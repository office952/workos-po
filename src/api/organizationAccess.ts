import { getJson, sendJson } from "./http";

export function organizationAccessPath(): string {
  return "/api/admin/access";
}

export async function fetchOrganizationAccess(): Promise<unknown> {
  return getJson(organizationAccessPath());
}

export async function postOrganizationAccessUser(body: {
  email: string;
  role: "owner" | "member";
  password?: string;
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", `${organizationAccessPath()}/users`, body);
}

export async function revokeOrganizationAccessMembership(
  membershipId: string,
): Promise<ReturnType<typeof sendJson>> {
  return sendJson(
    "POST",
    `${organizationAccessPath()}/memberships/${encodeURIComponent(membershipId)}/revoke`,
  );
}
