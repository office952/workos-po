export type OrganizationAccessMember = {
  membershipId: string;
  email: string;
  role: "owner" | "member";
  roleLabel: string;
  status: "ACTIVE" | "REVOKED";
  statusLabel: string;
  userStatus: "ACTIVE" | "DISABLED";
  createdAt: string;
};

export type OrganizationAccessAdminTransport = {
  canEdit: boolean;
  members: OrganizationAccessMember[];
};

function roleLabel(role: "owner" | "member"): string {
  return role === "owner" ? "Proprietar" : "Membru";
}

function statusLabel(status: "ACTIVE" | "REVOKED"): string {
  return status === "ACTIVE" ? "Activ" : "Revocat";
}

function presentMember(value: unknown): OrganizationAccessMember | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.membershipId !== "string" ||
    typeof row.email !== "string" ||
    (row.role !== "owner" && row.role !== "member") ||
    (row.status !== "ACTIVE" && row.status !== "REVOKED") ||
    (row.userStatus !== "ACTIVE" && row.userStatus !== "DISABLED") ||
    typeof row.createdAt !== "string"
  ) {
    return null;
  }
  return {
    membershipId: row.membershipId,
    email: row.email,
    role: row.role,
    roleLabel: roleLabel(row.role),
    status: row.status,
    statusLabel: statusLabel(row.status),
    userStatus: row.userStatus,
    createdAt: row.createdAt,
  };
}

export function presentOrganizationAccessAdmin(
  payload: unknown,
): OrganizationAccessAdminTransport | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const body = payload as Record<string, unknown>;
  if (typeof body.canEdit !== "boolean" || !Array.isArray(body.members)) {
    return null;
  }
  const members: OrganizationAccessMember[] = [];
  for (const item of body.members) {
    const presented = presentMember(item);
    if (!presented) {
      return null;
    }
    members.push(presented);
  }
  return {
    canEdit: body.canEdit,
    members,
  };
}
