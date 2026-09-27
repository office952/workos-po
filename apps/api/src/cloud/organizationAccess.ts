import type {
  CloudMembership,
  CloudUser,
  ControlPlane,
  MembershipRole,
} from "./controlPlane.js";
import { MEMBERSHIP_ROLES, normalizeEmail } from "./controlPlane.js";
import { assertCloudPassword, hashCloudPassword } from "./password.js";

export type OrganizationAccessMember = {
  membershipId: string;
  email: string;
  role: MembershipRole;
  status: CloudMembership["status"];
  userStatus: CloudUser["status"];
  createdAt: string;
};

export type OrganizationAccessError =
  | "access_identity_unavailable"
  | "already_member"
  | "invalid_password"
  | "invalid_payload"
  | "last_owner_removal"
  | "membership_missing"
  | "password_required";

export function isMembershipRole(value: unknown): value is MembershipRole {
  return typeof value === "string" && (MEMBERSHIP_ROLES as readonly string[]).includes(value);
}

export function listOrganizationAccessMembers(
  controlPlane: ControlPlane,
  organizationId: string,
): OrganizationAccessMember[] {
  const memberships = controlPlane.listMembershipsForOrganization(organizationId);
  const rows: OrganizationAccessMember[] = [];
  for (const membership of memberships) {
    const user = controlPlane.getUser(membership.userId);
    if (!user) {
      continue;
    }
    rows.push({
      membershipId: membership.membershipId,
      email: user.email,
      role: membership.role,
      status: membership.status,
      userStatus: user.status,
      createdAt: membership.createdAt,
    });
  }
  return rows.sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === "ACTIVE" ? -1 : 1;
    }
    return left.email.localeCompare(right.email, "en");
  });
}

/**
 * Owner-facing membership create for V1.
 * Creates a NEW Cloud user + membership only.
 * Never attaches an existing global identity (cross-org attach is deferred /
 * controlled-operator only). Response contract must not enumerate global identity.
 */
export async function addOrganizationAccessMember(
  controlPlane: ControlPlane,
  input: {
    organizationId: string;
    email: string;
    role: MembershipRole;
    password?: string;
  },
): Promise<
  | { ok: true; member: OrganizationAccessMember }
  | { ok: false; error: OrganizationAccessError }
> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "invalid_payload" };
  }
  if (!isMembershipRole(input.role)) {
    return { ok: false, error: "invalid_payload" };
  }

  // Always require and validate password before existence branching so missing
  // password cannot become a global-existence oracle.
  if (typeof input.password !== "string") {
    return { ok: false, error: "password_required" };
  }
  let hashed: { passwordHash: Buffer; passwordSalt: Buffer; kdf: string };
  try {
    assertCloudPassword(input.password);
    hashed = await hashCloudPassword(input.password);
  } catch {
    return { ok: false, error: "invalid_password" };
  }

  return controlPlane.runImmediateTransaction(() => {
    const existing = controlPlane.getUserByEmail(email);
    if (existing) {
      const current = controlPlane.getActiveMembership(existing.userId, input.organizationId);
      if (current) {
        // Safe local-state signal: Owner already knows their own org memberships.
        return { ok: false as const, error: "already_member" as const };
      }
      // Existing global identity (active/disabled/revoked/foreign membership):
      // refuse attach without revealing which case applied.
      return { ok: false as const, error: "access_identity_unavailable" as const };
    }

    const user = controlPlane.insertHashedUser({
      email,
      passwordHash: hashed.passwordHash,
      passwordSalt: hashed.passwordSalt,
      kdf: hashed.kdf,
    });
    const membership = controlPlane.addMembership({
      userId: user.userId,
      organizationId: input.organizationId,
      role: input.role,
    });
    return {
      ok: true as const,
      member: {
        membershipId: membership.membershipId,
        email: user.email,
        role: membership.role,
        status: membership.status,
        userStatus: user.status,
        createdAt: membership.createdAt,
      },
    };
  });
}

export function revokeOrganizationAccessMember(
  controlPlane: ControlPlane,
  input: { organizationId: string; membershipId: string },
):
  | { ok: true; member: OrganizationAccessMember }
  | { ok: false; error: OrganizationAccessError } {
  const revoked = controlPlane.revokeMembership({
    membershipId: input.membershipId,
    organizationId: input.organizationId,
  });
  if (!revoked.ok) {
    return { ok: false, error: revoked.error };
  }
  const user = controlPlane.getUser(revoked.membership.userId);
  if (!user) {
    return { ok: false, error: "membership_missing" };
  }
  return {
    ok: true,
    member: {
      membershipId: revoked.membership.membershipId,
      email: user.email,
      role: revoked.membership.role,
      status: revoked.membership.status,
      userStatus: user.status,
      createdAt: revoked.membership.createdAt,
    },
  };
}
