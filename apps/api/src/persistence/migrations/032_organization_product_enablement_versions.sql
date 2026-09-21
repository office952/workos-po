CREATE TABLE IF NOT EXISTS organization_product_enablement_versions (
  enablement_version_row_id TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  enabled_template_codes_json TEXT NOT NULL,
  source TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  supersedes_version INTEGER,
  CHECK (version >= 1),
  CHECK (status IN ('ACTIVE', 'RETIRED')),
  CHECK (source = 'ORGANIZATION')
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_product_enablement_versions_version
  ON organization_product_enablement_versions (version);

CREATE UNIQUE INDEX IF NOT EXISTS organization_product_enablement_versions_one_active
  ON organization_product_enablement_versions (status)
  WHERE status = 'ACTIVE';
