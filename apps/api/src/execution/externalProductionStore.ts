import { randomUUID } from "node:crypto";
import {
  assignExternalProviderToTask,
  createExternalProductionProvider,
  externalProviderNameKey,
  handOffExternalTask,
  markTaskExternal,
  nextExternalProductionHandoffVersion,
  parseExternalProductionHandoffMode,
  recordExternalReturn,
  renameExternalProductionProvider,
  resolveExternalProductionHandoffMode,
  setExternalProductionProviderActive,
  type ExternalProductionHandoffMode,
  type ExternalProductionHandoffModeRecord,
  type ExternalProductionProvider,
  type ExternalProviderMutationError,
  type StoredExternalProductionHandoffMode,
  type TaskMutationResult,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { applyExecutionTaskMutation } from "./store.js";

type ModeRow = {
  version: number;
  mode: string;
  updated_at: string;
  updated_by: string;
};

type ProviderRow = {
  provider_id: string;
  name: string;
  active: number;
  created_at: string;
  created_by: string;
};

export function readExternalProductionHandoffMode(
  db: SqliteDatabase,
): ExternalProductionHandoffModeRecord {
  const rows = db
    .prepare(
      `
      SELECT version, mode, updated_at, updated_by
      FROM external_production_handoff_modes
      ORDER BY version ASC
    `,
    )
    .all() as ModeRow[];
  return resolveExternalProductionHandoffMode(rows.flatMap(storedModeFromRow));
}

export function writeExternalProductionHandoffMode(
  db: SqliteDatabase,
  mode: string,
  updatedAt: string,
  updatedBy: string,
):
  | { ok: true; record: ExternalProductionHandoffModeRecord; alreadyApplied: boolean }
  | { ok: false; error: "invalid_mode" } {
  const parsed = parseExternalProductionHandoffMode(mode);
  if (!parsed) {
    return { ok: false, error: "invalid_mode" };
  }
  const current = readExternalProductionHandoffMode(db);
  const next = nextExternalProductionHandoffVersion(current, parsed, updatedAt, updatedBy);
  if (!next) {
    return { ok: true, record: current, alreadyApplied: true };
  }
  db.prepare(
    `
    INSERT INTO external_production_handoff_modes (
      version, mode, updated_at, updated_by
    ) VALUES (?, ?, ?, ?)
  `,
  ).run(next.version, next.mode, next.updatedAt, next.updatedBy);
  return {
    ok: true,
    alreadyApplied: false,
    record: { ...next, source: "STORED" },
  };
}

export function listExternalProductionProviders(
  db: SqliteDatabase,
): ExternalProductionProvider[] {
  const rows = db
    .prepare(
      `
      SELECT provider_id, name, active, created_at, created_by
      FROM external_production_providers
      ORDER BY name_key, provider_id
    `,
    )
    .all() as ProviderRow[];
  return rows.map(providerFromRow);
}

export function createStoredExternalProductionProvider(
  db: SqliteDatabase,
  name: unknown,
  createdAt: string,
  createdBy: string,
):
  | { ok: true; provider: ExternalProductionProvider }
  | { ok: false; error: ExternalProviderMutationError } {
  const created = createExternalProductionProvider({
    providerId: `xprov:${randomUUID()}`,
    name,
    createdAt,
    createdBy,
    existing: listExternalProductionProviders(db),
  });
  if (!created.ok) {
    return created;
  }
  const stored = insertExternalProductionProviderRow(db, created.provider);
  if (!stored.ok) {
    return stored;
  }
  return { ok: true, provider: created.provider };
}

export function insertExternalProductionProviderRow(
  db: SqliteDatabase,
  provider: ExternalProductionProvider,
): { ok: true } | { ok: false; error: "duplicate_name" } {
  try {
    db.prepare(
      `
      INSERT INTO external_production_providers (
        provider_id, name, name_key, active, created_at, created_by
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    ).run(
      provider.providerId,
      provider.name,
      externalProviderNameKey(provider.name),
      provider.active ? 1 : 0,
      provider.createdAt,
      provider.createdBy,
    );
    return { ok: true };
  } catch (error) {
    if (isSqliteUniqueConstraint(error)) {
      return { ok: false, error: "duplicate_name" };
    }
    throw error;
  }
}

export function updateStoredExternalProductionProvider(
  db: SqliteDatabase,
  providerId: string,
  patch: { name?: unknown; active?: unknown },
):
  | { ok: true; provider: ExternalProductionProvider; alreadyApplied: boolean }
  | { ok: false; error: ExternalProviderMutationError | "invalid_payload" } {
  const providers = listExternalProductionProviders(db);
  const current = providers.find((item) => item.providerId === providerId) ?? null;
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const requestedActive = patch.active;
  if (requestedActive !== undefined && typeof requestedActive !== "boolean") {
    return { ok: false, error: "invalid_payload" };
  }
  let next = current;
  let nameChange: { name: string; nameKey: string } | null = null;
  if (patch.name !== undefined) {
    const renamed = renameExternalProductionProvider(providers, providerId, patch.name);
    if (!renamed.ok) {
      return renamed;
    }
    if (!renamed.alreadyApplied) {
      nameChange = {
        name: renamed.provider.name,
        nameKey: externalProviderNameKey(renamed.provider.name),
      };
      next = renamed.provider;
    }
  }
  let activeChange: boolean | null = null;
  if (requestedActive !== undefined) {
    const activated = setExternalProductionProviderActive(providers, providerId, requestedActive);
    if (!activated.ok) {
      return activated;
    }
    if (!activated.alreadyApplied) {
      activeChange = requestedActive;
      next = { ...next, active: requestedActive };
    }
  }
  if (!nameChange && activeChange === null) {
    return { ok: true, provider: next, alreadyApplied: true };
  }
  try {
    db.transaction(() => {
      if (nameChange) {
        db.prepare(
          `
          UPDATE external_production_providers
          SET name = ?, name_key = ?
          WHERE provider_id = ?
        `,
        ).run(nameChange.name, nameChange.nameKey, providerId);
      }
      if (activeChange !== null) {
        db.prepare(
          `
          UPDATE external_production_providers
          SET active = ?
          WHERE provider_id = ?
        `,
        ).run(activeChange ? 1 : 0, providerId);
      }
    })();
  } catch (error) {
    if (isSqliteUniqueConstraint(error)) {
      return { ok: false, error: "duplicate_name" };
    }
    throw error;
  }
  return { ok: true, provider: next, alreadyApplied: false };
}

export function persistMarkTaskExternal(
  db: SqliteDatabase,
  taskId: string,
  actorId: string,
  markedAt: string,
): TaskMutationResult {
  return applyExternalMutation(db, taskId, (record) =>
    markTaskExternal(record, taskId, readExternalProductionHandoffMode(db).mode, actorId, markedAt),
  );
}

export function persistAssignExternalProvider(
  db: SqliteDatabase,
  taskId: string,
  providerId: string,
): TaskMutationResult {
  const provider =
    listExternalProductionProviders(db).find((item) => item.providerId === providerId) ?? null;
  return applyExternalMutation(db, taskId, (record) =>
    assignExternalProviderToTask(record, taskId, provider),
  );
}

export function persistHandOffExternalTask(
  db: SqliteDatabase,
  taskId: string,
  actorId: string,
  handedOffAt: string,
): TaskMutationResult {
  return applyExternalMutation(db, taskId, (record) => {
    const task = record.tasks.find((item) => item.taskId === taskId);
    const provider = task?.externalProviderId
      ? listExternalProductionProviders(db).find((item) => item.providerId === task.externalProviderId) ??
        null
      : null;
    return handOffExternalTask(
      record,
      taskId,
      actorId,
      handedOffAt,
      provider?.name ?? task?.externalProviderLabel ?? null,
    );
  });
}

export function persistRecordExternalReturn(
  db: SqliteDatabase,
  taskId: string,
  actorId: string,
  returnedAt: string,
): TaskMutationResult {
  return applyExternalMutation(db, taskId, (record) =>
    recordExternalReturn(record, taskId, actorId, returnedAt),
  );
}

function applyExternalMutation(
  db: SqliteDatabase,
  taskId: string,
  mutate: Parameters<typeof applyExecutionTaskMutation>[2],
): TaskMutationResult {
  return applyExecutionTaskMutation(db, taskId, mutate);
}

function isSqliteUniqueConstraint(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return false;
  }
  return (error as { code: unknown }).code === "SQLITE_CONSTRAINT_UNIQUE";
}

function storedModeFromRow(row: ModeRow): StoredExternalProductionHandoffMode[] {
  const mode = parseExternalProductionHandoffMode(row.mode);
  if (!mode) {
    return [];
  }
  return [
    {
      version: row.version,
      mode,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by,
    },
  ];
}

function providerFromRow(row: ProviderRow): ExternalProductionProvider {
  return {
    providerId: row.provider_id,
    name: row.name,
    active: row.active === 1,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export function externalProductionProjection(
  db: SqliteDatabase,
): {
  mode: ExternalProductionHandoffMode;
  providers: ExternalProductionProvider[];
} {
  return {
    mode: readExternalProductionHandoffMode(db).mode,
    providers: listExternalProductionProviders(db),
  };
}
