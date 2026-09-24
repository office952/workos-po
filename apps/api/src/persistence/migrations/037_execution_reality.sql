ALTER TABLE execution_tasks ADD COLUMN actual_duration_minutes INTEGER
  CHECK (actual_duration_minutes IS NULL OR actual_duration_minutes >= 0);

CREATE TABLE execution_machine_runs (
  machine_run_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  machine_provider_id TEXT NOT NULL,
  machine_provider_label TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_minutes INTEGER,
  started_by_operator_id TEXT NOT NULL,
  started_by_operator_label TEXT NOT NULL,
  completed_by_operator_id TEXT,
  completed_by_operator_label TEXT,
  created_at TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  FOREIGN KEY (plan_id) REFERENCES execution_plans(plan_id),
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id),
  CHECK (length(machine_provider_id) > 0),
  CHECK (length(machine_provider_label) > 0),
  CHECK (length(started_at) > 0),
  CHECK (length(started_by_operator_id) > 0),
  CHECK (length(started_by_operator_label) > 0),
  CHECK (schema_version = 1),
  CHECK (
    (
      completed_at IS NULL
      AND duration_minutes IS NULL
      AND completed_by_operator_id IS NULL
      AND completed_by_operator_label IS NULL
    )
    OR (
      completed_at IS NOT NULL
      AND duration_minutes IS NOT NULL
      AND duration_minutes >= 0
      AND completed_by_operator_id IS NOT NULL
      AND length(completed_by_operator_id) > 0
      AND completed_by_operator_label IS NOT NULL
      AND length(completed_by_operator_label) > 0
    )
  )
);

CREATE UNIQUE INDEX idx_execution_machine_runs_one_active
  ON execution_machine_runs(task_id)
  WHERE completed_at IS NULL;

CREATE INDEX idx_execution_machine_runs_plan
  ON execution_machine_runs(plan_id);
