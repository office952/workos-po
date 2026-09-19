CREATE TABLE IF NOT EXISTS commercial_request_optional_scopes (
  request_id TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  selected_at TEXT NOT NULL,
  PRIMARY KEY (request_id, scope_id),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);
