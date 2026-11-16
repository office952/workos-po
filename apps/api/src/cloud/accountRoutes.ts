import type { Context, Hono } from "hono";
import { deleteCookie, getCookie } from "hono/cookie";
import {
  acceptInvitation,
  accountSecurity,
  appendAccessEvent,
  changePassword,
  completeEmailVerification,
  completePasswordReset,
  configuredAccessMessageSender,
  previewInvitation,
  requestEmailVerification,
  requestPasswordReset,
  revokeUserSessions,
} from "./accessLifecycle.js";
import { clientAddress } from "./clientAddress.js";
import { CLOUD_SESSION_COOKIE } from "./controlPlane.js";
import { getControlPlane, type ApiEnv } from "./context.js";
import { linkBuilder } from "./organizationAccessRoutes.js";
import { roleCapabilityPresentation, setCloudSessionCookie } from "./routes.js";
import { OPERATOR_SESSION_COOKIE } from "../operator/store.js";

const REASONS: Record<string, string> = {
  invitation_unavailable: "Invitația nu mai este valabilă. Cere proprietarului o invitație nouă.",
  invitation_email_mismatch: "Ești autentificat cu alt cont. Ieși din cont și deschide din nou linkul.",
  sign_in_required: "Această adresă are deja cont WorkOS. Folosește parola contului existent.",
  invalid_credentials: "Emailul sau parola nu sunt corecte.",
  weak_password: "Parola trebuie să aibă cel puțin 10 caractere și să nu fie emailul.",
  token_unavailable: "Linkul nu mai este valabil. Cere unul nou.",
  session_rotated: "Sesiunea a fost deja reînnoită. Reîncarcă pagina.",
  delivery_unavailable: "Trimiterea pe email nu este disponibilă.",
  rate_limited: "Prea multe încercări. Reîncearcă mai târziu.",
  invalid_payload: "Cererea nu este completă.",
  invalid_session: "Sesiunea a expirat. Autentifică-te din nou.",
};

const reason = (error: string) => REASONS[error] ?? "Operația nu a putut fi efectuată.";

/** Rate-limit key: X-Forwarded-For is honoured only from an explicitly trusted proxy (clientAddress.ts). */
const clientIp = clientAddress;

