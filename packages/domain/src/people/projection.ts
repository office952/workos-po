import type { ProductionCapabilityClassId } from "../processes/catalog.js";
import type { PersonSkillAssignment } from "./assignment.js";
import { resolveEligiblePeople, type CapabilitySkillRequirement } from "./eligibility.js";
import {
  personAvailabilityLabel,
  personStatusLabel,
  type Person,
} from "./identity.js";
import type { Skill } from "./skills.js";

export type PersonSkillView = {
  skillId: string;
  code: string;
  displayLabel: string;
  status: "ACTIVE" | "RETIRED";
};

export type PersonRegistryItem = Person & {
  statusLabel: string;
  availabilityLabel: string;
  skills: readonly PersonSkillView[];
  href: string;
};

export type PeopleRegistryProjection = {
  summary: {
    total: number;
    active: number;
    available: number;
    temporarilyUnavailable: number;
    retired: number;
  };
  people: readonly PersonRegistryItem[];
};

export function personHref(personId: string): string {
  return `/admin/people/${encodeURIComponent(personId)}`;
}

export function projectPersonRegistryItem(
  person: Person,
  skills: readonly Skill[],
  assignments: readonly PersonSkillAssignment[],
): PersonRegistryItem {
  const skillById = new Map(skills.map((skill) => [skill.skillId, skill]));
  const current = assignments
    .filter((item) => item.personId === person.personId && item.status === "ACTIVE")
    .flatMap((item) => {
      const skill = skillById.get(item.skillId);
      return skill
        ? [
            {
              skillId: skill.skillId,
              code: skill.code,
              displayLabel: skill.displayLabel,
              status: skill.status,
            },
          ]
        : [];
    })
    .sort((left, right) => left.displayLabel.localeCompare(right.displayLabel, "ro"));
  return {
    ...person,
    statusLabel: personStatusLabel(person.status),
    availabilityLabel: personAvailabilityLabel(person.availability),
    skills: current,
    href: personHref(person.personId),
  };
}

export function projectPeopleRegistry(
  people: readonly Person[],
  skills: readonly Skill[],
  assignments: readonly PersonSkillAssignment[],
): PeopleRegistryProjection {
  const items = people
    .map((person) => projectPersonRegistryItem(person, skills, assignments))
    .sort((left, right) => {
      if (left.status !== right.status) {
        return left.status === "ACTIVE" ? -1 : 1;
      }
      return left.displayName.localeCompare(right.displayName, "ro");
    });
  return {
    summary: {
      total: items.length,
      active: items.filter((item) => item.status === "ACTIVE").length,
      available: items.filter(
        (item) => item.status === "ACTIVE" && item.availability === "AVAILABLE",
      ).length,
      temporarilyUnavailable: items.filter(
        (item) =>
          item.status === "ACTIVE" && item.availability === "TEMPORARILY_UNAVAILABLE",
      ).length,
      retired: items.filter((item) => item.status === "RETIRED").length,
    },
    people: items,
  };
}

export function eligibleExecutorsForCapability(input: {
  capabilityId: ProductionCapabilityClassId;
  people: readonly Person[];
  skills: readonly Skill[];
  assignments: readonly PersonSkillAssignment[];
  requirements: readonly CapabilitySkillRequirement[];
}): Array<{ id: string; label: string }> {
  return resolveEligiblePeople(input).map((person) => ({
    id: person.personId,
    label: person.displayName,
  }));
}
