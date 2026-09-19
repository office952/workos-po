import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import Database from "better-sqlite3";
import { API_CONTRACT_ID, HEALTH_SERVICE_NAME } from "../ops/contract.js";
import { opsLog } from "../ops/log.js";
import { listControlPlaneMigrationFiles } from "../persistence/controlPlaneSqlite.js";
import {
  migrationSetsEqual,
  readSqliteMigrationIds,
} from "../persistence/schemaLedger.js";
import { listOperationalMigrationFiles } from "../persistence/sqlite.js";
import { derivePlanePaths } from "./paths.js";
import { readOperationalPlaneIdentity } from "./planeIdentity.js";
import {
  CLOUD_BACKUP_VERSION,
  type BackupArtifact,
  type BackupOrganizationRecord,
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
  | "control_plane_open_failed"
  | "schema_mismatch";

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

const SHA256_HEX = /^[0-9a-f]{64}$/;

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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function resolveConfinedBackupPath(backupDir: string, artifactPath: string): string {
  if (!isNonEmptyString(artifactPath) || artifactPath.length > 1024) {
    fail("invalid_manifest");
  }
  if (artifactPath.includes("\0")) {
    fail("invalid_manifest");
  }
  const unified = artifactPath.replace(/\\/g, "/");
  if (isAbsolute(artifactPath) || isAbsolute(unified)) {
    fail("invalid_manifest");
  }
  if (unified.startsWith("/") || artifactPath.startsWith("/") || artifactPath.startsWith("\\")) {
    fail("invalid_manifest");
  }
  if (/^[a-zA-Z]:/.test(artifactPath) || /^[a-zA-Z]:/.test(unified)) {
    fail("invalid_manifest");
  }
  const parts = unified.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.includes("\0"))) {
    fail("invalid_manifest");
  }
  const backupRoot = resolve(backupDir);
  const resolved = resolve(backupRoot, ...parts);
  const prefix = backupRoot.endsWith(sep) ? backupRoot : backupRoot + sep;
  if (resolved !== backupRoot && !resolved.startsWith(prefix)) {
    fail("invalid_manifest");
  }
  return resolved;
}

function validateArtifact(artifact: unknown): BackupArtifact {
  if (!artifact || typeof artifact !== "object") {
    fail("invalid_manifest");
  }
  const record = artifact as BackupArtifact;
  if (!isNonEmptyString(record.path)) {
    fail("invalid_manifest");
  }
  if (record.kind !== "sqlite" && record.kind !== "document") {
    fail("invalid_manifest");
  }
  if (!isNonEmptyString(record.sha256) || !SHA256_HEX.test(record.sha256)) {
    fail("invalid_manifest");
  }
  if (!isCount(record.bytes)) {
    fail("invalid_manifest");
  }
  return {
    path: record.path,
    sha256: record.sha256,
    kind: record.kind,
    bytes: record.bytes,
  };
}

