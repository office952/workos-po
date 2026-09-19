import { createHash, randomBytes } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { API_CONTRACT_ID, HEALTH_SERVICE_NAME } from "../ops/contract.js";
import { opsLog } from "../ops/log.js";
import { listControlPlaneMigrationFiles } from "../persistence/controlPlaneSqlite.js";
import { listOperationalMigrationFiles } from "../persistence/sqlite.js";
import { derivePlanePaths, resolveCloudRoot } from "./paths.js";
import { readOperationalPlaneIdentity } from "./planeIdentity.js";

export const CLOUD_BACKUP_VERSION = "workos-cloud-backup-v1" as const;

export type BackupFaultCode =
  | "cloud_root_missing"
  | "backup_root_missing"
  | "backup_inside_cloud_root"
  | "control_plane_missing"
  | "sqlite_backup_failed"
  | "plane_missing"
  | "documents_missing";

export class CloudBackupError extends Error {
  readonly code: BackupFaultCode;

  constructor(code: BackupFaultCode) {
    super(code);
    this.name = "CloudBackupError";
    this.code = code;
  }
}

export type BackupArtifact = {
  path: string;
  sha256: string;
  kind: "sqlite" | "document";
  bytes: number;
};

export type BackupOrganizationRecord = {
  organizationId: string;
  slug: string;
  displayName: string;
  status: string;
  planeId: string;
  storageKind: string;
  artifactPrefix: string;
};

export type CloudBackupManifest = {
  version: typeof CLOUD_BACKUP_VERSION;
  createdAt: string;
  service: typeof HEALTH_SERVICE_NAME;
  apiContractId: typeof API_CONTRACT_ID;
  controlPlaneMigrations: string[];
  operationalMigrations: string[];
  organizationCount: number;
  planeCount: number;
  artifacts: BackupArtifact[];
  organizations: BackupOrganizationRecord[];
};

export type CloudBackupResult = {
  backupDir: string;
  manifest: CloudBackupManifest;
};

type ControlOrgRow = {
  organization_id: string;
  slug: string;
  display_name: string;
  status: string;
};

type ControlPlaneRow = {
  plane_id: string;
  organization_id: string;
  storage_kind: string;
  plane_key: string;
  status: string;
};

function fail(code: BackupFaultCode): never {
  opsLog("error", "backup_failed", { code });
  throw new CloudBackupError(code);
}

function sha256File(filePath: string): { sha256: string; bytes: number } {
  const bytes = readFileSync(filePath);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.byteLength,
  };
}

function assertOutsideCloudRoot(cloudRoot: string, backupRoot: string): void {
  const cloud = resolve(cloudRoot);
  const backup = resolve(backupRoot);
  if (backup === cloud || backup.startsWith(cloud + sep)) {
    fail("backup_inside_cloud_root");
  }
}

async function snapshotSqlite(sourcePath: string, destPath: string): Promise<void> {
  if (!existsSync(sourcePath)) {
    fail("control_plane_missing");
  }
  mkdirSync(dirname(destPath), { recursive: true });
  const db = new Database(sourcePath, { fileMustExist: true, readonly: true });
  try {
    await db.backup(destPath);
  } catch {
    fail("sqlite_backup_failed");
  } finally {
    db.close();
  }
}

function listDocumentFiles(documentsRoot: string): string[] {
  if (!existsSync(documentsRoot)) {
    return [];
  }
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.isFile()) {
        files.push(full);
      }
    }
  };
  walk(documentsRoot);
  return files.sort();
}

function readControlInventory(controlSqlitePath: string): {
  organizations: ControlOrgRow[];
  planes: ControlPlaneRow[];
  controlMigrations: string[];
} {
  const db = new Database(controlSqlitePath, { fileMustExist: true, readonly: true });
  try {
    const organizations = db
      .prepare(
        `SELECT organization_id, slug, display_name, status
         FROM organizations
         ORDER BY organization_id`,
      )
      .all() as ControlOrgRow[];
    const planes = db
      .prepare(
        `SELECT plane_id, organization_id, storage_kind, plane_key, status
         FROM operational_planes
         ORDER BY plane_id`,
      )
      .all() as ControlPlaneRow[];
    const controlMigrations = db
      .prepare("SELECT id FROM schema_migrations ORDER BY id")
      .all()
      .map((row) => (row as { id: string }).id);
    return { organizations, planes, controlMigrations };
  } finally {
    db.close();
  }
}

