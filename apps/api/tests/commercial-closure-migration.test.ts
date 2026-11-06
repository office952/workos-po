import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyMigrations,
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabaseWithoutMigrations,
  type SqliteDatabase,
} from "../src/persistence/sqlite.js";

const MIGRATION = "051_commercial_closure_ledger.sql";
const TABLES = [
  "commercial_request_ledger",
  "commercial_ledger_operations",
  "commercial_ledger_events",
  "commercial_offer_dispositions",
] as const;
const temps: Array<{ dir: string; db: SqliteDatabase }> = [];

afterEach(() => {
  for (const item of temps.splice(0)) {
    item.db.close();
    rmSync(item.dir, { recursive: true, force: true });
  }
});

function openPlane(): SqliteDatabase {
  const dir = mkdtempSync(join(tmpdir(), "workos-closure-mig-"));
  const db = openSqliteDatabaseWithoutMigrations(join(dir, "plane.sqlite"));
  temps.push({ dir, db });
  return db;
}

function tableNames(db: SqliteDatabase): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'commercial_%' ORDER BY name`)
      .all() as { name: string }[]
  ).map((row) => row.name);
}

describe("migration 051 commercial closure ledger", () => {
  it("creates the ledger tables on a new isolated database", () => {
    const db = openPlane();
    applyMigrations(db);
    for (const name of TABLES) {
      expect(tableNames(db)).toContain(name);
    }
    const registrations = db
      .prepare("SELECT id FROM schema_migrations WHERE id = ?")
      .get(MIGRATION) as { id: string } | undefined;
    expect(registrations?.id).toBe(MIGRATION);
  });

  it("applies to a legacy synthetic database migrated through 050 without rewriting snapshots", () => {
    const db = openPlane();
    const prior = listOperationalMigrationFiles().filter((file) => file < MIGRATION);
    expect(prior.at(-1)).toBe("050_organization_product_preset_revisions.sql");
    applySelectedMigrations(db, prior);
    db.exec(`
      INSERT INTO customers (customer_id, display_name, status, created_at, updated_at)
      VALUES ('cus:legacy', 'Legacy', 'ACTIVE', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `);
    db.exec(`
      INSERT INTO commercial_requests (
        request_id, reference, customer_id, title, description, status, created_at, updated_at
      ) VALUES (
        'crq:legacy', 'CER-LEGACY1', 'cus:legacy', 'Cerere veche', 'Descriere', 'NEW',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
      )
    `);
    const before = db
      .prepare("SELECT request_id, title, status FROM commercial_requests WHERE request_id = 'crq:legacy'")
      .get() as JsonRow;
    applySelectedMigrations(db, [...prior, MIGRATION]);
    const after = db
      .prepare("SELECT request_id, title, status FROM commercial_requests WHERE request_id = 'crq:legacy'")
      .get() as JsonRow;
    expect(after).toEqual(before);
    expect(tableNames(db)).toEqual(expect.arrayContaining([...TABLES]));
    const ledger = db
      .prepare("SELECT COUNT(*) AS count FROM commercial_request_ledger")
      .get() as { count: number };
    expect(ledger.count).toBe(0);
  });

  it("is idempotent when applied twice", () => {
    const db = openPlane();
    applyMigrations(db);
    applyMigrations(db);
    const registrations = db
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?")
      .get(MIGRATION) as { count: number };
    expect(registrations.count).toBe(1);
  });
});

type JsonRow = Record<string, unknown>;
