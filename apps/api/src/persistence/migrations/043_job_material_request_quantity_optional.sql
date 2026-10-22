-- Rebuild job_material_requests so a purchase quantity may stay unspecified.
-- One transaction: a failed copy rolls back the shadow table and leaves the source intact.
-- foreign_keys is off only around that transaction. If this file stops early, the
-- migration runner rolls the transaction back and turns foreign_keys back on.
-- Stored numbers are copied exactly. NULL stays unspecified. Zero is rejected.
-- An earlier 042 draft had no ceiling, so a stored quantity may exceed 1000000000.
-- The column CHECK therefore admits every stored quantity, and the two triggers below
-- keep the 1000000000 ceiling for every new or changed quantity.
-- Running this file again after its COMMIT (ledger row not yet written) rebuilds the
-- same table: DROP TABLE removes the old triggers and the index, which are then recreated.
-- Do not apply this file to a real business database without a separate Owner procedure.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;
CREATE TABLE job_material_requests__qty (
  request_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  estimated_quantity REAL NOT NULL CHECK(estimated_quantity > 0),
  requested_quantity REAL CHECK(requested_quantity IS NULL OR requested_quantity > 0),
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
CREATE TRIGGER trg_job_material_requests_quantity_insert
BEFORE INSERT ON job_material_requests
WHEN NEW.requested_quantity > 1000000000
BEGIN
  SELECT RAISE(ABORT, 'requested_quantity exceeds 1000000000');
END;
CREATE TRIGGER trg_job_material_requests_quantity_update
BEFORE UPDATE OF requested_quantity ON job_material_requests
WHEN NEW.requested_quantity > 1000000000
  AND NEW.requested_quantity IS NOT OLD.requested_quantity
BEGIN
  SELECT RAISE(ABORT, 'requested_quantity exceeds 1000000000');
END;
CREATE TEMP TABLE job_material_requests__fk_guard (
  marker TEXT NOT NULL CHECK (marker = 'ok')
);
INSERT INTO job_material_requests__fk_guard (marker)
SELECT 'fk' FROM pragma_foreign_key_check('job_material_requests');
DROP TABLE job_material_requests__fk_guard;
COMMIT;
PRAGMA foreign_keys=ON;