async function body(c: Context<ApiEnv>): Promise<Record<string, unknown>> {
  const parsed = (await c.req.json().catch(() => null)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

function currentSession(c: Context<ApiEnv>) {
  const controlPlane = getControlPlane(c);
  if (!controlPlane) return null;
  const resolved = controlPlane.resolveSession(getCookie(c, CLOUD_SESSION_COOKIE));
  return resolved.ok ? { controlPlane, ...resolved } : null;
}

export { PUBLIC_ACCOUNT_PATHS } from "./publicPaths.js";

export function registerAccountRoutes(app: Hono<ApiEnv>): void {
  app.post("/api/cloud/invitations/preview", async (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) return c.json({ error: "cloud_disabled" }, 404);
    const result = previewInvitation(controlPlane, (await body(c)).token);
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    return c.json(result.value);
  });

  app.post("/api/cloud/invitations/accept", async (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) return c.json({ error: "cloud_disabled" }, 404);
    const payload = await body(c);
    const session = currentSession(c);
    const result = await acceptInvitation(controlPlane, {
      token: payload.token,
      mode: payload.mode,
      password: payload.password,
      env: c.get("env") ?? process.env,
      sessionUser: session?.user ?? null,
    });
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    deleteCookie(c, OPERATOR_SESSION_COOKIE, { path: "/" });
    setCloudSessionCookie(c, result.value.rawSessionToken);
    const organization = controlPlane.getOrganization(result.value.organizationId);
    const membership = controlPlane.getActiveMembership(result.value.user.userId, result.value.organizationId);
    return c.json({
      mode: "cloud",
      user: { userId: result.value.user.userId, email: result.value.user.email },
      organization: organization
        ? {
            organizationId: organization.organizationId,
            displayName: organization.displayName,
            slug: organization.slug,
            role: membership?.role ?? null,
            ...roleCapabilityPresentation(membership?.role ?? null),
          }
        : null,
      memberships: controlPlane.listMembershipsForUser(result.value.user.userId),
      session: { sessionId: result.value.session.sessionId, expiresAt: result.value.session.expiresAt },
    });
  });

  app.post("/api/cloud/password-reset/request", async (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) return c.json({ error: "cloud_disabled" }, 404);
    const env = c.get("env") ?? process.env;
    const result = await requestPasswordReset(controlPlane, {
      email: (await body(c)).email,
      ip: clientIp(c),
      sender: configuredAccessMessageSender(env),
      linkFor: linkBuilder(c, "resetare-parola"),
    });
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    // Neutral: identical for unknown, unverified and verified addresses.
    return c.json({ accepted: true, selfServiceAvailable: configuredAccessMessageSender(env) !== null }, 202);
  });

  app.post("/api/cloud/password-reset/complete", async (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) return c.json({ error: "cloud_disabled" }, 404);
    const payload = await body(c);
    const result = await completePasswordReset(controlPlane, { token: payload.token, newPassword: payload.newPassword, ip: clientIp(c) });
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    deleteCookie(c, CLOUD_SESSION_COOKIE, { path: "/" });
    deleteCookie(c, OPERATOR_SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

  app.post("/api/cloud/email-verification/complete", async (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) return c.json({ error: "cloud_disabled" }, 404);
    const result = completeEmailVerification(controlPlane, { token: (await body(c)).token });
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    return c.body(null, 204);
  });

  app.get("/api/account/security", (c) => {
    const session = currentSession(c);
    if (!session) return c.json({ error: "invalid_session" }, 401);
    const env = c.get("env") ?? process.env;
    return c.json({
      ...accountSecurity(session.controlPlane, { user: session.user, sessionId: session.session.sessionId }),
      emailDeliveryAvailable: configuredAccessMessageSender(env) !== null,
    });
  });

  app.post("/api/account/password", async (c) => {
    const session = currentSession(c);
    if (!session) return c.json({ error: "invalid_session", reasons: [reason("invalid_session")] }, 401);
    const payload = await body(c);
    const result = await changePassword(session.controlPlane, {
      user: session.user,
      session: session.session,
      currentPassword: payload.currentPassword,
      newPassword: payload.newPassword,
    });
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    // C1: the old cookie is dead (revoked); the current device continues on the new token.
    setCloudSessionCookie(c, result.value.rawSessionToken);
    return c.json({ changed: true, otherSessionsClosed: Math.max(0, result.value.revoked - 1), session: { expiresAt: result.value.session.expiresAt } });
  });

  app.post("/api/account/sessions/revoke-others", (c) => {
    const session = currentSession(c);
    if (!session) return c.json({ error: "invalid_session" }, 401);
    const revoked = session.controlPlane.runImmediateTransaction(() => {
      const count = revokeUserSessions(session.controlPlane.db, session.user.userId, session.session.sessionId);
      appendAccessEvent(session.controlPlane.db, { organizationId: null, actorUserId: session.user.userId, subjectUserId: session.user.userId, action: "session.revoked_others", detail: { count } });
      return count;
    });
    return c.json({ revoked });
  });

  app.post("/api/account/email-verification", async (c) => {
    const session = currentSession(c);
    if (!session) return c.json({ error: "invalid_session" }, 401);
    const result = await requestEmailVerification(session.controlPlane, {
      user: session.user,
      sender: configuredAccessMessageSender(c.get("env") ?? process.env),
      linkFor: linkBuilder(c, "verificare-email"),
    });
    if (!result.ok) return c.json({ error: result.error, reasons: [reason(result.error)] }, result.status);
    return c.json({ requested: true }, 202);
  });
}
