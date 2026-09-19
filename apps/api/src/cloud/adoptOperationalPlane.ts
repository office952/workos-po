import { createHash } from "node:crypto";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { applyMigrations, openSqliteDatabaseWithoutMigrations } from "../persistence/sqlite.js";
import { bindOperationalPlaneIdentity } from "./planeIdentity.js";
import type { ControlPlane, OperationalPlaneDescriptor } from "./controlPlane.js";
import { derivePlanePaths } from "./paths.js";

export type AdoptMode = "dry-run" | "execute";

export type AdoptFailPoint =
  | "after-backup"
  | "after-stage-copy"
  | "before-identity-bind"
  | "during-verification";

export type AdoptInput = {
  controlPlane: ControlPlane;
  organizationId: string;
  sourceSqlite: string;
  sourceDocumentsRoot: string;
  mode: AdoptMode;
  /** Test-only seam. Production CLI never sets this. */
  failAt?: AdoptFailPoint;
};

export type SourceFingerprint = {
  sqlitePath: string;
  sqliteSize: number;
  sqliteMtimeMs: number;
  sqliteHash: string;
  walHash: string | null;
  shmHash: string | null;
};

export type AdoptVerification = {
  customers: number;
  people: number;
  activeCostEvidence: number;
  quotes: number;
  orders: number;
  attachments: number;
  documents: number;
  quoteSnapshotId: string | null;
  quoteContentHash: string | null;
};

export type AdoptPlan = {
  mode: AdoptMode;
  organizationId: string;
  planeId: string;
  planeKey: string;
  sourceSqlite: string;
  sourceDocumentsRoot: string;
  destinationPlaneRoot: string;
  stagingRoot: string;
  backupRoot: string;
  precondition: "Source writers must be stopped or the source must be a known-consistent snapshot. Adopt is not online live migration. Copy uses SQLite backup from a read-only handle.";
  wouldCopySqlite: true;
  wouldCopyDocuments: true;
  wouldMigrateDestinationOnly: true;
  wouldBindIdentityOnDestinationOnly: true;
};

export type AdoptResult = {
  plan: AdoptPlan;
  sourceBefore: SourceFingerprint;
  sourceAfter: SourceFingerprint;
  verification?: AdoptVerification;
  backupManifestPath?: string;
  executed: boolean;
};

export class AdoptError extends Error {
  readonly code: string;
  constructor(code: string, message = code) {
    super(message);
    this.name = "AdoptError";
    this.code = code;
  }
}

export function fingerprintSqlite(sqlitePath: string): SourceFingerprint {
  const sqlite = statAndHash(sqlitePath);
  const walPath = `${sqlitePath}-wal`;
  const shmPath = `${sqlitePath}-shm`;
  return {
    sqlitePath,
    sqliteSize: sqlite.size,
    sqliteMtimeMs: sqlite.mtimeMs,
    sqliteHash: sqlite.hash,
    walHash: existsSync(walPath) ? hashFile(walPath) : null,
    shmHash: existsSync(shmPath) ? hashFile(shmPath) : null,
  };
}

