export const PERSON_SKILL_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type PersonSkillStatus = (typeof PERSON_SKILL_STATUSES)[number];

export type PersonSkillAssignment = {
  assignmentId: string;
  personId: string;
  skillId: string;
  status: PersonSkillStatus;
  assignedAt: string;
  retiredAt: string | null;
};

export const PERSON_SKILL_MUTATION_ERRORS = [
  "not_found",
  "unknown_person",
  "unknown_skill",
  "retired_person",
  "retired_skill",
  "already_assigned",
] as const;
export type PersonSkillMutationError = (typeof PERSON_SKILL_MUTATION_ERRORS)[number];

export type PersonSkillMutationResult =
  | { ok: true; assignment: PersonSkillAssignment; alreadyApplied: boolean }
  | { ok: false; error: PersonSkillMutationError };

export function generatePersonSkillAssignmentId(): string {
  return `psa:${crypto.randomUUID()}`;
}

export function assignPersonSkill(input: {
  personId: string;
  skillId: string;
  personStatus: "ACTIVE" | "RETIRED";
  skillStatus: "ACTIVE" | "RETIRED";
  existing: readonly PersonSkillAssignment[];
  assignmentId?: string;
  assignedAt?: string;
}): PersonSkillMutationResult {
  if (!input.personId) {
    return { ok: false, error: "unknown_person" };
  }
  if (!input.skillId) {
    return { ok: false, error: "unknown_skill" };
  }
  if (input.personStatus === "RETIRED") {
    return { ok: false, error: "retired_person" };
  }
  if (input.skillStatus === "RETIRED") {
    return { ok: false, error: "retired_skill" };
  }
  const current = input.existing.find(
    (item) =>
      item.personId === input.personId &&
      item.skillId === input.skillId &&
      item.status === "ACTIVE",
  );
  if (current) {
    return { ok: true, assignment: current, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    assignment: {
      assignmentId: input.assignmentId ?? generatePersonSkillAssignmentId(),
      personId: input.personId,
      skillId: input.skillId,
      status: "ACTIVE",
      assignedAt: input.assignedAt ?? new Date().toISOString(),
      retiredAt: null,
    },
  };
}

export function retirePersonSkill(
  assignment: PersonSkillAssignment,
  retiredAt: string,
): PersonSkillMutationResult {
  if (assignment.status === "RETIRED") {
    return { ok: true, assignment, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    assignment: {
      ...assignment,
      status: "RETIRED",
      retiredAt,
    },
  };
}

export function isPersonSkillStatus(value: string): value is PersonSkillStatus {
  return value === "ACTIVE" || value === "RETIRED";
}

export function personSkillFromRow(row: {
  assignmentId: string;
  personId: string;
  skillId: string;
  status: string;
  assignedAt: string;
  retiredAt: string | null;
}): PersonSkillAssignment | null {
  if (
    !row.assignmentId ||
    !row.personId ||
    !row.skillId ||
    !isPersonSkillStatus(row.status) ||
    !row.assignedAt
  ) {
    return null;
  }
  return {
    assignmentId: row.assignmentId,
    personId: row.personId,
    skillId: row.skillId,
    status: row.status,
    assignedAt: row.assignedAt,
    retiredAt: row.retiredAt,
  };
}

export function activeAssignmentsForPerson(
  assignments: readonly PersonSkillAssignment[],
  personId: string,
): PersonSkillAssignment[] {
  return assignments.filter(
    (item) => item.personId === personId && item.status === "ACTIVE",
  );
}
