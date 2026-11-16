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

type CapabilitySession = {
  ready: boolean;
  unavailable: boolean;
  mode: string;
  organization?: { membershipRole?: string | null; capabilities?: readonly string[] | null } | null;
};

/**
 * Whether the signed-in session may perform an action guarded by `capability` on the server.
 * Single-plane keeps its full local access; a Cloud session uses the server capability list; a
 * server that sends no capabilities (pre-V1) keeps the previous owner-only rule. This only decides
 * what the UI offers — the API checks the same capability on every call.
 */
export function sessionHasCapability(session: CapabilitySession, capability: string): boolean {
  if (!session.ready || session.unavailable) return false;
  if (session.mode === "single_plane") return true;
  const capabilities = session.organization?.capabilities;
  if (Array.isArray(capabilities)) return capabilities.includes(capability);
  return session.organization?.membershipRole === "owner";
}
