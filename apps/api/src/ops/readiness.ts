import { accessSync, constants } from "node:fs";
import Database from "better-sqlite3";
import type { ControlPlane } from "../cloud/controlPlane.js";
import { derivePlanePaths } from "../cloud/paths.js";
import { readOperationalPlaneIdentity } from "../cloud/planeIdentity.js";
import { listControlPlaneMigrationFiles } from "../persistence/controlPlaneSqlite.js";
import { listOperationalMigrationFiles } from "../persistence/sqlite.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import { API_CONTRACT_ID, HEALTH_SERVICE_NAME } from "./contract.js";

export type ReadinessMode = "cloud" | "single_plane";

export type ReadinessChecks = {
  initialized: boolean;
  cloudRootConfigured: boolean;
  controlPlaneOpen: boolean;
  migrationsValid: boolean;
  persistentRootWritable: boolean;
  operationalRuntimeResolvable: boolean;
};

export type ReadinessResponse = {
  status: "ready" | "not_ready";
  service: typeof HEALTH_SERVICE_NAME;
  apiContractId: typeof API_CONTRACT_ID;
  mode: ReadinessMode;
  checks: ReadinessChecks;
};

export type ReadinessInput = {
  mode: ReadinessMode;
  cloudRoot?: string;
  controlPlane?: ControlPlane;
  productSystem?: ProductSystemRuntime;
};

function appliedMigrationIds(db: {
  prepare: (sql: string) => { all: () => unknown[] };
}): string[] {
  try {
    return db
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => (row as { id: string }).id)
      .sort();
  } catch {
    return [];
  }
}

function migrationsCover(applied: readonly string[], expected: readonly string[]): boolean {
  const have = new Set(applied);
  return expected.every((id) => have.has(id));
}

function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function inspectFirstPlane(
  controlPlane: ControlPlane,
  cloudRoot: string,
): { migrationsValid: boolean; resolvable: boolean } {
  const planes = controlPlane
    .listOrganizations()
    .map((organization) => controlPlane.getPlaneByOrganization(organization.organizationId))
    .filter((plane): plane is NonNullable<typeof plane> => Boolean(plane && plane.status === "ACTIVE"));
  if (planes.length === 0) {
    return { migrationsValid: true, resolvable: true };
  }
  const first = planes[0];
  if (!first) {
    return { migrationsValid: false, resolvable: false };
  }
  let db: InstanceType<typeof Database> | undefined;
  try {
    const paths = derivePlanePaths(cloudRoot, first.planeKey);
    db = new Database(paths.sqlitePath, { fileMustExist: true, readonly: true });
    const operationalOk = migrationsCover(
      appliedMigrationIds(db),
      listOperationalMigrationFiles(),
    );
    const identity = readOperationalPlaneIdentity(db);
    const identityOk =
      identity?.planeId === first.planeId && identity.organizationId === first.organizationId;
    return { migrationsValid: operationalOk, resolvable: identityOk };
  } catch {
    return { migrationsValid: false, resolvable: false };
  } finally {
    db?.close();
  }
}

export function evaluateReadiness(input: ReadinessInput): ReadinessResponse {
  const checks: ReadinessChecks = {
    initialized: true,
    cloudRootConfigured: input.mode === "single_plane" ? true : Boolean(input.cloudRoot?.trim()),
    controlPlaneOpen: false,
    migrationsValid: false,
    persistentRootWritable: false,
    operationalRuntimeResolvable: false,
  };

  if (input.mode === "single_plane") {
    checks.controlPlaneOpen = true;
    checks.migrationsValid = Boolean(input.productSystem);
    checks.persistentRootWritable = true;
    checks.operationalRuntimeResolvable = Boolean(input.productSystem);
  } else if (input.controlPlane && input.cloudRoot) {
    checks.controlPlaneOpen = true;
    checks.persistentRootWritable = isWritableDir(input.cloudRoot);
    const controlOk = migrationsCover(
      appliedMigrationIds(input.controlPlane.db),
      listControlPlaneMigrationFiles(),
    );
    const plane = inspectFirstPlane(input.controlPlane, input.cloudRoot);
    checks.migrationsValid = controlOk && plane.migrationsValid;
    checks.operationalRuntimeResolvable = plane.resolvable;
  }

  const ready = Object.values(checks).every(Boolean);
  return {
    status: ready ? "ready" : "not_ready",
    service: HEALTH_SERVICE_NAME,
    apiContractId: API_CONTRACT_ID,
    mode: input.mode,
    checks,
  };
}