function validateOrganizationRecord(record: unknown): BackupOrganizationRecord {
  if (!record || typeof record !== "object") {
    fail("invalid_manifest");
  }
  const item = record as BackupOrganizationRecord;
  if (
    !isNonEmptyString(item.organizationId) ||
    !isNonEmptyString(item.slug) ||
    !isNonEmptyString(item.displayName) ||
    !isNonEmptyString(item.status) ||
    !isNonEmptyString(item.planeId) ||
    !isNonEmptyString(item.storageKind) ||
    !isNonEmptyString(item.artifactPrefix)
  ) {
    fail("invalid_manifest");
  }
  resolveConfinedBackupPath(resolve("."), item.artifactPrefix);
  return {
    organizationId: item.organizationId,
    slug: item.slug,
    displayName: item.displayName,
    status: item.status,
    planeId: item.planeId,
    storageKind: item.storageKind,
    artifactPrefix: item.artifactPrefix,
  };
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
  const raw = parsed as CloudBackupManifest;
  if (typeof raw.version !== "string") {
    fail("invalid_manifest");
  }
  if (raw.version !== CLOUD_BACKUP_VERSION) {
    fail("unsupported_backup_version");
  }
  if (raw.service !== HEALTH_SERVICE_NAME || raw.apiContractId !== API_CONTRACT_ID) {
    fail("invalid_manifest");
  }
  if (!isNonEmptyString(raw.createdAt)) {
    fail("invalid_manifest");
  }
  if (!Array.isArray(raw.artifacts) || !Array.isArray(raw.organizations)) {
    fail("invalid_manifest");
  }
  if (!Array.isArray(raw.controlPlaneMigrations) || !Array.isArray(raw.operationalMigrations)) {
    fail("invalid_manifest");
  }
  if (
    !raw.controlPlaneMigrations.every((id) => isNonEmptyString(id)) ||
    !raw.operationalMigrations.every((id) => isNonEmptyString(id))
  ) {
    fail("invalid_manifest");
  }
  if (!isCount(raw.organizationCount) || !isCount(raw.planeCount)) {
    fail("invalid_manifest");
  }
  const artifacts = raw.artifacts.map(validateArtifact);
  const organizations = raw.organizations.map(validateOrganizationRecord);
  const artifactPaths = new Set<string>();
  for (const artifact of artifacts) {
    if (artifactPaths.has(artifact.path)) {
      fail("invalid_manifest");
    }
    artifactPaths.add(artifact.path);
  }
  const organizationIds = new Set<string>();
  const planeIds = new Set<string>();
  const prefixes = new Set<string>();
  for (const organization of organizations) {
    if (
      organizationIds.has(organization.organizationId) ||
      planeIds.has(organization.planeId) ||
      prefixes.has(organization.artifactPrefix)
    ) {
      fail("invalid_manifest");
    }
    organizationIds.add(organization.organizationId);
    planeIds.add(organization.planeId);
    prefixes.add(organization.artifactPrefix);
  }
  if (organizations.length !== raw.planeCount) {
    fail("invalid_manifest");
  }
  return {
    version: CLOUD_BACKUP_VERSION,
    createdAt: raw.createdAt,
    service: HEALTH_SERVICE_NAME,
    apiContractId: API_CONTRACT_ID,
    controlPlaneMigrations: raw.controlPlaneMigrations,
    operationalMigrations: raw.operationalMigrations,
    organizationCount: raw.organizationCount,
    planeCount: raw.planeCount,
    artifacts,
    organizations,
  };
}

function verifyArtifacts(backupDir: string, manifest: CloudBackupManifest): void {
  for (const artifact of manifest.artifacts) {
    const filePath = resolveConfinedBackupPath(backupDir, artifact.path);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      fail("missing_file");
    }
    if (sha256File(filePath) !== artifact.sha256) {
      fail("hash_mismatch");
    }
    if (statSync(filePath).size !== artifact.bytes) {
      fail("invalid_manifest");
    }
  }
}

function requireCurrentSchema(
  actual: readonly string[],
  expected: readonly string[],
  claimed: readonly string[],
): void {
  if (!migrationSetsEqual(actual, expected) || !migrationSetsEqual(actual, claimed)) {
    fail("schema_mismatch");
  }
}

function readLedgerOrMismatch(filePath: string): string[] {
  try {
    return readSqliteMigrationIds(filePath);
  } catch (error) {
    if (error instanceof CloudRestoreError) {
      throw error;
    }
    fail("schema_mismatch");
  }
}

function validateBackupSchemaLedgers(backupDir: string, manifest: CloudBackupManifest): void {
  const expectedControl = listControlPlaneMigrationFiles();
  const expectedOperational = listOperationalMigrationFiles();
  requireCurrentSchema(
    readLedgerOrMismatch(resolveConfinedBackupPath(backupDir, "control/control-plane.sqlite")),
    expectedControl,
    manifest.controlPlaneMigrations,
  );
  if (manifest.planeCount === 0) {
    if (manifest.operationalMigrations.length > 0) {
      fail("schema_mismatch");
    }
    return;
  }
  for (const organization of manifest.organizations) {
    const planeSqlite = resolveConfinedBackupPath(
      backupDir,
      `${organization.artifactPrefix}/product-system.sqlite`,
    );
    requireCurrentSchema(
      readLedgerOrMismatch(planeSqlite),
      expectedOperational,
      manifest.operationalMigrations,
    );
  }
}

