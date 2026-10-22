-- REQUIRES_FOREIGN_KEYS_OFF
-- Job-level file archive and task-scoped usage.
-- Applies after 044, including databases that already recorded 044.
-- Does not change 043.

ALTER TABLE execution_artifact_task_links ADD COLUMN used_at TEXT;
ALTER TABLE execution_artifact_task_links ADD COLUMN used_by_account_id TEXT;
ALTER TABLE execution_artifact_task_links ADD COLUMN used_by_operator_id TEXT;

UPDATE execution_artifact_task_links
SET used_at = (
  SELECT artifact.used_at
  FROM execution_job_artifacts AS artifact
  WHERE artifact.artifact_id = execution_artifact_task_links.artifact_id
)
WHERE used_at IS NULL
  AND artifact_id IN (
    SELECT artifact_id
    FROM execution_artifact_task_links
    GROUP BY artifact_id
    HAVING COUNT(*) = 1
  )
  AND artifact_id IN (
    SELECT artifact_id FROM execution_job_artifacts WHERE used_at IS NOT NULL
  );

UPDATE execution_job_artifacts
SET used_at = NULL
WHERE used_at IS NOT NULL
  AND artifact_id IN (
    SELECT artifact_id
    FROM execution_artifact_task_links
    WHERE used_at IS NOT NULL
    GROUP BY artifact_id
    HAVING COUNT(*) = 1
  );

CREATE TABLE execution_job_artifacts_v2 (
  artifact_id TEXT PRIMARY KEY NOT NULL,
  plan_id TEXT,
  job_id TEXT,
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  storage_scope TEXT NOT NULL,
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

INSERT INTO execution_job_artifacts_v2 (
  artifact_id, plan_id, job_id, original_file_name, mime_type, size_bytes,
  sha256, storage_key, storage_scope, category, preview, supersedes_artifact_id,
  uploaded_by_account_id, uploaded_by_operator_id, uploaded_at,
  purpose, purpose_note, used_at
)
SELECT
  artifact_id, plan_id, job_id, original_file_name, mime_type, size_bytes,
  sha256, storage_key, 'execution/' || plan_id, category, preview, supersedes_artifact_id,
  uploaded_by_account_id, uploaded_by_operator_id, uploaded_at,
  purpose, purpose_note, used_at
FROM execution_job_artifacts;

DROP TABLE execution_job_artifacts;
ALTER TABLE execution_job_artifacts_v2 RENAME TO execution_job_artifacts;

CREATE INDEX IF NOT EXISTS idx_execution_job_artifacts_plan
  ON execution_job_artifacts (plan_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_job_artifacts_job
  ON execution_job_artifacts (job_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS execution_job_file_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  plan_id TEXT,
  task_id TEXT,
  event_kind TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  actor_operator_id TEXT,
  occurred_at TEXT NOT NULL,
  artifact_id TEXT,
  detail_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_execution_job_file_events_job
  ON execution_job_file_events (job_id, occurred_at, event_id);
