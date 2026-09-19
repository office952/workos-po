ALTER TABLE accepted_production_snapshots
  ADD COLUMN source_order_snapshot_id TEXT;

ALTER TABLE accepted_production_snapshots
  ADD COLUMN source_order_content_hash TEXT;

ALTER TABLE accepted_production_snapshots
  ADD COLUMN source_production_input_hash TEXT;

ALTER TABLE accepted_production_snapshots
  ADD COLUMN release_source TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS accepted_production_snapshots_source_order_uidx
  ON accepted_production_snapshots(source_order_snapshot_id)
  WHERE source_order_snapshot_id IS NOT NULL;
