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

const MIGRATION = "043_job_material_request_quantity_optional.sql";
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const HISTORICAL_042 = `
CREATE TABLE job_material_checks (
  check_id TEXT PRIMARY KEY NOT NULL,
  action_key TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('AVAILABLE', 'MISSING')),
  checked_by_person_id TEXT NOT NULL,
  checked_by_label TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES execution_plans(plan_id)
);
CREATE UNIQUE INDEX idx_job_material_checks_action ON job_material_checks(organization_id, action_key);
CREATE INDEX idx_job_material_checks_job ON job_material_checks(organization_id, job_id, resource_id, checked_at DESC);
CREATE TABLE job_material_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  estimated_quantity REAL NOT NULL CHECK(estimated_quantity > 0),
  requested_quantity REAL NOT NULL CHECK(requested_quantity >= estimated_quantity),
  unit TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('REQUESTED', 'CANCELLED', 'FULFILLED')),
  source_check_id TEXT NOT NULL UNIQUE REFERENCES job_material_checks(check_id),
  requested_by_person_id TEXT NOT NULL,
  requested_by_label TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES execution_plans(plan_id)
);
CREATE UNIQUE INDEX idx_job_material_requests_open
  ON job_material_requests(organization_id, job_id, plan_id, resource_id)
  WHERE status = 'REQUESTED';
`;

const REBUILD_COLUMNS = `
  request_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  estimated_quantity REAL NOT NULL CHECK(estimated_quantity > 0),
  requested_quantity REAL CHECK(
    requested_quantity IS NULL OR (requested_quantity > 0 AND requested_quantity <= 1000000000)
  ),
  unit TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('REQUESTED', 'CANCELLED', 'FULFILLED')),
  source_check_id TEXT NOT NULL UNIQUE REFERENCES job_material_checks(check_id),
  requested_by_person_id TEXT NOT NULL,
  requested_by_label TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES execution_plans(plan_id)
`;

