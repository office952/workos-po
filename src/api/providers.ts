import { postJson } from "./http";

export async function ensureOrganizationCapabilityProvider(
  capabilityId: string,
  label: string,
): Promise<unknown> {
  return postJson("/api/organization-providers/capability", {
    capabilityId,
    label,
  });
}
