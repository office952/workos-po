ALTER TABLE commercial_request_optional_scopes ADD COLUMN provider_mode TEXT;

CREATE TABLE IF NOT EXISTS organization_operational_service_capabilities (
  capability_id TEXT PRIMARY KEY NOT NULL,
  offer_mode TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organization_operational_service_capability_history (
  capability_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  offer_mode TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (capability_id, version)
);
