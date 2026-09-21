import { getJson, postJson } from "./http";

export async function fetchPlanningWorkload(): Promise<unknown> {
  return getJson("/api/planning/workload");
}

export async function postPlannedEffort(
  taskId: string,
  plannedEffortMinutes: number | null,
): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/planned-effort`, {
    plannedEffortMinutes,
  });
}
