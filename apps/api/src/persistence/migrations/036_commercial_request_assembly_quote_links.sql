CREATE TABLE IF NOT EXISTS commercial_request_assembly_quote_links (
  request_id TEXT NOT NULL,
  assembly_quote_snapshot_id TEXT NOT NULL UNIQUE,
  linked_at TEXT NOT NULL,
  PRIMARY KEY (request_id, assembly_quote_snapshot_id),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);
