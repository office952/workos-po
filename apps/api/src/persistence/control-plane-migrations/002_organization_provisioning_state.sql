ALTER TABLE organizations ADD COLUMN provision_owner_email TEXT;
ALTER TABLE organizations ADD COLUMN provision_failure_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_provision_owner_email
ON organizations(provision_owner_email)
WHERE provision_owner_email IS NOT NULL;