function verifyRestoredPlanes(targetRoot: string, manifest: CloudBackupManifest): void {
  const controlPath = join(targetRoot, "control", "control-plane.sqlite");
  if (!existsSync(controlPath)) {
    fail("missing_file");
  }
  let db: InstanceType<typeof Database> | undefined;
  try {
    requireCurrentSchema(
      readSqliteMigrationIds(controlPath),
      listControlPlaneMigrationFiles(),
      manifest.controlPlaneMigrations,
    );
    db = new Database(controlPath, { fileMustExist: true, readonly: true });
    const organizations = db
      .prepare(`SELECT organization_id FROM organizations ORDER BY organization_id`)
      .all() as Array<{ organization_id: string }>;
    const planes = db
      .prepare(
        `SELECT plane_id, organization_id, plane_key
         FROM operational_planes
         ORDER BY plane_id`,
      )
      .all() as Array<{ plane_id: string; organization_id: string; plane_key: string }>;
    if (organizations.length !== manifest.organizationCount) {
      fail("invalid_manifest");
    }
    if (planes.length !== manifest.planeCount) {
      fail("invalid_manifest");
    }
    const expectedOperational = listOperationalMigrationFiles();
    const mapped = new Set<string>();
    for (const plane of planes) {
      const expected = manifest.organizations.filter(
        (item) => item.organizationId === plane.organization_id,
      );
      if (expected.length !== 1) {
        fail("plane_identity_mismatch");
      }
      const mapping = expected[0];
      if (!mapping || mapping.planeId !== plane.plane_id) {
        fail("plane_identity_mismatch");
      }
      mapped.add(mapping.organizationId);
      const paths = derivePlanePaths(targetRoot, plane.plane_key);
      if (!existsSync(paths.sqlitePath)) {
        fail("missing_file");
      }
      requireCurrentSchema(
        readSqliteMigrationIds(paths.sqlitePath),
        expectedOperational,
        manifest.operationalMigrations,
      );
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
    }
    if (mapped.size !== manifest.organizations.length) {
      fail("plane_identity_mismatch");
    }
    for (const organization of manifest.organizations) {
      if (!mapped.has(organization.organizationId)) {
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
    assertRestoreIsolation(input.sourceCloudRoot, targetRoot);
  }
  assertRestoreIsolation(backupDir, targetRoot);
  if (isNonEmptyDir(targetRoot)) {
    fail("restore_target_not_empty");
  }

  const manifest = readManifest(backupDir);
  verifyArtifacts(backupDir, manifest);
  validateBackupSchemaLedgers(backupDir, manifest);

  mkdirSync(targetRoot, { recursive: true });
  try {
    for (const artifact of manifest.artifacts) {
      const from = resolveConfinedBackupPath(backupDir, artifact.path);
      const to = resolveConfinedBackupPath(targetRoot, artifact.path);
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

export function resolvedRootsOverlap(left: string, right: string): boolean {
  const first = resolve(left);
  const second = resolve(right);
  if (first === second) {
    return true;
  }
  return first.startsWith(second + sep) || second.startsWith(first + sep);
}

function assertRestoreIsolation(otherRoot: string, targetRoot: string): void {
  if (resolvedRootsOverlap(otherRoot, targetRoot)) {
    fail("restore_target_not_isolated");
  }
}

export function assertRestoreTargetIsolated(sourceRoot: string, targetRoot: string): void {
  if (resolvedRootsOverlap(sourceRoot, targetRoot)) {
    throw new CloudRestoreError("restore_target_not_isolated");
  }
}
