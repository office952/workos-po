CREATE TABLE IF NOT EXISTS assembly_definitions (
  assembly_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  request_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assembly_definitions_org
  ON assembly_definitions (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS confirmed_child_products (
  truth_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  product_code TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  confirmed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_confirmed_child_products_org
  ON confirmed_child_products (organization_id, product_code);

CREATE TABLE IF NOT EXISTS assembly_truths (
  assembly_truth_id TEXT PRIMARY KEY NOT NULL,
  assembly_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  UNIQUE (assembly_id, content_hash)
);

CREATE TABLE IF NOT EXISTS assembly_quote_snapshots (
  quote_snapshot_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  assembly_id TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assembly_order_snapshots (
  order_snapshot_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  source_quote_snapshot_id TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assembly_production_snapshots (
  snapshot_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  source_order_snapshot_id TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
