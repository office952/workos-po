import { COMPLETION_NOTE_MAX_LENGTH, type ExecutionTask } from "./plan.js";

type ConsumptionError =
  | "invalid_resource"
  | "invalid_quantity"
  | "invalid_unit"
  | "invalid_note";

export type ActualConsumptionLineInput = {
  resourceId: string;
  actualQuantity: number;
  unit?: string;
  note?: string;
};

export type ActualConsumptionEntry = {
  entryId: string;
  taskId: string;
  resourceId: string;
  resourceLabel: string;
  actualQuantity: number;
  unit: string;
  recordedAt: string;
  note: string | null;
};

export function actualConsumptionEntryId(taskId: string, resourceId: string): string {
  return `act:${taskId}:${resourceId}`;
}

export function buildActualConsumption(
  task: Pick<ExecutionTask, "taskId" | "resourceDemands">,
  input: readonly ActualConsumptionLineInput[] | undefined,
  recordedAt: string,
):
  | { ok: true; entries: readonly ActualConsumptionEntry[] }
  | { ok: false; error: ConsumptionError } {
  if (input === undefined || input.length === 0) {
    return { ok: true, entries: [] };
  }
  if (task.resourceDemands.length === 0) {
    return { ok: false, error: "invalid_resource" };
  }

  const seen = new Set<string>();
  const entries: ActualConsumptionEntry[] = [];
  for (const line of input) {
    if (typeof line.resourceId !== "string" || line.resourceId.trim().length === 0) {
      return { ok: false, error: "invalid_resource" };
    }
    if (seen.has(line.resourceId)) {
      return { ok: false, error: "invalid_resource" };
    }
    seen.add(line.resourceId);

    const demand = task.resourceDemands.find((item) => item.resourceId === line.resourceId);
    if (!demand) {
      return { ok: false, error: "invalid_resource" };
    }
    if (!isValidActualQuantity(line.actualQuantity)) {
      return { ok: false, error: "invalid_quantity" };
    }
    if (line.unit !== undefined && line.unit !== demand.unit) {
      return { ok: false, error: "invalid_unit" };
    }
    const note = readConsumptionNote(line.note);
    if (note === false) {
      return { ok: false, error: "invalid_note" };
    }
    entries.push({
      entryId: actualConsumptionEntryId(task.taskId, demand.resourceId),
      taskId: task.taskId,
      resourceId: demand.resourceId,
      resourceLabel: demand.label,
      actualQuantity: line.actualQuantity,
      unit: demand.unit,
      recordedAt,
      note,
    });
  }
  return { ok: true, entries };
}

function isValidActualQuantity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readConsumptionNote(note: string | undefined): string | null | false {
  if (note === undefined) {
    return null;
  }
  if (typeof note !== "string") {
    return false;
  }
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > COMPLETION_NOTE_MAX_LENGTH) {
    return false;
  }
  return trimmed;
}
