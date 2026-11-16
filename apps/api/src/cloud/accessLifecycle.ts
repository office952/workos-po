import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  ORGANIZATION_ROLE_PRESENTATION,
  activeStatusForRole,
  isActiveMembershipPair,
  isOrganizationRole,
  isScopedOrganizationRole,
  type OrganizationRole,
} from "@workos-final/domain";
import { createSessionToken, hashRawSessionToken } from "../operator/crypto.js";
import { organizationRolesV1Enabled } from "./addOrganizationUser.js";
import {
  normalizeEmail,
  type CloudUser,
  type ControlPlane,
  type PlatformSessionRecord,
} from "./controlPlane.js";
import { cloudLoginCost, hashCloudPassword, validateCloudPassword } from "./password.js";

/**
 * V1 Organization Access — user lifecycle in the control plane: invitations, role change,
 * revocation trace, password change and recovery, email verification, access audit.
 * Contract: USER_LIFECYCLE_FLOWS.md, API_AND_DB_CHANGE_PLAN.md, OWNER_DECISIONS.md (D1–D8),
 * plus the Owner corrections C1 (session rotation) and C2 (email verification = proof).
 *
 * Tokens: 32 random bytes, stored only as SHA-256 (same primitive as sessions). Raw tokens are
 * returned only where the contract allows (invitation link for LINK delivery; platform CLI
 * recovery) and are never written to the audit log.
 */

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // D6
export const CREDENTIAL_TOKEN_TTL_MS = 60 * 60 * 1000; // D6: reset and verification ≤ 1 h
export const MAX_INVITATION_SENDS = 5;
export const MAX_INVITATIONS_PER_DAY = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AccessMessage = {
  kind: "INVITATION" | "PASSWORD_RESET" | "EMAIL_VERIFICATION";
  to: string;
  url: string;
  organizationName: string | null;
};
export type AccessMessageSender = { send(message: AccessMessage): Promise<{ ok: boolean }> };

/**
 * The only built-in sender is a SYNTHETIC outbox (files) for local tests and isolated runtimes.
 * No real email is sent by this build; real delivery is a SaaS-commercial gate (D2).
 */
export function configuredAccessMessageSender(env: NodeJS.ProcessEnv): AccessMessageSender | null {
  const dir = env.WORKOS_ACCESS_OUTBOX_DIR?.trim();
  if (!dir || env.NODE_ENV === "production") {
    return null;
  }
  return {
    async send(message) {
      if (env.WORKOS_ACCESS_OUTBOX_FAIL === "1") {
        return { ok: false };
      }
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.json`),
        `${JSON.stringify({ classification: "SYNTHETIC_OUTBOX", ...message }, null, 2)}\n`,
      );
      return { ok: true };
    },
  };
}

type Db = ControlPlane["db"];

export type AccessEventInput = {
  organizationId: string | null;
  actorUserId: string | null;
  subjectUserId?: string | null;
  subjectMembershipId?: string | null;
  subjectInvitationId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
};

export function appendAccessEvent(db: Db, event: AccessEventInput): void {
  db.prepare(
    `INSERT INTO access_audit_events
     (event_id, organization_id, actor_user_id, subject_user_id, subject_membership_id, subject_invitation_id, action, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `aev:${randomUUID()}`,
    event.organizationId,
    event.actorUserId,
    event.subjectUserId ?? null,
    event.subjectMembershipId ?? null,
    event.subjectInvitationId ?? null,
    event.action,
    JSON.stringify(event.detail ?? {}),
    new Date().toISOString(),
  );
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "•••";
  return `${local.slice(0, 1)}•••@${domain}`;
}

const rateWindows = new Map<string, number[]>();
/** Small in-memory limiter (single API process holds the runtime lease). */
export function accessRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateWindows.get(key) ?? []).filter((at) => now - at < windowMs);
  if (hits.length >= max) {
    rateWindows.set(key, hits);
    return true;
  }
  hits.push(now);
  rateWindows.set(key, hits);
  return false;
}
export function resetAccessRateLimits(): void {
  rateWindows.clear();
}

// ── Invitations ─────────────────────────────────────────────────────────────

