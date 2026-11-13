import { getJson, sendJson } from "./http";

export function resourcesAdminPath(): string {
  return "/api/resources-admin";
}

export function costEvidenceCollectionPath(): string {
  return "/api/resources-admin/cost-evidence";
}

export function costEvidencePatchPath(evidenceRowId: string): string {
  return `/api/resources-admin/cost-evidence/${encodeURIComponent(evidenceRowId)}`;
}

export async function fetchResourcesAdmin(): Promise<unknown> {
  return getJson(resourcesAdminPath());
}

export async function patchCostEvidence(
  evidenceRowId: string,
  body: { amount: number; note?: string },
): Promise<ReturnType<typeof sendJson>> {
  return sendJson("PATCH", costEvidencePatchPath(evidenceRowId), body);
}

export async function postCostEvidence(body: {
  resourceId: string;
  amount: number;
  note?: string;
  when?: { volumeDepthMm?: number };
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", costEvidenceCollectionPath(), body);
}
