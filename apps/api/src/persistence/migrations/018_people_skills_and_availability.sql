ALTER TABLE people ADD COLUMN availability TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE people ADD COLUMN unavailable_reason TEXT;
ALTER TABLE people ADD COLUMN unavailable_until TEXT;
ALTER TABLE people ADD COLUMN role_label TEXT;
ALTER TABLE people ADD COLUMN provenance TEXT;
ALTER TABLE people ADD COLUMN updated_at TEXT;
ALTER TABLE people ADD COLUMN availability_updated_at TEXT;

UPDATE people
SET
  updated_at = created_at,
  availability_updated_at = created_at
WHERE updated_at IS NULL;

CREATE TABLE IF NOT EXISTS skills (
  skill_id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  display_label TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retired_at TEXT
);

CREATE TABLE IF NOT EXISTS person_skill_assignments (
  assignment_id TEXT PRIMARY KEY NOT NULL,
  person_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  status TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  retired_at TEXT,
  FOREIGN KEY (person_id) REFERENCES people(person_id),
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_person_skill_active
  ON person_skill_assignments (person_id, skill_id)
  WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS capability_skill_requirements (
  capability_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  PRIMARY KEY (capability_id, skill_id),
  FOREIGN KEY (skill_id) REFERENCES skills(skill_id)
);
