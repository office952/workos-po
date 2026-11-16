import { getJson, sendJson, type JsonResult } from "./http";

/**
 * Commercial & Financial V1 · transport for the offering policy, price exception approvals,
 * company identity and the job economic result. The server owns every rule and value; these
 * calls only move them.
 */
export function fetchOfferingPolicyAdmin(): Promise<unknown> {
  return getJson("/api/admin/offering-policy");
}

export function fetchOfferingPolicy(): Promise<unknown> {
  return getJson("/api/offering-policy");
}

export function saveOfferingPolicy(input: {
  mode: string;
  rules: {
    incompleteCostRequiresApproval: boolean;
    minimumMarginPercent: number | null;
    maximumNetValue: number | null;
  };
  expectedVersion: number;
}): Promise<JsonResult> {
  return sendJson("POST", "/api/admin/offering-policy", input);
}

export function fetchPriceApprovals(status?: string): Promise<unknown> {
  return getJson(`/api/admin/price-approvals${status ? `?status=${encodeURIComponent(status)}` : ""}`);
}

export function decidePriceApproval(
  approvalId: string,
  decision: "APPROVED" | "REJECTED",
  reason: string | null,
): Promise<JsonResult> {
  return sendJson("POST", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}/decision`, {
    decision,
    reason,
  });
}

export function requestPriceApproval(productCode: string, body: Record<string, unknown>): Promise<JsonResult> {
  return sendJson("POST", `/api/products/${encodeURIComponent(productCode)}/price-approval-requests`, body);
}

export function fetchCompanyIdentity(): Promise<unknown> {
  return getJson("/api/seller");
}

export function fetchCompanyIdentityVersions(): Promise<unknown> {
  return getJson("/api/seller/versions");
}

export function saveCompanyIdentity(input: Record<string, unknown>): Promise<JsonResult> {
  return sendJson("PATCH", "/api/seller", input);
}

export function fetchJobEconomics(jobId: string): Promise<unknown> {
  return getJson(`/api/jobs/${encodeURIComponent(jobId)}/economics`);
}
