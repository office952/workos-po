-- Task dossier and unique-provider binding provenance.
-- Synthetic migration only. Does not alter 043 or historical assignment rows.

ALTER TABLE execution_tasks ADD COLUMN provider_binding_source TEXT;
ALTER TABLE execution_tasks ADD COLUMN provider_bound_at TEXT;
ALTER TABLE execution_tasks ADD COLUMN provider_bound_by_account_id TEXT;
ALTER TABLE execution_tasks ADD COLUMN provider_bound_by_operator_id TEXT;

CREATE TABLE IF NOT EXISTS execution_job_artifacts (
  artifact_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  job_id TEXT,
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  preview TEXT NOT NULL,
  supersedes_artifact_id TEXT,
  uploaded_by_account_id TEXT NOT NULL,
  uploaded_by_operator_id TEXT,
  uploaded_at TEXT NOT NULL,
  purpose TEXT,
  purpose_note TEXT,
  used_at TEXT,
  FOREIGN KEY (plan_id) REFERENCES execution_plans(plan_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_job_artifacts_plan
  ON execution_job_artifacts (plan_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS execution_artifact_task_links (
  artifact_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  linked_by_account_id TEXT NOT NULL,
  linked_by_operator_id TEXT,
  PRIMARY KEY (artifact_id, task_id),
  FOREIGN KEY (artifact_id) REFERENCES execution_job_artifacts(artifact_id),
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id)
);

CREATE TABLE IF NOT EXISTS execution_task_dossier_entries (
  entry_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  job_id TEXT,
  kind TEXT NOT NULL,
  body TEXT NOT NULL,
  reason_code TEXT,
  author_account_id TEXT NOT NULL,
  author_operator_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES execution_tasks(task_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_task_dossier_entries_task
  ON execution_task_dossier_entries (task_id, created_at, entry_id);

CREATE TABLE IF NOT EXISTS execution_task_dossier_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  job_id TEXT,
  event_kind TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  actor_operator_id TEXT,
  occurred_at TEXT NOT NULL,
  entry_id TEXT,
  artifact_id TEXT,
  detail_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_task_dossier_events_task
  ON execution_task_dossier_events (task_id, occurred_at, event_id);
