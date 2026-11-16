import { getJson, sendJson } from "./http";

export function organizationAccessPath(): string {
  return "/api/admin/access";
}

export async function fetchOrganizationAccess(): Promise<unknown> {
  return getJson(organizationAccessPath());
}

export function revokeOrganizationAccessMembership(
  membershipId: string,
): ReturnType<typeof sendJson> {
  return sendJson(
    "POST",
    `${organizationAccessPath()}/memberships/${encodeURIComponent(membershipId)}/revoke`,
  );
}

/* V1 Organization Access */

export function inviteOrganizationUser(email: string, role: string): ReturnType<typeof sendJson> {
  return sendJson("POST", `${organizationAccessPath()}/invitations`, { email, role });
}

export function resendOrganizationInvitation(invitationId: string): ReturnType<typeof sendJson> {
  return sendJson("POST", `${organizationAccessPath()}/invitations/${encodeURIComponent(invitationId)}/resend`);
}

export function revokeOrganizationInvitation(invitationId: string): ReturnType<typeof sendJson> {
  return sendJson("POST", `${organizationAccessPath()}/invitations/${encodeURIComponent(invitationId)}/revoke`);
}

export function changeOrganizationMemberRole(membershipId: string, role: string): ReturnType<typeof sendJson> {
  return sendJson("POST", `${organizationAccessPath()}/memberships/${encodeURIComponent(membershipId)}/role`, { role });
}

export function requestMemberRecovery(membershipId: string): ReturnType<typeof sendJson> {
  return sendJson("POST", `${organizationAccessPath()}/memberships/${encodeURIComponent(membershipId)}/send-recovery`);
}

export function fetchOrganizationAccessEvents(): Promise<unknown> {
  return getJson(`${organizationAccessPath()}/events`);
}

/* Account and public token flows */

export function fetchAccountSecurity(): Promise<unknown> {
  return getJson("/api/account/security");
}

export function changeOwnPassword(currentPassword: string, newPassword: string): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/account/password", { currentPassword, newPassword });
}

export function revokeOtherSessions(): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/account/sessions/revoke-others");
}

export function requestOwnEmailVerification(): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/account/email-verification");
}

export function previewInvitation(token: string): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/cloud/invitations/preview", { token });
}

export function acceptInvitation(token: string, mode: "existing" | "new" | "session", password: string): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/cloud/invitations/accept", { token, mode, password });
}

export function requestPasswordReset(email: string): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/cloud/password-reset/request", { email });
}

export function completePasswordReset(token: string, newPassword: string): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/cloud/password-reset/complete", { token, newPassword });
}

export function completeEmailVerification(token: string): ReturnType<typeof sendJson> {
  return sendJson("POST", "/api/cloud/email-verification/complete", { token });
}
