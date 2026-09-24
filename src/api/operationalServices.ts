import { getJson, patchJson } from "./http";

export async function fetchOperationalServices(): Promise<unknown> {
  return getJson("/api/operational-services");
}

export async function patchOperationalService(
  capabilityId: string,
  offerMode: string,
): Promise<unknown> {
  return patchJson(`/api/operational-services/${encodeURIComponent(capabilityId)}`, {
    offerMode,
  });
}
