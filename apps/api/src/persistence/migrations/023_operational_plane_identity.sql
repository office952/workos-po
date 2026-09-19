CREATE TABLE operational_plane_identity (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'current'),
  plane_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  bound_at TEXT NOT NULL
);
