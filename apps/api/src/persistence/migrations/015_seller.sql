CREATE TABLE IF NOT EXISTS seller_profile (
  profile_id TEXT PRIMARY KEY NOT NULL,
  legal_name TEXT NOT NULL,
  brand TEXT NOT NULL,
  fiscal_id TEXT NOT NULL,
  trade_register TEXT NOT NULL,
  address TEXT NOT NULL,
  locality TEXT NOT NULL,
  iban TEXT NOT NULL,
  bank TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
