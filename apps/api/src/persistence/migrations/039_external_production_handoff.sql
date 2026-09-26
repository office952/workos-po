ALTER TABLE execution_tasks ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE execution_tasks ADD COLUMN external_provider_id TEXT;
ALTER TABLE execution_tasks ADD COLUMN external_provider_label TEXT;
ALTER TABLE execution_tasks ADD COLUMN externalized_at TEXT;
ALTER TABLE execution_tasks ADD COLUMN externalized_by TEXT;
ALTER TABLE execution_tasks ADD COLUMN handed_off_at TEXT;
ALTER TABLE execution_tasks ADD COLUMN handed_off_by TEXT;
ALTER TABLE execution_tasks ADD COLUMN returned_at TEXT;
ALTER TABLE execution_tasks ADD COLUMN returned_by TEXT;

CREATE TABLE external_production_handoff_modes (
  version INTEGER PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  CHECK (version >= 1),
  CHECK (mode IN ('DISABLED', 'ENABLED')),
  CHECK (length(updated_at) > 0),
  CHECK (length(updated_by) > 0)
);

CREATE TABLE external_production_providers (
  provider_id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  CHECK (length(provider_id) > 0),
  CHECK (length(trim(name)) > 0),
  CHECK (length(name) <= 80),
  CHECK (active IN (0, 1)),
  CHECK (length(created_at) > 0),
  CHECK (length(created_by) > 0)
);

CREATE UNIQUE INDEX external_production_providers_name_key
  ON external_production_providers(name_key);
