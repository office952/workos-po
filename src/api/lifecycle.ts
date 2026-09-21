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

export async function startExecutionTask(taskId: string): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/start`);
}

export async function completeExecutionTask(
  taskId: string,
  input: ExecutionTaskCompletionInput = {},
): Promise<unknown> {
  return postJson(`/api/execution-tasks/${encodeURIComponent(taskId)}/complete`, input);
}
