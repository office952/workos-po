CREATE TABLE IF NOT EXISTS commercial_request_attachments (
  attachment_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  original_file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_request_attachments_request
  ON commercial_request_attachments (request_id, created_at DESC);
