-- Heals a database that already applied the earlier 042 draft, where
-- requested_quantity was NOT NULL and had to be at least the estimate.
-- Fresh databases created by the aligned 042 pass through the same rebuild.
-- Stored numbers are copied. NULL stays unspecified. This file does not invent zero.
-- Do not apply this to a real business database without a separate Owner procedure.
PRAGMA foreign_keys=OFF;
CREATE TABLE job_material_requests__qty (
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
);
INSERT INTO job_material_requests__qty (
  request_id, organization_id, job_id, plan_id, resource_id, estimated_quantity,
  requested_quantity, unit, status, source_check_id, requested_by_person_id,
  requested_by_label, requested_at
)
SELECT
  request_id, organization_id, job_id, plan_id, resource_id, estimated_quantity,
  requested_quantity, unit, status, source_check_id, requested_by_person_id,
  requested_by_label, requested_at
FROM job_material_requests;
DROP TABLE job_material_requests;
ALTER TABLE job_material_requests__qty RENAME TO job_material_requests;
CREATE UNIQUE INDEX idx_job_material_requests_open
  ON job_material_requests(organization_id, job_id, plan_id, resource_id)
  WHERE status = 'REQUESTED';
PRAGMA foreign_keys=ON;
