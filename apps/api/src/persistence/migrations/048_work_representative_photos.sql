-- N-021 · The representative photo of a work, chosen by an operator.
-- Additive only: one new table; no existing table, snapshot, document or link is changed.
-- One row per work (a WorkOS job or a historical work). `document_id` NULL means the automatic
-- choice applies (after → simulation → before). The row is kept when the choice is cleared, so the
-- revision only moves forward and a stale edit can never match again.

CREATE TABLE IF NOT EXISTS work_representative_photos (
  work_kind TEXT NOT NULL CHECK (work_kind IN ('JOB', 'HISTORICAL_WORK')),
  work_id TEXT NOT NULL,
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  document_id TEXT REFERENCES customer_documents(document_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL,
  updated_by_account_id TEXT NOT NULL,
  -- Set when the chosen photo stopped being eligible (unlinked from the work, or no longer a photo).
  invalidated_document_id TEXT,
  invalidated_reason TEXT CHECK (invalidated_reason IS NULL OR invalidated_reason IN ('UNLINKED', 'NOT_A_PHOTO')),
  invalidated_at TEXT,
  PRIMARY KEY (work_kind, work_id),
  CHECK (document_id IS NULL OR invalidated_reason IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_work_representative_photos_customer
  ON work_representative_photos (customer_id);

CREATE INDEX IF NOT EXISTS idx_work_representative_photos_document
  ON work_representative_photos (document_id);
