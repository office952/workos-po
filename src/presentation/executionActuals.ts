import type {
  ExecutionTaskCompletionInput,
  ExecutionTaskTransport,
  PlannedResourceTransport,
} from "../api/types";
import { parseCompletedQuantity } from "./completedQuantity";

export function canEditActualConsumption(task: ExecutionTaskTransport): boolean {
  return (
    task.status === "IN_PROGRESS" &&
    task.canComplete &&
    task.canRecordActualConsumption &&
    task.plannedResources.length > 0
  );
}

export function actualConsumptionDraftKey(taskId: string, resourceId: string): string {
  return `${taskId}:${resourceId}`;
}

export function actualConsumptionFieldId(taskId: string, resourceId: string): string {
  return `actual-consumption-${taskId}-${resourceId}`;
}

export function actualConsumptionFieldLabel(label: string): string {
  return `${label} — consum efectiv`;
}

export function collectActualConsumptionInput(
  plannedResources: readonly PlannedResourceTransport[],
  drafts: Record<string, string>,
  taskId: string,
):
  | { ok: true; actualConsumption?: ExecutionTaskCompletionInput["actualConsumption"] }
  | { ok: false } {
  const lines: NonNullable<ExecutionTaskCompletionInput["actualConsumption"]> = [];
  for (const resource of plannedResources) {
    const raw = drafts[actualConsumptionDraftKey(taskId, resource.resourceId)];
    if (raw === undefined || raw.trim() === "") {
      continue;
    }
    const parsed = parseCompletedQuantity(raw);
    if (parsed === null) {
      return { ok: false };
    }
    lines.push({
      resourceId: resource.resourceId,
      actualQuantity: parsed,
    });
  }
  return lines.length === 0 ? { ok: true } : { ok: true, actualConsumption: lines };
}