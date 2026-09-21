import { createHash } from "node:crypto";
import {
  createMachine,
  createWorkcenter,
  createWorkcenterRegistry,
  PRODUCTION_CAPABILITY_CLASS_IDS,
  PROVIDER_LIFECYCLES,
  updateMachine,
  updateWorkcenter,
  type Machine,
  type MachineCreateInput,
  type MachinePatch,
  type ProductionCapabilityClassId,
  type ProviderLifecycle,
  type ProviderMutationResult,
  type Workcenter,
  type WorkcenterCreateInput,
  type WorkcenterPatch,
  type WorkcenterRegistry,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

export const ORGANIZATION_PROVIDER_CONFIG_ID = "org-provider-config:current" as const;
export const ORGANIZATION_PROVIDER_COMPATIBILITY_SOURCE = "compatibility" as const;
export const ORGANIZATION_PROVIDER_ORGANIZATION_SOURCE = "organization" as const;

export class OrganizationProviderPersistError extends Error {
  readonly error = "internal" as const;

  constructor() {
    super("internal");
    this.name = "OrganizationProviderPersistError";
  }
}

export const ORGANIZATION_PROVIDER_CONFIG_ERRORS = [
  "invalid_config",
  "provider_in_use",
] as const;
export type OrganizationProviderConfigError =
  (typeof ORGANIZATION_PROVIDER_CONFIG_ERRORS)[number];

export type OrganizationProviderConfigInput = {
  workcenters: readonly OrganizationWorkcenterInput[];
  machines: readonly OrganizationMachineInput[];
};

export type OrganizationWorkcenterInput = {
  id: string;
  label: string;
  description?: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: readonly ProductionCapabilityClassId[];
};

export type OrganizationMachineInput = {
  id: string;
  label: string;
  description?: string;
  workcenterId: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds: readonly ProductionCapabilityClassId[];
};

export type OrganizationProviderApplyResult =
  | {
      ok: true;
      alreadyApplied: boolean;
      contentHash: string;
      registry: WorkcenterRegistry;
      executed: boolean;
    }
  | { ok: false; error: OrganizationProviderConfigError; detail?: string };

type ProviderRow = {
  id: string;
  label: string;
  description: string;
  lifecycle: string;
  capability_ids_json: string;
  workcenter_id?: string;
  created_at: string;
  updated_at: string;
};

export function loadOrganizationProviderRegistry(db: SqliteDatabase): WorkcenterRegistry {
  const workcenterRows = db
    .prepare(
      `
      SELECT workcenter_id AS id, label, description, lifecycle, capability_ids_json,
             created_at, updated_at
      FROM organization_workcenters
      ORDER BY workcenter_id
    `,
    )
    .all() as ProviderRow[];
  const machineRows = db
    .prepare(
      `
      SELECT machine_id AS id, label, description, lifecycle, capability_ids_json,
             workcenter_id, created_at, updated_at
      FROM organization_machines
      ORDER BY machine_id
    `,
    )
    .all() as ProviderRow[];
  return createWorkcenterRegistry(
    workcenterRows.map(rowToWorkcenter),
    machineRows.map(rowToMachine),
  );
}

export function applyOrganizationProviderConfiguration(
  db: SqliteDatabase,
  input: unknown,
  options: { mode: "dry-run" | "execute"; source?: string; appliedAt?: string },
): OrganizationProviderApplyResult {
  const parsed = parseOrganizationProviderConfig(input);
  if (!parsed.ok) {
    return parsed;
  }
  let registry: WorkcenterRegistry;
  try {
    registry = createWorkcenterRegistry(parsed.workcenters, parsed.machines);
  } catch (error) {
    return {
      ok: false,
      error: "invalid_config",
      detail: error instanceof Error ? error.message : "invalid_config",
    };
  }
  const contentHash = hashProviderConfig(registry);
  const currentHash = readCurrentConfigHash(db);
  if (currentHash === contentHash) {
    return {
      ok: true,
      alreadyApplied: true,
      contentHash,
      registry: loadOrganizationProviderRegistry(db),
      executed: false,
    };
  }
  const inUse = usedProviderConflict(db, registry);
  if (inUse) {
    return { ok: false, error: "provider_in_use", detail: inUse };
  }
  if (options.mode === "dry-run") {
    return {
      ok: true,
      alreadyApplied: false,
      contentHash,
      registry,
      executed: false,
    };
  }
  const appliedAt = options.appliedAt ?? new Date().toISOString();
  const source = options.source ?? "cli";
  const write = db.transaction(() => {
    db.prepare("DELETE FROM organization_machines").run();
    db.prepare("DELETE FROM organization_workcenters").run();
    const insertWorkcenter = db.prepare(
      `
      INSERT INTO organization_workcenters (
        workcenter_id, label, description, lifecycle, capability_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const workcenter of registry.workcenters) {
      insertWorkcenter.run(
        workcenter.id,
        workcenter.label,
        workcenter.description,
        workcenter.lifecycle,
        JSON.stringify(workcenter.capabilityIds),
        appliedAt,
        appliedAt,
      );
    }
    const insertMachine = db.prepare(
      `
      INSERT INTO organization_machines (
        machine_id, label, description, workcenter_id, lifecycle, capability_ids_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    );
    for (const machine of registry.machines) {
      insertMachine.run(
        machine.id,
        machine.label,
        machine.description,
        machine.workcenterId,
        machine.lifecycle,
        JSON.stringify(machine.capabilityIds),
        appliedAt,
        appliedAt,
      );
    }
    db.prepare(
      `
      INSERT INTO organization_provider_configuration (config_id, content_hash, applied_at, source)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(config_id) DO UPDATE SET
        content_hash = excluded.content_hash,
        applied_at = excluded.applied_at,
        source = excluded.source
    `,
    ).run(ORGANIZATION_PROVIDER_CONFIG_ID, contentHash, appliedAt, source);
  });
  write();
  return {
    ok: true,
    alreadyApplied: false,
    contentHash,
    registry: loadOrganizationProviderRegistry(db),
    executed: true,
  };
}

function parseOrganizationProviderConfig(
  input: unknown,
):
  | { ok: true; workcenters: Workcenter[]; machines: Machine[] }
  | { ok: false; error: "invalid_config"; detail?: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "invalid_config" };
  }
  const record = input as { workcenters?: unknown; machines?: unknown };
  if (!Array.isArray(record.workcenters) || !Array.isArray(record.machines)) {
    return { ok: false, error: "invalid_config" };
  }
  const workcenters: Workcenter[] = [];
  for (const item of record.workcenters) {
    const parsed = parseWorkcenter(item);
    if (!parsed) {
      return { ok: false, error: "invalid_config" };
    }
    workcenters.push(parsed);
  }
  const machines: Machine[] = [];
  for (const item of record.machines) {
    const parsed = parseMachine(item);
    if (!parsed) {
      return { ok: false, error: "invalid_config" };
    }
    machines.push(parsed);
  }
  return { ok: true, workcenters, machines };
}

