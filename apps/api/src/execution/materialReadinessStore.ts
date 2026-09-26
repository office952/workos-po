import {
  nextMaterialReadinessVersion,
  parseMaterialReadinessMode,
  resolveMaterialReadinessMode,
  type MaterialReadinessConfirmation,
  type MaterialReadinessContext,
  type MaterialReadinessMode,
  type MaterialReadinessModeRecord,
  type StoredMaterialReadinessMode,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type ModeRow = {
  version: number;
  mode: string;
  updated_at: string;
  updated_by: string;
};

type ConfirmationRow = {
  task_id: string;
  resource_id: string;
  status: string;
  confirmed_by: string;
  confirmed_at: string;
};

export function readMaterialReadinessMode(db: SqliteDatabase): MaterialReadinessModeRecord {
  const rows = db
    .prepare(
      `
      SELECT version, mode, updated_at, updated_by
      FROM execution_material_readiness_modes
      ORDER BY version ASC
    `,
    )
    .all() as ModeRow[];
  return resolveMaterialReadinessMode(rows.flatMap(storedModeFromRow));
}

export function readMaterialReadinessContext(db: SqliteDatabase): MaterialReadinessContext {
  return {
    mode: readMaterialReadinessMode(db).mode,
    confirmations: listMaterialConfirmations(db),
  };
}

export function writeMaterialReadinessMode(
  db: SqliteDatabase,
  mode: MaterialReadinessMode,
  updatedAt: string,
  updatedBy: string,
): { record: MaterialReadinessModeRecord; alreadyApplied: boolean } {
  const current = readMaterialReadinessMode(db);
  const next = nextMaterialReadinessVersion(current, mode, updatedAt, updatedBy);
  if (!next) {
    return { record: current, alreadyApplied: true };
  }
  db.prepare(
    `
    INSERT INTO execution_material_readiness_modes (
      version, mode, updated_at, updated_by
    ) VALUES (?, ?, ?, ?)
  `,
  ).run(next.version, next.mode, next.updatedAt, next.updatedBy);
  return {
    record: { ...next, source: "STORED" },
    alreadyApplied: false,
  };
}

export function listMaterialConfirmations(
  db: SqliteDatabase,
): MaterialReadinessConfirmation[] {
  const rows = db
    .prepare(
      `
      SELECT task_id, resource_id, status, confirmed_by, confirmed_at
      FROM execution_material_confirmations
    `,
    )
    .all() as ConfirmationRow[];
  return rows.flatMap(confirmationFromRow);
}

export function upsertMaterialConfirmation(
  db: SqliteDatabase,
  confirmation: MaterialReadinessConfirmation,
): void {
  db.prepare(
    `
    INSERT INTO execution_material_confirmations (
      task_id, resource_id, status, confirmed_by, confirmed_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(task_id, resource_id) DO UPDATE SET
      status = excluded.status,
      confirmed_by = excluded.confirmed_by,
      confirmed_at = excluded.confirmed_at
  `,
  ).run(
    confirmation.taskId,
    confirmation.resourceId,
    confirmation.status,
    confirmation.confirmedBy,
    confirmation.confirmedAt,
  );
}

export function applyMaterialReadinessMode(
  db: SqliteDatabase,
  mode: string,
  updatedAt: string,
  updatedBy: string,
):
  | { ok: true; record: MaterialReadinessModeRecord; alreadyApplied: boolean }
  | { ok: false; error: "invalid_mode" } {
  const parsed = parseMaterialReadinessMode(mode);
  if (!parsed) {
    return { ok: false, error: "invalid_mode" };
  }
  const written = writeMaterialReadinessMode(db, parsed, updatedAt, updatedBy);
  return { ok: true, ...written };
}

function storedModeFromRow(row: ModeRow): StoredMaterialReadinessMode[] {
  const mode = parseMaterialReadinessMode(row.mode);
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

function confirmationFromRow(row: ConfirmationRow): MaterialReadinessConfirmation[] {
  if (row.status !== "AVAILABLE" && row.status !== "NOT_AVAILABLE") {
    return [];
  }
  return [
    {
      taskId: row.task_id,
      resourceId: row.resource_id,
      status: row.status,
      confirmedBy: row.confirmed_by,
      confirmedAt: row.confirmed_at,
    },
  ];
}
