/**
 * V1 Organization Access: unauthenticated single-use token flows. They authenticate with their
 * own token; mutations still go through the production Origin check.
 */
export const PUBLIC_ACCOUNT_PATHS = [
  "/api/cloud/invitations/preview",
  "/api/cloud/invitations/accept",
  "/api/cloud/password-reset/request",
  "/api/cloud/password-reset/complete",
  "/api/cloud/email-verification/complete",
] as const;
