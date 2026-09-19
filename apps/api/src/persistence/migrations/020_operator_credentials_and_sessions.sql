CREATE TABLE IF NOT EXISTS operator_credentials (
  person_id TEXT PRIMARY KEY NOT NULL,
  pin_hash BLOB NOT NULL,
  pin_salt BLOB NOT NULL,
  kdf TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (person_id) REFERENCES people(person_id)
);

CREATE TABLE IF NOT EXISTS operator_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL,
  token_hash BLOB NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (person_id) REFERENCES people(person_id)
);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_person
  ON operator_sessions (person_id);

CREATE INDEX IF NOT EXISTS idx_operator_sessions_token_hash
  ON operator_sessions (token_hash);
