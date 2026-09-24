export type ActualDurationParseResult =
  | { ok: true; actualDurationMinutes: number | null }
  | { ok: false; error: "invalid_actual_duration" };

export function parseActualDurationMinutes(value: unknown): ActualDurationParseResult {
  if (value === undefined || value === null) {
    return { ok: true, actualDurationMinutes: null };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return { ok: false, error: "invalid_actual_duration" };
  }
  return { ok: true, actualDurationMinutes: value };
}

export function formatMinutesLabel(minutes: number): string {
  return `${minutes} min`;
}

export function formatSignedVarianceMinutes(variance: number): string {
  const sign = variance > 0 ? "+" : "";
  return `Diferență ${sign}${variance} min`;
}

export function timeVarianceMinutes(
  plannedEffortMinutes: number | null,
  actualDurationMinutes: number | null,
): number | null {
  if (plannedEffortMinutes === null || actualDurationMinutes === null) {
    return null;
  }
  return actualDurationMinutes - plannedEffortMinutes;
}

export type ExecutionTimeSummary = {
  plannedKnownMinutes: number;
  actualKnownMinutes: number;
  plannedKnownTaskCount: number;
  actualKnownTaskCount: number;
  totalTaskCount: number;
  plannedKnownLabel: string;
  actualKnownLabel: string;
};

export function projectExecutionTimeSummary(
  tasks: readonly {
    plannedEffortMinutes: number | null;
    actualDurationMinutes: number | null;
  }[],
): ExecutionTimeSummary {
  let plannedKnownMinutes = 0;
  let actualKnownMinutes = 0;
  let plannedKnownTaskCount = 0;
  let actualKnownTaskCount = 0;
  for (const task of tasks) {
    if (task.plannedEffortMinutes !== null) {
      plannedKnownMinutes += task.plannedEffortMinutes;
      plannedKnownTaskCount += 1;
    }
    if (task.actualDurationMinutes !== null) {
      actualKnownMinutes += task.actualDurationMinutes;
      actualKnownTaskCount += 1;
    }
  }
  const totalTaskCount = tasks.length;
  return {
    plannedKnownMinutes,
    actualKnownMinutes,
    plannedKnownTaskCount,
    actualKnownTaskCount,
    totalTaskCount,
    plannedKnownLabel: `Planificat cunoscut: ${plannedKnownMinutes} min / ${plannedKnownTaskCount} din ${totalTaskCount} sarcini`,
    actualKnownLabel: `Realizat cunoscut: ${actualKnownMinutes} min / ${actualKnownTaskCount} din ${totalTaskCount} sarcini`,
  };
}
