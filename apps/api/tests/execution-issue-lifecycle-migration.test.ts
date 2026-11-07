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

const MIGRATION = "052_execution_issue_lifecycle.sql";
const temps: Array<{ dir: string; db: SqliteDatabase }> = [];

afterEach(() => {
  for (const item of temps.splice(0)) {
    item.db.close();
    rmSync(item.dir, { recursive: true, force: true });
  }
});

function openPlane(): SqliteDatabase {
  const dir = mkdtempSync(join(tmpdir(), "workos-issue-mig-"));
  const db = openSqliteDatabaseWithoutMigrations(join(dir, "plane.sqlite"));
  temps.push({ dir, db });
  return db;
}

describe("migration 052 execution issue lifecycle", () => {
  it("adds the lifecycle table on a new isolated database", () => {
    const db = openPlane();
    applyMigrations(db);
    const table = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'execution_task_issue_lifecycle'")
      .get() as { name: string } | undefined;
    expect(table?.name).toBe("execution_task_issue_lifecycle");
    expect(
      (db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION) as { id: string } | undefined)?.id,
    ).toBe(MIGRATION);
  });

  it("applies to a legacy synthetic database migrated through 051 without rewriting dossier entries", () => {
    const db = openPlane();
    const prior = listOperationalMigrationFiles().filter((file) => file < MIGRATION);
    expect(prior.at(-1)).toBe("051_commercial_closure_ledger.sql");
    applySelectedMigrations(db, prior);
    db.exec(`
      INSERT INTO execution_plans (
        plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
        inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
      ) VALUES ('plan:1', 'snap:1', 'hash', 'P', 'Produs', 'ABC', '2026-11-07T00:00:00.000Z', 'OPEN', 1, 1, 0, 'RON', 'PARTIAL');
      INSERT INTO execution_tasks (
        task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
        seq, seq_label, required_capability_id, required_capability_label, status, created_at,
        quantities_json, resources_json
      ) VALUES ('task:1', 'plan:1', 'op:1', 'CUT', 'Debitare', 'FACE', 'Față', 1, '01', 'CNC', 'CNC', 'PLANNED', '2026-11-07T00:00:00.000Z', '{}', '[]');
      INSERT INTO execution_task_dossier_entries (
        entry_id, plan_id, task_id, job_id, kind, body, reason_code, author_account_id, created_at
      ) VALUES ('den:legacy', 'plan:1', 'task:1', 'job:1', 'ISSUE_REPORT', 'Vibrație', 'MACHINE', 'acct', '2026-11-07T00:00:00.000Z');
    `);
    const before = db
      .prepare("SELECT entry_id, body, reason_code FROM execution_task_dossier_entries WHERE entry_id = 'den:legacy'")
      .get() as { entry_id: string; body: string; reason_code: string };
    applySelectedMigrations(db, [...prior, MIGRATION]);
    const after = db
      .prepare("SELECT entry_id, body, reason_code FROM execution_task_dossier_entries WHERE entry_id = 'den:legacy'")
      .get() as { entry_id: string; body: string; reason_code: string };
    expect(after).toEqual(before);
    expect(
      db.prepare("SELECT entry_id FROM execution_task_issue_lifecycle WHERE entry_id = 'den:legacy'").get(),
    ).toBeUndefined();
  });
});
