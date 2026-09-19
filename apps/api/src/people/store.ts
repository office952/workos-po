import {
  assignPersonSkill,
  createPerson,
  createSkill,
  personFromRow,
  personSkillFromRow,
  projectPeopleRegistry,
  renameSkillDisplay,
  retirePerson,
  retirePersonSkill,
  retireSkill,
  skillFromRow,
  updatePersonProfile,
  type CapabilitySkillRequirement,
  type PeopleEligibilityContext,
  type PeopleRegistryProjection,
  type Person,
  type PersonMutationResult,
  type PersonProfilePatch,
  type PersonSkillAssignment,
  type PersonSkillMutationResult,
  type Skill,
  type SkillMutationResult,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  OPERATIONAL_FOUNDATION_CAPABILITY_SKILLS,
  OPERATIONAL_FOUNDATION_SKILLS,
  OPERATIONAL_SKILL_FOUNDATION_MARKER,
} from "./operationalSkillFoundation.js";
import {
  TRUSTED_CAPABILITY_SKILLS,
  TRUSTED_PEOPLE,
  TRUSTED_SKILLS,
} from "./trustedWorkforce.js";

type PersonRow = {
  person_id: string;
  display_name: string;
  status: string;
  created_at: string;
  retired_at: string | null;
  availability: string | null;
  unavailable_reason: string | null;
  unavailable_until: string | null;
  role_label: string | null;
  provenance: string | null;
  updated_at: string | null;
  availability_updated_at: string | null;
};

type SkillRow = {
  skill_id: string;
  code: string;
  display_label: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  retired_at: string | null;
};

type AssignmentRow = {
  assignment_id: string;
  person_id: string;
  skill_id: string;
  status: string;
  assigned_at: string;
  retired_at: string | null;
};

export function listPeople(db: SqliteDatabase): Person[] {
  const rows = db
    .prepare(
      `
      SELECT person_id, display_name, status, created_at, retired_at,
             availability, unavailable_reason, unavailable_until, role_label,
             provenance, updated_at, availability_updated_at
      FROM people
      ORDER BY display_name COLLATE NOCASE
    `,
    )
    .all() as PersonRow[];
  return rows.flatMap((row) => {
    const person = mapPerson(row);
    return person ? [person] : [];
  });
}

export function getPerson(db: SqliteDatabase, personId: string): Person | null {
  const row = db
    .prepare(
      `
      SELECT person_id, display_name, status, created_at, retired_at,
             availability, unavailable_reason, unavailable_until, role_label,
             provenance, updated_at, availability_updated_at
      FROM people
      WHERE person_id = ?
    `,
    )
    .get(personId) as PersonRow | undefined;
  return row ? mapPerson(row) : null;
}

export function listSkills(db: SqliteDatabase): Skill[] {
  const rows = db
    .prepare(
      `
      SELECT skill_id, code, display_label, description, status, created_at, updated_at, retired_at
      FROM skills
      ORDER BY display_label COLLATE NOCASE
    `,
    )
    .all() as SkillRow[];
  return rows.flatMap((row) => {
    const skill = mapSkill(row);
    return skill ? [skill] : [];
  });
}

export function getSkill(db: SqliteDatabase, skillId: string): Skill | null {
  const row = db
    .prepare(
      `
      SELECT skill_id, code, display_label, description, status, created_at, updated_at, retired_at
      FROM skills
      WHERE skill_id = ?
    `,
    )
    .get(skillId) as SkillRow | undefined;
  return row ? mapSkill(row) : null;
}

export function listPersonSkillAssignments(db: SqliteDatabase): PersonSkillAssignment[] {
  const rows = db
    .prepare(
      `
      SELECT assignment_id, person_id, skill_id, status, assigned_at, retired_at
      FROM person_skill_assignments
    `,
    )
    .all() as AssignmentRow[];
  return rows.flatMap((row) => {
    const assignment = personSkillFromRow({
      assignmentId: row.assignment_id,
      personId: row.person_id,
      skillId: row.skill_id,
      status: row.status,
      assignedAt: row.assigned_at,
      retiredAt: row.retired_at,
    });
    return assignment ? [assignment] : [];
  });
}

export function listCapabilitySkillRequirements(
  db: SqliteDatabase,
): CapabilitySkillRequirement[] {
  const rows = db
    .prepare(
      `
      SELECT capability_id, skill_id
      FROM capability_skill_requirements
    `,
    )
    .all() as Array<{ capability_id: string; skill_id: string }>;
  return rows.map((row) => ({
    capabilityId: row.capability_id as CapabilitySkillRequirement["capabilityId"],
    skillId: row.skill_id,
  }));
}

