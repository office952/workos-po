import type { ProductionCapabilityClassId } from "@workos-final/domain";

export type TrustedSkillSeed = {
  skillId: string;
  code: string;
  displayLabel: string;
  description: string | null;
};

export const OPERATIONAL_SKILL_FOUNDATION_MARKER =
  "OPERATIONAL_SKILL_FOUNDATION_V1_APPLIED" as const;

export const OPERATIONAL_FOUNDATION_SKILLS: readonly TrustedSkillSeed[] = [
  {
    skillId: "skl:operational:cnc-operator",
    code: "SK_CNC_OPERATOR",
    displayLabel: "CNC",
    description: null,
  },
  {
    skillId: "skl:operational:letter-cant",
    code: "SK_LETTER_CANT_OPERATOR",
    displayLabel: "Operator CNC cant litere",
    description: null,
  },
  {
    skillId: "skl:operational:letter-modeling",
    code: "SK_LETTER_MODELING",
    displayLabel: "Modelare cant litere",
    description: null,
  },
  {
    skillId: "skl:operational:assembly",
    code: "SK_ASSEMBLY",
    displayLabel: "Ansamblare",
    description: null,
  },
  {
    skillId: "skl:operational:electrician",
    code: "SK_ELECTRICIAN",
    displayLabel: "Electrician",
    description: null,
  },
];

export const OPERATIONAL_FOUNDATION_CAPABILITY_SKILLS: ReadonlyArray<{
  capabilityId: ProductionCapabilityClassId;
  skillCode: string;
}> = [
  { capabilityId: "CNC_ROUTING", skillCode: "SK_CNC_OPERATOR" },
  { capabilityId: "PROFILE_FORMING", skillCode: "SK_LETTER_CANT_OPERATOR" },
  { capabilityId: "PROFILE_FORMING", skillCode: "SK_LETTER_MODELING" },
  { capabilityId: "MANUAL_ASSEMBLY", skillCode: "SK_ASSEMBLY" },
  { capabilityId: "ELECTRICAL_ASSEMBLY", skillCode: "SK_ELECTRICIAN" },
  { capabilityId: "QUALITY_CONTROL", skillCode: "SK_ASSEMBLY" },
  { capabilityId: "PACKAGING", skillCode: "SK_ASSEMBLY" },
];