export type InvitationRow = {
  invitation_id: string;
  organization_id: string;
  email: string;
  role: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  delivery_channel: "LINK" | "EMAIL";
  delivery_status: "NOT_SENT" | "SENT" | "FAILED";
  send_count: number;
  created_by_user_id: string;
  created_at: string;
  expires_at: string;
  last_sent_at: string;
  accepted_user_id: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type InvitationPresentation = {
  invitationId: string;
  email: string;
  role: string;
  roleLabel: string;
  status: InvitationRow["status"];
  deliveryChannel: InvitationRow["delivery_channel"];
  deliveryStatus: InvitationRow["delivery_status"];
  sendCount: number;
  createdByEmail: string | null;
  createdAt: string;
  expiresAt: string;
};

function presentInvitation(controlPlane: ControlPlane, row: InvitationRow): InvitationPresentation {
  return {
    invitationId: row.invitation_id,
    email: row.email,
    role: row.role,
    roleLabel: isOrganizationRole(row.role) ? ORGANIZATION_ROLE_PRESENTATION[row.role].label : row.role,
    status: row.status,
    deliveryChannel: row.delivery_channel,
    deliveryStatus: row.delivery_status,
    sendCount: row.send_count,
    createdByEmail: controlPlane.getUser(row.created_by_user_id)?.email ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function expireStaleInvitations(db: Db, organizationId?: string): void {
  const now = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT invitation_id, organization_id FROM organization_invitations
       WHERE status = 'PENDING' AND expires_at <= ? ${organizationId ? "AND organization_id = ?" : ""}`,
    )
    .all(...(organizationId ? [now, organizationId] : [now])) as Array<{ invitation_id: string; organization_id: string }>;
  for (const row of rows) {
    db.prepare(`UPDATE organization_invitations SET status = 'EXPIRED' WHERE invitation_id = ? AND status = 'PENDING'`).run(row.invitation_id);
    appendAccessEvent(db, { organizationId: row.organization_id, actorUserId: null, subjectInvitationId: row.invitation_id, action: "invitation.expired" });
  }
}

export function listPendingInvitations(controlPlane: ControlPlane, organizationId: string): InvitationPresentation[] {
  controlPlane.runImmediateTransaction(() => expireStaleInvitations(controlPlane.db, organizationId));
  return (controlPlane.db
    .prepare(`SELECT * FROM organization_invitations WHERE organization_id = ? AND status = 'PENDING' ORDER BY created_at DESC`)
    .all(organizationId) as InvitationRow[]).map((row) => presentInvitation(controlPlane, row));
}

export type AccessResult<T> = { ok: true; value: T } | { ok: false; error: string; status: 400 | 401 | 403 | 404 | 409 | 410 | 429 };
const fail = <T>(error: string, status: 400 | 401 | 403 | 404 | 409 | 410 | 429): AccessResult<T> => ({ ok: false, error, status });

function roleAllowedForWrite(role: string, env: NodeJS.ProcessEnv): AccessResult<OrganizationRole> {
  if (!isOrganizationRole(role)) return fail("invalid_role", 400);
  if (isScopedOrganizationRole(role) && !organizationRolesV1Enabled(env)) return fail("roles_not_enabled", 409);
  return { ok: true, value: role };
}

async function deliver(
  sender: AccessMessageSender | null,
  message: AccessMessage,
): Promise<"SENT" | "FAILED" | "NOT_SENT"> {
  if (!sender) return "NOT_SENT";
  try {
    return (await sender.send(message)).ok ? "SENT" : "FAILED";
  } catch {
    return "FAILED";
  }
}

export async function createInvitation(
  controlPlane: ControlPlane,
  input: {
    organizationId: string;
    actorUserId: string;
    email: string;
    role: string;
    env: NodeJS.ProcessEnv;
    sender: AccessMessageSender | null;
    linkFor: (rawToken: string) => string;
  },
): Promise<AccessResult<{ invitation: InvitationPresentation; inviteUrl: string | null }>> {
  const email = normalizeEmail(input.email ?? "");
  if (!EMAIL_PATTERN.test(email)) return fail("invalid_email", 400);
  const role = roleAllowedForWrite(input.role, input.env);
  if (!role.ok) return role;
  if (accessRateLimited(`invite:${input.organizationId}`, MAX_INVITATIONS_PER_DAY, 24 * 60 * 60 * 1000)) {
    return fail("rate_limited", 429);
  }
  const organization = controlPlane.getOrganization(input.organizationId);
  const token = createSessionToken();
  const created = controlPlane.runImmediateTransaction((): AccessResult<InvitationRow> => {
    const db = controlPlane.db;
    expireStaleInvitations(db, input.organizationId);
    const existingUser = controlPlane.getUserByEmail(email);
    if (existingUser) {
      const membership = controlPlane.getActiveMembership(existingUser.userId, input.organizationId);
      if (membership) return fail("already_member", 409);
    }
    const pending = db
      .prepare(`SELECT invitation_id FROM organization_invitations WHERE organization_id = ? AND email = ? AND status = 'PENDING'`)
      .get(input.organizationId, email);
    if (pending) return fail("invitation_pending", 409);
    const now = new Date();
    const row: InvitationRow = {
      invitation_id: `inv:${randomUUID()}`,
      organization_id: input.organizationId,
      email,
      role: role.value,
      status: "PENDING",
      delivery_channel: input.sender ? "EMAIL" : "LINK",
      delivery_status: "NOT_SENT",
      send_count: 1,
      created_by_user_id: input.actorUserId,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
      last_sent_at: now.toISOString(),
      accepted_user_id: null,
      accepted_at: null,
      revoked_at: null,
    };
    db.prepare(
      `INSERT INTO organization_invitations
       (invitation_id, organization_id, email, role, token_hash, status, delivery_channel, delivery_status, send_count, created_by_user_id, created_at, expires_at, last_sent_at)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?, 'NOT_SENT', 1, ?, ?, ?, ?)`,
    ).run(row.invitation_id, row.organization_id, row.email, row.role, token.tokenHash, row.delivery_channel, row.created_by_user_id, row.created_at, row.expires_at, row.last_sent_at);
    appendAccessEvent(db, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      subjectInvitationId: row.invitation_id,
      action: "invitation.created",
      detail: { role: row.role, channel: row.delivery_channel },
    });
    return { ok: true, value: row };
  });
  if (!created.ok) return created;
  return finishDelivery(controlPlane, created.value, token.rawToken, input.sender, input.linkFor, organization?.displayName ?? null);
}

async function finishDelivery(
  controlPlane: ControlPlane,
  row: InvitationRow,
  rawToken: string,
  sender: AccessMessageSender | null,
  linkFor: (rawToken: string) => string,
  organizationName: string | null,
): Promise<AccessResult<{ invitation: InvitationPresentation; inviteUrl: string | null }>> {
  const url = linkFor(rawToken);
  const status = await deliver(sender, { kind: "INVITATION", to: row.email, url, organizationName });
  controlPlane.db
    .prepare(`UPDATE organization_invitations SET delivery_status = ? WHERE invitation_id = ?`)
    .run(status, row.invitation_id);
  const fresh = controlPlane.db.prepare(`SELECT * FROM organization_invitations WHERE invitation_id = ?`).get(row.invitation_id) as InvitationRow;
  // The link is shown once to the owner only when there is no email delivery (pilot) or when it
  // failed (fallback). A link copied by hand is NOT proof of email control (C2).
  const inviteUrl = status === "SENT" ? null : url;
  return { ok: true, value: { invitation: presentInvitation(controlPlane, fresh), inviteUrl } };
}

export async function resendInvitation(
  controlPlane: ControlPlane,
  input: { organizationId: string; invitationId: string; actorUserId: string; sender: AccessMessageSender | null; linkFor: (raw: string) => string },
): Promise<AccessResult<{ invitation: InvitationPresentation; inviteUrl: string | null }>> {
  const token = createSessionToken();
  const rotated = controlPlane.runImmediateTransaction((): AccessResult<InvitationRow> => {
    const db = controlPlane.db;
    expireStaleInvitations(db, input.organizationId);
    const row = db
      .prepare(`SELECT * FROM organization_invitations WHERE invitation_id = ? AND organization_id = ?`)
      .get(input.invitationId, input.organizationId) as InvitationRow | undefined;
    if (!row) return fail("invitation_missing", 404);
    if (row.status !== "PENDING") return fail("invitation_not_pending", 409);
    if (row.send_count >= MAX_INVITATION_SENDS) return fail("rate_limited", 429);
    const now = new Date();
    db.prepare(
      `UPDATE organization_invitations
       SET token_hash = ?, expires_at = ?, last_sent_at = ?, send_count = send_count + 1, delivery_channel = ?, delivery_status = 'NOT_SENT'
       WHERE invitation_id = ? AND status = 'PENDING'`,
    ).run(token.tokenHash, new Date(now.getTime() + INVITATION_TTL_MS).toISOString(), now.toISOString(), input.sender ? "EMAIL" : "LINK", row.invitation_id);
    appendAccessEvent(db, { organizationId: input.organizationId, actorUserId: input.actorUserId, subjectInvitationId: row.invitation_id, action: "invitation.resent" });
    return { ok: true, value: db.prepare(`SELECT * FROM organization_invitations WHERE invitation_id = ?`).get(row.invitation_id) as InvitationRow };
  });
  if (!rotated.ok) return rotated;
  const organization = controlPlane.getOrganization(input.organizationId);
  return finishDelivery(controlPlane, rotated.value, token.rawToken, input.sender, input.linkFor, organization?.displayName ?? null);
}

export function revokeInvitation(
  controlPlane: ControlPlane,
  input: { organizationId: string; invitationId: string; actorUserId: string },
): AccessResult<InvitationPresentation> {
  return controlPlane.runImmediateTransaction(() => {
    const db = controlPlane.db;
    const row = db
      .prepare(`SELECT * FROM organization_invitations WHERE invitation_id = ? AND organization_id = ?`)
      .get(input.invitationId, input.organizationId) as InvitationRow | undefined;
    if (!row) return fail<InvitationPresentation>("invitation_missing", 404);
    if (row.status !== "PENDING") return fail<InvitationPresentation>("invitation_not_pending", 409);
    db.prepare(
      `UPDATE organization_invitations SET status = 'REVOKED', revoked_at = ?, revoked_by_user_id = ? WHERE invitation_id = ? AND status = 'PENDING'`,
    ).run(new Date().toISOString(), input.actorUserId, row.invitation_id);
    appendAccessEvent(db, { organizationId: input.organizationId, actorUserId: input.actorUserId, subjectInvitationId: row.invitation_id, action: "invitation.revoked" });
    return { ok: true, value: presentInvitation(controlPlane, db.prepare(`SELECT * FROM organization_invitations WHERE invitation_id = ?`).get(row.invitation_id) as InvitationRow) };
  });
}

function readInvitationByToken(db: Db, rawToken: unknown): InvitationRow | null {
  if (typeof rawToken !== "string" || rawToken.length < 16) return null;
  let hash: Buffer;
  try {
    hash = hashRawSessionToken(rawToken);
  } catch {
    return null;
  }
  return (db.prepare(`SELECT * FROM organization_invitations WHERE token_hash = ?`).get(hash) as InvitationRow | undefined) ?? null;
}

function usableInvitation(row: InvitationRow | null): row is InvitationRow {
  return Boolean(row && row.status === "PENDING" && Date.parse(row.expires_at) > Date.now());
}

export function previewInvitation(
  controlPlane: ControlPlane,
  rawToken: unknown,
): AccessResult<{ organizationDisplayName: string; roleLabel: string; maskedEmail: string; expiresAt: string }> {
  const row = readInvitationByToken(controlPlane.db, rawToken);
  if (!usableInvitation(row)) return fail("invitation_unavailable", 410);
  const organization = controlPlane.getOrganization(row.organization_id);
  if (!organization || organization.status !== "ACTIVE") return fail("invitation_unavailable", 410);
  return {
    ok: true,
    value: {
      organizationDisplayName: organization.displayName,
      roleLabel: isOrganizationRole(row.role) ? ORGANIZATION_ROLE_PRESENTATION[row.role].label : row.role,
      maskedEmail: maskEmail(row.email),
      expiresAt: row.expires_at,
    },
  };
}

export async function acceptInvitation(
  controlPlane: ControlPlane,
  input: {
    token: unknown;
    mode: unknown;
    password: unknown;
    env: NodeJS.ProcessEnv;
    /** The user already authenticated in this browser, if any. */
    sessionUser: CloudUser | null;
  },
): Promise<AccessResult<{ user: CloudUser; organizationId: string; rawSessionToken: string; session: PlatformSessionRecord }>> {
  const row = readInvitationByToken(controlPlane.db, input.token);
  if (!usableInvitation(row)) return fail("invitation_unavailable", 410);
  if (accessRateLimited(`accept:${row.invitation_id}`, 10, 15 * 60 * 1000)) return fail("rate_limited", 429);
  const role = roleAllowedForWrite(row.role, input.env);
  if (!role.ok) return fail("invitation_unavailable", 410);
  const mode = input.mode === "existing" || input.mode === "new" || input.mode === "session" ? input.mode : null;
  if (!mode) return fail("invalid_payload", 400);
  const password = typeof input.password === "string" ? input.password : "";

  let verifiedUserId: string | null = null;
  let newUserHash: Awaited<ReturnType<typeof hashCloudPassword>> | null = null;
  if (mode === "session") {
    if (!input.sessionUser) return fail("invalid_session", 401);
    if (input.sessionUser.email !== row.email) return fail("invitation_email_mismatch", 409);
    verifiedUserId = input.sessionUser.userId;
  } else if (mode === "existing") {
    const verified = await controlPlane.verifyLogin(row.email, password);
    if (!verified.ok) {
      if (verified.error === "disabled") return fail("invitation_unavailable", 410);
      return fail(verified.error === "rate_limited" ? "rate_limited" : "invalid_credentials", verified.error === "rate_limited" ? 429 : 401);
    }
    verifiedUserId = verified.user.userId;
  } else {
    if (controlPlane.getUserByEmail(row.email)) {
      await cloudLoginCost.consumeUnknownEmail(password);
      return fail("sign_in_required", 409);
    }
    const issue = validateCloudPassword(password);
    if (issue || password.trim().toLowerCase() === row.email) return fail("weak_password", 400);
    newUserHash = await hashCloudPassword(password);
  }

  return controlPlane.runImmediateTransaction(() => {
    const db = controlPlane.db;
    const current = db.prepare(`SELECT * FROM organization_invitations WHERE invitation_id = ?`).get(row.invitation_id) as InvitationRow;
    if (!usableInvitation(current)) return fail("invitation_unavailable", 410);
    let user: CloudUser | null = verifiedUserId ? controlPlane.getUser(verifiedUserId) : null;
    if (!user && newUserHash) {
      if (controlPlane.getUserByEmail(current.email)) return fail("sign_in_required", 409);
      user = controlPlane.insertHashedUser({ email: current.email, ...newUserHash });
      db.prepare(`UPDATE users SET password_changed_at = ? WHERE user_id = ?`).run(new Date().toISOString(), user.userId);
    }
    if (!user || user.status !== "ACTIVE") {
      appendAccessEvent(db, { organizationId: current.organization_id, actorUserId: null, subjectInvitationId: current.invitation_id, action: "invitation.accept_refused_disabled" });
      return fail("invitation_unavailable", 410);
    }
    const existing = controlPlane.getMembershipForUserInOrganization(user.userId, current.organization_id);
    let action = "membership.attached";
    let membershipId: string;
    const now = new Date().toISOString();
    if (!existing) {
      const created = controlPlane.addMembership({ userId: user.userId, organizationId: current.organization_id, role: role.value });
      membershipId = created.membershipId;
      db.prepare(`UPDATE organization_memberships SET created_by_user_id = ?, updated_at = ? WHERE membership_id = ?`).run(current.created_by_user_id, now, membershipId);
    } else if (isActiveMembershipPair(existing.role, existing.status)) {
      return fail("already_member", 409);
    } else {
      const reactivated = controlPlane.reactivateRevokedMembership({ membershipId: existing.membershipId, organizationId: current.organization_id, role: role.value });
      if (!reactivated) return fail("invitation_unavailable", 410);
      membershipId = reactivated.membershipId;
      db.prepare(`UPDATE organization_memberships SET updated_at = ?, role_changed_at = ?, revoked_at = NULL, revoked_by_user_id = NULL WHERE membership_id = ?`).run(now, now, membershipId);
      action = "membership.reactivated";
    }
    db.prepare(`UPDATE organization_invitations SET status = 'ACCEPTED', accepted_user_id = ?, accepted_at = ? WHERE invitation_id = ? AND status = 'PENDING'`).run(user.userId, now, current.invitation_id);
    // C2: accepting an invitation never marks the email verified, whatever the delivery channel.
    appendAccessEvent(db, { organizationId: current.organization_id, actorUserId: user.userId, subjectUserId: user.userId, subjectInvitationId: current.invitation_id, action: "invitation.accepted", detail: { mode } });
    appendAccessEvent(db, { organizationId: current.organization_id, actorUserId: user.userId, subjectUserId: user.userId, subjectMembershipId: membershipId, action, detail: { role: role.value } });
    const created = controlPlane.createSession({ userId: user.userId, activeOrganizationId: current.organization_id });
    return { ok: true, value: { user, organizationId: current.organization_id, rawSessionToken: created.rawToken, session: created.session } };
  });
}

// ── Memberships ─────────────────────────────────────────────────────────────

export function changeMembershipRole(
  controlPlane: ControlPlane,
  input: { organizationId: string; membershipId: string; role: string; actorUserId: string; env: NodeJS.ProcessEnv },
): AccessResult<{ membershipId: string; role: OrganizationRole }> {
  const role = roleAllowedForWrite(input.role, input.env);
  if (!role.ok) return role;
  return controlPlane.runImmediateTransaction(() => {
    const db = controlPlane.db;
    const current = db
      .prepare(`SELECT membership_id, user_id, role, status FROM organization_memberships WHERE membership_id = ? AND organization_id = ?`)
      .get(input.membershipId, input.organizationId) as { membership_id: string; user_id: string; role: string; status: string } | undefined;
    if (!current) return fail<{ membershipId: string; role: OrganizationRole }>("membership_missing", 404);
    if (!isActiveMembershipPair(current.role, current.status)) return fail<{ membershipId: string; role: OrganizationRole }>("membership_not_active", 409);
    if (current.role === role.value) return { ok: true, value: { membershipId: current.membership_id, role: role.value } };
    if (current.role === "owner" && controlPlane.countOwnerMemberships(input.organizationId) <= 1) {
      return fail<{ membershipId: string; role: OrganizationRole }>("last_owner_removal", 409);
    }
    const now = new Date().toISOString();
    // Role and status change together (compatibility invariant; DB triggers enforce it).
    db.prepare(
      `UPDATE organization_memberships SET role = ?, status = ?, role_changed_at = ?, updated_at = ? WHERE membership_id = ?`,
    ).run(role.value, activeStatusForRole(role.value), now, now, current.membership_id);
    appendAccessEvent(db, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      subjectUserId: current.user_id,
      subjectMembershipId: current.membership_id,
      action: "membership.role_changed",
      detail: { from: current.role, to: role.value },
    });
    return { ok: true, value: { membershipId: current.membership_id, role: role.value } };
  });
}

export function recordMembershipRevocation(
  controlPlane: ControlPlane,
  input: { organizationId: string; membershipId: string; actorUserId: string },
): void {
  const now = new Date().toISOString();
  const row = controlPlane.db
    .prepare(`SELECT user_id, revoked_at FROM organization_memberships WHERE membership_id = ? AND organization_id = ? AND status = 'REVOKED'`)
    .get(input.membershipId, input.organizationId) as { user_id: string; revoked_at: string | null } | undefined;
  if (!row || row.revoked_at) return;
  controlPlane.db
    .prepare(`UPDATE organization_memberships SET revoked_at = ?, revoked_by_user_id = ?, updated_at = ? WHERE membership_id = ?`)
    .run(now, input.actorUserId, now, input.membershipId);
  appendAccessEvent(controlPlane.db, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    subjectUserId: row.user_id,
    subjectMembershipId: input.membershipId,
    action: "membership.revoked",
  });
}

// ── Sessions and passwords ──────────────────────────────────────────────────

export function revokeUserSessions(db: Db, userId: string, exceptSessionId: string | null = null): number {
  const now = new Date().toISOString();
  const result = exceptSessionId
    ? db.prepare(`UPDATE platform_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND session_id != ?`).run(now, userId, exceptSessionId)
    : db.prepare(`UPDATE platform_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(now, userId);
  return result.changes;
}

/**
 * C1 · password change keeps the user signed in safely: every session of the user — including the
 * current one — is revoked and the current device receives a NEW session token in the same
 * transaction. No timestamp exception: invalidation is explicit revocation. If anything fails, the
 * transaction rolls back and the old password and session stay valid.
 */
export async function changePassword(
  controlPlane: ControlPlane,
  input: { user: CloudUser; session: PlatformSessionRecord; currentPassword: unknown; newPassword: unknown; hooks?: { beforeCommit?: () => void } },
): Promise<AccessResult<{ rawSessionToken: string; session: PlatformSessionRecord; revoked: number }>> {
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  const verified = await controlPlane.verifyLogin(input.user.email, currentPassword);
  if (!verified.ok) {
    return verified.error === "rate_limited" ? fail("rate_limited", 429) : fail("invalid_credentials", 401);
  }
  if (validateCloudPassword(newPassword) || newPassword.trim().toLowerCase() === input.user.email || newPassword === currentPassword) {
    return fail("weak_password", 400);
  }
  const hashed = await hashCloudPassword(newPassword);
  return controlPlane.runImmediateTransaction(() => {
    const db = controlPlane.db;
    const live = db
      .prepare(`SELECT revoked_at, expires_at FROM platform_sessions WHERE session_id = ?`)
      .get(input.session.sessionId) as { revoked_at: string | null; expires_at: string } | undefined;
    if (!live || live.revoked_at || Date.parse(live.expires_at) <= Date.now()) {
      // A concurrent change or a logout already rotated this session.
      return fail<{ rawSessionToken: string; session: PlatformSessionRecord; revoked: number }>("session_rotated", 409);
    }
    const now = new Date().toISOString();
    controlPlane.updateHashedUserPassword({ userId: input.user.userId, ...hashed });
    db.prepare(`UPDATE users SET password_changed_at = ? WHERE user_id = ?`).run(now, input.user.userId);
    const revoked = revokeUserSessions(db, input.user.userId);
    const created = controlPlane.createSession({ userId: input.user.userId, activeOrganizationId: input.session.activeOrganizationId });
    appendAccessEvent(db, { organizationId: null, actorUserId: input.user.userId, subjectUserId: input.user.userId, action: "credential.password_changed", detail: { otherSessionsRevoked: Math.max(0, revoked - 1) } });
    input.hooks?.beforeCommit?.();
    return { ok: true, value: { rawSessionToken: created.rawToken, session: created.session, revoked } };
  });
}

type CredentialPurpose = "PASSWORD_RESET" | "EMAIL_VERIFICATION";
type IssuedVia = "SELF_SERVICE" | "OWNER_REQUEST_EMAIL" | "PLATFORM_CLI";

function issueCredentialToken(
  db: Db,
  input: { userId: string; purpose: CredentialPurpose; via: IssuedVia; issuedBy: string | null; organizationId: string | null; deliveredTo: string | null },
): string {
  const token = createSessionToken();
  const now = new Date();
  db.prepare(`UPDATE credential_tokens SET status = 'SUPERSEDED' WHERE user_id = ? AND purpose = ? AND status = 'ISSUED'`).run(input.userId, input.purpose);
  db.prepare(
    `INSERT INTO credential_tokens
     (token_id, user_id, purpose, token_hash, status, issued_via, issued_by_user_id, issued_in_organization_id, delivered_to_email, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'ISSUED', ?, ?, ?, ?, ?, ?)`,
  ).run(`ctk:${randomUUID()}`, input.userId, input.purpose, token.tokenHash, input.via, input.issuedBy, input.organizationId, input.deliveredTo, now.toISOString(), new Date(now.getTime() + CREDENTIAL_TOKEN_TTL_MS).toISOString());
  return token.rawToken;
}

type UserCredentialRow = { user_id: string; email: string; status: string; email_verified_at: string | null; password_changed_at: string | null };
function readUserCredentialRow(db: Db, userId: string): UserCredentialRow | null {
  return (db.prepare(`SELECT user_id, email, status, email_verified_at, password_changed_at FROM users WHERE user_id = ?`).get(userId) as UserCredentialRow | undefined) ?? null;
}

/** Self-service "forgot password": always neutral; sends only to an existing, active, VERIFIED email. */
export async function requestPasswordReset(
  controlPlane: ControlPlane,
  input: { email: unknown; ip: string; sender: AccessMessageSender | null; linkFor: (raw: string) => string },
): Promise<AccessResult<null>> {
  const email = typeof input.email === "string" ? normalizeEmail(input.email) : "";
  if (accessRateLimited(`reset-ip:${input.ip}`, 20, 60 * 60 * 1000) || accessRateLimited(`reset-email:${email}`, 3, 60 * 60 * 1000)) {
    return fail("rate_limited", 429);
  }
  const user = email ? controlPlane.getUserByEmail(email) : null;
  const row = user ? readUserCredentialRow(controlPlane.db, user.userId) : null;
  // Neutral answer (F): every branch pays the same KDF cost and nobody waits for delivery, so
  // status, body and the dominant timing do not depend on whether the account exists or is verified.
  await cloudLoginCost.consumeUnknownEmail(email || "x");
  if (!input.sender || !row || row.status !== "ACTIVE" || !row.email_verified_at) {
    return { ok: true, value: null };
  }
  const raw = controlPlane.runImmediateTransaction(() => {
    const token = issueCredentialToken(controlPlane.db, { userId: row.user_id, purpose: "PASSWORD_RESET", via: "SELF_SERVICE", issuedBy: null, organizationId: null, deliveredTo: row.email });
    appendAccessEvent(controlPlane.db, { organizationId: null, actorUserId: null, subjectUserId: row.user_id, action: "credential.recovery_requested", detail: { via: "SELF_SERVICE" } });
    return token;
  });
  void deliver(input.sender, { kind: "PASSWORD_RESET", to: row.email, url: input.linkFor(raw), organizationName: null });
  return { ok: true, value: null };
}

/** D7: the owner may only ask WorkOS to send recovery to the user's verified email. Never returns a token. */
export async function ownerRequestRecovery(
  controlPlane: ControlPlane,
  input: { organizationId: string; membershipId: string; actorUserId: string; sender: AccessMessageSender | null; linkFor: (raw: string) => string },
): Promise<AccessResult<null>> {
  const membership = controlPlane.getMembership(input.membershipId);
  if (!membership || membership.organizationId !== input.organizationId) return fail("membership_missing", 404);
  const row = readUserCredentialRow(controlPlane.db, membership.userId);
  if (!input.sender || !row || row.status !== "ACTIVE" || !row.email_verified_at) return fail("recovery_channel_unavailable", 409);
  if (accessRateLimited(`owner-recovery:${row.user_id}`, 3, 60 * 60 * 1000)) return fail("rate_limited", 429);
  const raw = controlPlane.runImmediateTransaction(() => {
    const token = issueCredentialToken(controlPlane.db, { userId: row.user_id, purpose: "PASSWORD_RESET", via: "OWNER_REQUEST_EMAIL", issuedBy: input.actorUserId, organizationId: input.organizationId, deliveredTo: row.email });
    appendAccessEvent(controlPlane.db, { organizationId: input.organizationId, actorUserId: input.actorUserId, subjectUserId: row.user_id, subjectMembershipId: input.membershipId, action: "credential.recovery_requested", detail: { via: "OWNER_REQUEST_EMAIL" } });
    return token;
  });
  await deliver(input.sender, { kind: "PASSWORD_RESET", to: row.email, url: input.linkFor(raw), organizationName: controlPlane.getOrganization(input.organizationId)?.displayName ?? null });
  return { ok: true, value: null };
}

/** Pilot only: platform-assisted recovery (CLI). Returns the raw token to the platform operator. */
export function issuePlatformRecovery(controlPlane: ControlPlane, input: { email: string }): AccessResult<{ rawToken: string; userId: string; expiresInMinutes: number }> {
  const user = controlPlane.getUserByEmail(normalizeEmail(input.email));
  if (!user) return fail("user_missing", 404);
  if (user.status !== "ACTIVE") return fail("user_disabled", 409);
  const raw = controlPlane.runImmediateTransaction(() => {
    const token = issueCredentialToken(controlPlane.db, { userId: user.userId, purpose: "PASSWORD_RESET", via: "PLATFORM_CLI", issuedBy: null, organizationId: null, deliveredTo: null });
    appendAccessEvent(controlPlane.db, { organizationId: null, actorUserId: null, subjectUserId: user.userId, action: "credential.recovery_issued_by_platform" });
    return token;
  });
  return { ok: true, value: { rawToken: raw, userId: user.userId, expiresInMinutes: CREDENTIAL_TOKEN_TTL_MS / 60000 } };
}

function readUsableCredentialToken(db: Db, rawToken: unknown, purpose: CredentialPurpose): { token_id: string; user_id: string; issued_via: IssuedVia; delivered_to_email: string | null } | null {
  if (typeof rawToken !== "string" || rawToken.length < 16) return null;
  let hash: Buffer;
  try {
    hash = hashRawSessionToken(rawToken);
  } catch {
    return null;
  }
  const row = db
    .prepare(`SELECT token_id, user_id, status, expires_at, issued_via, delivered_to_email FROM credential_tokens WHERE token_hash = ? AND purpose = ?`)
    .get(hash, purpose) as { token_id: string; user_id: string; status: string; expires_at: string; issued_via: IssuedVia; delivered_to_email: string | null } | undefined;
  if (!row || row.status !== "ISSUED" || Date.parse(row.expires_at) <= Date.now()) return null;
  return row;
}

export async function completePasswordReset(
  controlPlane: ControlPlane,
  input: { token: unknown; newPassword: unknown; ip: string },
): Promise<AccessResult<null>> {
  if (accessRateLimited(`reset-complete:${input.ip}`, 20, 15 * 60 * 1000)) return fail("rate_limited", 429);
  const pre = readUsableCredentialToken(controlPlane.db, input.token, "PASSWORD_RESET");
  if (!pre) return fail("token_unavailable", 410);
  const user = controlPlane.getUser(pre.user_id);
  const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
  if (!user || validateCloudPassword(newPassword) || newPassword.trim().toLowerCase() === user.email) return fail("weak_password", 400);
  const hashed = await hashCloudPassword(newPassword);
  return controlPlane.runImmediateTransaction(() => {
    const db = controlPlane.db;
    const token = readUsableCredentialToken(db, input.token, "PASSWORD_RESET");
    if (!token || token.token_id !== pre.token_id) return fail<null>("token_unavailable", 410);
    const current = controlPlane.getUser(token.user_id);
    if (!current || current.status !== "ACTIVE") return fail<null>("token_unavailable", 410);
    const now = new Date().toISOString();
    db.prepare(`UPDATE credential_tokens SET status = 'USED', used_at = ? WHERE token_id = ? AND status = 'ISSUED'`).run(now, token.token_id);
    controlPlane.updateHashedUserPassword({ userId: current.userId, ...hashed });
    db.prepare(`UPDATE users SET password_changed_at = ? WHERE user_id = ?`).run(now, current.userId);
    const revoked = revokeUserSessions(db, current.userId);
    appendAccessEvent(db, { organizationId: null, actorUserId: current.userId, subjectUserId: current.userId, action: "credential.password_reset", detail: { via: token.issued_via, sessionsRevoked: revoked } });
    return { ok: true, value: null };
  });
}

export async function requestEmailVerification(
  controlPlane: ControlPlane,
  input: { user: CloudUser; sender: AccessMessageSender | null; linkFor: (raw: string) => string },
): Promise<AccessResult<null>> {
  if (!input.sender) return fail("delivery_unavailable", 409);
  if (accessRateLimited(`verify:${input.user.userId}`, 3, 60 * 60 * 1000)) return fail("rate_limited", 429);
  const raw = controlPlane.runImmediateTransaction(() =>
    issueCredentialToken(controlPlane.db, { userId: input.user.userId, purpose: "EMAIL_VERIFICATION", via: "SELF_SERVICE", issuedBy: input.user.userId, organizationId: null, deliveredTo: input.user.email }),
  );
  await deliver(input.sender, { kind: "EMAIL_VERIFICATION", to: input.user.email, url: input.linkFor(raw), organizationName: null });
  return { ok: true, value: null };
}

/** C2: the ONLY way to set email_verified_at is to use a link that was sent to that email. */
export function completeEmailVerification(controlPlane: ControlPlane, input: { token: unknown }): AccessResult<null> {
  return controlPlane.runImmediateTransaction(() => {
    const db = controlPlane.db;
    const token = readUsableCredentialToken(db, input.token, "EMAIL_VERIFICATION");
    if (!token) return fail<null>("token_unavailable", 410);
    const user = controlPlane.getUser(token.user_id);
    if (!user || user.status !== "ACTIVE" || token.delivered_to_email !== user.email) return fail<null>("token_unavailable", 410);
    const now = new Date().toISOString();
    db.prepare(`UPDATE credential_tokens SET status = 'USED', used_at = ? WHERE token_id = ?`).run(now, token.token_id);
    db.prepare(`UPDATE users SET email_verified_at = ? WHERE user_id = ?`).run(now, user.userId);
    appendAccessEvent(db, { organizationId: null, actorUserId: user.userId, subjectUserId: user.userId, action: "credential.email_verified" });
    return { ok: true, value: null };
  });
}

// ── Read models ─────────────────────────────────────────────────────────────

export type AccessEventPresentation = { eventId: string; action: string; actorEmail: string | null; subjectEmail: string | null; detail: Record<string, unknown>; createdAt: string };

function presentEvents(controlPlane: ControlPlane, rows: Array<{ event_id: string; action: string; actor_user_id: string | null; subject_user_id: string | null; detail_json: string; created_at: string }>): AccessEventPresentation[] {
  return rows.map((row) => ({
    eventId: row.event_id,
    action: row.action,
    actorEmail: row.actor_user_id ? controlPlane.getUser(row.actor_user_id)?.email ?? null : null,
    subjectEmail: row.subject_user_id ? controlPlane.getUser(row.subject_user_id)?.email ?? null : null,
    detail: JSON.parse(row.detail_json) as Record<string, unknown>,
    createdAt: row.created_at,
  }));
}

export function listOrganizationAccessEvents(controlPlane: ControlPlane, organizationId: string, before?: string | null): AccessEventPresentation[] {
  const rows = controlPlane.db
    .prepare(`SELECT * FROM access_audit_events WHERE organization_id = ? ${before ? "AND created_at < ?" : ""} ORDER BY created_at DESC LIMIT 50`)
    .all(...(before ? [organizationId, before] : [organizationId])) as Parameters<typeof presentEvents>[1];
  return presentEvents(controlPlane, rows);
}

export function accountSecurity(controlPlane: ControlPlane, input: { user: CloudUser; sessionId: string }) {
  const db = controlPlane.db;
  const row = readUserCredentialRow(db, input.user.userId);
  const sessions = (db
    .prepare(`SELECT session_id, created_at, last_seen_at, expires_at FROM platform_sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY created_at DESC`)
    .all(input.user.userId, new Date().toISOString()) as Array<{ session_id: string; created_at: string; last_seen_at: string; expires_at: string }>).map((session) => ({
    createdAt: session.created_at,
    lastSeenAt: session.last_seen_at,
    expiresAt: session.expires_at,
    current: session.session_id === input.sessionId,
  }));
  const events = presentEvents(controlPlane, db
    .prepare(`SELECT * FROM access_audit_events WHERE subject_user_id = ? ORDER BY created_at DESC LIMIT 20`)
    .all(input.user.userId) as Parameters<typeof presentEvents>[1]);
  return {
    email: input.user.email,
    emailVerified: Boolean(row?.email_verified_at),
    emailVerifiedAt: row?.email_verified_at ?? null,
    passwordChangedAt: row?.password_changed_at ?? null,
    sessions,
    memberships: controlPlane.listMembershipsForUser(input.user.userId).map((membership) => ({
      organizationId: membership.organizationId,
      displayName: membership.displayName,
      role: membership.role,
      roleLabel: isOrganizationRole(membership.role) ? ORGANIZATION_ROLE_PRESENTATION[membership.role].label : membership.role,
    })),
    recentEvents: events,
  };
}

export function userEmailVerified(controlPlane: ControlPlane, userId: string): boolean {
  return Boolean(readUserCredentialRow(controlPlane.db, userId)?.email_verified_at);
}