function parseWorkcenter(input: unknown): Workcenter | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as OrganizationWorkcenterInput;
  if (typeof record.id !== "string" || typeof record.label !== "string") {
    return null;
  }
  const lifecycle = record.lifecycle ?? "ACTIVE";
  if (!isLifecycle(lifecycle)) {
    return null;
  }
  const capabilityIds = parseCapabilityIds(record.capabilityIds ?? []);
  if (!capabilityIds) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    description: typeof record.description === "string" ? record.description : "",
    lifecycle,
    capabilityIds,
  };
}

function parseMachine(input: unknown): Machine | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const record = input as OrganizationMachineInput;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.workcenterId !== "string"
  ) {
    return null;
  }
  const lifecycle = record.lifecycle ?? "ACTIVE";
  if (!isLifecycle(lifecycle)) {
    return null;
  }
  const capabilityIds = parseCapabilityIds(record.capabilityIds);
  if (!capabilityIds) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    description: typeof record.description === "string" ? record.description : "",
    workcenterId: record.workcenterId,
    lifecycle,
    capabilityIds,
  };
}

function parseCapabilityIds(
  value: unknown,
): ProductionCapabilityClassId[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const ids: ProductionCapabilityClassId[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isCapabilityId(item)) {
      return null;
    }
    ids.push(item);
  }
  return ids;
}

function isCapabilityId(value: string): value is ProductionCapabilityClassId {
  return (PRODUCTION_CAPABILITY_CLASS_IDS as readonly string[]).includes(value);
}

function isLifecycle(value: string): value is ProviderLifecycle {
  return (PROVIDER_LIFECYCLES as readonly string[]).includes(value);
}

