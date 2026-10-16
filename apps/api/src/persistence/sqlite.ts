import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export type SqliteDatabase = InstanceType<typeof Database>;

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Canonical WorkOS application data root.
 * SQLite and document bytes both live under this boundary (unless SQLITE_PATH overrides DB).
 *
 * Under Vitest, ambient DEV WORKOS_DATA_DIR cannot win. Tests may still set
 * WORKOS_DATA_DIR to an OS-temp directory for per-suite isolation.
 */
export function resolveWorkosDataDir(): string {
  if (process.env.VITEST) {
    return resolveVitestDataDir();
  }
  if (process.env.WORKOS_DATA_DIR) {
    const dataDir = process.env.WORKOS_DATA_DIR;
    mkdirSync(dataDir, { recursive: true });
    return dataDir;
  }
  const dataDir = join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

export function resolveProductSystemSqlitePath(): string {
  if (process.env.VITEST) {
    return ":memory:";
  }
  if (process.env.WORKOS_SQLITE_PATH) {
    return process.env.WORKOS_SQLITE_PATH;
  }
  return join(resolveWorkosDataDir(), "product-system.sqlite");
}

export function configureOperationalSqlite(
  db: SqliteDatabase,
  filePath: string,
): void {
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  if (filePath !== ":memory:") {
    db.pragma("journal_mode = WAL");
  }
}

export function openSqliteDatabaseWithoutMigrations(
  filePath: string,
): SqliteDatabase {
  if (filePath !== ":memory:") {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const db = new Database(filePath);
  configureOperationalSqlite(db, filePath);
  return db;
}

export function openSqliteDatabase(filePath: string): SqliteDatabase {
  const db = openSqliteDatabaseWithoutMigrations(filePath);
  applyMigrations(db);
  return db;
}

export function listOperationalMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function applyMigrations(db: SqliteDatabase): void {
  applySelectedMigrations(db, listOperationalMigrationFiles());
}

const MATERIAL_REQUEST_QUANTITY_MIGRATION = "043_job_material_request_quantity_optional.sql";
const MATERIAL_REQUEST_TABLE = "job_material_requests";
const MATERIAL_REQUEST_SHADOW = "job_material_requests__qty";

/**
 * A crashed non-transactional rebuild can leave the shadow table behind.
 * When the source table still exists, the shadow is an unfinished copy.
 * When only the shadow exists, it holds the copied rows and becomes the source.
 */
function recoverInterruptedMaterialRequestRebuild(db: SqliteDatabase): void {
  const names = new Set(
    db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?)",
    ).all(MATERIAL_REQUEST_TABLE, MATERIAL_REQUEST_SHADOW).map(
      (row) => (row as { name: string }).name,
    ),
  );
  if (names.has(MATERIAL_REQUEST_SHADOW) && names.has(MATERIAL_REQUEST_TABLE)) {
    db.exec(`DROP TABLE ${MATERIAL_REQUEST_SHADOW}`);
    return;
  }
  if (names.has(MATERIAL_REQUEST_SHADOW)) {
    db.exec(`ALTER TABLE ${MATERIAL_REQUEST_SHADOW} RENAME TO ${MATERIAL_REQUEST_TABLE}`);
  }
}

export function applySelectedMigrations(
  db: SqliteDatabase,
  files: readonly string[],
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT id FROM schema_migrations")
      .all()
      .map((row) => (row as { id: string }).id),
  );

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      if (file === MATERIAL_REQUEST_QUANTITY_MIGRATION) {
        recoverInterruptedMaterialRequestRebuild(db);
      }
      if (migrationManagesOwnTransaction(sql)) {
        db.exec(sql);
        db.prepare(
          "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
        ).run(file, new Date().toISOString());
      } else {
        applyMigrationSql(db, file, sql);
      }
    } catch (error) {
      try {
        if (db.inTransaction) {
          db.exec("ROLLBACK");
        }
      } finally {
        db.pragma("foreign_keys = ON");
      }
      throw error;
    }
  }
}

/**
 * Schema changes and the ledger row commit together.
 * A throw after partial SQL rolls the schema back and leaves the ledger unchanged.
 * Migration 043 already opens its own immediate transaction; wrapping it again is invalid.
 */
export function applyMigrationSql(
  db: SqliteDatabase,
  id: string,
  sql: string,
  beforeLedger?: () => void,
): void {
  const commit = db.transaction(() => {
    db.exec(sql);
    beforeLedger?.();
    db.prepare(
      "INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)",
    ).run(id, new Date().toISOString());
  });
  commit();
}

function migrationManagesOwnTransaction(sql: string): boolean {
  return /^\s*BEGIN IMMEDIATE\s*;/m.test(sql);
}

function resolveVitestDataDir(): string {
  const requested = process.env.WORKOS_DATA_DIR;
  if (requested && isUnderOsTemp(requested)) {
    mkdirSync(requested, { recursive: true });
    return requested;
  }
  const fallback = process.env.WORKOS_TEST_DATA_DIR;
  if (fallback && isUnderOsTemp(fallback)) {
    mkdirSync(fallback, { recursive: true });
    return fallback;
  }
  const auto = join(tmpdir(), "workos-vitest-fallback");
  mkdirSync(auto, { recursive: true });
  return auto;
}

function isUnderOsTemp(dir: string): boolean {
  const tmp = resolve(tmpdir());
  const candidate = resolve(dir);
  return candidate === tmp || candidate.startsWith(tmp + sep);
}
