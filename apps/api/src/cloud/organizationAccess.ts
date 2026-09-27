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
  | "already_member"
  | "invalid_password"
  | "invalid_payload"
  | "last_owner_removal"
  | "membership_missing"
  | "password_required"
  | "user_disabled";

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

export async function addOrganizationAccessMember(
  controlPlane: ControlPlane,
  input: {
    organizationId: string;
    email: string;
    role: MembershipRole;
    password?: string;
  },
): Promise<
  | { ok: true; member: OrganizationAccessMember; attachedExistingUser: boolean }
  | { ok: false; error: OrganizationAccessError }
> {
  const email = normalizeEmail(input.email);
  if (!email || !email.includes("@")) {
    return { ok: false, error: "invalid_payload" };
  }
  if (!isMembershipRole(input.role)) {
    return { ok: false, error: "invalid_payload" };
  }

  const existingBefore = controlPlane.getUserByEmail(email);
  let hashed:
    | { passwordHash: Buffer; passwordSalt: Buffer; kdf: string }
    | undefined;
  if (!existingBefore) {
    if (typeof input.password !== "string") {
      return { ok: false, error: "password_required" };
    }
    try {
      assertCloudPassword(input.password);
      hashed = await hashCloudPassword(input.password);
    } catch {
      return { ok: false, error: "invalid_password" };
    }
  }

  return controlPlane.runImmediateTransaction(() => {
    const existing = controlPlane.getUserByEmail(email);
    if (existing) {
      if (existing.status !== "ACTIVE") {
        return { ok: false as const, error: "user_disabled" as const };
      }
      const current = controlPlane.getActiveMembership(existing.userId, input.organizationId);
      if (current) {
        return { ok: false as const, error: "already_member" as const };
      }
      // Attach existing global Cloud user; never overwrite password.
      const membership = controlPlane.addMembership({
        userId: existing.userId,
        organizationId: input.organizationId,
        role: input.role,
      });
      return {
        ok: true as const,
        attachedExistingUser: true,
        member: {
          membershipId: membership.membershipId,
          email: existing.email,
          role: membership.role,
          status: membership.status,
          userStatus: existing.status,
          createdAt: membership.createdAt,
        },
      };
    }

    if (!hashed) {
      return { ok: false as const, error: "password_required" as const };
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
      attachedExistingUser: false,
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