function hashProviderConfig(registry: WorkcenterRegistry): string {
  const payload = {
    workcenters: [...registry.workcenters]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        lifecycle: item.lifecycle,
        capabilityIds: [...item.capabilityIds].sort(),
      })),
    machines: [...registry.machines]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        workcenterId: item.workcenterId,
        lifecycle: item.lifecycle,
        capabilityIds: [...item.capabilityIds].sort(),
      })),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function readCurrentConfigHash(db: SqliteDatabase): string | null {
  const row = db
    .prepare(
      "SELECT content_hash FROM organization_provider_configuration WHERE config_id = ?",
    )
    .get(ORGANIZATION_PROVIDER_CONFIG_ID) as { content_hash: string } | undefined;
  return row?.content_hash ?? null;
}

function usedProviderConflict(db: SqliteDatabase, next: WorkcenterRegistry): string | null {
  const used = db
    .prepare(
      `
      SELECT DISTINCT assigned_provider_id AS id
      FROM execution_tasks
      WHERE assigned_provider_id IS NOT NULL
    `,
    )
    .all() as Array<{ id: string }>;
  if (used.length === 0) {
    return null;
  }
  const current = loadOrganizationProviderRegistry(db);
  for (const row of used) {
    const nextMachine = next.getMachine(row.id);
    const nextWorkcenter = next.getWorkcenter(row.id);
    if (!nextMachine && !nextWorkcenter) {
      return row.id;
    }
    const currentMachine = current.getMachine(row.id);
    if (currentMachine && nextMachine) {
      if (
        currentMachine.workcenterId !== nextMachine.workcenterId ||
        capabilitiesChanged(currentMachine.capabilityIds, nextMachine.capabilityIds)
      ) {
        return row.id;
      }
    }
    const currentWorkcenter = current.getWorkcenter(row.id);
    if (currentWorkcenter && nextWorkcenter) {
      if (capabilitiesChanged(currentWorkcenter.capabilityIds, nextWorkcenter.capabilityIds)) {
        return row.id;
      }
    }
  }
  return null;
}

function capabilitiesChanged(
  left: readonly ProductionCapabilityClassId[],
  right: readonly ProductionCapabilityClassId[],
): boolean {
  if (left.length !== right.length) {
    return true;
  }
  const rightSet = new Set(right);
  return left.some((item) => !rightSet.has(item));
}

function rowToWorkcenter(row: ProviderRow): Workcenter {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    lifecycle: row.lifecycle as ProviderLifecycle,
    capabilityIds: JSON.parse(row.capability_ids_json) as ProductionCapabilityClassId[],
  };
}

function rowToMachine(row: ProviderRow): Machine {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
    workcenterId: row.workcenter_id ?? null,
    lifecycle: row.lifecycle as ProviderLifecycle,
    capabilityIds: JSON.parse(row.capability_ids_json) as ProductionCapabilityClassId[],
  };
}

export type OrganizationProviderMutationResult<T> = ProviderMutationResult<T> & {
  contentHash?: string;
};

export function persistCreatedWorkcenter(
  db: SqliteDatabase,
  input: WorkcenterCreateInput,
  appliedAt = new Date().toISOString(),
): OrganizationProviderMutationResult<Workcenter> {
  const created = createWorkcenter({
    label: input.label,
    description: input.description,
    lifecycle: input.lifecycle,
    capabilityIds: input.capabilityIds,
  });
  if (!created.ok) {
    return created;
  }
  return writeProviderMutation(db, appliedAt, () => {
    insertWorkcenterRow(db, created.value, appliedAt);
    return created.value;
  });
}

export function persistUpdatedWorkcenter(
  db: SqliteDatabase,
  workcenterId: string,
  patch: WorkcenterPatch,
  appliedAt = new Date().toISOString(),
): OrganizationProviderMutationResult<Workcenter> {
  const current = loadOrganizationProviderRegistry(db);
  const workcenter = current.getWorkcenter(workcenterId);
  if (!workcenter) {
    return { ok: false, error: "not_found" };
  }
  const updated = updateWorkcenter(
    workcenter,
    patch,
    providerHistoryContext(db, workcenterId),
    current.machines,
  );
  if (!updated.ok || updated.alreadyApplied) {
    return updated;
  }
  return writeProviderMutation(db, appliedAt, () => {
    updateWorkcenterRow(db, updated.value, appliedAt);
    return updated.value;
  });
}

