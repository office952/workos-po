CREATE TABLE IF NOT EXISTS resource_cost_evidence (
  evidence_row_id TEXT PRIMARY KEY NOT NULL,
  resource_id TEXT NOT NULL,
  volume_depth_mm INTEGER,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  per_unit TEXT NOT NULL,
  source TEXT NOT NULL,
  classification TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  superseded_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS resource_cost_evidence_active_unqualified
  ON resource_cost_evidence (resource_id)
  WHERE superseded_at IS NULL AND volume_depth_mm IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS resource_cost_evidence_active_qualified
  ON resource_cost_evidence (resource_id, volume_depth_mm)
  WHERE superseded_at IS NULL AND volume_depth_mm IS NOT NULL;
