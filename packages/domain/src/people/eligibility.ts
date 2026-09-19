import type { ProductionCapabilityClassId } from "../processes/catalog.js";
import type { Person } from "./identity.js";
import type { PersonSkillAssignment } from "./assignment.js";
import type { Skill } from "./skills.js";

export const ELIGIBILITY_EXCLUSION_REASONS = [
  "RETIRED",
  "TEMPORARILY_UNAVAILABLE",
  "MISSING_SKILL",
  "RETIRED_SKILL",
  "CAPABILITY_UNMAPPED",
] as const;
export type EligibilityExclusionReason =
  (typeof ELIGIBILITY_EXCLUSION_REASONS)[number];

export type CapabilitySkillRequirement = {
  capabilityId: ProductionCapabilityClassId;
  skillId: string;
};

export type PeopleEligibilityContext = {
  skills: readonly Skill[];
  assignments: readonly PersonSkillAssignment[];
  requirements: readonly CapabilitySkillRequirement[];
};

export type EligiblePerson = {
  personId: string;
  displayName: string;
};

export type PersonEligibilityDiagnosis = {
  personId: string;
  displayName: string;
  eligible: boolean;
  reason: EligibilityExclusionReason | null;
};

export function skillIdsForCapability(
  requirements: readonly CapabilitySkillRequirement[],
  capabilityId: ProductionCapabilityClassId,
): string[] {
  return requirements
    .filter((item) => item.capabilityId === capabilityId)
    .map((item) => item.skillId);
}

export function resolveEligiblePeople(input: {
  capabilityId: ProductionCapabilityClassId;
  people: readonly Person[];
  skills: readonly Skill[];
  assignments: readonly PersonSkillAssignment[];
  requirements: readonly CapabilitySkillRequirement[];
}): EligiblePerson[] {
  return diagnoseEligibility(input)
    .filter((item) => item.eligible)
    .map((item) => ({
      personId: item.personId,
      displayName: item.displayName,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ro"));
}

export function diagnoseEligibility(input: {
  capabilityId: ProductionCapabilityClassId;
  people: readonly Person[];
  skills: readonly Skill[];
  assignments: readonly PersonSkillAssignment[];
  requirements: readonly CapabilitySkillRequirement[];
}): PersonEligibilityDiagnosis[] {
  const requiredSkillIds = skillIdsForCapability(
    input.requirements,
    input.capabilityId,
  );
  const skillsById = new Map(input.skills.map((skill) => [skill.skillId, skill]));
  return input.people.map((person) => diagnosePerson(person, requiredSkillIds, skillsById, input.assignments));
}

function diagnosePerson(
  person: Person,
  requiredSkillIds: readonly string[],
  skillsById: ReadonlyMap<string, Skill>,
  assignments: readonly PersonSkillAssignment[],
): PersonEligibilityDiagnosis {
  if (person.status === "RETIRED") {
    return excluded(person, "RETIRED");
  }
  if (person.availability === "TEMPORARILY_UNAVAILABLE") {
    return excluded(person, "TEMPORARILY_UNAVAILABLE");
  }
  if (requiredSkillIds.length === 0) {
    return excluded(person, "CAPABILITY_UNMAPPED");
  }
  const qualified = assignments.some((assignment) => {
    if (
      assignment.personId !== person.personId ||
      assignment.status !== "ACTIVE" ||
      !requiredSkillIds.includes(assignment.skillId)
    ) {
      return false;
    }
    const skill = skillsById.get(assignment.skillId);
    return skill?.status === "ACTIVE";
  });
  if (!qualified) {
    const hadRetiredSkill = assignments.some((assignment) => {
      if (
        assignment.personId !== person.personId ||
        !requiredSkillIds.includes(assignment.skillId)
      ) {
        return false;
      }
      const skill = skillsById.get(assignment.skillId);
      return skill?.status === "RETIRED" || assignment.status === "RETIRED";
    });
    return excluded(person, hadRetiredSkill ? "RETIRED_SKILL" : "MISSING_SKILL");
  }
  return {
    personId: person.personId,
    displayName: person.displayName,
    eligible: true,
    reason: null,
  };
}

export function personIsCurrentlyEligible(input: {
  personId: string;
  capabilityId: ProductionCapabilityClassId;
  people: readonly Person[];
  eligibility: PeopleEligibilityContext | null;
}): boolean {
  const person = input.people.find((item) => item.personId === input.personId);
  if (!person || person.status !== "ACTIVE" || person.availability !== "AVAILABLE") {
    return false;
  }
  if (!input.eligibility) {
    return true;
  }
  return resolveEligiblePeople({
    capabilityId: input.capabilityId,
    people: input.people,
    skills: input.eligibility.skills,
    assignments: input.eligibility.assignments,
    requirements: input.eligibility.requirements,
  }).some((item) => item.personId === input.personId);
}

export function diagnoseAssignedPerson(input: {
  personId: string;
  capabilityId: ProductionCapabilityClassId;
  people: readonly Person[];
  eligibility: PeopleEligibilityContext | null;
}): PersonEligibilityDiagnosis | null {
  const person = input.people.find((item) => item.personId === input.personId);
  if (!person) {
    return null;
  }
  if (!input.eligibility) {
    if (person.status === "RETIRED") {
      return excluded(person, "RETIRED");
    }
    if (person.availability === "TEMPORARILY_UNAVAILABLE") {
      return excluded(person, "TEMPORARILY_UNAVAILABLE");
    }
    return {
      personId: person.personId,
      displayName: person.displayName,
      eligible: true,
      reason: null,
    };
  }
  return (
    diagnoseEligibility({
      capabilityId: input.capabilityId,
      people: [person],
      skills: input.eligibility.skills,
      assignments: input.eligibility.assignments,
      requirements: input.eligibility.requirements,
    })[0] ?? null
  );
}

function excluded(
  person: Person,
  reason: EligibilityExclusionReason,
): PersonEligibilityDiagnosis {
  return {
    personId: person.personId,
    displayName: person.displayName,
    eligible: false,
    reason,
  };
}
