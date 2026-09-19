ALTER TABLE execution_tasks ADD COLUMN assigned_provider_id TEXT;
ALTER TABLE execution_tasks ADD COLUMN assigned_provider_kind TEXT;
ALTER TABLE execution_tasks ADD COLUMN assigned_provider_label TEXT;
ALTER TABLE execution_tasks ADD COLUMN started_at TEXT;
ALTER TABLE execution_tasks ADD COLUMN completed_at TEXT;