export function readPeopleEligibilityContext(db: SqliteDatabase): PeopleEligibilityContext {
  return {
    skills: listSkills(db),
    assignments: listPersonSkillAssignments(db),
    requirements: listCapabilitySkillRequirements(db),
  };
}

export function runtimePeopleEligibilityContext(
  db: SqliteDatabase,
  options?: { failClosedWhenUnmapped?: boolean },
): PeopleEligibilityContext | null {
  const context = readPeopleEligibilityContext(db);
  if (context.requirements.length === 0) {
    return options?.failClosedWhenUnmapped ? context : null;
  }
  return context;
}

export function readPeopleRegistry(db: SqliteDatabase): PeopleRegistryProjection {
  return projectPeopleRegistry(
    listPeople(db),
    listSkills(db),
    listPersonSkillAssignments(db),
  );
}

export function persistCreatedPerson(
  db: SqliteDatabase,
  displayName: string,
  options?: { roleLabel?: string | null },
): PersonMutationResult {
  const created = createPerson(displayName, {
    roleLabel: options?.roleLabel,
    provenance: "MANUAL",
  });
  if (!created.ok) {
    return created;
  }
  insertPerson(db, created.person);
  return created;
}

export function persistUpdatedPerson(
  db: SqliteDatabase,
  personId: string,
  patch: PersonProfilePatch,
): PersonMutationResult {
  const current = getPerson(db, personId);
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const updated = updatePersonProfile(current, patch);
  if (!updated.ok || updated.alreadyApplied) {
    return updated;
  }
  writePerson(db, updated.person);
  return updated;
}

export function persistRenamedPerson(
  db: SqliteDatabase,
  personId: string,
  displayName: string,
): PersonMutationResult {
  return persistUpdatedPerson(db, personId, { displayName });
}

export function persistRetiredPerson(
  db: SqliteDatabase,
  personId: string,
  retiredAt: string,
): PersonMutationResult {
  const current = getPerson(db, personId);
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const retired = retirePerson(current, retiredAt, {
    hasActiveTask: personHasInProgressTask(db, personId),
  });
  if (!retired.ok || retired.alreadyApplied) {
    return retired;
  }
  writePerson(db, retired.person);
  return retired;
}

export function persistCreatedSkill(
  db: SqliteDatabase,
  input: { code: string; displayLabel: string; description?: string | null },
): SkillMutationResult {
  const created = createSkill(input);
  if (!created.ok) {
    return created;
  }
  try {
    insertSkill(db, created.skill);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      return { ok: false, error: "invalid_code" };
    }
    throw error;
  }
  return created;
}

export function persistRenamedSkill(
  db: SqliteDatabase,
  skillId: string,
  displayLabel: string,
): SkillMutationResult {
  const current = getSkill(db, skillId);
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const renamed = renameSkillDisplay(current, displayLabel);
  if (!renamed.ok || renamed.alreadyApplied) {
    return renamed;
  }
  db.prepare(
    `
    UPDATE skills
    SET display_label = ?, updated_at = ?
    WHERE skill_id = ?
  `,
  ).run(renamed.skill.displayLabel, renamed.skill.updatedAt, skillId);
  return renamed;
}

export function persistRetiredSkill(
  db: SqliteDatabase,
  skillId: string,
  retiredAt: string,
): SkillMutationResult {
  const current = getSkill(db, skillId);
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const retired = retireSkill(current, retiredAt);
  if (!retired.ok || retired.alreadyApplied) {
    return retired;
  }
  db.prepare(
    `
    UPDATE skills
    SET status = ?, retired_at = ?, updated_at = ?
    WHERE skill_id = ?
  `,
  ).run(retired.skill.status, retired.skill.retiredAt, retired.skill.updatedAt, skillId);
  return retired;
}

