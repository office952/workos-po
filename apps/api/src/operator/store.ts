import {
  diagnoseOperatorSession,
  generateOperatorSessionId,
  isValidOperatorPin,
  personAvailabilityLabel,
  sessionExpiresAt,
  type OperatorCandidate,
  type OperatorSessionRecord,
  type Person,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { getPerson, listPeople } from "../people/store.js";
import {
  createSessionToken,
  hashOperatorPin,
  hashRawSessionToken,
  verifyOperatorPin,
} from "./crypto.js";
import {
  getConfiguredDevOperatorPersonId,
  isDevOperatorModeEnabled,
} from "./devMode.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

export const OPERATOR_SESSION_COOKIE = "workos_operator_session";

type CredentialRow = {
  person_id: string;
  pin_hash: Buffer;
  pin_salt: Buffer;
  kdf: string;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  session_id: string;
  person_id: string;
  token_hash: Buffer;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export function personHasOperatorPin(db: SqliteDatabase, personId: string): boolean {
  const row = db
    .prepare("SELECT 1 AS found FROM operator_credentials WHERE person_id = ?")
    .get(personId) as { found: number } | undefined;
  return Boolean(row);
}

export function listOperatorCandidates(db: SqliteDatabase): OperatorCandidate[] {
  return listPeople(db)
    .filter((person) => person.status === "ACTIVE")
    .map((person) => ({
      personId: person.personId,
      displayName: person.displayName,
      pinConfigured: personHasOperatorPin(db, person.personId),
      availability: person.availability,
      availabilityLabel: personAvailabilityLabel(person.availability),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName, "ro"));
}

export async function setOperatorPin(
  db: SqliteDatabase,
  personId: string,
  pin: string,
  confirmPin: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidOperatorPin(pin) || pin !== confirmPin) {
    return { ok: false, error: pin === confirmPin ? "invalid_pin" : "pin_mismatch" };
  }
  const person = getPerson(db, personId);
  if (!person) {
    return { ok: false, error: "unknown_person" };
  }
  if (person.status === "RETIRED") {
    return { ok: false, error: "retired_person" };
  }
  const hashed = await hashOperatorPin(pin);
  const now = new Date().toISOString();
  const existing = personHasOperatorPin(db, personId);
  const write = db.transaction(() => {
    if (existing) {
      db.prepare(
        `
        UPDATE operator_credentials
        SET pin_hash = ?, pin_salt = ?, kdf = ?, updated_at = ?
        WHERE person_id = ?
      `,
      ).run(hashed.pinHash, hashed.pinSalt, hashed.kdf, now, personId);
    } else {
      db.prepare(
        `
        INSERT INTO operator_credentials (person_id, pin_hash, pin_salt, kdf, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      ).run(personId, hashed.pinHash, hashed.pinSalt, hashed.kdf, now, now);
    }
    revokePersonSessions(db, personId, now);
  });
  write();
  return { ok: true };
}

export async function identifyOperator(
  db: SqliteDatabase,
  personId: string,
  pin: string,
): Promise<
  | { ok: true; person: Person; session: OperatorSessionRecord; rawToken: string }
  | { ok: false; error: string }
> {
  const lock = failedAttempts.get(personId);
  if (lock && lock.lockedUntil > Date.now()) {
    return { ok: false, error: "rate_limited" };
  }
  const person = getPerson(db, personId);
  if (!person) {
    return { ok: false, error: "unknown_person" };
  }
  if (person.status === "RETIRED") {
    return { ok: false, error: "retired_person" };
  }
  const credential = db
    .prepare(
      `
      SELECT person_id, pin_hash, pin_salt, kdf, created_at, updated_at
      FROM operator_credentials
      WHERE person_id = ?
    `,
    )
    .get(personId) as CredentialRow | undefined;
  if (!credential) {
    return { ok: false, error: "not_configured" };
  }
  if (!isValidOperatorPin(pin) || !(await verifyOperatorPin(pin, credential.pin_hash, credential.pin_salt))) {
    registerFailedAttempt(personId);
    return { ok: false, error: "invalid_pin" };
  }
  clearFailedAttempts(personId);
  const created = createOperatorSessionForPerson(db, person);
  return { ok: true, person, session: created.session, rawToken: created.rawToken };
}

/**
 * Shared session persistence for PIN identify and DEV operator mode.
 * Caller must already validate Person identity/status.
 */
export function createOperatorSessionForPerson(
  db: SqliteDatabase,
  person: Person,
): { session: OperatorSessionRecord; rawToken: string } {
  const createdAt = new Date().toISOString();
  const sessionId = generateOperatorSessionId();
  const token = createSessionToken();
  const session: OperatorSessionRecord = {
    sessionId,
    personId: person.personId,
    createdAt,
    expiresAt: sessionExpiresAt(createdAt),
    revokedAt: null,
  };
  db.prepare(
    `
    INSERT INTO operator_sessions (session_id, person_id, token_hash, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, NULL)
  `,
  ).run(session.sessionId, session.personId, token.tokenHash, session.createdAt, session.expiresAt);
  return { session, rawToken: token.rawToken };
}

export function createDevOperatorSession(
  db: SqliteDatabase,
  env: NodeJS.ProcessEnv = process.env,
):
  | { ok: true; person: Person; session: OperatorSessionRecord; rawToken: string }
  | { ok: false; error: string } {
  if (!isDevOperatorModeEnabled(env)) {
    return { ok: false, error: "dev_operator_disabled" };
  }
  const personId = getConfiguredDevOperatorPersonId(env);
  if (!personId) {
    return { ok: false, error: "dev_operator_person_missing" };
  }
  const person = getPerson(db, personId);
  if (!person) {
    return { ok: false, error: "unknown_person" };
  }
  switch (person.status) {
    case "RETIRED":
      return { ok: false, error: "retired_person" };
    case "ACTIVE": {
      const created = createOperatorSessionForPerson(db, person);
      return { ok: true, person, session: created.session, rawToken: created.rawToken };
    }
    default: {
      const _exhaustive: never = person.status;
      return _exhaustive;
    }
  }
}

export function resolveOperatorSession(
  db: SqliteDatabase,
  rawToken: string | undefined | null,
):
  | { ok: true; person: Person; session: OperatorSessionRecord }
  | { ok: false; error: string } {
  if (!rawToken) {
    return { ok: false, error: "invalid_session" };
  }
  const tokenHash = hashRawSessionToken(rawToken);
  const row = db
    .prepare(
      `
      SELECT session_id, person_id, token_hash, created_at, expires_at, revoked_at
      FROM operator_sessions
      WHERE token_hash = ?
    `,
    )
    .get(tokenHash) as SessionRow | undefined;
  if (!row) {
    return { ok: false, error: "invalid_session" };
  }
  const session: OperatorSessionRecord = {
    sessionId: row.session_id,
    personId: row.person_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
  const diagnosis = diagnoseOperatorSession(session);
  if (diagnosis) {
    return { ok: false, error: diagnosis };
  }
  const person = getPerson(db, session.personId);
  if (!person) {
    return { ok: false, error: "unknown_person" };
  }
  if (person.status === "RETIRED") {
    revokeSession(db, session.sessionId, new Date().toISOString());
    return { ok: false, error: "retired_person" };
  }
  return { ok: true, person, session };
}

export function logoutOperatorSession(db: SqliteDatabase, rawToken: string | undefined | null): void {
  if (!rawToken) {
    return;
  }
  const resolved = resolveOperatorSession(db, rawToken);
  if (!resolved.ok) {
    return;
  }
  revokeSession(db, resolved.session.sessionId, new Date().toISOString());
}

export function revokePersonSessions(db: SqliteDatabase, personId: string, revokedAt: string): void {
  db.prepare(
    `
    UPDATE operator_sessions
    SET revoked_at = ?
    WHERE person_id = ? AND revoked_at IS NULL
  `,
  ).run(revokedAt, personId);
}

function revokeSession(db: SqliteDatabase, sessionId: string, revokedAt: string): void {
  db.prepare(
    `
    UPDATE operator_sessions
    SET revoked_at = ?
    WHERE session_id = ? AND revoked_at IS NULL
  `,
  ).run(revokedAt, sessionId);
}

function registerFailedAttempt(personId: string): void {
  const current = failedAttempts.get(personId) ?? { count: 0, lockedUntil: 0 };
  const count = current.count + 1;
  failedAttempts.set(personId, {
    count,
    lockedUntil: count >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
  });
}

function clearFailedAttempts(personId: string): void {
  failedAttempts.delete(personId);
}

/** Test helper only — clears in-memory rate limits. */
export function resetOperatorPinAttemptGuard(): void {
  failedAttempts.clear();
}
