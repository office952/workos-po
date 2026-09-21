export type PlannedEffortParseResult =
  | { ok: true; plannedEffortMinutes: number | null }
  | { ok: false; error: "invalid_planned_effort" };

export function parsePlannedEffortMinutes(value: unknown): PlannedEffortParseResult {
  if (value === null) {
    return { ok: true, plannedEffortMinutes: null };
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    !Number.isFinite(value) ||
    value < 1
  ) {
    return { ok: false, error: "invalid_planned_effort" };
  }
  return { ok: true, plannedEffortMinutes: value };
}

export function plannedEffortIsUnknown(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}
