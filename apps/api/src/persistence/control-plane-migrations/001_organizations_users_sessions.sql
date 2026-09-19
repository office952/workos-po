CREATE TABLE organizations (
  organization_id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE users (
  user_id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash BLOB NOT NULL,
  password_salt BLOB NOT NULL,
  kdf TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE organization_memberships (
  membership_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (organization_id) REFERENCES organizations(organization_id),
  UNIQUE (user_id, organization_id)
);

CREATE TABLE operational_planes (
  plane_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL UNIQUE,
  storage_kind TEXT NOT NULL,
  plane_key TEXT NOT NULL UNIQUE,
  bootstrap_policy TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(organization_id)
);

CREATE TABLE platform_sessions (
  session_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash BLOB NOT NULL UNIQUE,
  active_organization_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (active_organization_id) REFERENCES organizations(organization_id)
);

CREATE INDEX idx_platform_sessions_user ON platform_sessions(user_id);
CREATE INDEX idx_memberships_organization ON organization_memberships(organization_id);
