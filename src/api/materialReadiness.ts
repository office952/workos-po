import { getJson, postJson } from "./http";

export async function fetchMaterialReadiness(): Promise<unknown> {
  return getJson("/api/admin/material-readiness");
}

export async function saveMaterialReadiness(mode: string): Promise<unknown> {
  return postJson("/api/admin/material-readiness", { mode });
}
