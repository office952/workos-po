import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyMigrationSql,
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabaseWithoutMigrations,
  type SqliteDatabase,
} from "../src/persistence/sqlite.js";

const MIGRATION = "044_execution_task_dossier.sql";
const PRIOR = "043_job_material_request_quantity_optional.sql";
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("execution task dossier migration atomicity", () => {
  it("rolls back a partial 044, retries it, and leaves 043 data in place", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-dossier-migration-"));
    temps.push(dir);
    const db = openSqliteDatabaseWithoutMigrations(join(dir, "app.sqlite"));
    try {
      const files = listOperationalMigrationFiles();
      applySelectedMigrations(db, files.filter((file) => file < MIGRATION));
      db.prepare(
        "INSERT INTO customers (customer_id, display_name, status, created_at, updated_at) VALUES ('cus:kept', 'Client păstrat', 'ACTIVE', ?, ?)",
      ).run("2026-10-16T00:00:00.000Z", "2026-10-16T00:00:00.000Z");
      const sql = readFileSync(
        fileURLToPath(new URL("../src/persistence/migrations/044_execution_task_dossier.sql", import.meta.url)),
        "utf8",
      );

      expect(() => applyMigrationSql(db, MIGRATION, sql, () => {
        throw new Error("interrupted after schema statements");
      })).toThrow(/interrupted after schema statements/);

      expect(registered(db, MIGRATION)).toBe(false);
      expect(tableExists(db, "execution_job_artifacts")).toBe(false);
      expect(columnExists(db, "execution_tasks", "provider_binding_source")).toBe(false);
      expect(customerName(db)).toBe("Client păstrat");
      expect(registered(db, PRIOR)).toBe(true);
      expect(tableExists(db, "job_material_requests")).toBe(true);

      applySelectedMigrations(db, files);
      expect(registered(db, MIGRATION)).toBe(true);
      expect(tableExists(db, "execution_job_artifacts")).toBe(true);
      expect(columnExists(db, "execution_job_artifacts", "purpose")).toBe(true);
      expect(columnExists(db, "execution_job_artifacts", "used_at")).toBe(true);
      expect(customerName(db)).toBe("Client păstrat");
      expect(tableExists(db, "job_material_requests")).toBe(true);
    } finally {
      db.close();
    }
  });

  it("rolls back an interrupted 045 on an existing 044 database, then copies single-task usage", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-job-file-migration-"));
    temps.push(dir);
    const db = openSqliteDatabaseWithoutMigrations(join(dir, "app.sqlite"));
    try {
      const files = listOperationalMigrationFiles();
      const next = "045_execution_job_file_archive.sql";
      applySelectedMigrations(db, files.filter((file) => file < next));
      db.prepare(
        "INSERT INTO customers (customer_id, display_name, status, created_at, updated_at) VALUES ('cus:kept', 'Client păstrat', 'ACTIVE', ?, ?)",
      ).run("2026-10-16T00:00:00.000Z", "2026-10-16T00:00:00.000Z");
      insertPlan(db);
      insertArtifact(db, "art:one", "2026-10-16T01:00:00.000Z");
      insertArtifact(db, "art:many", "2026-10-16T02:00:00.000Z");
      insertTask(db, "task:a", 1);
      insertTask(db, "task:b", 2);
      link(db, "art:one", "task:a");
      link(db, "art:many", "task:a");
      link(db, "art:many", "task:b");
      const sql = readFileSync(
        fileURLToPath(new URL(`../src/persistence/migrations/${next}`, import.meta.url)),
        "utf8",
      );
      expect(() => applyMigrationSql(db, next, sql, () => {
        throw new Error("interrupted after job archive statements");
      })).toThrow(/interrupted after job archive statements/);
      expect(registered(db, next)).toBe(false);
      expect(columnExists(db, "execution_artifact_task_links", "used_at")).toBe(false);
      expect(columnExists(db, "execution_job_artifacts", "storage_scope")).toBe(false);
      expect(customerName(db)).toBe("Client păstrat");

      applySelectedMigrations(db, files);
      expect(registered(db, next)).toBe(true);
      expect(columnExists(db, "execution_job_artifacts", "storage_scope")).toBe(true);
      expect(linkUsedAt(db, "art:one", "task:a")).toBe("2026-10-16T01:00:00.000Z");
      expect(artifactUsedAt(db, "art:one")).toBeNull();
      expect(linkUsedAt(db, "art:many", "task:a")).toBeNull();
      expect(linkUsedAt(db, "art:many", "task:b")).toBeNull();
      expect(artifactUsedAt(db, "art:many")).toBe("2026-10-16T02:00:00.000Z");
      expect(customerName(db)).toBe("Client păstrat");
      expect(registered(db, PRIOR)).toBe(true);
      db.prepare(
        `
        INSERT INTO execution_job_artifacts (
          artifact_id, plan_id, job_id, original_file_name, mime_type, size_bytes,
          sha256, storage_key, storage_scope, category, preview,
          uploaded_by_account_id, uploaded_at
        ) VALUES ('art:job', NULL, 'job:1', 'nota.txt', 'text/plain', 1, 'aa', 'key-job', 'execution/jobs/job:1', 'DOCUMENT', 'NONE', 'acct', '2026-10-16T03:00:00.000Z')
      `,
      ).run();
      expect(
        (db.prepare("SELECT plan_id FROM execution_job_artifacts WHERE artifact_id = 'art:job'").get() as {
          plan_id: string | null;
        }).plan_id,
      ).toBeNull();
    } finally {
      db.close();
    }
  });

  it("adds purpose columns when 044 was recorded before those columns existed", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-job-file-legacy-"));
    temps.push(dir);
    const db = openSqliteDatabaseWithoutMigrations(join(dir, "app.sqlite"));
    try {
      const files = listOperationalMigrationFiles();
      applySelectedMigrations(db, files.filter((file) => file < MIGRATION));
      db.exec(`
        CREATE TABLE execution_job_artifacts (
          artifact_id TEXT PRIMARY KEY NOT NULL,
          plan_id TEXT NOT NULL,
          job_id TEXT,
          original_file_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size_bytes INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          storage_key TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          preview TEXT NOT NULL,
          supersedes_artifact_id TEXT,
          uploaded_by_account_id TEXT NOT NULL,
          uploaded_by_operator_id TEXT,
          uploaded_at TEXT NOT NULL,
          FOREIGN KEY (plan_id) REFERENCES execution_plans(plan_id)
        );
        CREATE TABLE execution_artifact_task_links (
          artifact_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          linked_at TEXT NOT NULL,
          linked_by_account_id TEXT NOT NULL,
          linked_by_operator_id TEXT,
          PRIMARY KEY (artifact_id, task_id)
        );
      `);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        MIGRATION,
        "2026-10-16T00:00:00.000Z",
      );
      applySelectedMigrations(db, files);
      expect(columnExists(db, "execution_job_artifacts", "purpose")).toBe(true);
      expect(columnExists(db, "execution_job_artifacts", "used_at")).toBe(true);
      expect(columnExists(db, "execution_job_artifacts", "storage_scope")).toBe(true);
      expect(columnExists(db, "execution_artifact_task_links", "used_at")).toBe(true);
      expect(registered(db, "045_execution_job_file_archive.sql")).toBe(true);
    } finally {
      db.close();
    }
  });
});