describe("job material request quantity migration", () => {
  it("builds a clean database with an optional purchase quantity", () => {
    withDb((db) => {
      applyMigrations(db);

      expect(registered(db)).toBe(true);
      expect(shadowExists(db)).toBe(false);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(db.inTransaction).toBe(false);
      expect(tableSql(db)).toContain("requested_quantity IS NULL");
      expect(tableSql(db)).not.toContain("requested_quantity >= estimated_quantity");
      expect(indexNames(db)).toContain("idx_job_material_requests_open");

      insertPlan(db, "plan-clean");
      insertCheck(db, { checkId: "mcheck:clean", planId: "plan-clean", resourceId: "MAT-LED" });
      insertRequest(db, {
        requestId: "mreq:clean", checkId: "mcheck:clean", planId: "plan-clean",
        resourceId: "MAT-LED", estimated: 125, requested: null,
      });
      expect(quantity(db, "mreq:clean")).toBeNull();
      expect(foreignKeyViolations(db)).toEqual([]);
      insertCheck(db, { checkId: "mcheck:zero", planId: "plan-clean", resourceId: "MAT-ZERO" });
      expect(() => insertRequest(db, {
        requestId: "mreq:zero", checkId: "mcheck:zero", planId: "plan-clean",
        resourceId: "MAT-ZERO", estimated: 1, requested: 0,
      })).toThrow(/CHECK/i);
      insertCheck(db, { checkId: "mcheck:orphan", planId: "plan-clean", resourceId: "MAT-ORPHAN" });
      expect(() => insertRequest(db, {
        requestId: "mreq:orphan", checkId: "mcheck:orphan", planId: "plan-missing",
        resourceId: "MAT-ORPHAN", estimated: 1, requested: null,
      })).toThrow(/FOREIGN KEY/i);
      insertCheck(db, { checkId: "mcheck:again", planId: "plan-clean", resourceId: "MAT-LED" });
      expect(() => insertRequest(db, {
        requestId: "mreq:again", checkId: "mcheck:again", planId: "plan-clean",
        resourceId: "MAT-LED", estimated: 125, requested: null,
      })).toThrow(/UNIQUE/i);
    });
  });

  it("keeps valid historical quantities when an older 042 draft is rebuilt", () => {
    withDb((db) => {
      applyHistorical042(db);
      insertPlan(db, "plan-1");
      insertCheck(db, {
        checkId: "mcheck:boundary", planId: "plan-1", resourceId: "MAT-BOUND",
      });
      insertCheck(db, {
        checkId: "mcheck:above", planId: "plan-1", resourceId: "MAT-LED-MODULE",
      });
      insertRequest(db, {
        requestId: "mreq:boundary", checkId: "mcheck:boundary", planId: "plan-1",
        resourceId: "MAT-BOUND", estimated: 120, requested: 120,
      });
      insertRequest(db, {
        requestId: "mreq:above", checkId: "mcheck:above", planId: "plan-1",
        resourceId: "MAT-LED-MODULE", estimated: 120, requested: 140,
      });

      applySelectedMigrations(db, [MIGRATION]);

      expect(row(db, "mreq:boundary")).toEqual({ requested_quantity: 120, estimated_quantity: 120 });
      expect(row(db, "mreq:above")).toEqual({ requested_quantity: 140, estimated_quantity: 120 });
      expect(tableSql(db)).toContain("requested_quantity IS NULL");
      expect(indexNames(db)).toContain("idx_job_material_requests_open");
      expect(foreignKeyViolations(db)).toEqual([]);
      expect(shadowExists(db)).toBe(false);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);

      insertCheck(db, { checkId: "mcheck:new", planId: "plan-1", resourceId: "MAT-POWER" });
      insertRequest(db, {
        requestId: "mreq:new", checkId: "mcheck:new", planId: "plan-1",
        resourceId: "MAT-POWER", estimated: 1, requested: null,
      });
      expect(quantity(db, "mreq:new")).toBeNull();
      insertCheck(db, { checkId: "mcheck:zero", planId: "plan-1", resourceId: "MAT-ZERO" });
      expect(() => insertRequest(db, {
        requestId: "mreq:zero", checkId: "mcheck:zero", planId: "plan-1",
        resourceId: "MAT-ZERO", estimated: 1, requested: 0,
      })).toThrow(/CHECK/i);
    });
  });

  it("rolls back a copy that would reject a historical quantity and then retries", () => {
    withDb((db) => {
      applyHistorical042(db);
      insertPlan(db, "plan-1");
      insertCheck(db, { checkId: "mcheck:kept", planId: "plan-1", resourceId: "MAT-LED" });
      insertCheck(db, { checkId: "mcheck:huge", planId: "plan-1", resourceId: "MAT-HUGE" });
      insertRequest(db, {
        requestId: "mreq:kept", checkId: "mcheck:kept", planId: "plan-1",
        resourceId: "MAT-LED", estimated: 120, requested: 140,
      });
      insertRequest(db, {
        requestId: "mreq:huge", checkId: "mcheck:huge", planId: "plan-1",
        resourceId: "MAT-HUGE", estimated: 1, requested: 1000000001,
      });

      expect(() => applySelectedMigrations(db, [MIGRATION])).toThrow(/CHECK/i);

      expect(registered(db)).toBe(false);
      expect(shadowExists(db)).toBe(false);
      expect(db.inTransaction).toBe(false);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(row(db, "mreq:kept")).toEqual({ requested_quantity: 140, estimated_quantity: 120 });
      expect(quantity(db, "mreq:huge")).toBe(1000000001);
      expect(tableSql(db)).toContain("requested_quantity >= estimated_quantity");

      db.prepare("DELETE FROM job_material_requests WHERE request_id = ?").run("mreq:huge");
      applySelectedMigrations(db, [MIGRATION]);

      expect(registered(db)).toBe(true);
      expect(row(db, "mreq:kept")).toEqual({ requested_quantity: 140, estimated_quantity: 120 });
      expect(quantity(db, "mreq:huge")).toBeUndefined();
      expect(foreignKeyViolations(db)).toEqual([]);
      expect(shadowExists(db)).toBe(false);
    });
  });

  it("rolls back an orphan foreign key and retries after that row is removed", () => {
    withDb((db) => {
      applyHistorical042(db);
      insertPlan(db, "plan-1");
      insertCheck(db, { checkId: "mcheck:kept", planId: "plan-1", resourceId: "MAT-LED" });
      insertCheck(db, { checkId: "mcheck:orphan", planId: "plan-1", resourceId: "MAT-ORPHAN" });
      insertRequest(db, {
        requestId: "mreq:kept", checkId: "mcheck:kept", planId: "plan-1",
        resourceId: "MAT-LED", estimated: 4, requested: 4,
      });
      db.pragma("foreign_keys = OFF");
      insertRequest(db, {
        requestId: "mreq:orphan", checkId: "mcheck:orphan", planId: "plan-missing",
        resourceId: "MAT-ORPHAN", estimated: 2, requested: 2,
      });
      db.pragma("foreign_keys = ON");

      expect(() => applySelectedMigrations(db, [MIGRATION])).toThrow(/CHECK/i);

      expect(registered(db)).toBe(false);
      expect(shadowExists(db)).toBe(false);
      expect(db.inTransaction).toBe(false);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(quantity(db, "mreq:kept")).toBe(4);
      expect(quantity(db, "mreq:orphan")).toBe(2);

      db.prepare("DELETE FROM job_material_requests WHERE request_id = ?").run("mreq:orphan");
      applySelectedMigrations(db, [MIGRATION]);

      expect(quantity(db, "mreq:kept")).toBe(4);
      expect(quantity(db, "mreq:orphan")).toBeUndefined();
      expect(foreignKeyViolations(db)).toEqual([]);
      expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    });
  });

  it("drops an unfinished shadow table and keeps the source rows", () => {
    withDb((db) => {
      applyHistorical042(db);
      insertPlan(db, "plan-1");
      insertCheck(db, { checkId: "mcheck:kept", planId: "plan-1", resourceId: "MAT-LED" });
      insertRequest(db, {
        requestId: "mreq:kept", checkId: "mcheck:kept", planId: "plan-1",
        resourceId: "MAT-LED", estimated: 120, requested: 140,
      });
      db.exec(
        "CREATE TABLE job_material_requests__qty (request_id TEXT PRIMARY KEY NOT NULL)",
      );

      applySelectedMigrations(db, [MIGRATION]);

      expect(row(db, "mreq:kept")).toEqual({ requested_quantity: 140, estimated_quantity: 120 });
      expect(shadowExists(db)).toBe(false);
      expect(registered(db)).toBe(true);
      expect(foreignKeyViolations(db)).toEqual([]);
    });
  });

  it("renames a copied shadow back when the source table was already dropped", () => {
    withDb((db) => {
      applyHistorical042(db);
      insertPlan(db, "plan-1");
      insertCheck(db, { checkId: "mcheck:kept", planId: "plan-1", resourceId: "MAT-LED" });
      insertRequest(db, {
        requestId: "mreq:kept", checkId: "mcheck:kept", planId: "plan-1",
        resourceId: "MAT-LED", estimated: 120, requested: 140,
      });
      db.exec(`CREATE TABLE job_material_requests__qty (${REBUILD_COLUMNS})`);
      db.exec(
        "INSERT INTO job_material_requests__qty (" +
        "request_id, organization_id, job_id, plan_id, resource_id, estimated_quantity, " +
        "requested_quantity, unit, status, source_check_id, requested_by_person_id, " +
        "requested_by_label, requested_at) " +
        "SELECT request_id, organization_id, job_id, plan_id, resource_id, estimated_quantity, " +
        "requested_quantity, unit, status, source_check_id, requested_by_person_id, " +
        "requested_by_label, requested_at FROM job_material_requests",
      );
      db.exec("DROP TABLE job_material_requests");

      applySelectedMigrations(db, [MIGRATION]);

      expect(row(db, "mreq:kept")).toEqual({ requested_quantity: 140, estimated_quantity: 120 });
      expect(shadowExists(db)).toBe(false);
      expect(indexNames(db)).toContain("idx_job_material_requests_open");
      expect(foreignKeyViolations(db)).toEqual([]);
      expect(registered(db)).toBe(true);
    });
  });
});

