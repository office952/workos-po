CREATE TABLE IF NOT EXISTS commercial_requests (
  request_id TEXT PRIMARY KEY NOT NULL,
  reference TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_commercial_requests_customer
  ON commercial_requests (customer_id);

CREATE INDEX IF NOT EXISTS idx_commercial_requests_status
  ON commercial_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS commercial_request_quote_links (
  request_id TEXT NOT NULL,
  quote_snapshot_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (request_id, quote_snapshot_id),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id),
  FOREIGN KEY (quote_snapshot_id) REFERENCES quote_snapshots(quote_snapshot_id)
);
