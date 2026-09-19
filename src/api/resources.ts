import { getJson, sendJson } from "./http";

export function resourcesAdminPath(): string {
  return "/api/resources-admin";
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