export async function adoptOperationalPlane(input: AdoptInput): Promise<AdoptResult> {
  const sourceSqlite = assertAbsoluteExistingFile(input.sourceSqlite, "missing_sqlite");
  const sourceDocumentsRoot = assertAbsoluteExistingDir(
    input.sourceDocumentsRoot,
    "missing_documents_root",
  );
  const cloudRoot = resolve(input.controlPlane.cloudRoot);
  rejectIfInsideCloudRoot(sourceSqlite, cloudRoot);
  rejectIfInsideCloudRoot(sourceDocumentsRoot, cloudRoot);

  const plane = input.controlPlane.getPlaneByOrganization(input.organizationId);
  if (!plane) {
    throw new AdoptError("plane_missing");
  }
  if (plane.bootstrapPolicy !== "ADOPT_EXISTING") {
    throw new AdoptError("bootstrap_policy_not_adopt_existing");
  }

  const paths = derivePlanePaths(cloudRoot, plane.planeKey);
  if (existsSync(paths.planeRoot) || existsSync(paths.sqlitePath)) {
    throw new AdoptError("destination_collision");
  }

  const utc = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = join(cloudRoot, "backups", `adopt-${utc}`);
  const stagingRoot = `${paths.planeRoot}.staging`;
  const plan: AdoptPlan = {
    mode: input.mode,
    organizationId: plane.organizationId,
    planeId: plane.planeId,
    planeKey: plane.planeKey,
    sourceSqlite,
    sourceDocumentsRoot,
    destinationPlaneRoot: paths.planeRoot,
    stagingRoot,
    backupRoot,
    precondition:
      "Source writers must be stopped or the source must be a known-consistent snapshot. Adopt is not online live migration. Copy uses SQLite backup from a read-only handle.",
    wouldCopySqlite: true,
    wouldCopyDocuments: true,
    wouldMigrateDestinationOnly: true,
    wouldBindIdentityOnDestinationOnly: true,
  };

  const sourceBefore = fingerprintSqlite(sourceSqlite);
  if (input.mode === "dry-run") {
    return {
      plan,
      sourceBefore,
      sourceAfter: fingerprintSqlite(sourceSqlite),
      executed: false,
    };
  }

  let promoted = false;
  try {
    writeAdoptBackup(backupRoot, sourceSqlite, sourceDocumentsRoot, sourceBefore, plane);
    failIf(input.failAt, "after-backup");
    rmSync(stagingRoot, { recursive: true, force: true });
    mkdirSync(join(stagingRoot, "documents"), { recursive: true });
    const stagedSqlite = join(stagingRoot, "product-system.sqlite");
    await copySqliteViaBackup(sourceSqlite, stagedSqlite);
    cpSync(sourceDocumentsRoot, join(stagingRoot, "documents"), { recursive: true });
    failIf(input.failAt, "after-stage-copy");
    failIf(input.failAt, "before-identity-bind");
    migrateAndBindDestination(stagedSqlite, plane);
    failIf(input.failAt, "during-verification");
    const verification = readVerification(stagedSqlite, join(stagingRoot, "documents"));
    const sourceAfter = fingerprintSqlite(sourceSqlite);
    assertUnchanged(sourceBefore, sourceAfter);
    mkdirSync(join(cloudRoot, "organizations"), { recursive: true });
    renameSync(stagingRoot, paths.planeRoot);
    promoted = true;
    return {
      plan,
      sourceBefore,
      sourceAfter,
      verification,
      backupManifestPath: join(backupRoot, "manifest.json"),
      executed: true,
    };
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    if (!promoted) {
      rmSync(paths.planeRoot, { recursive: true, force: true });
      input.controlPlane.removePlane(plane.planeId);
    }
    throw error;
  }
}

function migrateAndBindDestination(
  sqlitePath: string,
  plane: OperationalPlaneDescriptor,
): void {
  const db = openSqliteDatabaseWithoutMigrations(sqlitePath);
  try {
    applyMigrations(db);
    bindOperationalPlaneIdentity(db, {
      planeId: plane.planeId,
      organizationId: plane.organizationId,
    });
  } finally {
    db.close();
  }
}

function readVerification(sqlitePath: string, documentsRoot: string): AdoptVerification {
  const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  try {
    const count = (sql: string) => {
      try {
        return (db.prepare(sql).get() as { n: number }).n;
      } catch {
        return 0;
      }
    };
    const quote = (() => {
      try {
        return db
          .prepare(
            `SELECT quote_snapshot_id, content_hash
             FROM quote_snapshots
             ORDER BY created_at
             LIMIT 1`,
          )
          .get() as { quote_snapshot_id: string; content_hash: string } | undefined;
      } catch {
        return undefined;
      }
    })();
    return {
      customers: count("SELECT COUNT(*) AS n FROM customers"),
      people: count("SELECT COUNT(*) AS n FROM people"),
      activeCostEvidence: count(
        "SELECT COUNT(*) AS n FROM resource_cost_evidence WHERE superseded_at IS NULL",
      ),
      quotes: count("SELECT COUNT(*) AS n FROM quote_snapshots"),
      orders: count("SELECT COUNT(*) AS n FROM order_snapshots"),
      attachments: count("SELECT COUNT(*) AS n FROM commercial_request_attachments"),
      documents: countFiles(documentsRoot),
      quoteSnapshotId: quote?.quote_snapshot_id ?? null,
      quoteContentHash: quote?.content_hash ?? null,
    };
  } finally {
    db.close();
  }
}