function withDb(run: (db: SqliteDatabase) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "workos-n009-migration-"));
  temps.push(dir);
  const db = openSqliteDatabaseWithoutMigrations(join(dir, "app.sqlite"));
  try {
    run(db);
  } finally {
    db.close();
  }
}

function applyHistorical042(db: SqliteDatabase): void {
  const prior = listOperationalMigrationFiles()
    .filter((file) => file < "042_job_material_purchasing_requests.sql");
  applySelectedMigrations(db, prior);
  db.exec(HISTORICAL_042);
  db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
    "042_job_material_purchasing_requests.sql",
    "2026-10-16T00:00:00.000Z",
  );
}

function insertPlan(db: SqliteDatabase, planId: string): void {
  db.prepare(
    "INSERT INTO execution_plans (plan_id, source_snapshot_id, source_snapshot_hash, product_code, " +
    "product_label, inscription, created_at, status, schema_version, task_count, eic_total, " +
    "eic_currency, eic_completeness) VALUES (?, ?, ?, 'LETTERS', 'Litere', '', ?, 'RELEASED', 1, 1, 0, 'RON', 'COMPLETE')",
  ).run(planId, "snap:" + planId, "hash:" + planId, "2026-10-16T00:00:00.000Z");
}

function insertCheck(
  db: SqliteDatabase,
  input: { checkId: string; planId: string; resourceId: string },
): void {
  db.prepare(
    "INSERT INTO job_material_checks (check_id, action_key, organization_id, job_id, plan_id, " +
    "resource_id, status, checked_by_person_id, checked_by_label, checked_at) " +
    "VALUES (?, ?, 'org-1', 'job-1', ?, ?, 'MISSING', 'per-1', 'Operator Vechi', ?)",
  ).run(input.checkId, "action:" + input.checkId, input.planId, input.resourceId,
    "2026-10-16T00:00:00.000Z");
}

