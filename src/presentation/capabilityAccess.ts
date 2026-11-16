/**
 * V1 Organization Access: whether the UI may offer a link/action that needs `capability`.
 * `null` capabilities (single-plane, legacy server, no session data) never narrow the UI; the API
 * authorizes every call on its own.
 */
export function capabilityAllows(capabilities: readonly string[] | null | undefined, capability: string): boolean {
  return capabilities == null || capabilities.includes(capability);
}

/** Capabilities of the active cloud organization, or null when they do not apply. */
export function sessionCapabilities(cloud: { mode: string; organization?: { capabilities?: readonly string[] | null } | null }): readonly string[] | null {
  return cloud.mode === "cloud" ? cloud.organization?.capabilities ?? null : null;
}
