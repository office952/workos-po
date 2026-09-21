import type { ProductionCapabilityClassId } from "@workos-final/domain";

export type TrustedSkillSeed = {
  skillId: string;
  code: string;
  displayLabel: string;
  description: string | null;
};

export const OPERATIONAL_SKILL_FOUNDATION_MARKER =
  "OPERATIONAL_SKILL_FOUNDATION_V1_APPLIED" as const;

export const VINYL_APPLICATOR_SKILL_ID = "skl:legacy:vinyl" as const;
export const VINYL_APPLICATOR_SKILL_CODE = "SK_VINYL_APPLICATOR" as const;
export const VINYL_APPLICATOR_NEW_ORG_LABEL = "Aplicare autocolant" as const;

export const PAINTING_SKILL_ID = "skl:operational:painting" as const;
export const PAINTING_SKILL_CODE = "SK_PAINTING" as const;
export const PAINTING_SKILL_LABEL = "Vopsire spray / pistol" as const;

export const METAL_CUTTING_OPERATOR_SKILL_ID = "skl:operational:metal-cutting-operator" as const;
export const METAL_CUTTING_OPERATOR_SKILL_CODE = "SK_METAL_CUTTING_OPERATOR" as const;
export const METAL_CUTTING_OPERATOR_SKILL_LABEL = "Operator debitare metale" as const;

export const DEPRECATED_PAINTING_ASSEMBLY_SKILL_CODE = "SK_ASSEMBLY" as const;

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
  {
    skillId: VINYL_APPLICATOR_SKILL_ID,
    code: VINYL_APPLICATOR_SKILL_CODE,
    displayLabel: VINYL_APPLICATOR_NEW_ORG_LABEL,
    description: null,
  },
  {
    skillId: PAINTING_SKILL_ID,
    code: PAINTING_SKILL_CODE,
    displayLabel: PAINTING_SKILL_LABEL,
    description: null,
  },
  {
    skillId: METAL_CUTTING_OPERATOR_SKILL_ID,
    code: METAL_CUTTING_OPERATOR_SKILL_CODE,
    displayLabel: METAL_CUTTING_OPERATOR_SKILL_LABEL,
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
  { capabilityId: "VINYL_APPLICATION", skillCode: VINYL_APPLICATOR_SKILL_CODE },
  { capabilityId: "PAINTING", skillCode: PAINTING_SKILL_CODE },
  { capabilityId: "METAL_CUTTING", skillCode: METAL_CUTTING_OPERATOR_SKILL_CODE },
];
