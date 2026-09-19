DELETE FROM accepted_production_snapshots;

CREATE TABLE IF NOT EXISTS execution_plans (
  plan_id TEXT PRIMARY KEY NOT NULL,
  source_snapshot_id TEXT NOT NULL UNIQUE,
  source_snapshot_hash TEXT NOT NULL,
  product_code TEXT NOT NULL,
  product_label TEXT NOT NULL,
  inscription TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  task_count INTEGER NOT NULL,
  eic_total REAL NOT NULL,
  eic_currency TEXT NOT NULL,
  eic_completeness TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS execution_tasks (
  task_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  source_operation_id TEXT NOT NULL,
  process_id TEXT NOT NULL,
  process_label TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_label TEXT NOT NULL,
  seq INTEGER NOT NULL,
  seq_label TEXT NOT NULL,
  required_capability_id TEXT NOT NULL,
  required_capability_label TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  quantities_json TEXT NOT NULL,
  resources_json TEXT NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES execution_plans(plan_id),
  UNIQUE (plan_id, source_operation_id),
  UNIQUE (plan_id, seq)
);

CREATE TABLE IF NOT EXISTS execution_task_dependencies (
  plan_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  depends_on_task_id TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_task_id),
  FOREIGN KEY (plan_id) REFERENCES execution_plans(plan_id),
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id),
  FOREIGN KEY (depends_on_task_id) REFERENCES execution_tasks(task_id)
);
