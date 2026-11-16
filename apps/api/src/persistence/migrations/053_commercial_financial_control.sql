-- Commercial & Financial V1 · additive only. Existing quote, acceptance, order, seller and job
-- tables are unchanged; historical rows keep their meaning.

-- Organization offering policy: one immutable row per version. No row = OWNER_ONLY (pre-V1).
CREATE TABLE IF NOT EXISTS organization_offering_policy_versions (
  version INTEGER PRIMARY KEY NOT NULL CHECK (version >= 1),
  policy_schema TEXT NOT NULL CHECK (policy_schema = 'ORGANIZATION_OFFERING_POLICY_V1'),
  mode TEXT NOT NULL CHECK (mode IN ('OWNER_ONLY', 'COMMERCIAL_AUTONOMOUS', 'COMMERCIAL_APPROVAL_POLICY')),
  incomplete_cost_requires_approval INTEGER NOT NULL CHECK (incomplete_cost_requires_approval IN (0, 1)),
  minimum_margin_percent REAL CHECK (minimum_margin_percent IS NULL OR minimum_margin_percent >= 0),
  maximum_net_value REAL CHECK (maximum_net_value IS NULL OR maximum_net_value > 0),
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_by_label TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS organization_offering_policy_versions_no_update
BEFORE UPDATE ON organization_offering_policy_versions
BEGIN
  SELECT RAISE(ABORT, 'offering policy versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS organization_offering_policy_versions_no_delete
BEFORE DELETE ON organization_offering_policy_versions
BEGIN
  SELECT RAISE(ABORT, 'offering policy versions are immutable');
END;

-- Price exception approvals. Request facts are immutable; the decision is written once.
CREATE TABLE IF NOT EXISTS commercial_price_approvals (
  approval_id TEXT PRIMARY KEY NOT NULL,
  subject_kind TEXT NOT NULL CHECK (subject_kind = 'PRODUCT_QUOTE'),
  request_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  binding_hash TEXT NOT NULL,
  policy_version INTEGER NOT NULL,
  policy_mode TEXT NOT NULL,
  net_price REAL NOT NULL,
  installation_net_price REAL,
  internal_cost_complete INTEGER NOT NULL CHECK (internal_cost_complete IN (0, 1)),
  triggered_rules TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  requested_by_user_id TEXT NOT NULL,
  requested_by_label TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  request_note TEXT,
  decided_by_user_id TEXT,
  decided_by_label TEXT,
  decided_at TEXT,
  decision_reason TEXT,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_price_approvals_subject
  ON commercial_price_approvals (request_id, product_code, requested_at);
CREATE INDEX IF NOT EXISTS idx_commercial_price_approvals_status
  ON commercial_price_approvals (status, requested_at);

-- Append-only transition journal for approvals.
CREATE TABLE IF NOT EXISTS commercial_price_approval_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  approval_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_kind TEXT NOT NULL CHECK (event_kind IN ('REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN')),
  actor_user_id TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  reason TEXT,
  UNIQUE (approval_id, sequence),
  FOREIGN KEY (approval_id) REFERENCES commercial_price_approvals(approval_id)
);

CREATE TRIGGER IF NOT EXISTS commercial_price_approval_events_no_update
BEFORE UPDATE ON commercial_price_approval_events
BEGIN
  SELECT RAISE(ABORT, 'approval events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS commercial_price_approval_events_no_delete
BEFORE DELETE ON commercial_price_approval_events
BEGIN
  SELECT RAISE(ABORT, 'approval events are append-only');
END;

-- AUD-PRICING-002: explicit Owner exception attached to an acceptance (the quote is unchanged).
CREATE TABLE IF NOT EXISTS quote_incomplete_cost_acceptances (
  acceptance_id TEXT PRIMARY KEY NOT NULL,
  quote_snapshot_id TEXT NOT NULL UNIQUE,
  quote_content_hash TEXT NOT NULL,
  policy TEXT NOT NULL CHECK (policy = 'INCOMPLETE_COST_ACCEPTANCE_V1'),
  cost_completeness TEXT NOT NULL CHECK (cost_completeness = 'PARTIAL'),
  accepted_by_user_id TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  FOREIGN KEY (acceptance_id) REFERENCES quote_acceptance_decisions(acceptance_id),
  FOREIGN KEY (quote_snapshot_id) REFERENCES quote_snapshots(quote_snapshot_id)
);

CREATE TRIGGER IF NOT EXISTS quote_incomplete_cost_acceptances_no_update
BEFORE UPDATE ON quote_incomplete_cost_acceptances
BEGIN
  SELECT RAISE(ABORT, 'incomplete cost acceptances are immutable');
END;

CREATE TRIGGER IF NOT EXISTS quote_incomplete_cost_acceptances_no_delete
BEFORE DELETE ON quote_incomplete_cost_acceptances
BEGIN
  SELECT RAISE(ABORT, 'incomplete cost acceptances are immutable');
END;

-- Company identity history. The current profile stays in seller_profile for compatibility.
CREATE TABLE IF NOT EXISTS seller_profile_versions (
  version INTEGER PRIMARY KEY NOT NULL CHECK (version >= 1),
  legal_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  fiscal_id TEXT NOT NULL,
  trade_register TEXT NOT NULL,
  address TEXT NOT NULL,
  locality TEXT NOT NULL,
  iban TEXT NOT NULL,
  bank TEXT NOT NULL,
  changed_fields TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_by_label TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS seller_profile_versions_no_update
BEFORE UPDATE ON seller_profile_versions
BEGIN
  SELECT RAISE(ABORT, 'seller profile versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS seller_profile_versions_no_delete
BEFORE DELETE ON seller_profile_versions
BEGIN
  SELECT RAISE(ABORT, 'seller profile versions are immutable');
END;