function resolveBackupRoot(env: NodeJS.ProcessEnv, explicit?: string): string {
  const root = explicit?.trim() || env.WORKOS_BACKUP_ROOT?.trim();
  if (!root) {
    fail("backup_root_missing");
  }
  return root;
}

export async function createCloudBackup(input: {
  cloudRoot?: string;
  backupRoot?: string;
  env?: NodeJS.ProcessEnv;
  createdAt?: string;
}): Promise<CloudBackupResult> {
  const env = input.env ?? process.env;
  let cloudRoot: string;
  try {
    cloudRoot = input.cloudRoot?.trim() || resolveCloudRoot(env);
  } catch {
    fail("cloud_root_missing");
  }
  const backupRoot = resolveBackupRoot(env, input.backupRoot);
  assertOutsideCloudRoot(cloudRoot, backupRoot);

  const controlSource = join(cloudRoot, "control", "control-plane.sqlite");
  if (!existsSync(controlSource)) {
    fail("control_plane_missing");
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, "-");
  const backupDir = join(backupRoot, `bkp-${stamp}-${randomBytes(4).toString("hex")}`);
  mkdirSync(backupDir, { recursive: true });

  const controlDest = join(backupDir, "control", "control-plane.sqlite");
  await snapshotSqlite(controlSource, controlDest);

  const inventory = readControlInventory(controlSource);
  const artifacts: BackupArtifact[] = [];
  const controlHash = sha256File(controlDest);
  artifacts.push({
    path: "control/control-plane.sqlite",
    sha256: controlHash.sha256,
    kind: "sqlite",
    bytes: controlHash.bytes,
  });

  const organizationRecords: BackupOrganizationRecord[] = [];
  for (const plane of inventory.planes) {
    const paths = derivePlanePaths(cloudRoot, plane.plane_key);
    if (!existsSync(paths.sqlitePath)) {
      fail("plane_missing");
    }
    const prefix = `organizations/${plane.plane_key}`;
    const planeSqliteDest = join(backupDir, prefix, "product-system.sqlite");
    await snapshotSqlite(paths.sqlitePath, planeSqliteDest);
    const sqliteHash = sha256File(planeSqliteDest);
    artifacts.push({
      path: `${prefix}/product-system.sqlite`,
      sha256: sqliteHash.sha256,
      kind: "sqlite",
      bytes: sqliteHash.bytes,
    });

    const identityDb = new Database(paths.sqlitePath, { fileMustExist: true, readonly: true });
    try {
      const identity = readOperationalPlaneIdentity(identityDb);
      if (
        !identity ||
        identity.planeId !== plane.plane_id ||
        identity.organizationId !== plane.organization_id
      ) {
        fail("plane_missing");
      }
    } finally {
      identityDb.close();
    }

    if (existsSync(paths.documentsRoot) && !statSync(paths.documentsRoot).isDirectory()) {
      fail("documents_missing");
    }
    const documents = listDocumentFiles(paths.documentsRoot);
    for (const file of documents) {
      const rel = relative(paths.documentsRoot, file).split(sep).join("/");
      const dest = join(backupDir, prefix, "documents", ...rel.split("/"));
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(file, dest);
      const hashed = sha256File(dest);
      artifacts.push({
        path: `${prefix}/documents/${rel}`,
        sha256: hashed.sha256,
        kind: "document",
        bytes: hashed.bytes,
      });
    }

    const organization = inventory.organizations.find(
      (row) => row.organization_id === plane.organization_id,
    );
    if (organization) {
      organizationRecords.push({
        organizationId: organization.organization_id,
        slug: organization.slug,
        displayName: organization.display_name,
        status: organization.status,
        planeId: plane.plane_id,
        storageKind: plane.storage_kind,
        artifactPrefix: prefix,
      });
    }
  }

  const manifest: CloudBackupManifest = {
    version: CLOUD_BACKUP_VERSION,
    createdAt,
    service: HEALTH_SERVICE_NAME,
    apiContractId: API_CONTRACT_ID,
    controlPlaneMigrations: inventory.controlMigrations.length
      ? inventory.controlMigrations
      : listControlPlaneMigrationFiles(),
    operationalMigrations: listOperationalMigrationFiles(),
    organizationCount: inventory.organizations.length,
    planeCount: inventory.planes.length,
    artifacts,
    organizations: organizationRecords,
  };
  writeFileSync(join(backupDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  opsLog("info", "backup_succeeded", {
    organizationCount: manifest.organizationCount,
    planeCount: manifest.planeCount,
  });
  return { backupDir, manifest };
}
