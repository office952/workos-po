CREATE TABLE IF NOT EXISTS technical_setting_versions (
  technical_setting_version_row_id TEXT PRIMARY KEY NOT NULL,
  definition_id TEXT NOT NULL,
  type_id TEXT NOT NULL,
  setting_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  value REAL NOT NULL,
  value_type TEXT NOT NULL,
  unit TEXT NOT NULL,
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_user_id TEXT,
  actor_system_id TEXT,
  supersedes_version INTEGER,
  CHECK (version >= 1),
  CHECK (status IN ('ACTIVE', 'RETIRED')),
  CHECK (scope = 'ORGANIZATION'),
  CHECK (source IN ('PLATFORM_STARTER', 'ORGANIZATION')),
  CHECK (value_type = 'number'),
  CHECK (actor_kind IN ('SYSTEM', 'USER')),
  CHECK (
    (actor_kind = 'SYSTEM' AND actor_system_id IS NOT NULL AND actor_user_id IS NULL)
    OR
    (actor_kind = 'USER' AND actor_user_id IS NOT NULL AND actor_system_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS technical_setting_versions_definition_version
  ON technical_setting_versions (definition_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS technical_setting_versions_one_active
  ON technical_setting_versions (definition_id)
  WHERE status = 'ACTIVE';
