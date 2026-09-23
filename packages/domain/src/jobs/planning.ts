import { parseCanonicalCalendarDate } from "../calendarDate.js";

type PlanningStage =
  | "ORDER_CREATED"
  | "RELEASED"
  | "EXECUTION_PLANNED"
  | "EXECUTION_IN_PROGRESS"
  | "EXECUTION_COMPLETED";

export const JOB_KINDS = ["PRODUCT", "ASSEMBLY"] as const;
export type JobKind = (typeof JOB_KINDS)[number];

export const OPERATIONAL_PRIORITIES = ["STANDARD", "HIGH", "URGENT"] as const;
export type OperationalPriority = (typeof OPERATIONAL_PRIORITIES)[number];

export const DEFAULT_OPERATIONAL_PRIORITY = "STANDARD" satisfies OperationalPriority;

export const OVERDUE_ATTENTION_LABEL = "Termen depășit";

export type JobPlanningMetadata = {
  organizationId: string;
  jobId: string;
  jobKind: JobKind;
  priority: OperationalPriority;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobPlanningPatch = {
  priority?: OperationalPriority;
  targetDate?: string | null;
};

export function jobKindLabel(kind: JobKind): string {
  switch (kind) {
    case "PRODUCT":
      return "Produs";
    case "ASSEMBLY":
      return "Ansamblu";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function operationalPriorityLabel(priority: OperationalPriority): string {
  switch (priority) {
    case "STANDARD":
      return "Standard";
    case "HIGH":
      return "Ridicată";
    case "URGENT":
      return "Urgentă";
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

export function operationalPriorityRank(priority: OperationalPriority): number {
  switch (priority) {
    case "URGENT":
      return 0;
    case "HIGH":
      return 1;
    case "STANDARD":
      return 2;
    default: {
      const _exhaustive: never = priority;
      return _exhaustive;
    }
  }
}

export function operationalTargetDateLabel(targetDate: string | null): string {
  if (!targetDate) {
    return "Fără termen";
  }
  const [year, month, day] = targetDate.split("-");
  if (!year || !month || !day) {
    return targetDate;
  }
  return `${day}.${month}.${year}`;
}

export function parseOperationalPriority(
  value: unknown,
): { ok: true; priority: OperationalPriority } | { ok: false; error: "invalid_priority" } {
  if (
    value === "STANDARD" ||
    value === "HIGH" ||
    value === "URGENT"
  ) {
    return { ok: true, priority: value };
  }
  return { ok: false, error: "invalid_priority" };
}

export function parseTargetDate(
  value: unknown,
): { ok: true; targetDate: string | null } | { ok: false; error: "invalid_target_date" } {
  if (value === null) {
    return { ok: true, targetDate: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_target_date" };
  }
  const parsed = parseCanonicalCalendarDate(value);
  if (!parsed.ok) {
    return { ok: false, error: "invalid_target_date" };
  }
  return { ok: true, targetDate: parsed.date };
}

export function planningMetadataIsEditable(stage: PlanningStage): boolean {
  switch (stage) {
    case "ORDER_CREATED":
    case "RELEASED":
    case "EXECUTION_PLANNED":
    case "EXECUTION_IN_PROGRESS":
      return true;
    case "EXECUTION_COMPLETED":
      return false;
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function isOperationallyOverdue(input: {
  targetDate: string | null;
  stage: PlanningStage;
  today: string;
}): boolean {
  if (!input.targetDate || input.stage === "EXECUTION_COMPLETED") {
    return false;
  }
  return input.targetDate < input.today;
}

export function compareOperationalTargetDates(
  left: string | null,
  right: string | null,
): number {
  if (left === right) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return left.localeCompare(right);
}
