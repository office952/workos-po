-- N-023 · The customer's official logo, managed by hand.
-- Additive only: one new table; no existing table, document, snapshot or link is changed.
-- Every change is a new revision of the customer's logo: the active one is the highest revision.
-- Going back to the monogram is a revision without a file (`has_logo = 0`). Earlier revisions and
-- their files are kept. The primary key (customer_id, revision) makes two writers that both start
-- from the same revision collide: only one of them can create the next revision.

CREATE TABLE IF NOT EXISTS customer_logo_revisions (
  customer_id TEXT NOT NULL REFERENCES customers(customer_id),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  has_logo INTEGER NOT NULL CHECK (has_logo IN (0, 1)),
  storage_key TEXT,
  sha256 TEXT,
  mime_type TEXT CHECK (mime_type IS NULL OR mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  width INTEGER CHECK (width IS NULL OR (width BETWEEN 1 AND 4096)),
  height INTEGER CHECK (height IS NULL OR (height BETWEEN 1 AND 4096)),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR (size_bytes BETWEEN 1 AND 2097152)),
  original_file_name TEXT,
  provenance TEXT CHECK (provenance IS NULL OR provenance = 'UPLOAD'),
  changed_at TEXT NOT NULL,
  changed_by_account_id TEXT NOT NULL,
  PRIMARY KEY (customer_id, revision),
  CHECK (
    (has_logo = 1 AND storage_key IS NOT NULL AND sha256 IS NOT NULL AND mime_type IS NOT NULL AND width IS NOT NULL
      AND height IS NOT NULL AND size_bytes IS NOT NULL AND original_file_name IS NOT NULL AND provenance IS NOT NULL)
    OR
    (has_logo = 0 AND storage_key IS NULL AND sha256 IS NULL AND mime_type IS NULL AND width IS NULL
      AND height IS NULL AND size_bytes IS NULL AND original_file_name IS NULL AND provenance IS NULL)
  )
);
