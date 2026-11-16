import {
  ORGANIZATION_ROLE_PRESENTATION,
  isActiveMembershipPair,
  isOrganizationRole,
} from "@workos-final/domain";
import { recordMembershipRevocation, userEmailVerified } from "./accessLifecycle.js";
import type {
  CloudMembership,
  CloudUser,
  ControlPlane,
  MembershipRole,
} from "./controlPlane.js";

export type OrganizationAccessMember = {
  membershipId: string;
  email: string;
  role: MembershipRole;
  /** V1: server-owned Romanian label; the client never derives it. */
  roleLabel: string;
  status: CloudMembership["status"];
  /** V1: true for an active (role, status) pair. */
  active: boolean;
  userStatus: CloudUser["status"];
  createdAt: string;
  /** V1: the last owner cannot be revoked or demoted (shown without those actions). */
  lastActiveOwner: boolean;
  emailVerified: boolean;
};

/**
 * Owner /admin/access errors. Global identities are never created or probed from the browser:
 * V1 adds invitations, where only the recipient creates or proves the identity.
 */
export type OrganizationAccessError = "last_owner_removal" | "membership_missing";

export function listOrganizationAccessMembers(
  controlPlane: ControlPlane,
  organizationId: string,
): OrganizationAccessMember[] {
  const memberships = controlPlane.listMembershipsForOrganization(organizationId);
  const activeOwners = controlPlane.countOwnerMemberships(organizationId);
  const rows: OrganizationAccessMember[] = [];
  for (const membership of memberships) {
    const user = controlPlane.getUser(membership.userId);
    if (!user) {
      continue;
    }
    const active = isActiveMembershipPair(membership.role, membership.status);
    rows.push({
      membershipId: membership.membershipId,
      email: user.email,
      role: membership.role,
      roleLabel: isOrganizationRole(membership.role) ? ORGANIZATION_ROLE_PRESENTATION[membership.role].label : "Rol necunoscut",
      status: membership.status,
      active,
      userStatus: user.status,
      createdAt: membership.createdAt,
      lastActiveOwner: active && membership.role === "owner" && activeOwners <= 1,
      emailVerified: userEmailVerified(controlPlane, user.userId),
    });
  }
  return rows.sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }
    return left.email.localeCompare(right.email, "en");
  });
}

export function revokeOrganizationAccessMember(
  controlPlane: ControlPlane,
  input: { organizationId: string; membershipId: string; actorUserId?: string },
):
  | { ok: true; member: OrganizationAccessMember }
  | { ok: false; error: OrganizationAccessError } {
  // V1: one IMMEDIATE transaction so two concurrent revocations cannot remove the last owner.
  return controlPlane.runImmediateTransaction(() => {
    const revoked = controlPlane.revokeMembership({
      membershipId: input.membershipId,
      organizationId: input.organizationId,
    });
    if (!revoked.ok) {
      return { ok: false as const, error: revoked.error };
    }
    if (input.actorUserId) {
      recordMembershipRevocation(controlPlane, {
        organizationId: input.organizationId,
        membershipId: input.membershipId,
        actorUserId: input.actorUserId,
      });
    }
    const member = listOrganizationAccessMembers(controlPlane, input.organizationId).find(
      (item) => item.membershipId === revoked.membership.membershipId,
    );
    if (!member) {
      return { ok: false as const, error: "membership_missing" as const };
    }
    return { ok: true as const, member };
  });
}
