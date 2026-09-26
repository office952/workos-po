import { getJson, postJson } from "./http";

export async function fetchExternalProduction(): Promise<unknown> {
  return getJson("/api/admin/external-production");
}

export async function saveExternalProductionMode(mode: string): Promise<unknown> {
  return postJson("/api/admin/external-production", { mode });
}

export async function createExternalProductionProvider(name: string): Promise<unknown> {
  return postJson("/api/admin/external-production/providers", { name });
}

export async function updateExternalProductionProvider(
  providerId: string,
  patch: { name?: string; active?: boolean },
): Promise<unknown> {
  return postJson(
    `/api/admin/external-production/providers/${encodeURIComponent(providerId)}`,
    patch,
  );
}
