import { randomBytes, randomUUID } from "node:crypto";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  createSessionToken,
  hashRawSessionToken,
} from "../operator/crypto.js";
import {
  CloudKdfError,
  cloudLoginCost,
  hashCloudPassword,
  validateCloudPassword,
  verifyCloudPassword,
} from "./password.js";

export class ControlPlaneInvariantError extends Error {
  readonly code:
    | "no_membership"
    | "organization_disabled"
    | "organization_not_ready"
    | "user_unavailable";

  constructor(
    code:
      | "no_membership"
      | "organization_disabled"
      | "organization_not_ready"
      | "user_unavailable",
  ) {
    super(code);
    this.name = "ControlPlaneInvariantError";
    this.code = code;
  }
}

export const CLOUD_SESSION_COOKIE = "workos_cloud_session" as const;
export const CLOUD_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const CLOUD_SESSION_MAX_AGE_SEC = 12 * 60 * 60;

export const BOOTSTRAP_POLICIES = [
  "ADOPT_EXISTING",
  "NEW_ORGANIZATION",
  "SYNTHETIC_TEST",
] as const;
export type BootstrapPolicy = (typeof BOOTSTRAP_POLICIES)[number];

export const MEMBERSHIP_ROLES = ["owner", "member"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const ORGANIZATION_STATUSES = [
  "PROVISIONING",
  "ACTIVE",
  "FAILED_RETRYABLE",
  "DISABLED",
] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export const ORGANIZATION_LOGIN_STATUSES = ["ACTIVE"] as const;
export type UserStatus = "ACTIVE" | "DISABLED";
export type MembershipStatus = "ACTIVE" | "REVOKED";
export type PlaneStatus = "ACTIVE" | "RETIRED";

export type CloudOrganization = {
  organizationId: string;
  slug: string;
  displayName: string;
  status: OrganizationStatus;
  provisionOwnerEmail: string | null;
  provisionFailureCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CloudUser = {
  userId: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type CloudMembership = {
  membershipId: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
};

export type OperationalPlaneDescriptor = {
  planeId: string;
  organizationId: string;
  storageKind: "SQLITE_DIR";
  planeKey: string;
  bootstrapPolicy: BootstrapPolicy;
  status: PlaneStatus;
  createdAt: string;
};

export type PlatformSessionRecord = {
  sessionId: string;
  userId: string;
  activeOrganizationId: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string;
};

export type CloudMembershipPublic = {
  organizationId: string;
  displayName: string;
  slug: string;
  role: MembershipRole;
  status: OrganizationStatus;
};

export type ControlPlane = {
  db: SqliteDatabase;
  cloudRoot: string;
  close(): void;
  runTransaction<T>(work: () => T): T;
  runImmediateTransaction<T>(work: () => T): T;
  createOrganization(input: {
    displayName: string;
    slug?: string;
    ownerEmail?: string;
  }): CloudOrganization;
  getOrganization(organizationId: string): CloudOrganization | null;
  listOrganizations(): CloudOrganization[];
  markOrganizationFailed(organizationId: string, failureCode: string): CloudOrganization;
  claimProvisionOwnerEmail(
    organizationId: string,
    email: string,
  ): { ok: true; organization: CloudOrganization } | { ok: false; error: "email_mismatch" | "organization_missing" };
  activateOrganization(organizationId: string): CloudOrganization;
  activateOrganizationForInitialProvision(
    organizationId: string,
    ownerUserId: string,
  ): CloudOrganization;
  listActiveOwnerMemberships(organizationId: string): CloudMembership[];
  countUsers(): number;
  countMemberships(organizationId: string): number;
  countActiveMemberships(organizationId: string): number;
  countPlanes(organizationId: string): number;
  countOwnerMemberships(organizationId: string): number;
  listMembershipsForOrganization(organizationId: string): CloudMembership[];
  insertHashedUser(input: {
    email: string;
    passwordHash: Buffer;
    passwordSalt: Buffer;
    kdf: string;
  }): CloudUser;
  updateHashedUserPassword(input: {
    userId: string;
    passwordHash: Buffer;
    passwordSalt: Buffer;
    kdf: string;
  }): void;
  createUser(input: { email: string; password: string }): Promise<CloudUser>;
  getUserByEmail(email: string): CloudUser | null;
  getUser(userId: string): CloudUser | null;
  addMembership(input: {
    userId: string;
    organizationId: string;
    role: MembershipRole;
  }): CloudMembership;
  listMembershipsForUser(userId: string): CloudMembershipPublic[];
  getActiveMembership(
    userId: string,
    organizationId: string,
  ): CloudMembership | null;
  createPlane(input: {
    organizationId: string;
    bootstrapPolicy: BootstrapPolicy;
  }): OperationalPlaneDescriptor;
  getPlaneByOrganization(
    organizationId: string,
  ): OperationalPlaneDescriptor | null;
  removePlane(planeId: string): void;
  createSession(input: {
    userId: string;
    activeOrganizationId: string;
  }): { session: PlatformSessionRecord; rawToken: string };
  resolveSession(rawToken: string | undefined):
    | { ok: true; user: CloudUser; session: PlatformSessionRecord }
    | { ok: false; error: "invalid_session" };
  switchActiveOrganization(
    sessionId: string,
    organizationId: string,
  ): PlatformSessionRecord | null;
  revokeSession(rawToken: string | undefined): void;
  verifyLogin(
    email: string,
    password: string,
  ): Promise<
    | { ok: true; user: CloudUser }
    | { ok: false; error: "invalid_credentials" | "rate_limited" | "disabled" }
  >;
};

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const loginAttempts = new Map<string, { failures: number; lockedUntil: number }>();

export function resetCloudLoginAttemptGuard(): void {
  loginAttempts.clear();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createControlPlane(db: SqliteDatabase, cloudRoot: string): ControlPlane {
  return {
    db,
    cloudRoot,
    close() {
      db.close();
    },
    runTransaction(work) {
      return db.transaction(work)();
    },
    runImmediateTransaction(work) {
      return db.transaction(work).immediate();
    },
    createOrganization(input) {
      const now = new Date().toISOString();
      const ownerEmail = input.ownerEmail ? normalizeEmail(input.ownerEmail) : null;
      const organization: CloudOrganization = {
        organizationId: `org:${randomUUID()}`,
        slug: input.slug?.trim() || allocateSlug(input.displayName),
        displayName: input.displayName.trim(),
        status: "PROVISIONING",
        provisionOwnerEmail: ownerEmail,
        provisionFailureCode: null,
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO organizations
         (organization_id, slug, display_name, status, provision_owner_email, provision_failure_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        organization.organizationId,
        organization.slug,
        organization.displayName,
        organization.status,
        organization.provisionOwnerEmail,
        organization.provisionFailureCode,
        organization.createdAt,
        organization.updatedAt,
      );
      return organization;
    },
    getOrganization(organizationId) {
      return readOrganization(db, organizationId);
    },
    listOrganizations() {
      return db
        .prepare(
          `SELECT organization_id, slug, display_name, status, provision_owner_email, provision_failure_code, created_at, updated_at
           FROM organizations
           ORDER BY display_name COLLATE NOCASE`,
        )
        .all()
        .map((row) => mapOrganization(row as OrganizationRow));
    },
    markOrganizationFailed(organizationId, failureCode) {
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE organizations
         SET status = 'FAILED_RETRYABLE', provision_failure_code = ?, updated_at = ?
         WHERE organization_id = ?`,
      ).run(failureCode, now, organizationId);
      const organization = readOrganization(db, organizationId);
      if (!organization) {
        throw new ControlPlaneInvariantError("organization_disabled");
      }
      return organization;
    },
    claimProvisionOwnerEmail(organizationId, email) {
      const normalized = normalizeEmail(email);
      const current = readOrganization(db, organizationId);
      if (!current) {
        return { ok: false as const, error: "organization_missing" as const };
      }
      if (current.provisionOwnerEmail === normalized) {
        return { ok: true as const, organization: current };
      }
      if (current.provisionOwnerEmail) {
        return { ok: false as const, error: "email_mismatch" as const };
      }
      const taken = db
        .prepare(
          `SELECT organization_id FROM organizations
           WHERE provision_owner_email = ? AND organization_id != ?`,
        )
        .get(normalized, organizationId) as { organization_id: string } | undefined;
      if (taken) {
        return { ok: false as const, error: "email_mismatch" as const };
      }
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE organizations
         SET provision_owner_email = ?, updated_at = ?
         WHERE organization_id = ? AND provision_owner_email IS NULL`,
      ).run(normalized, now, organizationId);
      const after = readOrganization(db, organizationId);
      if (!after) {
        return { ok: false as const, error: "organization_missing" as const };
      }
      if (after.provisionOwnerEmail === normalized) {
        return { ok: true as const, organization: after };
      }
      return { ok: false as const, error: "email_mismatch" as const };
    },
    activateOrganization(organizationId) {
      const current = readOrganization(db, organizationId);
      if (!current) {
        throw new ControlPlaneInvariantError("organization_disabled");
      }
      if (current.status === "DISABLED") {
        throw new ControlPlaneInvariantError("organization_disabled");
      }
      const owners = countOwnerMemberships(db, organizationId);
      if (owners < 1) {
        throw new ControlPlaneInvariantError("organization_not_ready");
      }
      return markOrganizationActive(db, organizationId);
    },
    activateOrganizationForInitialProvision(organizationId, ownerUserId) {
      const current = readOrganization(db, organizationId);
      if (!current) {
        throw new ControlPlaneInvariantError("organization_disabled");
      }
      if (current.status === "DISABLED") {
        throw new ControlPlaneInvariantError("organization_disabled");
      }
      const owners = listActiveOwnerMemberships(db, organizationId);
      if (owners.length !== 1 || owners[0].userId !== ownerUserId) {
        throw new ControlPlaneInvariantError("organization_not_ready");
      }
      return markOrganizationActive(db, organizationId);
    },
    listActiveOwnerMemberships(organizationId) {
      return listActiveOwnerMemberships(db, organizationId);
    },
    countUsers() {
      const row = db.prepare(`SELECT count(*) AS n FROM users`).get() as { n: number };
      return row.n;
    },
    countMemberships(organizationId) {
      const row = db
        .prepare(`SELECT count(*) AS n FROM organization_memberships WHERE organization_id = ?`)
        .get(organizationId) as { n: number };
      return row.n;
    },
    countActiveMemberships(organizationId) {
      const row = db
        .prepare(
          `SELECT count(*) AS n FROM organization_memberships WHERE organization_id = ? AND status = 'ACTIVE'`,
        )
        .get(organizationId) as { n: number };
      return row.n;
    },
    countPlanes(organizationId) {
      const row = db
        .prepare(`SELECT count(*) AS n FROM operational_planes WHERE organization_id = ?`)
        .get(organizationId) as { n: number };
      return row.n;
    },
    countOwnerMemberships(organizationId) {
      return countOwnerMemberships(db, organizationId);
    },
    listMembershipsForOrganization(organizationId) {
      return db
        .prepare(
          `SELECT membership_id, user_id, organization_id, role, status, created_at
           FROM organization_memberships
           WHERE organization_id = ?
           ORDER BY created_at`,
        )
        .all(organizationId)
        .map((row) => mapMembership(row as MembershipRow));
    },
    insertHashedUser(input) {
      const email = normalizeEmail(input.email);
      const now = new Date().toISOString();
      const user: CloudUser = {
        userId: `usr:${randomUUID()}`,
        email,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO users
         (user_id, email, password_hash, password_salt, kdf, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        user.userId,
        user.email,
        input.passwordHash,
        input.passwordSalt,
        input.kdf,
        user.status,
        user.createdAt,
        user.updatedAt,
      );
      return user;
    },
    updateHashedUserPassword(input) {
      const now = new Date().toISOString();
      db.prepare(
        `UPDATE users
         SET password_hash = ?, password_salt = ?, kdf = ?, updated_at = ?
         WHERE user_id = ?`,
      ).run(
        input.passwordHash,
        input.passwordSalt,
        input.kdf,
        now,
        input.userId,
      );
    },
    async createUser(input) {
      const email = normalizeEmail(input.email);
      const issue = validateCloudPassword(input.password);
      if (issue) {
        throw new Error(`invalid_password:${issue}`);
      }
      const hashed = await hashCloudPassword(input.password);
      const now = new Date().toISOString();
      const user: CloudUser = {
        userId: `usr:${randomUUID()}`,
        email,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
      };
      db.prepare(
        `INSERT INTO users
         (user_id, email, password_hash, password_salt, kdf, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        user.userId,
        user.email,
        hashed.passwordHash,
        hashed.passwordSalt,
        hashed.kdf,
        user.status,
        user.createdAt,
        user.updatedAt,
      );
      return user;
    },
    getUserByEmail(email) {
      return readUserByEmail(db, email);
    },
    getUser(userId) {
      return readUser(db, userId);
    },
    addMembership(input) {
      const now = new Date().toISOString();
      const membership: CloudMembership = {
        membershipId: `mem:${randomUUID()}`,
        userId: input.userId,
        organizationId: input.organizationId,
        role: input.role,
        status: "ACTIVE",
        createdAt: now,
      };
      const existing = db
        .prepare(
          `SELECT membership_id, user_id, organization_id, role, status, created_at
           FROM organization_memberships
           WHERE user_id = ? AND organization_id = ?`,
        )
        .get(input.userId, input.organizationId) as MembershipRow | undefined;
      if (existing) {
        db.prepare(
          `UPDATE organization_memberships
           SET role = ?, status = 'ACTIVE'
           WHERE membership_id = ?`,
        ).run(input.role, existing.membership_id);
        return mapMembership({
          ...existing,
          role: input.role,
          status: "ACTIVE",
        });
      }
      db.prepare(
        `INSERT INTO organization_memberships
         (membership_id, user_id, organization_id, role, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        membership.membershipId,
        membership.userId,
        membership.organizationId,
        membership.role,
        membership.status,
        membership.createdAt,
      );
      return membership;
    },
    listMembershipsForUser(userId) {
      return db
        .prepare(
          `SELECT m.organization_id, o.display_name, o.slug, m.role, o.status
           FROM organization_memberships m
           JOIN organizations o ON o.organization_id = m.organization_id
           WHERE m.user_id = ? AND m.status = 'ACTIVE'
           ORDER BY o.display_name COLLATE NOCASE`,
        )
        .all(userId)
        .map((row) => {
          const record = row as {
            organization_id: string;
            display_name: string;
            slug: string;
            role: MembershipRole;
            status: OrganizationStatus;
          };
          return {
            organizationId: record.organization_id,
            displayName: record.display_name,
            slug: record.slug,
            role: record.role,
            status: record.status,
          };
        });
    },
    getActiveMembership(userId, organizationId) {
      const row = db
        .prepare(
          `SELECT membership_id, user_id, organization_id, role, status, created_at
           FROM organization_memberships
           WHERE user_id = ? AND organization_id = ? AND status = 'ACTIVE'`,
        )
        .get(userId, organizationId) as MembershipRow | undefined;
      return row ? mapMembership(row) : null;
    },
    createPlane(input) {
      const now = new Date().toISOString();
      const descriptor: OperationalPlaneDescriptor = {
        planeId: `pln:${randomUUID()}`,
        organizationId: input.organizationId,
        storageKind: "SQLITE_DIR",
        planeKey: randomBytes(12).toString("hex"),
        bootstrapPolicy: input.bootstrapPolicy,
        status: "ACTIVE",
        createdAt: now,
      };
      db.prepare(
        `INSERT INTO operational_planes
         (plane_id, organization_id, storage_kind, plane_key, bootstrap_policy, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        descriptor.planeId,
        descriptor.organizationId,
        descriptor.storageKind,
        descriptor.planeKey,
        descriptor.bootstrapPolicy,
        descriptor.status,
        descriptor.createdAt,
      );
      return descriptor;
    },
    getPlaneByOrganization(organizationId) {
      const row = db
        .prepare(
          `SELECT plane_id, organization_id, storage_kind, plane_key, bootstrap_policy, status, created_at
           FROM operational_planes
           WHERE organization_id = ? AND status = 'ACTIVE'`,
        )
        .get(organizationId) as PlaneRow | undefined;
      return row ? mapPlane(row) : null;
    },
    removePlane(planeId) {
      db.prepare(`DELETE FROM operational_planes WHERE plane_id = ?`).run(planeId);
    },
    createSession(input) {
      assertUsableMembership(db, input.userId, input.activeOrganizationId);
      const now = new Date();
      const createdAt = now.toISOString();
      const expiresAt = new Date(now.getTime() + CLOUD_SESSION_TTL_MS).toISOString();
      const token = createSessionToken();
      const session: PlatformSessionRecord = {
        sessionId: `ses:${randomUUID()}`,
        userId: input.userId,
        activeOrganizationId: input.activeOrganizationId,
        createdAt,
        expiresAt,
        revokedAt: null,
        lastSeenAt: createdAt,
      };
      db.prepare(
        `INSERT INTO platform_sessions
         (session_id, user_id, token_hash, active_organization_id, created_at, expires_at, revoked_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      ).run(
        session.sessionId,
        session.userId,
        token.tokenHash,
        session.activeOrganizationId,
        session.createdAt,
        session.expiresAt,
        session.lastSeenAt,
      );
      return { session, rawToken: token.rawToken };
    },
    resolveSession(rawToken) {
      if (!rawToken) {
        return { ok: false, error: "invalid_session" };
      }
      let tokenHash: Buffer;
      try {
        tokenHash = hashRawSessionToken(rawToken);
      } catch {
        return { ok: false, error: "invalid_session" };
      }
      const row = db
        .prepare(
          `SELECT session_id, user_id, active_organization_id, created_at, expires_at, revoked_at, last_seen_at
           FROM platform_sessions
           WHERE token_hash = ?`,
        )
        .get(tokenHash) as SessionRow | undefined;
      if (!row || row.revoked_at) {
        return { ok: false, error: "invalid_session" };
      }
      if (Date.parse(row.expires_at) <= Date.now()) {
        return { ok: false, error: "invalid_session" };
      }
      const user = readUser(db, row.user_id);
      if (!user || user.status !== "ACTIVE") {
        return { ok: false, error: "invalid_session" };
      }
      return { ok: true, user, session: mapSession(row) };
    },
    switchActiveOrganization(sessionId, organizationId) {
      const current = db
        .prepare(
          `SELECT session_id, user_id, active_organization_id, created_at, expires_at, revoked_at, last_seen_at
           FROM platform_sessions
           WHERE session_id = ?`,
        )
        .get(sessionId) as SessionRow | undefined;
      if (!current || current.revoked_at || Date.parse(current.expires_at) <= Date.now()) {
        return null;
      }
      try {
        assertUsableMembership(db, current.user_id, organizationId);
      } catch (error) {
        if (error instanceof ControlPlaneInvariantError) {
          return null;
        }
        throw error;
      }
      const now = new Date().toISOString();
      const result = db
        .prepare(
          `UPDATE platform_sessions
           SET active_organization_id = ?, last_seen_at = ?
           WHERE session_id = ? AND revoked_at IS NULL`,
        )
        .run(organizationId, now, sessionId);
      if (result.changes === 0) {
        return null;
      }
      const row = db
        .prepare(
          `SELECT session_id, user_id, active_organization_id, created_at, expires_at, revoked_at, last_seen_at
           FROM platform_sessions
           WHERE session_id = ?`,
        )
        .get(sessionId) as SessionRow | undefined;
      return row ? mapSession(row) : null;
    },
    revokeSession(rawToken) {
      if (!rawToken) {
        return;
      }
      let tokenHash: Buffer;
      try {
        tokenHash = hashRawSessionToken(rawToken);
      } catch {
        return;
      }
      db.prepare(
        `UPDATE platform_sessions
         SET revoked_at = ?
         WHERE token_hash = ? AND revoked_at IS NULL`,
      ).run(new Date().toISOString(), tokenHash);
    },
    async verifyLogin(email, password) {
      const normalized = normalizeEmail(email);
      const guard = loginAttempts.get(normalized);
      if (guard && guard.lockedUntil > Date.now()) {
        return { ok: false, error: "rate_limited" };
      }
      const row = db
        .prepare(
          `SELECT user_id, email, password_hash, password_salt, kdf, status, created_at, updated_at
           FROM users
           WHERE email = ?`,
        )
        .get(normalized) as
        | (UserRow & { password_hash: Buffer; password_salt: Buffer; kdf: string })
        | undefined;
      if (!row) {
        await cloudLoginCost.consumeUnknownEmail(password);
        recordLoginFailure(normalized);
        return { ok: false, error: "invalid_credentials" };
      }
      let matches = false;
      try {
        matches = await verifyCloudPassword(
          password,
          row.password_hash,
          row.password_salt,
          row.kdf,
        );
      } catch (error) {
        if (error instanceof CloudKdfError) {
          recordLoginFailure(normalized);
          return { ok: false, error: "invalid_credentials" };
        }
        throw error;
      }
      if (!matches) {
        recordLoginFailure(normalized);
        return { ok: false, error: "invalid_credentials" };
      }
      if (row.status !== "ACTIVE") {
        return { ok: false, error: "disabled" };
      }
      loginAttempts.delete(normalized);
      return {
        ok: true,
        user: {
          userId: row.user_id,
          email: row.email,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      };
    },
  };
}

function recordLoginFailure(email: string): void {
  const current = loginAttempts.get(email) ?? { failures: 0, lockedUntil: 0 };
  const failures = current.failures + 1;
  loginAttempts.set(email, {
    failures,
    lockedUntil: failures >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0,
  });
}

function allocateSlug(displayName: string): string {
  const base = displayName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(3).toString("hex");
  const slug = `${base || "org"}-${suffix}`;
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) {
    return `org-${suffix}`;
  }
  return slug;
}

type OrganizationRow = {
  organization_id: string;
  slug: string;
  display_name: string;
  status: OrganizationStatus;
  provision_owner_email: string | null;
  provision_failure_code: string | null;
  created_at: string;
  updated_at: string;
};

type UserRow = {
  user_id: string;
  email: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  membership_id: string;
  user_id: string;
  organization_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  created_at: string;
};

type PlaneRow = {
  plane_id: string;
  organization_id: string;
  storage_kind: "SQLITE_DIR";
  plane_key: string;
  bootstrap_policy: BootstrapPolicy;
  status: PlaneStatus;
  created_at: string;
};

type SessionRow = {
  session_id: string;
  user_id: string;
  active_organization_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_seen_at: string;
};

function mapOrganization(row: OrganizationRow): CloudOrganization {
  return {
    organizationId: row.organization_id,
    slug: row.slug,
    displayName: row.display_name,
    status: row.status,
    provisionOwnerEmail: row.provision_owner_email ?? null,
    provisionFailureCode: row.provision_failure_code ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row: MembershipRow): CloudMembership {
  return {
    membershipId: row.membership_id,
    userId: row.user_id,
    organizationId: row.organization_id,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapPlane(row: PlaneRow): OperationalPlaneDescriptor {
  return {
    planeId: row.plane_id,
    organizationId: row.organization_id,
    storageKind: row.storage_kind,
    planeKey: row.plane_key,
    bootstrapPolicy: row.bootstrap_policy,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapSession(row: SessionRow): PlatformSessionRecord {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    activeOrganizationId: row.active_organization_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastSeenAt: row.last_seen_at,
  };
}

function readOrganization(
  db: SqliteDatabase,
  organizationId: string,
): CloudOrganization | null {
  const row = db
    .prepare(
      `SELECT organization_id, slug, display_name, status, provision_owner_email, provision_failure_code, created_at, updated_at
       FROM organizations
       WHERE organization_id = ?`,
    )
    .get(organizationId) as OrganizationRow | undefined;
  return row ? mapOrganization(row) : null;
}

function readUser(db: SqliteDatabase, userId: string): CloudUser | null {
  const row = db
    .prepare(
      `SELECT user_id, email, status, created_at, updated_at
       FROM users
       WHERE user_id = ?`,
    )
    .get(userId) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

function readUserByEmail(db: SqliteDatabase, email: string): CloudUser | null {
  const row = db
    .prepare(
      `SELECT user_id, email, status, created_at, updated_at
       FROM users
       WHERE email = ?`,
    )
    .get(normalizeEmail(email)) as UserRow | undefined;
  return row ? mapUser(row) : null;
}

function countOwnerMemberships(db: SqliteDatabase, organizationId: string): number {
  return listActiveOwnerMemberships(db, organizationId).length;
}

function listActiveOwnerMemberships(
  db: SqliteDatabase,
  organizationId: string,
): CloudMembership[] {
  return db
    .prepare(
      `SELECT membership_id, user_id, organization_id, role, status, created_at
       FROM organization_memberships
       WHERE organization_id = ? AND role = 'owner' AND status = 'ACTIVE'
       ORDER BY created_at`,
    )
    .all(organizationId)
    .map((row) => mapMembership(row as MembershipRow));
}

function markOrganizationActive(db: SqliteDatabase, organizationId: string): CloudOrganization {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE organizations
     SET status = 'ACTIVE', provision_failure_code = NULL, updated_at = ?
     WHERE organization_id = ?`,
  ).run(now, organizationId);
  const organization = readOrganization(db, organizationId);
  if (!organization) {
    throw new ControlPlaneInvariantError("organization_disabled");
  }
  return organization;
}

function assertUsableMembership(
  db: SqliteDatabase,
  userId: string,
  organizationId: string,
): void {
  const user = readUser(db, userId);
  if (!user || user.status !== "ACTIVE") {
    throw new ControlPlaneInvariantError("user_unavailable");
  }
  const organization = readOrganization(db, organizationId);
  if (!organization) {
    throw new ControlPlaneInvariantError("organization_disabled");
  }
  if (organization.status === "DISABLED") {
    throw new ControlPlaneInvariantError("organization_disabled");
  }
  if (organization.status !== "ACTIVE") {
    throw new ControlPlaneInvariantError("organization_not_ready");
  }
  const membership = db
    .prepare(
      `SELECT membership_id
       FROM organization_memberships
       WHERE user_id = ? AND organization_id = ? AND status = 'ACTIVE'`,
    )
    .get(userId, organizationId) as { membership_id: string } | undefined;
  if (!membership) {
    throw new ControlPlaneInvariantError("no_membership");
  }
}

function mapUser(row: UserRow): CloudUser {
  return {
    userId: row.user_id,
    email: row.email,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
