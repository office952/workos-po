CREATE TABLE IF NOT EXISTS job_planning_metadata (
  organization_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  job_kind TEXT NOT NULL,
  priority TEXT NOT NULL,
  target_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (organization_id, job_id, job_kind)
);

CREATE INDEX IF NOT EXISTS idx_job_planning_metadata_org_job
  ON job_planning_metadata (organization_id, job_id);
