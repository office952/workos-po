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
  status: CloudMembership["status"];
  userStatus: CloudUser["status"];
  createdAt: string;
};

/**
 * Owner /admin/access V1 errors.
 * Owner browser create of global users is disabled for V1 (enumeration-safe).
 * ADDITIONAL_USER_OPERATOR_TOOLING = DEFERRED_FOLLOWUP
 * First Owner remains via controlled organization provisioning only.
 */
export type OrganizationAccessError = "last_owner_removal" | "membership_missing";

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
