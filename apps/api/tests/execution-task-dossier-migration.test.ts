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

function customerName(db: SqliteDatabase): string {
  return (db.prepare("SELECT display_name FROM customers WHERE customer_id = 'cus:kept'").get() as {
    display_name: string;
  }).display_name;
}
