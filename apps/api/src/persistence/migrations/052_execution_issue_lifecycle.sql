-- Additive lifecycle for existing task issue reports.
-- Legacy ISSUE_REPORT rows without a lifecycle row remain OPEN.

CREATE TABLE IF NOT EXISTS execution_task_issue_lifecycle (
  entry_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by_account_id TEXT,
  acknowledged_by_operator_id TEXT,
  resolved_at TEXT,
  resolved_by_account_id TEXT,
  resolved_by_operator_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (entry_id) REFERENCES execution_task_dossier_entries(entry_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_task_issue_lifecycle_status
  ON execution_task_issue_lifecycle (status);
