export const DEV_CANONICAL_PORTS: number[];
export const OWNER_REFERENCE_PORT: number;
export const PROTECTED_OWNER_PORTS: number[];

export function portsEligibleForGenericReclaim(
  ports?: number[],
  protectedPorts?: number[],
): number[];
export function isProtectedOwnerPort(port: number): boolean;
