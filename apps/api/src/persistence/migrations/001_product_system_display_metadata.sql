CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_system_display_metadata (
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_label TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (entity_kind, entity_id)
);
