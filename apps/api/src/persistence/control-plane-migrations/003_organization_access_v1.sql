-- V1 Organization Access (contract WORKOS_V1_ORGANIZATION_ACCESS_CONTRACT, API_AND_DB_CHANGE_PLAN.md §1).
-- Control plane only. Additive: no existing row is rewritten.

-- Fail closed if existing memberships are outside the (role, status) invariant.
CREATE TEMP TABLE v1_membership_invariant_check (offending INTEGER NOT NULL CHECK (offending = 0));
INSERT INTO v1_membership_invariant_check
SELECT count(*) FROM organization_memberships
WHERE NOT ((role IN ('owner','member') AND status IN ('ACTIVE','REVOKED'))
        OR (role IN ('production','workshop') AND status IN ('ACTIVE_SCOPED','REVOKED')));
DROP TABLE v1_membership_invariant_check;

ALTER TABLE users ADD COLUMN password_changed_at TEXT;
ALTER TABLE users ADD COLUMN email_verified_at TEXT;

ALTER TABLE organization_memberships ADD COLUMN updated_at TEXT;
ALTER TABLE organization_memberships ADD COLUMN created_by_user_id TEXT;
ALTER TABLE organization_memberships ADD COLUMN role_changed_at TEXT;
ALTER TABLE organization_memberships ADD COLUMN revoked_at TEXT;
ALTER TABLE organization_memberships ADD COLUMN revoked_by_user_id TEXT;

-- New roles use ACTIVE_SCOPED, which a pre-V1 build does not treat as active (fail-closed rollback).
CREATE TRIGGER memberships_role_status_insert BEFORE INSERT ON organization_memberships
WHEN NOT ((NEW.role IN ('owner','member') AND NEW.status IN ('ACTIVE','REVOKED'))
       OR (NEW.role IN ('production','workshop') AND NEW.status IN ('ACTIVE_SCOPED','REVOKED')))
BEGIN
  SELECT RAISE(ABORT, 'membership_role_status_invalid');
END;

CREATE TRIGGER memberships_role_status_update BEFORE UPDATE OF role, status ON organization_memberships
WHEN NOT ((NEW.role IN ('owner','member') AND NEW.status IN ('ACTIVE','REVOKED'))
       OR (NEW.role IN ('production','workshop') AND NEW.status IN ('ACTIVE_SCOPED','REVOKED')))
BEGIN
  SELECT RAISE(ABORT, 'membership_role_status_invalid');
END;

CREATE TABLE organization_invitations (
  invitation_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(organization_id),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','member','production','workshop')),
  token_hash BLOB NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','REVOKED','EXPIRED')),
  delivery_channel TEXT NOT NULL CHECK (delivery_channel IN ('LINK','EMAIL')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('NOT_SENT','SENT','FAILED')),
  send_count INTEGER NOT NULL DEFAULT 1,
  created_by_user_id TEXT NOT NULL REFERENCES users(user_id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_sent_at TEXT NOT NULL,
  accepted_user_id TEXT REFERENCES users(user_id),
  accepted_at TEXT,
  revoked_by_user_id TEXT REFERENCES users(user_id),
  revoked_at TEXT
);
CREATE UNIQUE INDEX idx_invitations_pending
  ON organization_invitations(organization_id, email) WHERE status = 'PENDING';
CREATE INDEX idx_invitations_org ON organization_invitations(organization_id, status);

CREATE TABLE credential_tokens (
  token_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id),
  purpose TEXT NOT NULL CHECK (purpose IN ('PASSWORD_RESET','EMAIL_VERIFICATION')),
  token_hash BLOB NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('ISSUED','USED','EXPIRED','SUPERSEDED')),
  issued_via TEXT NOT NULL CHECK (issued_via IN ('SELF_SERVICE','OWNER_REQUEST_EMAIL','PLATFORM_CLI')),
  issued_by_user_id TEXT REFERENCES users(user_id),
  issued_in_organization_id TEXT REFERENCES organizations(organization_id),
  delivered_to_email TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE INDEX idx_credential_tokens_user ON credential_tokens(user_id, purpose, status);

CREATE TABLE access_audit_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(organization_id),
  actor_user_id TEXT REFERENCES users(user_id),
  subject_user_id TEXT REFERENCES users(user_id),
  subject_membership_id TEXT,
  subject_invitation_id TEXT,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_access_audit_org ON access_audit_events(organization_id, created_at);
CREATE INDEX idx_access_audit_subject ON access_audit_events(subject_user_id, created_at);
CREATE TRIGGER access_audit_events_append_only_update BEFORE UPDATE ON access_audit_events
BEGIN
  SELECT RAISE(ABORT, 'access_audit_events_append_only');
END;
CREATE TRIGGER access_audit_events_append_only_delete BEFORE DELETE ON access_audit_events
BEGIN
  SELECT RAISE(ABORT, 'access_audit_events_append_only');
END;
