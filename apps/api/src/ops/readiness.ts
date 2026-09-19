import { accessSync, constants } from "node:fs";
import Database from "better-sqlite3";
import type { ControlPlane } from "../cloud/controlPlane.js";
import { derivePlanePaths } from "../cloud/paths.js";
import { readOperationalPlaneIdentity } from "../cloud/planeIdentity.js";
import { listControlPlaneMigrationFiles } from "../persistence/controlPlaneSqlite.js";
import {
  migrationSetsEqual,
  readAppliedMigrationIds,
} from "../persistence/schemaLedger.js";
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

function isWritableDir(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function inspectActivePlanes(
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

  const expectedOperational = listOperationalMigrationFiles();
  let migrationsValid = true;
  let resolvable = true;
  for (const plane of planes) {
    let db: InstanceType<typeof Database> | undefined;
    try {
      const paths = derivePlanePaths(cloudRoot, plane.planeKey);
      db = new Database(paths.sqlitePath, { fileMustExist: true, readonly: true });
      const operationalOk = migrationSetsEqual(readAppliedMigrationIds(db), expectedOperational);
      const identity = readOperationalPlaneIdentity(db);
      const identityOk =
        identity?.planeId === plane.planeId && identity.organizationId === plane.organizationId;
      if (!operationalOk) {
        migrationsValid = false;
      }
      if (!identityOk) {
        resolvable = false;
      }
    } catch {
      migrationsValid = false;
      resolvable = false;
    } finally {
      db?.close();
    }
  }
  return { migrationsValid, resolvable };
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
    let controlOk = false;
    try {
      controlOk = migrationSetsEqual(
        readAppliedMigrationIds(input.controlPlane.db),
        listControlPlaneMigrationFiles(),
      );
    } catch {
      controlOk = false;
    }
    const planes = inspectActivePlanes(input.controlPlane, input.cloudRoot);
    checks.migrationsValid = controlOk && planes.migrationsValid;
    checks.operationalRuntimeResolvable = planes.resolvable;
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
