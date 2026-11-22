-- Commercial Continuity V2 · additive only. Existing quote, acceptance, order, approval and policy
-- rows keep their meaning; no historical row is rewritten.

-- Control total: the approval mode with the unconditional rule. Earlier versions read as 0.
ALTER TABLE organization_offering_policy_versions
  ADD COLUMN every_offer_requires_approval INTEGER NOT NULL DEFAULT 0
  CHECK (every_offer_requires_approval IN (0, 1));

-- An approval may name the saved variant it is about. NULL on every earlier approval.
ALTER TABLE commercial_price_approvals ADD COLUMN variant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_commercial_price_approvals_variant
  ON commercial_price_approvals (variant_id, requested_at);

-- A quote variant: one product chosen for a request, with its technical values kept on the
-- server from the moment the product is chosen. `version` is the optimistic write counter.
CREATE TABLE IF NOT EXISTS commercial_request_variants (
  variant_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  registration_index INTEGER NOT NULL CHECK (registration_index >= 1),
  product_code TEXT NOT NULL,
  alternative_of_variant_id TEXT,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('ACTIVE', 'WITHDRAWN')),
  version INTEGER NOT NULL CHECK (version >= 1),
  draft_values TEXT NOT NULL,
  notes TEXT,
  confirmed_review_id TEXT,
  confirmed_at TEXT,
  confirmed_by_user_id TEXT,
  confirmed_by_label TEXT,
  product_net_price REAL CHECK (product_net_price IS NULL OR product_net_price >= 0),
  price_review_id TEXT,
  price_set_at TEXT,
  price_set_by_user_id TEXT,
  price_set_by_label TEXT,
  price_set_by_role TEXT CHECK (price_set_by_role IS NULL OR price_set_by_role IN ('owner', 'member')),
  quote_snapshot_id TEXT,
  issued_at TEXT,
  issued_by_user_id TEXT,
  issued_by_label TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  created_by_label TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by_user_id TEXT NOT NULL,
  updated_by_label TEXT NOT NULL,
  UNIQUE (request_id, registration_index),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id),
  FOREIGN KEY (alternative_of_variant_id) REFERENCES commercial_request_variants(variant_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_request_variants_request
  ON commercial_request_variants (request_id, registration_index);
CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_request_variants_quote
  ON commercial_request_variants (quote_snapshot_id) WHERE quote_snapshot_id IS NOT NULL;

-- A variant is never deleted, and an issued variant is never modified again.
CREATE TRIGGER IF NOT EXISTS commercial_request_variants_no_delete
BEFORE DELETE ON commercial_request_variants
BEGIN
  SELECT RAISE(ABORT, 'quote variants are never deleted');
END;

CREATE TRIGGER IF NOT EXISTS commercial_request_variants_issued_immutable
BEFORE UPDATE ON commercial_request_variants
WHEN OLD.quote_snapshot_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'an issued quote variant is immutable');
END;

