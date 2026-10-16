import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabaseWithoutMigrations,
} from "../src/persistence/sqlite.js";

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

describe("job material request quantity migration", () => {
  it("keeps a stored purchase quantity when an older 042 draft is rebuilt", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-n009-migration-"));
    temps.push(dir);
    const db = openSqliteDatabaseWithoutMigrations(join(dir, "app.sqlite"));
    const files = listOperationalMigrationFiles();
    const prior = files.filter((file) => file < "042_job_material_purchasing_requests.sql");
    applySelectedMigrations(db, prior);
    db.exec(HISTORICAL_042);
    db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
      "042_job_material_purchasing_requests.sql",
      "2026-10-16T00:00:00.000Z",
    );
    db.pragma("foreign_keys = OFF");
    db.prepare(
      "INSERT INTO job_material_checks (check_id, action_key, organization_id, job_id, plan_id, " +
      "resource_id, status, checked_by_person_id, checked_by_label, checked_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'MISSING', ?, ?, ?)",
    ).run("mcheck:old", "action-old", "org-1", "job-1", "plan-1", "MAT-LED-MODULE",
      "per-1", "Operator Vechi", "2026-10-16T00:00:00.000Z");
    db.prepare(
      "INSERT INTO job_material_requests (request_id, organization_id, job_id, plan_id, resource_id, " +
      "estimated_quantity, requested_quantity, unit, status, source_check_id, requested_by_person_id, " +
      "requested_by_label, requested_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'buc', 'REQUESTED', ?, ?, ?, ?)",
    ).run("mreq:old", "org-1", "job-1", "plan-1", "MAT-LED-MODULE", 120, 140,
      "mcheck:old", "per-1", "Operator Vechi", "2026-10-16T00:00:00.000Z");
    db.pragma("foreign_keys = ON");

    applySelectedMigrations(db, ["043_job_material_request_quantity_optional.sql"]);

    const kept = db.prepare(
      "SELECT requested_quantity, estimated_quantity FROM job_material_requests WHERE request_id = ?",
    ).get("mreq:old") as { requested_quantity: number; estimated_quantity: number };
    expect(kept).toEqual({ requested_quantity: 140, estimated_quantity: 120 });

    db.pragma("foreign_keys = OFF");
    db.prepare(
      "INSERT INTO job_material_checks (check_id, action_key, organization_id, job_id, plan_id, " +
      "resource_id, status, checked_by_person_id, checked_by_label, checked_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'MISSING', ?, ?, ?)",
    ).run("mcheck:new", "action-new", "org-1", "job-1", "plan-1", "MAT-POWER",
      "per-1", "Operator Vechi", "2026-10-16T01:00:00.000Z");
    db.prepare(
      "INSERT INTO job_material_requests (request_id, organization_id, job_id, plan_id, resource_id, " +
      "estimated_quantity, requested_quantity, unit, status, source_check_id, requested_by_person_id, " +
      "requested_by_label, requested_at) VALUES (?, ?, ?, ?, ?, ?, NULL, 'buc', 'REQUESTED', ?, ?, ?, ?)",
    ).run("mreq:new", "org-1", "job-1", "plan-1", "MAT-POWER", 1,
      "mcheck:new", "per-1", "Operator Vechi", "2026-10-16T01:00:00.000Z");
    const unspecified = db.prepare(
      "SELECT requested_quantity FROM job_material_requests WHERE request_id = ?",
    ).get("mreq:new") as { requested_quantity: number | null };
    expect(unspecified.requested_quantity).toBeNull();
    expect(() => db.prepare(
      "INSERT INTO job_material_requests (request_id, organization_id, job_id, plan_id, resource_id, " +
      "estimated_quantity, requested_quantity, unit, status, source_check_id, requested_by_person_id, " +
      "requested_by_label, requested_at) VALUES ('mreq:zero', 'org-1', 'job-1', 'plan-1', 'MAT-ZERO', " +
      "1, 0, 'buc', 'REQUESTED', 'mcheck:zero', 'per-1', 'Operator Vechi', '2026-10-16T02:00:00.000Z')",
    ).run()).toThrow(/CHECK/i);
    db.close();
  });
});
