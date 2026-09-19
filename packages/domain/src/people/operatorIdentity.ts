export const OPERATOR_PIN_MIN_LENGTH = 4;
export const OPERATOR_PIN_MAX_LENGTH = 8;
export const OPERATOR_PIN_RECOMMENDED_LENGTH = 6;
export const OPERATOR_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const OPERATOR_PIN_MUTATION_ERRORS = [
  "invalid_pin",
  "pin_mismatch",
  "unknown_person",
  "retired_person",
  "not_configured",
] as const;
export type OperatorPinMutationError = (typeof OPERATOR_PIN_MUTATION_ERRORS)[number];

export const OPERATOR_SESSION_ERRORS = [
  "invalid_pin",
  "pin_mismatch",
  "not_configured",
  "unknown_person",
  "retired_person",
  "rate_limited",
  "invalid_session",
  "expired_session",
  "revoked_session",
] as const;
export type OperatorSessionError = (typeof OPERATOR_SESSION_ERRORS)[number];

export type OperatorCredentialRecord = {
  personId: string;
  createdAt: string;
  updatedAt: string;
};

export type OperatorSessionRecord = {
  sessionId: string;
  personId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type OperatorCandidate = {
  personId: string;
  displayName: string;
  pinConfigured: boolean;
  availability: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";
  availabilityLabel: string;
};

export function isValidOperatorPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= OPERATOR_PIN_MIN_LENGTH && pin.length <= OPERATOR_PIN_MAX_LENGTH;
}

export function generateOperatorSessionId(): string {
  return `ops:${crypto.randomUUID()}`;
}

export function sessionExpiresAt(createdAt: string, ttlMs = OPERATOR_SESSION_TTL_MS): string {
  return new Date(Date.parse(createdAt) + ttlMs).toISOString();
}

export function diagnoseOperatorSession(
  session: OperatorSessionRecord | null,
  nowIso = new Date().toISOString(),
): OperatorSessionError | null {
  if (!session) {
    return "invalid_session";
  }
  if (session.revokedAt) {
    return "revoked_session";
  }
  if (Date.parse(session.expiresAt) <= Date.parse(nowIso)) {
    return "expired_session";
  }
  return null;
}
