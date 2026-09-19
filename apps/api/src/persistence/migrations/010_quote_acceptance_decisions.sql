CREATE TABLE IF NOT EXISTS quote_acceptance_decisions (
  acceptance_id TEXT PRIMARY KEY NOT NULL,
  quote_snapshot_id TEXT NOT NULL UNIQUE,
  quote_content_hash TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  accepted_at TEXT NOT NULL,
  FOREIGN KEY (quote_snapshot_id) REFERENCES quote_snapshots(quote_snapshot_id)
);
