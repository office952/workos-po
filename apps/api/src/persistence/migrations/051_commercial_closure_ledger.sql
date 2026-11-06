-- W3-D06 · Commercial closure ledger. Additive only: existing commercial request,
-- quote snapshot, acceptance, order and job tables are unchanged.

CREATE TABLE IF NOT EXISTS commercial_request_ledger (
  request_id TEXT PRIMARY KEY NOT NULL,
  commercial_state TEXT NOT NULL CHECK (commercial_state IN ('OPEN', 'CLOSED')),
  revision INTEGER NOT NULL,
  closed_at TEXT,
  closed_by_account_id TEXT,
  closed_by_display_name TEXT,
  closed_by_role TEXT CHECK (closed_by_role IS NULL OR closed_by_role IN ('owner', 'member')),
  close_reason TEXT,
  reopened_at TEXT,
  reopened_by_account_id TEXT,
  reopened_by_display_name TEXT,
  reopened_by_role TEXT CHECK (reopened_by_role IS NULL OR reopened_by_role IN ('owner', 'member')),
  reopen_reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

CREATE TABLE IF NOT EXISTS commercial_ledger_operations (
  operation_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  result_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_ledger_operations_request
  ON commercial_ledger_operations (request_id, created_at);

CREATE TABLE IF NOT EXISTS commercial_ledger_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  ledger_revision INTEGER NOT NULL,
  sequence_in_operation INTEGER NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'OFFER_DISPOSITION',
    'OFFER_RESUMED',
    'REQUEST_CLOSED',
    'REQUEST_REOPENED'
  )),
  quote_snapshot_id TEXT,
  disposition TEXT CHECK (disposition IS NULL OR disposition IN ('NOT_PURSUED', 'DECLINED_BY_CUSTOMER')),
  reason TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('owner', 'member')),
  actor_display_name TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  supersedes_event_id TEXT,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id),
  FOREIGN KEY (operation_id) REFERENCES commercial_ledger_operations(operation_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_ledger_events_request
  ON commercial_ledger_events (request_id, occurred_at, event_id);

CREATE TABLE IF NOT EXISTS commercial_offer_dispositions (
  request_id TEXT NOT NULL,
  quote_snapshot_id TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK (disposition IN ('NOT_PURSUED', 'DECLINED_BY_CUSTOMER')),
  current_event_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_account_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (request_id, quote_snapshot_id),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id),
  FOREIGN KEY (current_event_id) REFERENCES commercial_ledger_events(event_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_offer_dispositions_request
  ON commercial_offer_dispositions (request_id, occurred_at);
