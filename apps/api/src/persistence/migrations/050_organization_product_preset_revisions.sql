CREATE TABLE IF NOT EXISTS organization_product_preset_revisions (
  preset_revision_row_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  preset_id TEXT NOT NULL,
  template_code TEXT NOT NULL,
  template_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  lifecycle TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  selections_json TEXT NOT NULL,
  supersedes_revision INTEGER,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  CHECK (revision >= 1),
  CHECK (lifecycle IN ('DRAFT', 'PUBLISHED', 'RETIRED')),
  CHECK (length(name) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_product_preset_revisions_revision
  ON organization_product_preset_revisions (organization_id, preset_id, revision);

CREATE INDEX IF NOT EXISTS organization_product_preset_revisions_template
  ON organization_product_preset_revisions (organization_id, template_code, preset_id, revision);