-- Append-only trail of what happened to a variant.
CREATE TABLE IF NOT EXISTS commercial_request_variant_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  variant_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'CREATED', 'VALUES_SAVED', 'CONFIRMED', 'CONFIRMATION_CLEARED', 'PRICE_SET', 'PRICE_CLEARED',
    'APPROVAL_REQUESTED', 'APPROVED', 'REJECTED', 'ISSUED', 'WITHDRAWN', 'RESUMED'
  )),
  actor_user_id TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  variant_version INTEGER NOT NULL,
  net_price REAL,
  detail TEXT,
  UNIQUE (variant_id, sequence),
  FOREIGN KEY (variant_id) REFERENCES commercial_request_variants(variant_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_request_variant_events_request
  ON commercial_request_variant_events (request_id, occurred_at);

CREATE TRIGGER IF NOT EXISTS commercial_request_variant_events_no_update
BEFORE UPDATE ON commercial_request_variant_events
BEGIN
  SELECT RAISE(ABORT, 'variant events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS commercial_request_variant_events_no_delete
BEFORE DELETE ON commercial_request_variant_events
BEGIN
  SELECT RAISE(ABORT, 'variant events are append-only');
END;

-- A second accepted quote with installation on the same request is never accepted silently.
-- Until common installation can be consolidated, the only recorded decision is a justified
-- separate installation. The frozen quotes are not touched.
CREATE TABLE IF NOT EXISTS commercial_installation_decisions (
  decision_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  quote_snapshot_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL CHECK (mode IN ('SEPARATE')),
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  related_quote_snapshot_ids TEXT NOT NULL,
  decided_by_user_id TEXT NOT NULL,
  decided_by_label TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

CREATE TRIGGER IF NOT EXISTS commercial_installation_decisions_no_update
BEFORE UPDATE ON commercial_installation_decisions
BEGIN
  SELECT RAISE(ABORT, 'installation decisions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS commercial_installation_decisions_no_delete
BEFORE DELETE ON commercial_installation_decisions
BEGIN
  SELECT RAISE(ABORT, 'installation decisions are append-only');
END;

-- Request-level shared-installation overlay (Design B). Quotes and V2 orders stay copies.
-- Current state is the latest event per request; historical orders without events are unchanged.
CREATE TABLE IF NOT EXISTS commercial_installation_commitment_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'CREATED', 'MEMBER_JOINED', 'MEMBER_LEFT', 'HOLDER_REASSIGNED', 'ENDED'
  )),
  holder_order_snapshot_id TEXT,
  holder_quote_snapshot_id TEXT,
  member_order_snapshot_ids TEXT NOT NULL,
  member_quote_snapshot_ids TEXT NOT NULL,
  net_price REAL NOT NULL CHECK (net_price >= 0),
  actor_user_id TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail TEXT,
  UNIQUE (request_id, sequence),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_installation_commitment_request
  ON commercial_installation_commitment_events (request_id, sequence);

CREATE TRIGGER IF NOT EXISTS commercial_installation_commitment_events_no_update
BEFORE UPDATE ON commercial_installation_commitment_events
BEGIN
  SELECT RAISE(ABORT, 'installation commitment events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS commercial_installation_commitment_events_no_delete
BEFORE DELETE ON commercial_installation_commitment_events
BEGIN
  SELECT RAISE(ABORT, 'installation commitment events are append-only');
END;

-- Staging row until the member order exists (acceptance can precede order persist).
CREATE TABLE IF NOT EXISTS commercial_installation_common_intents (
  quote_snapshot_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  holder_order_snapshot_id TEXT NOT NULL,
  holder_quote_snapshot_id TEXT NOT NULL,
  net_price REAL NOT NULL CHECK (net_price >= 0),
  decided_by_user_id TEXT NOT NULL,
  decided_by_label TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id)
);

-- Commercial journal: what was discussed with the customer. An entry never changes an official
-- price, a variant state or an approval. A correction is a new entry that names the old one.
CREATE TABLE IF NOT EXISTS commercial_request_journal_entries (
  entry_id TEXT PRIMARY KEY NOT NULL,
  request_id TEXT NOT NULL,
  variant_id TEXT,
  entry_kind TEXT NOT NULL CHECK (entry_kind IN ('DISCUSSION', 'CUSTOMER_BUDGET', 'DISCUSSED_PRICE')),
  discussed_at TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('PHONE', 'EMAIL', 'WHATSAPP', 'MEETING', 'OTHER')),
  interlocutor TEXT,
  amount_min REAL CHECK (amount_min IS NULL OR amount_min >= 0),
  amount_max REAL CHECK (amount_max IS NULL OR amount_max >= 0),
  currency TEXT,
  vat_basis TEXT CHECK (vat_basis IS NULL OR vat_basis IN ('NET', 'GROSS', 'UNSPECIFIED')),
  notes TEXT,
  rectifies_entry_id TEXT,
  rectification_reason TEXT,
  author_user_id TEXT NOT NULL,
  author_label TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  CHECK (
    (entry_kind = 'DISCUSSION' AND amount_min IS NULL AND amount_max IS NULL)
    OR (entry_kind <> 'DISCUSSION' AND (amount_min IS NOT NULL OR amount_max IS NOT NULL) AND currency IS NOT NULL)
  ),
  CHECK (amount_min IS NULL OR amount_max IS NULL OR amount_min <= amount_max),
  FOREIGN KEY (request_id) REFERENCES commercial_requests(request_id),
  FOREIGN KEY (variant_id) REFERENCES commercial_request_variants(variant_id),
  FOREIGN KEY (rectifies_entry_id) REFERENCES commercial_request_journal_entries(entry_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_request_journal_request
  ON commercial_request_journal_entries (request_id, discussed_at);

CREATE TRIGGER IF NOT EXISTS commercial_request_journal_entries_no_update
BEFORE UPDATE ON commercial_request_journal_entries
BEGIN
  SELECT RAISE(ABORT, 'journal entries are append-only');
END;

CREATE TRIGGER IF NOT EXISTS commercial_request_journal_entries_no_delete
BEFORE DELETE ON commercial_request_journal_entries
BEGIN
  SELECT RAISE(ABORT, 'journal entries are append-only');
END;
