CREATE TABLE IF NOT EXISTS organization_workcenters (
  workcenter_id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  capability_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_machines (
  machine_id TEXT PRIMARY KEY NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  workcenter_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL,
  capability_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workcenter_id) REFERENCES organization_workcenters(workcenter_id)
);

CREATE TABLE IF NOT EXISTS organization_provider_configuration (
  config_id TEXT PRIMARY KEY NOT NULL,
  content_hash TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  source TEXT NOT NULL
);
