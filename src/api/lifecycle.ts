import { getJson, postJson } from "./http";
import type { ExecutionTaskCompletionInput } from "./types";

export async function postQuoteAcceptance(
  productCode: string,
  quoteSnapshotId: string,
): Promise<unknown> {
  return postJson(
    `/api/products/${encodeURIComponent(productCode)}/quote-snapshots/${encodeURIComponent(quoteSnapshotId)}/acceptance`,
  );
}

export async function fetchQuoteAcceptance(
  productCode: string,
  quoteSnapshotId: string,
): Promise<unknown> {
  return getJson(
    `/api/products/${encodeURIComponent(productCode)}/quote-snapshots/${encodeURIComponent(quoteSnapshotId)}/acceptance`,
  );
}

export async function postQuoteOrder(
  productCode: string,
  quoteSnapshotId: string,
): Promise<unknown> {
  return postJson(
    `/api/products/${encodeURIComponent(productCode)}/quote-snapshots/${encodeURIComponent(quoteSnapshotId)}/order`,
  );
}

export async function fetchQuoteOrder(
  productCode: string,
  quoteSnapshotId: string,
): Promise<unknown> {
  return getJson(
    `/api/products/${encodeURIComponent(productCode)}/quote-snapshots/${encodeURIComponent(quoteSnapshotId)}/order`,
  );
}

export async function postProductionRelease(
  productCode: string,
  orderSnapshotId: string,
): Promise<unknown> {
  return postJson(
    `/api/products/${encodeURIComponent(productCode)}/orders/${encodeURIComponent(orderSnapshotId)}/production-release`,
  );
}

export async function postExecutionPlan(
  productCode: string,
  snapshotId: string,
): Promise<unknown> {
  return postJson(
    `/api/products/${encodeURIComponent(productCode)}/accepted-production-snapshots/${encodeURIComponent(snapshotId)}/execution-plan`,
  );
}

export async function fetchExecutionPlan(planId: string): Promise<unknown> {
  return getJson(`/api/execution-plans/${encodeURIComponent(planId)}`);
}

export async function assignTaskProvider(
  taskId: string,
  providerId: string,
): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/provider`, {
    providerId,
  });
}

export async function confirmTaskMaterial(
  taskId: string,
  resourceId: string,
  status: "AVAILABLE" | "NOT_AVAILABLE",
): Promise<unknown> {
  return postJson(
    `/api/execution-tasks/${encodeURIComponent(taskId)}/material-readiness`,
    { resourceId, status },
  );
}

export async function startExecutionTask(taskId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/start`);
}

export async function startMachineRun(taskId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/machine-runs/start`);
}

export async function stopMachineRun(machineRunId: string): Promise<unknown> {
  return postJson(`/api/execution-machine-runs/${encodeURIComponent(machineRunId)}/stop`);
}

export async function recordQualityFail(taskId: string, note: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/quality-fail`, { note });
}

export async function recordQualityPass(taskId: string, note?: string): Promise<unknown> {
  return postJson(
    `/api/execution-tasks/${encodeURIComponent(taskId)}/quality-pass`,
    note === undefined ? {} : { note },
  );
}

export async function closeReworkEpisode(taskId: string, note: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/rework-close`, { note });
}

export async function completeExecutionTask(
  taskId: string,
  input: ExecutionTaskCompletionInput = {},
): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/complete`, input);
}

export async function markTaskExternal(taskId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/external`);
}

export async function assignExternalProvider(taskId: string, providerId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/external-provider`, {
    providerId,
  });
}

export async function handOffExternalTask(taskId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/hand-off`);
}

export async function recordExternalReturn(taskId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/external-return`);
}
