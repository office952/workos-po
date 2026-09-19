CREATE TABLE IF NOT EXISTS order_snapshots (
  order_snapshot_id TEXT PRIMARY KEY NOT NULL,
  product_code TEXT NOT NULL,
  source_quote_snapshot_id TEXT NOT NULL,
  source_quote_content_hash TEXT NOT NULL,
  source_acceptance_id TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  FOREIGN KEY (source_quote_snapshot_id) REFERENCES quote_snapshots(quote_snapshot_id),
  FOREIGN KEY (source_acceptance_id) REFERENCES quote_acceptance_decisions(acceptance_id)
);
