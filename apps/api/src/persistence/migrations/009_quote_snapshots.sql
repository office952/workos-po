CREATE TABLE IF NOT EXISTS quote_snapshots (
  quote_snapshot_id TEXT PRIMARY KEY NOT NULL,
  product_code TEXT NOT NULL,
  source_review_id TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL
);
