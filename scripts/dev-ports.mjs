export const DEV_CANONICAL_PORTS = [5173];
export const OWNER_REFERENCE_PORT = 8787;
export const PROTECTED_OWNER_PORTS = [OWNER_REFERENCE_PORT];

export function portsEligibleForGenericReclaim(
  ports = DEV_CANONICAL_PORTS,
  protectedPorts = PROTECTED_OWNER_PORTS,
) {
  return ports.filter((port) => !protectedPorts.includes(port));
}

export function isProtectedOwnerPort(port) {
  return PROTECTED_OWNER_PORTS.includes(Number(port));
}
