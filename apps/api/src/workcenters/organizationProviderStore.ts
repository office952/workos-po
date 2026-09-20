import { createHash } from "node:crypto";
import {
  createWorkcenterRegistry,
  PRODUCTION_CAPABILITY_CLASS_IDS,
  PROVIDER_LIFECYCLES,
  type ProductionCapabilityClassId,
  type ProviderLifecycle,
  type Workcenter,
  type WorkcenterRegistry,
  type Machine,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

export const ORGANIZATION_PROVIDER_CONFIG_ID = "org-provider-config:current" as const;

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
