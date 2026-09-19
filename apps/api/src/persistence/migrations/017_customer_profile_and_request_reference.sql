ALTER TABLE customers ADD COLUMN cui TEXT;
ALTER TABLE customers ADD COLUMN contact_name TEXT;
ALTER TABLE customers ADD COLUMN phone TEXT;
ALTER TABLE customers ADD COLUMN email TEXT;
ALTER TABLE customers ADD COLUMN address TEXT;
ALTER TABLE customers ADD COLUMN city TEXT;
ALTER TABLE customers ADD COLUMN notes TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_requests_reference
  ON commercial_requests (reference);