export function persistCreatedMachine(
  db: SqliteDatabase,
  input: MachineCreateInput,
  appliedAt = new Date().toISOString(),
): OrganizationProviderMutationResult<Machine> {
  const created = createMachine(
    {
      label: input.label,
      description: input.description,
      workcenterId: input.workcenterId,
      lifecycle: input.lifecycle,
      capabilityIds: input.capabilityIds,
    },
    loadOrganizationProviderRegistry(db).workcenters,
  );
  if (!created.ok) {
    return created;
  }
  return writeProviderMutation(db, appliedAt, () => {
    insertMachineRow(db, created.value, appliedAt);
    return created.value;
  });
}

export function persistUpdatedMachine(
  db: SqliteDatabase,
  machineId: string,
  patch: MachinePatch,
  appliedAt = new Date().toISOString(),
): OrganizationProviderMutationResult<Machine> {
  const current = loadOrganizationProviderRegistry(db);
  const machine = current.getMachine(machineId);
  if (!machine) {
    return { ok: false, error: "not_found" };
  }
  const updated = updateMachine(
    machine,
    patch,
    providerHistoryContext(db, machineId),
    current.workcenters,
  );
  if (!updated.ok || updated.alreadyApplied) {
    return updated;
  }
  return writeProviderMutation(db, appliedAt, () => {
    updateMachineRow(db, updated.value, appliedAt);
    return updated.value;
  });
}

export type OrganizationProviderFoundationResult = {
  materialized: boolean;
  alreadyOwned: boolean;
  registry: WorkcenterRegistry;
};

export function organizationProviderTablesHaveRows(db: SqliteDatabase): boolean {
  const workcenters = db
    .prepare("SELECT COUNT(*) AS count FROM organization_workcenters")
    .get() as { count: number };
  const machines = db
    .prepare("SELECT COUNT(*) AS count FROM organization_machines")
    .get() as { count: number };
  return workcenters.count > 0 || machines.count > 0;
}

export function hasOrganizationProviderOwnership(db: SqliteDatabase): boolean {
  return readOrganizationProviderConfig(db) !== null || organizationProviderTablesHaveRows(db);
}

export function ensureOrganizationProviderFoundation(
  db: SqliteDatabase,
  compatibility: WorkcenterRegistry,
  appliedAt = new Date().toISOString(),
): OrganizationProviderFoundationResult {
  try {
    if (readOrganizationProviderConfig(db)) {
      return {
        materialized: false,
        alreadyOwned: true,
        registry: loadOrganizationProviderRegistry(db),
      };
    }
    if (organizationProviderTablesHaveRows(db)) {
      const registry = loadOrganizationProviderRegistry(db);
      createWorkcenterRegistry(registry.workcenters, registry.machines);
      writeProviderConfiguration(
        db,
        registry,
        ORGANIZATION_PROVIDER_ORGANIZATION_SOURCE,
        appliedAt,
      );
      return {
        materialized: false,
        alreadyOwned: true,
        registry,
      };
    }
    if (compatibility.workcenters.length === 0 && compatibility.machines.length === 0) {
      return {
        materialized: false,
        alreadyOwned: false,
        registry: loadOrganizationProviderRegistry(db),
      };
    }
    const persist = db.transaction(() => {
      for (const workcenter of compatibility.workcenters) {
        insertWorkcenterRow(db, workcenter, appliedAt);
      }
      for (const machine of compatibility.machines) {
        insertMachineRow(db, machine, appliedAt);
      }
      const registry = loadOrganizationProviderRegistry(db);
      createWorkcenterRegistry(registry.workcenters, registry.machines);
      writeProviderConfiguration(
        db,
        registry,
        ORGANIZATION_PROVIDER_COMPATIBILITY_SOURCE,
        appliedAt,
      );
      return registry;
    });
    return {
      materialized: true,
      alreadyOwned: true,
      registry: persist(),
    };
  } catch (error) {
    if (error instanceof OrganizationProviderPersistError) {
      throw error;
    }
    throw new OrganizationProviderPersistError();
  }
}

