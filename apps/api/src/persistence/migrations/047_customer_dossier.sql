-- N-020 · Customer dossier: sites, documents and photos, commercial terms, historical works.
-- Additive only: no existing table, snapshot or frozen document is changed.

CREATE TABLE IF NOT EXISTS customer_sites (
  site_id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  contact_name TEXT,
  phone TEXT,
  access_notes TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE')),
  revision INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_sites_customer
  ON customer_sites (customer_id, status, name);

-- One site per request or job; the snapshot keeps the site as it was when linked.
CREATE TABLE IF NOT EXISTS customer_site_assignments (
  subject_kind TEXT NOT NULL CHECK (subject_kind IN ('REQUEST', 'JOB')),
  subject_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  site_id TEXT NOT NULL REFERENCES customer_sites(site_id),
  site_snapshot_json TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  assigned_by_account_id TEXT NOT NULL,
  PRIMARY KEY (subject_kind, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_site_assignments_customer
  ON customer_site_assignments (customer_id, site_id);

-- One stored file per document; links reference it from as many views as needed.
CREATE TABLE IF NOT EXISTS customer_documents (
  document_id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  kind TEXT NOT NULL CHECK (kind IN ('CONTRACT', 'ADDENDUM', 'INVOICE', 'RECEPTION', 'PHOTO', 'OTHER')),
  photo_stage TEXT CHECK (photo_stage IS NULL OR photo_stage IN ('BEFORE', 'SIMULATION', 'AFTER')),
  title TEXT NOT NULL,
  document_number TEXT,
  document_date TEXT,
  description TEXT,
  original_file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  uploaded_at TEXT NOT NULL,
  uploaded_by_account_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  CHECK ((kind = 'PHOTO') = (photo_stage IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_customer_documents_customer
  ON customer_documents (customer_id, uploaded_at DESC, document_id);

CREATE TABLE IF NOT EXISTS customer_document_links (
  document_id TEXT NOT NULL REFERENCES customer_documents(document_id),
  link_kind TEXT NOT NULL CHECK (link_kind IN ('SITE', 'REQUEST', 'JOB', 'HISTORICAL_WORK')),
  subject_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  linked_by_account_id TEXT NOT NULL,
  PRIMARY KEY (document_id, link_kind, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_document_links_subject
  ON customer_document_links (link_kind, subject_id);

-- Append-only: the current terms are the latest revision.
CREATE TABLE IF NOT EXISTS customer_commercial_terms_revisions (
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  revision INTEGER NOT NULL,
  fields_json TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  recorded_by_account_id TEXT NOT NULL,
  PRIMARY KEY (customer_id, revision)
);

CREATE TABLE IF NOT EXISTS customer_historical_works (
  work_id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  site_id TEXT REFERENCES customer_sites(site_id),
  site_snapshot_json TEXT,
  title TEXT NOT NULL,
  reference TEXT,
  description TEXT,
  event_date TEXT NOT NULL,
  event_date_end TEXT,
  provenance TEXT NOT NULL CHECK (provenance = 'HISTORICAL_RECORD'),
  recorded_at TEXT NOT NULL,
  recorded_by_account_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  revision INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_historical_works_customer
  ON customer_historical_works (customer_id, event_date DESC);

-- Traceable operator actions on the dossier.
CREATE TABLE IF NOT EXISTS customer_dossier_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  customer_id TEXT NOT NULL,
  event_kind TEXT NOT NULL,
  subject_id TEXT,
  actor_account_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_dossier_events_customer
  ON customer_dossier_events (customer_id, occurred_at, event_id);