export function persistAssignedPersonSkill(
  db: SqliteDatabase,
  personId: string,
  skillId: string,
): PersonSkillMutationResult {
  const person = getPerson(db, personId);
  if (!person) {
    return { ok: false, error: "unknown_person" };
  }
  const skill = getSkill(db, skillId);
  if (!skill) {
    return { ok: false, error: "unknown_skill" };
  }
  const assigned = assignPersonSkill({
    personId,
    skillId,
    personStatus: person.status,
    skillStatus: skill.status,
    existing: listPersonSkillAssignments(db),
  });
  if (!assigned.ok || assigned.alreadyApplied) {
    return assigned;
  }
  db.prepare(
    `
    INSERT INTO person_skill_assignments
      (assignment_id, person_id, skill_id, status, assigned_at, retired_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  ).run(
    assigned.assignment.assignmentId,
    assigned.assignment.personId,
    assigned.assignment.skillId,
    assigned.assignment.status,
    assigned.assignment.assignedAt,
    assigned.assignment.retiredAt,
  );
  return assigned;
}

export function persistRetiredPersonSkill(
  db: SqliteDatabase,
  personId: string,
  skillId: string,
  retiredAt: string,
): PersonSkillMutationResult {
  const current = listPersonSkillAssignments(db).find(
    (item) =>
      item.personId === personId && item.skillId === skillId && item.status === "ACTIVE",
  );
  if (!current) {
    return { ok: false, error: "not_found" };
  }
  const retired = retirePersonSkill(current, retiredAt);
  if (!retired.ok || retired.alreadyApplied) {
    return retired;
  }
  db.prepare(
    `
    UPDATE person_skill_assignments
    SET status = ?, retired_at = ?
    WHERE assignment_id = ?
  `,
  ).run(retired.assignment.status, retired.assignment.retiredAt, retired.assignment.assignmentId);
  return retired;
}

export function personHasInProgressTask(db: SqliteDatabase, personId: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS found
      FROM execution_tasks
      WHERE assigned_executor_id = ? AND status = 'IN_PROGRESS'
      LIMIT 1
    `,
    )
    .get(personId) as { found: number } | undefined;
  return Boolean(row);
}

export const PEOPLE_TRUSTED_WORKFORCE_MARKER = "PEOPLE_TRUSTED_WORKFORCE_V1_APPLIED";

export function isTrustedWorkforceApplied(db: SqliteDatabase): boolean {
  const row = db
    .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
    .get(PEOPLE_TRUSTED_WORKFORCE_MARKER) as { marker_id: string } | undefined;
  return Boolean(row);
}

export function isOperationalSkillFoundationApplied(db: SqliteDatabase): boolean {
  const row = db
    .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
    .get(OPERATIONAL_SKILL_FOUNDATION_MARKER) as { marker_id: string } | undefined;
  return Boolean(row);
}

export function applyOperationalSkillFoundation(db: SqliteDatabase): void {
  if (isOperationalSkillFoundationApplied(db)) {
    return;
  }
  const apply = db.transaction(() => {
    if (isOperationalSkillFoundationApplied(db)) {
      return;
    }
    materializeSkillSeeds(db, OPERATIONAL_FOUNDATION_SKILLS, OPERATIONAL_FOUNDATION_CAPABILITY_SKILLS);
    db.prepare(
      `
      INSERT INTO runtime_bootstrap_markers (marker_id, applied_at)
      VALUES (?, ?)
    `,
    ).run(OPERATIONAL_SKILL_FOUNDATION_MARKER, new Date().toISOString());
  });
  apply();
}

export function ensureTrustedWorkforce(db: SqliteDatabase): void {
  applyOperationalSkillFoundation(db);
  if (isTrustedWorkforceApplied(db)) {
    return;
  }
  const apply = db.transaction(() => {
    if (isTrustedWorkforceApplied(db)) {
      return;
    }
    if (!allTrustedPeoplePresent(db)) {
      materializeTrustedWorkforceOnce(db);
    }
    db.prepare(
      `
      INSERT INTO runtime_bootstrap_markers (marker_id, applied_at)
      VALUES (?, ?)
    `,
    ).run(PEOPLE_TRUSTED_WORKFORCE_MARKER, new Date().toISOString());
  });
  apply();
}

function trustedPersonPresent(
  db: SqliteDatabase,
  seed: (typeof TRUSTED_PEOPLE)[number],
): boolean {
  return Boolean(
    getPerson(db, seed.personId) ||
      listPeople(db).some((item) => item.displayName === seed.displayName),
  );
}

function allTrustedPeoplePresent(db: SqliteDatabase): boolean {
  return TRUSTED_PEOPLE.every((seed) => trustedPersonPresent(db, seed));
}

