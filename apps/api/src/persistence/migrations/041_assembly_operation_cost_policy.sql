CREATE TABLE IF NOT EXISTS assembly_operation_cost_policy_versions (
  version INTEGER PRIMARY KEY NOT NULL,
  final_inspection_mode TEXT NOT NULL,
  final_packaging_mode TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (typeof(version) = 'integer' AND version >= 1),
  CHECK (final_inspection_mode IN ('NOT_CONFIGURED', 'INCLUDED_IN_OTHER_OPERATIONS', 'SEPARATE_LABOR')),
  CHECK (final_packaging_mode IN ('NOT_CONFIGURED', 'PANEL_FACE_AREA')),
  CHECK (length(trim(updated_at)) > 0),
  CHECK (length(trim(updated_by)) > 0 AND length(updated_by) <= 200)
);

CREATE TRIGGER IF NOT EXISTS assembly_operation_cost_policy_versions_next_only
BEFORE INSERT ON assembly_operation_cost_policy_versions
WHEN NEW.version != (SELECT COALESCE(MAX(version), 0) + 1 FROM assembly_operation_cost_policy_versions)
BEGIN
  SELECT RAISE(ABORT, 'stale_policy_version');
END;

CREATE TRIGGER IF NOT EXISTS assembly_operation_cost_policy_versions_no_update
BEFORE UPDATE ON assembly_operation_cost_policy_versions
BEGIN
  SELECT RAISE(ABORT, 'append_only');
END;

CREATE TRIGGER IF NOT EXISTS assembly_operation_cost_policy_versions_no_delete
BEFORE DELETE ON assembly_operation_cost_policy_versions
BEGIN
  SELECT RAISE(ABORT, 'append_only');
END;
