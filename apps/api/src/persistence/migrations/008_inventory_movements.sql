CREATE TABLE IF NOT EXISTS inventory_movements (
  movement_id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL,
  resource_label TEXT NOT NULL,
  quantity_delta REAL NOT NULL,
  unit TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_label TEXT,
  recorded_at TEXT NOT NULL,
  note TEXT,
  UNIQUE (source_type, source_id)
);
