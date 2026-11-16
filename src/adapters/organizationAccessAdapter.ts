/**
 * Organization access transport → presentation. V1: roles, labels and permissions come from the
 * server; the adapter never derives them (any role string is shown with the server's label).
 */
export type OrganizationAccessMember = {
  membershipId: string;
  email: string;
  role: string;
  roleLabel: string;
  status: string;
  statusLabel: string;
  active: boolean;
  userStatus: "ACTIVE" | "DISABLED";
  createdAt: string;
  lastActiveOwner: boolean;
  emailVerified: boolean;
};

export type OrganizationAccessInvitation = {
  invitationId: string;
  email: string;
  role: string;
  roleLabel: string;
  deliveryChannel: "LINK" | "EMAIL";
  deliveryStatus: "NOT_SENT" | "SENT" | "FAILED";
  deliveryLabel: string;
  createdByEmail: string | null;
  createdAt: string;
  expiresAt: string;
};

export type OrganizationAccessRole = {
  role: string;
  label: string;
  summary: string;
  cannot: string;
  assignable: boolean;
};

export type OrganizationAccessAdminTransport = {
  canEdit: boolean;
  canManage: boolean;
  members: OrganizationAccessMember[];
  invitations: OrganizationAccessInvitation[];
  roles: OrganizationAccessRole[];
  emailDeliveryAvailable: boolean;
  currentUserId: string | null;
};

const LEGACY_ROLE_LABELS: Record<string, string> = {
  owner: "Proprietar",
  member: "Comercial",
  production: "Producție",
  workshop: "Atelier",
};

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function statusLabel(active: boolean, userStatus: string): string {
  if (userStatus === "DISABLED") return "Cont dezactivat de platformă";
  return active ? "Activ" : "Revocat";
}

function deliveryLabel(channel: string, status: string): string {
  if (channel === "EMAIL" && status === "SENT") return "Trimisă pe email";
  if (channel === "EMAIL" && status === "FAILED") return "Trimiterea pe email a eșuat";
  return "Link copiat manual";
}

function presentMember(value: unknown): OrganizationAccessMember | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const membershipId = str(row.membershipId);
  const email = str(row.email);
  const role = str(row.role);
  const status = str(row.status);
  const createdAt = str(row.createdAt);
  if (!membershipId || !email || !role || !status || !createdAt || (row.userStatus !== "ACTIVE" && row.userStatus !== "DISABLED")) {
    return null;
  }
  const active = typeof row.active === "boolean" ? row.active : status === "ACTIVE";
  return {
    membershipId,
    email,
    role,
    roleLabel: str(row.roleLabel) ?? LEGACY_ROLE_LABELS[role] ?? role,
    status,
    statusLabel: statusLabel(active, row.userStatus),
    active,
    userStatus: row.userStatus,
    createdAt,
    lastActiveOwner: row.lastActiveOwner === true,
    emailVerified: row.emailVerified === true,
  };
}

function presentInvitation(value: unknown): OrganizationAccessInvitation | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const invitationId = str(row.invitationId);
  const email = str(row.email);
  const role = str(row.role);
  const expiresAt = str(row.expiresAt);
  const createdAt = str(row.createdAt);
  if (!invitationId || !email || !role || !expiresAt || !createdAt) return null;
  const channel = row.deliveryChannel === "EMAIL" ? "EMAIL" : "LINK";
  const status = row.deliveryStatus === "SENT" || row.deliveryStatus === "FAILED" ? row.deliveryStatus : "NOT_SENT";
  return {
    invitationId,
    email,
    role,
    roleLabel: str(row.roleLabel) ?? LEGACY_ROLE_LABELS[role] ?? role,
    deliveryChannel: channel,
    deliveryStatus: status,
    deliveryLabel: deliveryLabel(channel, status),
    createdByEmail: str(row.createdByEmail),
    createdAt,
    expiresAt,
  };
}

function presentRole(value: unknown): OrganizationAccessRole | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  const role = str(row.role);
  const label = str(row.label);
  if (!role || !label) return null;
  return { role, label, summary: str(row.summary) ?? "", cannot: str(row.cannot) ?? "", assignable: row.assignable === true };
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
    canManage: typeof body.canManage === "boolean" ? body.canManage : body.canEdit,
    members,
    invitations: Array.isArray(body.invitations)
      ? body.invitations.map(presentInvitation).filter((item): item is OrganizationAccessInvitation => item !== null)
      : [],
    roles: Array.isArray(body.roles)
      ? body.roles.map(presentRole).filter((item): item is OrganizationAccessRole => item !== null)
      : [],
    emailDeliveryAvailable: body.emailDeliveryAvailable === true,
    currentUserId: str(body.currentUserId),
  };
}