function writeAdoptBackup(
  backupRoot: string,
  sourceSqlite: string,
  sourceDocumentsRoot: string,
  fingerprint: SourceFingerprint,
  plane: OperationalPlaneDescriptor,
): void {
  mkdirSync(join(backupRoot, "documents"), { recursive: true });
  copyFileSync(sourceSqlite, join(backupRoot, "product-system.sqlite"));
  const wal = `${sourceSqlite}-wal`;
  const shm = `${sourceSqlite}-shm`;
  if (existsSync(wal)) {
    copyFileSync(wal, join(backupRoot, "product-system.sqlite-wal"));
  }
  if (existsSync(shm)) {
    copyFileSync(shm, join(backupRoot, "product-system.sqlite-shm"));
  }
  cpSync(sourceDocumentsRoot, join(backupRoot, "documents"), { recursive: true });
  writeFileSync(
    join(backupRoot, "manifest.json"),
    JSON.stringify(
      {
        sourceSqlite,
        sourceDocumentsRoot,
        utc: new Date().toISOString(),
        sqliteSize: fingerprint.sqliteSize,
        sqliteHash: fingerprint.sqliteHash,
        destinationPlaneId: plane.planeId,
        destinationOrganizationId: plane.organizationId,
      },
      null,
      2,
    ),
  );
}

async function copySqliteViaBackup(sourcePath: string, destPath: string): Promise<void> {
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destPath);
  } finally {
    source.close();
  }
}

function assertAbsoluteExistingFile(path: string, code: string): string {
  if (!isAbsolute(path)) {
    throw new AdoptError("relative_source_path");
  }
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new AdoptError(code);
  }
  return resolve(path);
}

function assertAbsoluteExistingDir(path: string, code: string): string {
  if (!isAbsolute(path)) {
    throw new AdoptError("relative_source_path");
  }
  if (!existsSync(path) || !statSync(path).isDirectory()) {
    throw new AdoptError(code);
  }
  return resolve(path);
}

function rejectIfInsideCloudRoot(target: string, cloudRoot: string): void {
  const normalizedTarget = resolve(target).toLowerCase();
  const normalizedRoot = `${resolve(cloudRoot).toLowerCase()}${sep}`;
  if (
    normalizedTarget === resolve(cloudRoot).toLowerCase() ||
    normalizedTarget.startsWith(normalizedRoot)
  ) {
    throw new AdoptError("source_inside_cloud_root");
  }
}

export function sourceFingerprintsEqual(
  left: SourceFingerprint,
  right: SourceFingerprint,
): boolean {
  return (
    left.sqlitePath === right.sqlitePath &&
    left.sqliteHash === right.sqliteHash &&
    left.sqliteSize === right.sqliteSize &&
    left.walHash === right.walHash &&
    left.shmHash === right.shmHash
  );
}

function assertUnchanged(before: SourceFingerprint, after: SourceFingerprint): void {
  if (!sourceFingerprintsEqual(before, after)) {
    throw new AdoptError("source_mutated");
  }
}

function failIf(actual: AdoptFailPoint | undefined, expected: AdoptFailPoint): void {
  if (actual === expected) {
    throw new AdoptError("injected_failure");
  }
}

function statAndHash(path: string): { size: number; mtimeMs: number; hash: string } {
  const stat = statSync(path);
  return { size: stat.size, mtimeMs: stat.mtimeMs, hash: hashFile(path) };
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function countFiles(root: string): number {
  if (!existsSync(root)) {
    return 0;
  }
  let total = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next);
      } else if (entry.isFile()) {
        total += 1;
      }
    }
  };
  walk(root);
  return total;
}
