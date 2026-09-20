CREATE TABLE IF NOT EXISTS commercial_policy_versions (
  policy_version_row_id TEXT PRIMARY KEY NOT NULL,
  policy_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  label TEXT NOT NULL,
  default_markup_percent REAL NOT NULL,
  vat_percent REAL NOT NULL,
  default_discount_percent REAL NOT NULL,
  default_adjustment REAL NOT NULL,
  currency TEXT NOT NULL,
  rounding REAL NOT NULL,
  source TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  created_at TEXT NOT NULL,
  supersedes_version INTEGER,
  CHECK (version >= 1),
  CHECK (status IN ('DRAFT', 'NEEDS_CONFIRMATION', 'ACTIVE', 'RETIRED')),
  CHECK (currency = 'EUR'),
  CHECK (rounding = 0.01),
  CHECK (default_markup_percent >= 0),
  CHECK (vat_percent >= 0),
  CHECK (default_discount_percent >= 0 AND default_discount_percent <= 100),
  CHECK (source = 'ORGANIZATION')
);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_policy_versions_policy_version
  ON commercial_policy_versions (policy_id, version);

CREATE UNIQUE INDEX IF NOT EXISTS commercial_policy_versions_one_active
  ON commercial_policy_versions (policy_id)
  WHERE status = 'ACTIVE';
