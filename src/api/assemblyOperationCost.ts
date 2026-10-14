import { getJson, sendJson, type JsonResult } from "./http";

export function assemblyOperationCostAdminPath(): string {
  return "/api/admin/assembly-operation-cost";
}

export function assemblyOperationCostPolicyPath(): string {
  return "/api/admin/assembly-operation-cost-policy";
}

export function initialCostEvidencePath(): string {
  return "/api/resources-admin/cost-evidence";
}

export function assemblyOperationEstimatesPath(assemblyId: string): string {
  return `/api/assemblies/${encodeURIComponent(assemblyId)}/operation-estimates`;
}

export async function fetchAssemblyOperationCostAdmin(): Promise<unknown> {
  return getJson(assemblyOperationCostAdminPath());
}

export async function postAssemblyOperationCostPolicy(body: {
  expectedVersion: number | null;
  finalInspectionMode: string;
  finalPackagingMode: string;
}): Promise<JsonResult> {
  return sendJson("POST", assemblyOperationCostPolicyPath(), body);
}

export async function postInitialCostEvidence(body: {
  resourceId: string;
  amount: number;
  note?: string;
}): Promise<JsonResult> {
  return sendJson("POST", initialCostEvidencePath(), body);
}

export async function putAssemblyOperationEstimates(
  assemblyId: string,
  estimates: readonly { processId: string; personHours: number | null }[],
): Promise<JsonResult> {
  return sendJson("PUT", assemblyOperationEstimatesPath(assemblyId), { estimates });
}
