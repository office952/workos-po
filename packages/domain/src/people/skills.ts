export const SKILL_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type SkillStatus = (typeof SKILL_STATUSES)[number];

export const SKILL_CODE_MAX_LENGTH = 40;
export const SKILL_LABEL_MAX_LENGTH = 80;
export const SKILL_DESCRIPTION_MAX_LENGTH = 240;
export const SKILL_CODE_PATTERN = /^SK_[A-Z0-9_]+$/;

export type Skill = {
  skillId: string;
  code: string;
  displayLabel: string;
  description: string | null;
  status: SkillStatus;
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
};

export const SKILL_MUTATION_ERRORS = [
  "invalid_code",
  "invalid_label",
  "invalid_description",
  "not_found",
  "already_retired",
] as const;
export type SkillMutationError = (typeof SKILL_MUTATION_ERRORS)[number];

export type SkillMutationResult =
  | { ok: true; skill: Skill; alreadyApplied: boolean }
  | { ok: false; error: SkillMutationError };

export function generateSkillId(): string {
  return `skl:${crypto.randomUUID()}`;
}

export function createSkill(
  input: {
    code: string;
    displayLabel: string;
    description?: string | null;
    skillId?: string;
    createdAt?: string;
  },
): SkillMutationResult {
  const code = readSkillCode(input.code);
  if (!code) {
    return { ok: false, error: "invalid_code" };
  }
  const displayLabel = readLabel(input.displayLabel);
  if (!displayLabel) {
    return { ok: false, error: "invalid_label" };
  }
  const description = readDescription(input.description);
  if (description === false) {
    return { ok: false, error: "invalid_description" };
  }
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    ok: true,
    alreadyApplied: false,
    skill: {
      skillId: input.skillId ?? generateSkillId(),
      code,
      displayLabel,
      description,
      status: "ACTIVE",
      createdAt,
      updatedAt: createdAt,
      retiredAt: null,
    },
  };
}

export function renameSkillDisplay(
  skill: Skill,
  displayLabel: string,
  updatedAt = new Date().toISOString(),
): SkillMutationResult {
  const label = readLabel(displayLabel);
  if (!label) {
    return { ok: false, error: "invalid_label" };
  }
  if (skill.displayLabel === label) {
    return { ok: true, skill, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    skill: {
      ...skill,
      displayLabel: label,
      updatedAt,
    },
  };
}

export function retireSkill(
  skill: Skill,
  retiredAt: string,
): SkillMutationResult {
  if (skill.status === "RETIRED") {
    return { ok: true, skill, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    skill: {
      ...skill,
      status: "RETIRED",
      retiredAt,
      updatedAt: retiredAt,
    },
  };
}

export function isSkillStatus(value: string): value is SkillStatus {
  return value === "ACTIVE" || value === "RETIRED";
}

export function skillFromRow(row: {
  skillId: string;
  code: string;
  displayLabel: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  retiredAt: string | null;
}): Skill | null {
  if (
    !row.skillId ||
    !row.code ||
    !row.displayLabel ||
    !isSkillStatus(row.status) ||
    !row.createdAt ||
    !row.updatedAt
  ) {
    return null;
  }
  return {
    skillId: row.skillId,
    code: row.code,
    displayLabel: row.displayLabel,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    retiredAt: row.retiredAt,
  };
}

export function skillStatusLabel(status: SkillStatus): string {
  switch (status) {
    case "ACTIVE":
      return "Activ";
    case "RETIRED":
      return "Retras";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function readSkillCode(value: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  if (
    trimmed.length === 0 ||
    trimmed.length > SKILL_CODE_MAX_LENGTH ||
    !SKILL_CODE_PATTERN.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function readLabel(value: string): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > SKILL_LABEL_MAX_LENGTH) {
    return null;
  }
  return trimmed;
}

function readDescription(value: string | null | undefined): string | null | false {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return false;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > SKILL_DESCRIPTION_MAX_LENGTH) {
    return false;
  }
  return trimmed;
}
