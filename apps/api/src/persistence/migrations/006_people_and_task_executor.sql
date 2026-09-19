CREATE TABLE IF NOT EXISTS people (
  person_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  retired_at TEXT
);

ALTER TABLE execution_tasks ADD COLUMN assigned_executor_id TEXT;
ALTER TABLE execution_tasks ADD COLUMN assigned_executor_label TEXT;
