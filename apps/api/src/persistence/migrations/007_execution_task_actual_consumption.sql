CREATE TABLE IF NOT EXISTS execution_task_actual_consumption (
  entry_id TEXT PRIMARY KEY NOT NULL,
  task_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  resource_label TEXT NOT NULL,
  actual_quantity REAL NOT NULL,
  unit TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id),
  FOREIGN KEY (plan_id) REFERENCES execution_plans(plan_id),
  UNIQUE (task_id, resource_id)
);
