import { describe, expect, it } from "vitest";
import { assignPersonSkill, retirePersonSkill } from "./assignment.js";
import {
  diagnoseEligibility,
  personIsCurrentlyEligible,
  resolveEligiblePeople,
} from "./eligibility.js";
import { createPerson, retirePerson, setPersonAvailability } from "./identity.js";
import { createSkill, retireSkill } from "./skills.js";

function person(name: string, personId: string) {
  const created = createPerson(name, { personId });
  if (!created.ok) {
    throw new Error("expected person");
  }
  return created.person;
}

function skill(code: string, skillId: string) {
  const created = createSkill({
    code,
    displayLabel: code,
    skillId,
  });
  if (!created.ok) {
    throw new Error("expected skill");
  }
  return created.skill;
}

describe("current operational eligibility", () => {
  it("includes only ACTIVE + AVAILABLE people with the required skill", () => {
    const florin = person("Florin CNC", "per:florin");
    const andrei = person("Andrei Goghi", "per:andrei");
    const chirila = person("Chirila Cristian", "per:chirila");
    const cnc = skill("SK_CNC_OPERATOR", "skl:cnc");
    const quoting = skill("SK_QUOTING", "skl:quote");
    const florinCnc = assignPersonSkill({
      personId: florin.personId,
      skillId: cnc.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    const andreiCnc = assignPersonSkill({
      personId: andrei.personId,
      skillId: cnc.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    const chirilaQuote = assignPersonSkill({
      personId: chirila.personId,
      skillId: quoting.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    expect(florinCnc.ok && andreiCnc.ok && chirilaQuote.ok).toBe(true);
    if (!florinCnc.ok || !andreiCnc.ok || !chirilaQuote.ok) {
      return;
    }
    const requirements = [{ capabilityId: "CNC_ROUTING" as const, skillId: cnc.skillId }];
    const initial = resolveEligiblePeople({
      capabilityId: "CNC_ROUTING",
      people: [florin, andrei, chirila],
      skills: [cnc, quoting],
      assignments: [florinCnc.assignment, andreiCnc.assignment, chirilaQuote.assignment],
      requirements,
    });
    expect(initial.map((item) => item.personId)).toEqual(["per:andrei", "per:florin"]);

    const away = setPersonAvailability(florin, {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
    });
    expect(away.ok).toBe(true);
    if (!away.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "CNC_ROUTING",
        people: [away.person, andrei, chirila],
        skills: [cnc, quoting],
        assignments: [florinCnc.assignment, andreiCnc.assignment, chirilaQuote.assignment],
        requirements,
      }).map((item) => item.personId),
    ).toEqual(["per:andrei"]);
    expect(away.person.status).toBe("ACTIVE");
    expect(florinCnc.assignment.status).toBe("ACTIVE");

    const mihai = person("Mihai", "per:mihai");
    const mihaiCnc = assignPersonSkill({
      personId: mihai.personId,
      skillId: cnc.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    expect(mihaiCnc.ok).toBe(true);
    if (!mihaiCnc.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "CNC_ROUTING",
        people: [away.person, andrei, chirila, mihai],
        skills: [cnc, quoting],
        assignments: [
          florinCnc.assignment,
          andreiCnc.assignment,
          chirilaQuote.assignment,
          mihaiCnc.assignment,
        ],
        requirements,
      }).map((item) => item.personId),
    ).toEqual(["per:andrei", "per:mihai"]);

    const returned = setPersonAvailability(away.person, { availability: "AVAILABLE" });
    expect(returned.ok).toBe(true);
    if (!returned.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "CNC_ROUTING",
        people: [returned.person, andrei, chirila, mihai],
        skills: [cnc, quoting],
        assignments: [
          florinCnc.assignment,
          andreiCnc.assignment,
          chirilaQuote.assignment,
          mihaiCnc.assignment,
        ],
        requirements,
      }).map((item) => item.personId),
    ).toEqual(["per:andrei", "per:florin", "per:mihai"]);

    const andreiRemoved = retirePersonSkill(
      andreiCnc.assignment,
      "2026-08-17T14:00:00.000Z",
    );
    expect(andreiRemoved.ok).toBe(true);
    if (!andreiRemoved.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "CNC_ROUTING",
        people: [returned.person, andrei, chirila, mihai],
        skills: [cnc, quoting],
        assignments: [
          florinCnc.assignment,
          andreiRemoved.assignment,
          chirilaQuote.assignment,
          mihaiCnc.assignment,
        ],
        requirements,
      }).map((item) => item.personId),
    ).toEqual(["per:florin", "per:mihai"]);
  });

  it("excludes a retired person without deleting history", () => {
    const florin = person("Florin CNC", "per:florin");
    const cnc = skill("SK_CNC_OPERATOR", "skl:cnc");
    const assigned = assignPersonSkill({
      personId: florin.personId,
      skillId: cnc.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    const retired = retirePerson(florin, "2026-08-17T15:00:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "CNC_ROUTING",
        people: [retired.person],
        skills: [cnc],
        assignments: [assigned.assignment],
        requirements: [{ capabilityId: "CNC_ROUTING", skillId: cnc.skillId }],
      }),
    ).toEqual([]);
    expect(retired.person.personId).toBe("per:florin");
    expect(assigned.assignment.status).toBe("ACTIVE");
  });

  it("stops using a retired skill without deleting people", () => {
    const florin = person("Florin CNC", "per:florin");
    const cnc = skill("SK_CNC_OPERATOR", "skl:cnc");
    const assigned = assignPersonSkill({
      personId: florin.personId,
      skillId: cnc.skillId,
      personStatus: "ACTIVE",
      skillStatus: "ACTIVE",
      existing: [],
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    const retiredSkill = retireSkill(cnc, "2026-08-17T16:00:00.000Z");
    expect(retiredSkill.ok).toBe(true);
    if (!retiredSkill.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "CNC_ROUTING",
        people: [florin],
        skills: [retiredSkill.skill],
        assignments: [assigned.assignment],
        requirements: [{ capabilityId: "CNC_ROUTING", skillId: cnc.skillId }],
      }),
    ).toEqual([]);
    expect(florin.status).toBe("ACTIVE");
  });

  it("does not treat an unmapped capability as everyone-eligible", () => {
    const florin = person("Florin CNC", "per:florin");
    const away = setPersonAvailability(person("Andrei Goghi", "per:andrei"), {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
    });
    expect(away.ok).toBe(true);
    if (!away.ok) {
      return;
    }
    expect(
      resolveEligiblePeople({
        capabilityId: "LASER_CUTTING",
        people: [florin, away.person],
        skills: [],
        assignments: [],
        requirements: [],
      }),
    ).toEqual([]);
    expect(
      diagnoseEligibility({
        capabilityId: "LASER_CUTTING",
        people: [florin],
        skills: [],
        assignments: [],
        requirements: [],
      }),
    ).toEqual([
      {
        personId: "per:florin",
        displayName: "Florin CNC",
        eligible: false,
        reason: "CAPABILITY_UNMAPPED",
      },
    ]);
  });

  it("keeps null eligibility permissive and empty mappings fail-closed", () => {
    const ana = person("Ana Noua", "per:ana");
    expect(
      personIsCurrentlyEligible({
        personId: ana.personId,
        capabilityId: "CNC_ROUTING",
        people: [ana],
        eligibility: null,
      }),
    ).toBe(true);
    expect(
      personIsCurrentlyEligible({
        personId: ana.personId,
        capabilityId: "CNC_ROUTING",
        people: [ana],
        eligibility: { skills: [], assignments: [], requirements: [] },
      }),
    ).toBe(false);
  });
});
