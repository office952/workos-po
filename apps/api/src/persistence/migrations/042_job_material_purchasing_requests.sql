-- Source-controlled migration only. Do not run on real data without deployment GO.
CREATE TABLE job_material_checks (
  check_id TEXT PRIMARY KEY NOT NULL,
  action_key TEXT NOT NULL UNIQUE,
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