function registered(db: SqliteDatabase, id: string): boolean {
  return db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(id) !== undefined;
}

function tableExists(db: SqliteDatabase, name: string): boolean {
  return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function columnExists(db: SqliteDatabase, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return columns.some((item) => item.name === column);
}

function insertPlan(db: SqliteDatabase): void {
  db.prepare(
    `
    INSERT INTO execution_plans (
      plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
      inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
    ) VALUES ('plan:1', 'snap:1', 'hash', 'P', 'Produs', 'ABC', '2026-10-16T00:00:00.000Z', 'OPEN', 1, 2, 0, 'RON', 'PARTIAL')
  `,
  ).run();
}

function insertTask(db: SqliteDatabase, taskId: string, seq: number): void {
  db.prepare(
    `
    INSERT INTO execution_tasks (
      task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
      seq, seq_label, required_capability_id, required_capability_label, status, created_at,
      quantities_json, resources_json
    ) VALUES (?, 'plan:1', ?, 'CUT', 'Debitare', 'FACE', 'Față', ?, ?, 'CNC', 'CNC', 'PLANNED', '2026-10-16T00:00:00.000Z', '{}', '[]')
  `,
  ).run(taskId, `op:${taskId}`, seq, `0${seq}`);
}

function insertArtifact(db: SqliteDatabase, artifactId: string, usedAt: string): void {
  db.prepare(
    `
    INSERT INTO execution_job_artifacts (
      artifact_id, plan_id, job_id, original_file_name, mime_type, size_bytes, sha256,
      storage_key, category, preview, uploaded_by_account_id, uploaded_at, used_at
    ) VALUES (?, 'plan:1', 'job:1', ?, 'application/pdf', 4, ?, ?, 'DOCUMENT', 'NONE', 'acct', '2026-10-16T00:00:00.000Z', ?)
  `,
  ).run(artifactId, `${artifactId}.pdf`, artifactId, `key-${artifactId}`, usedAt);
}

function link(db: SqliteDatabase, artifactId: string, taskId: string): void {
  db.prepare(
    `
    INSERT INTO execution_artifact_task_links (
      artifact_id, task_id, plan_id, linked_at, linked_by_account_id
    ) VALUES (?, ?, 'plan:1', '2026-10-16T00:00:00.000Z', 'acct')
  `,
  ).run(artifactId, taskId);
}

function linkUsedAt(db: SqliteDatabase, artifactId: string, taskId: string): string | null {
  return (db.prepare(
    "SELECT used_at FROM execution_artifact_task_links WHERE artifact_id = ? AND task_id = ?",
  ).get(artifactId, taskId) as { used_at: string | null }).used_at;
}

function artifactUsedAt(db: SqliteDatabase, artifactId: string): string | null {
  return (db.prepare("SELECT used_at FROM execution_job_artifacts WHERE artifact_id = ?").get(artifactId) as {
    used_at: string | null;
  }).used_at;
}

function customerName(db: SqliteDatabase): string {
  return (db.prepare("SELECT display_name FROM customers WHERE customer_id = 'cus:kept'").get() as {
    display_name: string;
  }).display_name;
}