export function readOrganizationProviderConfig(
  db: SqliteDatabase,
): { contentHash: string; appliedAt: string; source: string } | null {
  const row = db
    .prepare(
      `
      SELECT content_hash, applied_at, source
      FROM organization_provider_configuration
      WHERE config_id = ?
    `,
    )
    .get(ORGANIZATION_PROVIDER_CONFIG_ID) as
    | { content_hash: string; applied_at: string; source: string }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    contentHash: row.content_hash,
    appliedAt: row.applied_at,
    source: row.source,
  };
}

function writeProviderMutation<T>(
  db: SqliteDatabase,
  appliedAt: string,
  write: () => T,
): OrganizationProviderMutationResult<T> {
  try {
    const persist = db.transaction(() => {
      const value = write();
      const registry = loadOrganizationProviderRegistry(db);
      createWorkcenterRegistry(registry.workcenters, registry.machines);
      const contentHash = writeProviderConfiguration(db, registry, "admin", appliedAt);
      return { value, contentHash };
    });
    const persisted = persist();
    return {
      ok: true,
      alreadyApplied: false,
      value: persisted.value,
      contentHash: persisted.contentHash,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_workcenter") {
      return { ok: false, error: "invalid_workcenter" };
    }
    throw new OrganizationProviderPersistError();
  }
}

function writeProviderConfiguration(
  db: SqliteDatabase,
  registry: WorkcenterRegistry,
  source: string,
  appliedAt: string,
): string {
  const contentHash = hashProviderConfig(registry);
  db.prepare(
    `
    INSERT INTO organization_provider_configuration (config_id, content_hash, applied_at, source)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(config_id) DO UPDATE SET
      content_hash = excluded.content_hash,
      applied_at = excluded.applied_at,
      source = excluded.source
  `,
  ).run(ORGANIZATION_PROVIDER_CONFIG_ID, contentHash, appliedAt, source);
  return contentHash;
}

function insertWorkcenterRow(db: SqliteDatabase, workcenter: Workcenter, at: string): void {
  db.prepare(
    `
    INSERT INTO organization_workcenters (
      workcenter_id, label, description, lifecycle, capability_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    workcenter.id,
    workcenter.label,
    workcenter.description,
    workcenter.lifecycle,
    JSON.stringify(workcenter.capabilityIds),
    at,
    at,
  );
}

function updateWorkcenterRow(db: SqliteDatabase, workcenter: Workcenter, at: string): void {
  db.prepare(
    `
    UPDATE organization_workcenters
    SET label = ?, description = ?, lifecycle = ?, capability_ids_json = ?, updated_at = ?
    WHERE workcenter_id = ?
  `,
  ).run(
    workcenter.label,
    workcenter.description,
    workcenter.lifecycle,
    JSON.stringify(workcenter.capabilityIds),
    at,
    workcenter.id,
  );
}

function insertMachineRow(db: SqliteDatabase, machine: Machine, at: string): void {
  if (!machine.workcenterId) {
    throw new Error("invalid_workcenter");
  }
  db.prepare(
    `
    INSERT INTO organization_machines (
      machine_id, label, description, workcenter_id, lifecycle, capability_ids_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    machine.id,
    machine.label,
    machine.description,
    machine.workcenterId,
    machine.lifecycle,
    JSON.stringify(machine.capabilityIds),
    at,
    at,
  );
}

function updateMachineRow(db: SqliteDatabase, machine: Machine, at: string): void {
  if (!machine.workcenterId) {
    throw new Error("invalid_workcenter");
  }
  db.prepare(
    `
    UPDATE organization_machines
    SET label = ?, description = ?, workcenter_id = ?, lifecycle = ?, capability_ids_json = ?, updated_at = ?
    WHERE machine_id = ?
  `,
  ).run(
    machine.label,
    machine.description,
    machine.workcenterId,
    machine.lifecycle,
    JSON.stringify(machine.capabilityIds),
    at,
    machine.id,
  );
}

function providerHistoryContext(db: SqliteDatabase, providerId: string): {
  referencedByHistory: boolean;
  hasOpenAssignment: boolean;
} {
  const rows = db
    .prepare(
      `
      SELECT status
      FROM execution_tasks
      WHERE assigned_provider_id = ?
    `,
    )
    .all(providerId) as Array<{ status: string }>;
  return {
    referencedByHistory: rows.length > 0,
    hasOpenAssignment: rows.some(
      (row) => row.status === "PLANNED" || row.status === "IN_PROGRESS",
    ),
  };
}