function insertRequest(
  db: SqliteDatabase,
  input: {
    requestId: string;
    checkId: string;
    planId: string;
    resourceId: string;
    estimated: number;
    requested: number | null;
  },
): void {
  db.prepare(
    "INSERT INTO job_material_requests (request_id, organization_id, job_id, plan_id, resource_id, " +
    "estimated_quantity, requested_quantity, unit, status, source_check_id, requested_by_person_id, " +
    "requested_by_label, requested_at) VALUES (?, 'org-1', 'job-1', ?, ?, ?, ?, 'buc', 'REQUESTED', ?, " +
    "'per-1', 'Operator Vechi', '2026-10-16T00:00:00.000Z')",
  ).run(input.requestId, input.planId, input.resourceId, input.estimated, input.requested, input.checkId);
}

function row(db: SqliteDatabase, requestId: string): { requested_quantity: number; estimated_quantity: number } {
  return db.prepare(
    "SELECT requested_quantity, estimated_quantity FROM job_material_requests WHERE request_id = ?",
  ).get(requestId) as { requested_quantity: number; estimated_quantity: number };
}

function quantity(db: SqliteDatabase, requestId: string): number | null | undefined {
  const found = db.prepare(
    "SELECT requested_quantity FROM job_material_requests WHERE request_id = ?",
  ).get(requestId) as { requested_quantity: number | null } | undefined;
  return found?.requested_quantity;
}

function tableSql(db: SqliteDatabase): string {
  const found = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'job_material_requests'",
  ).get() as { sql: string };
  return found.sql;
}

function indexNames(db: SqliteDatabase): string[] {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'job_material_requests'",
  ).all().map((item) => (item as { name: string }).name);
}

function foreignKeyViolations(db: SqliteDatabase): unknown[] {
  return db.prepare("SELECT * FROM pragma_foreign_key_check('job_material_requests')").all();
}

function shadowExists(db: SqliteDatabase): boolean {
  return db.prepare(
    "SELECT name FROM sqlite_master WHERE name = 'job_material_requests__qty'",
  ).get() !== undefined;
}

function registered(db: SqliteDatabase): boolean {
  return db.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION) !== undefined;
}
