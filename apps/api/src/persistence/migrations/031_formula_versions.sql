CREATE TABLE IF NOT EXISTS formula_versions (
  formula_version_row_id TEXT PRIMARY KEY NOT NULL,
  formula_id TEXT NOT NULL,
  component_type_id TEXT NOT NULL,
  result_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  expression_json TEXT NOT NULL,
  source TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_kind TEXT NOT NULL,
  actor_user_id TEXT,
  actor_system_id TEXT,
  supersedes_version INTEGER,
  CHECK (version >= 1),
  CHECK (status IN ('ACTIVE', 'RETIRED')),
  CHECK (source IN ('PLATFORM_STARTER', 'ORGANIZATION')),
  CHECK (actor_kind IN ('SYSTEM', 'USER')),
  CHECK (
    (actor_kind = 'SYSTEM' AND actor_system_id IS NOT NULL AND actor_user_id IS NULL)
    OR
    (actor_kind = 'USER' AND actor_user_id IS NOT NULL AND actor_system_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS formula_versions_formula_version
  ON formula_versions (formula_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS formula_versions_one_active
  ON formula_versions (formula_id)
  WHERE status = 'ACTIVE';
