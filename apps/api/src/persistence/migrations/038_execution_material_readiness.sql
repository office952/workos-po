CREATE TABLE execution_material_readiness_modes (
  version INTEGER PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (version >= 1),
  CHECK (mode IN ('DISABLED', 'REQUIRED')),
  CHECK (length(updated_at) > 0),
  CHECK (length(updated_by) > 0)
);

CREATE TABLE execution_material_confirmations (
  task_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  status TEXT NOT NULL,
  confirmed_by TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  PRIMARY KEY (task_id, resource_id),
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id),
  CHECK (status IN ('AVAILABLE', 'NOT_AVAILABLE')),
  CHECK (length(resource_id) > 0),
  CHECK (length(confirmed_by) > 0),
  CHECK (length(confirmed_at) > 0)
);
