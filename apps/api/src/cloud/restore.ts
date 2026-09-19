import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { opsLog } from "../ops/log.js";
import { openControlPlaneDatabase } from "../persistence/controlPlaneSqlite.js";
import { derivePlanePaths } from "./paths.js";
import { readOperationalPlaneIdentity } from "./planeIdentity.js";
import {
  CLOUD_BACKUP_VERSION,
  type CloudBackupManifest,
} from "./backup.js";

export type RestoreFaultCode =
  | "invalid_manifest"
  | "unsupported_backup_version"
  | "missing_file"
  | "hash_mismatch"
  | "plane_identity_mismatch"
  | "restore_target_invalid"
  | "restore_target_not_isolated"
  | "restore_target_not_empty"
  | "control_plane_open_failed";

export class CloudRestoreError extends Error {
  readonly code: RestoreFaultCode;

  constructor(code: RestoreFaultCode) {
    super(code);
    this.name = "CloudRestoreError";
    this.code = code;
  }
}

export type CloudRestoreResult = {
  targetRoot: string;
  organizationCount: number;
  planeCount: number;
};

function fail(code: RestoreFaultCode): never {
  opsLog("error", "restore_failed", { code });
  throw new CloudRestoreError(code);
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function isNonEmptyDir(dir: string): boolean {
  if (!existsSync(dir)) {
    return false;
  }
  if (!statSync(dir).isDirectory()) {
    return true;
  }
  return existsSync(join(dir, "control")) || existsSync(join(dir, "organizations"));
}

function readManifest(backupDir: string): CloudBackupManifest {
  const manifestPath = join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    fail("invalid_manifest");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    fail("invalid_manifest");
  }
  if (!parsed || typeof parsed !== "object") {
    fail("invalid_manifest");
  }
  const manifest = parsed as CloudBackupManifest;
  if (manifest.version !== CLOUD_BACKUP_VERSION) {
    fail("unsupported_backup_version");
  }
  if (!Array.isArray(manifest.artifacts) || !Array.isArray(manifest.organizations)) {
    fail("invalid_manifest");
  }
  return manifest;
}

function verifyArtifacts(backupDir: string, manifest: CloudBackupManifest): void {
  for (const artifact of manifest.artifacts) {
    if (!artifact.path || artifact.path.includes("..") || artifact.path.startsWith("/")) {
      fail("invalid_manifest");
    }
    const filePath = join(backupDir, artifact.path);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      fail("missing_file");
    }
    if (sha256File(filePath) !== artifact.sha256) {
      fail("hash_mismatch");
    }
  }
}

function verifyRestoredPlanes(targetRoot: string, manifest: CloudBackupManifest): void {
  let db: InstanceType<typeof Database> | undefined;
  try {
    db = openControlPlaneDatabase(join(targetRoot, "control", "control-plane.sqlite"));
    const planes = db
      .prepare(
        `SELECT plane_id, organization_id, plane_key
         FROM operational_planes
         ORDER BY plane_id`,
      )
      .all() as Array<{ plane_id: string; organization_id: string; plane_key: string }>;
    if (planes.length !== manifest.planeCount) {
      fail("plane_identity_mismatch");
    }
    for (const plane of planes) {
      const paths = derivePlanePaths(targetRoot, plane.plane_key);
      if (!existsSync(paths.sqlitePath)) {
        fail("missing_file");
      }
      const operational = new Database(paths.sqlitePath, { fileMustExist: true, readonly: true });
      try {
        const identity = readOperationalPlaneIdentity(operational);
        if (
          !identity ||
          identity.planeId !== plane.plane_id ||
          identity.organizationId !== plane.organization_id
        ) {
          fail("plane_identity_mismatch");
        }
      } finally {
        operational.close();
      }
      const expected = manifest.organizations.find(
        (item) => item.organizationId === plane.organization_id,
      );
      if (!expected || expected.planeId !== plane.plane_id) {
        fail("plane_identity_mismatch");
      }
    }
  } catch (error) {
    if (error instanceof CloudRestoreError) {
      throw error;
    }
    fail("control_plane_open_failed");
  } finally {
    db?.close();
  }
}

export function restoreCloudBackup(input: {
  backupDir: string;
  targetRoot: string;
  sourceCloudRoot?: string;
}): CloudRestoreResult {
  const backupDir = resolve(input.backupDir);
  const targetRoot = resolve(input.targetRoot);
  if (!targetRoot || targetRoot.length < 4) {
    fail("restore_target_invalid");
  }
  if (input.sourceCloudRoot) {
    const source = resolve(input.sourceCloudRoot);
    if (targetRoot === source) {
      fail("restore_target_not_isolated");
    }
  }
  if (isNonEmptyDir(targetRoot)) {
    fail("restore_target_not_empty");
  }

  const manifest = readManifest(backupDir);
  verifyArtifacts(backupDir, manifest);

  mkdirSync(targetRoot, { recursive: true });
  try {
    for (const artifact of manifest.artifacts) {
      const from = join(backupDir, artifact.path);
      const to = join(targetRoot, artifact.path);
      mkdirSync(dirname(to), { recursive: true });
      cpSync(from, to);
    }
    verifyRestoredPlanes(targetRoot, manifest);
  } catch (error) {
    rmSync(targetRoot, { recursive: true, force: true });
    throw error;
  }

  opsLog("info", "restore_validated", {
    organizationCount: manifest.organizationCount,
    planeCount: manifest.planeCount,
  });
  return {
    targetRoot,
    organizationCount: manifest.organizationCount,
    planeCount: manifest.planeCount,
  };
}

export function assertRestoreTargetIsolated(sourceRoot: string, targetRoot: string): void {
  const source = resolve(sourceRoot);
  const target = resolve(targetRoot);
  if (target === source || target.startsWith(source + sep) || source.startsWith(target + sep)) {
    throw new CloudRestoreError("restore_target_not_isolated");
  }
}