function materializeSkillSeeds(
  db: SqliteDatabase,
  skills: readonly { skillId: string; code: string; displayLabel: string; description: string | null }[],
  mappings: ReadonlyArray<{ capabilityId: string; skillCode: string }>,
  createdAt = "2026-08-17T12:00:00.000Z",
): void {
  for (const seed of skills) {
    const existing = db
      .prepare("SELECT skill_id FROM skills WHERE code = ? OR skill_id = ?")
      .get(seed.code, seed.skillId) as { skill_id: string } | undefined;
    if (existing) {
      continue;
    }
    const created = createSkill({
      skillId: seed.skillId,
      code: seed.code,
      displayLabel: seed.displayLabel,
      description: seed.description,
      createdAt,
    });
    if (created.ok) {
      insertSkill(db, created.skill);
    }
  }
  const skillIdByCode = new Map(listSkills(db).map((skill) => [skill.code, skill.skillId]));
  for (const mapping of mappings) {
    const skillId = skillIdByCode.get(mapping.skillCode);
    if (!skillId) {
      continue;
    }
    db.prepare(
      `
      INSERT OR IGNORE INTO capability_skill_requirements (capability_id, skill_id)
      VALUES (?, ?)
    `,
    ).run(mapping.capabilityId, skillId);
  }
}

function materializeTrustedWorkforceOnce(db: SqliteDatabase): void {
  const createdAt = "2026-08-17T12:00:00.000Z";
  materializeSkillSeeds(db, TRUSTED_SKILLS, TRUSTED_CAPABILITY_SKILLS, createdAt);
  const skillIdByCode = new Map(listSkills(db).map((skill) => [skill.code, skill.skillId]));
  for (const seed of TRUSTED_PEOPLE) {
    const byId = getPerson(db, seed.personId);
    const byName = listPeople(db).find((item) => item.displayName === seed.displayName);
    if (byId || byName) {
      continue;
    }
    const created = createPerson(seed.displayName, {
      personId: seed.personId,
      createdAt,
      roleLabel: seed.roleLabel,
      provenance: "OWNER_CONFIRMED_LEGACY",
    });
    if (!created.ok) {
      continue;
    }
    insertPerson(db, created.person);
    for (const code of seed.skillCodes) {
      const skillId = skillIdByCode.get(code);
      if (!skillId) {
        continue;
      }
      persistAssignedPersonSkill(db, created.person.personId, skillId);
    }
  }
}

function insertPerson(db: SqliteDatabase, person: Person): void {
  db.prepare(
    `
    INSERT INTO people (
      person_id, display_name, status, created_at, retired_at,
      availability, unavailable_reason, unavailable_until, role_label,
      provenance, updated_at, availability_updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    person.personId,
    person.displayName,
    person.status,
    person.createdAt,
    person.retiredAt,
    person.availability,
    person.unavailableReason,
    person.unavailableUntil,
    person.roleLabel,
    person.provenance,
    person.updatedAt,
    person.availabilityUpdatedAt,
  );
}

function writePerson(db: SqliteDatabase, person: Person): void {
  db.prepare(
    `
    UPDATE people
    SET display_name = ?, status = ?, retired_at = ?, availability = ?,
        unavailable_reason = ?, unavailable_until = ?, role_label = ?,
        provenance = ?, updated_at = ?, availability_updated_at = ?
    WHERE person_id = ?
  `,
  ).run(
    person.displayName,
    person.status,
    person.retiredAt,
    person.availability,
    person.unavailableReason,
    person.unavailableUntil,
    person.roleLabel,
    person.provenance,
    person.updatedAt,
    person.availabilityUpdatedAt,
    person.personId,
  );
}

function insertSkill(db: SqliteDatabase, skill: Skill): void {
  db.prepare(
    `
    INSERT INTO skills
      (skill_id, code, display_label, description, status, created_at, updated_at, retired_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    skill.skillId,
    skill.code,
    skill.displayLabel,
    skill.description,
    skill.status,
    skill.createdAt,
    skill.updatedAt,
    skill.retiredAt,
  );
}

function mapPerson(row: PersonRow): Person | null {
  return personFromRow({
    personId: row.person_id,
    displayName: row.display_name,
    status: row.status,
    createdAt: row.created_at,
    retiredAt: row.retired_at,
    availability: row.availability,
    unavailableReason: row.unavailable_reason,
    unavailableUntil: row.unavailable_until,
    roleLabel: row.role_label,
    provenance: row.provenance,
    updatedAt: row.updated_at,
    availabilityUpdatedAt: row.availability_updated_at,
  });
}

function mapSkill(row: SkillRow): Skill | null {
  return skillFromRow({
    skillId: row.skill_id,
    code: row.code,
    displayLabel: row.display_label,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retiredAt: row.retired_at,
  });
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}
