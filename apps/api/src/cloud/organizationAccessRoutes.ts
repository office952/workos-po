import type { Context, Hono } from "hono";
import {
  ORGANIZATION_ROLE_PRESENTATION,
  ORGANIZATION_ROLES,
  isScopedOrganizationRole,
} from "@workos-final/domain";
import {
  changeMembershipRole,
  configuredAccessMessageSender,
  createInvitation,
  listOrganizationAccessEvents,
  listPendingInvitations,
  ownerRequestRecovery,
  resendInvitation,
  revokeInvitation,
  type AccessResult,
} from "./accessLifecycle.js";
import { organizationRolesV1Enabled } from "./addOrganizationUser.js";
import type { ControlPlane } from "./controlPlane.js";
import { getControlPlane, type ApiEnv, can } from "./context.js";
import { requireCapability } from "./middleware.js";
import {
  listOrganizationAccessMembers,
  revokeOrganizationAccessMember,
  type OrganizationAccessError,
} from "./organizationAccess.js";

/** Romanian operator messages; internal codes stay in `error`. */
const REASONS: Record<string, string> = {
  last_owner_removal: "Nu poți elimina sau retrograda ultimul proprietar activ al organizației.",
  membership_missing: "Accesul selectat nu mai este disponibil.",
  membership_not_active: "Accesul acestui utilizator nu este activ.",
  invalid_email: "Adresa de email nu este validă.",
  invalid_role: "Rolul ales nu este disponibil.",
  roles_not_enabled: "Rolurile Producție și Atelier nu sunt încă activate pentru organizații.",
  already_member: "Acest utilizator are deja acces. Poți schimba rolul din listă.",
  invitation_pending: "Există deja o invitație în așteptare pentru această adresă.",
  invitation_missing: "Invitația nu mai este disponibilă.",
  invitation_not_pending: "Invitația nu mai este în așteptare.",
  recovery_channel_unavailable: "Recuperarea pe email nu este disponibilă pentru acest utilizator. Utilizatorul poate cere ajutorul suportului WorkOS.",
  rate_limited: "Prea multe încercări. Reîncearcă mai târziu.",
};

export function publicOrigin(c: Context<ApiEnv>): string {
  const env = c.get("env") ?? process.env;
  const configured = env.WORKOS_PUBLIC_ORIGIN?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin = c.req.header("origin")?.trim();
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) return origin;
  return new URL(c.req.url).origin;
}

/** Tokens travel in the URL fragment: never in server logs, Referer or proxies. */
export function linkBuilder(c: Context<ApiEnv>, page: "invitatie" | "resetare-parola" | "verificare-email") {
  const origin = publicOrigin(c);
  return (rawToken: string) => `${origin}/${page}#t=${encodeURIComponent(rawToken)}`;
}

function rolesPayload(env: NodeJS.ProcessEnv) {
  const enabled = organizationRolesV1Enabled(env);
  return ORGANIZATION_ROLES.map((role) => ({
    role,
    ...ORGANIZATION_ROLE_PRESENTATION[role],
    assignable: !isScopedOrganizationRole(role) || enabled,
  }));
}

function accessAdminPayload(c: Context<ApiEnv>, controlPlane: ControlPlane, organizationId: string) {
  const env = c.get("env") ?? process.env;
  const canManage = can(c, "org.access.manage");
  return {
    canEdit: canManage,
    canManage,
    members: listOrganizationAccessMembers(controlPlane, organizationId),
    invitations: canManage ? listPendingInvitations(controlPlane, organizationId) : [],
    roles: rolesPayload(env),
    emailDeliveryAvailable: configuredAccessMessageSender(env) !== null,
    currentUserId: c.get("cloudUser")?.userId ?? null,
  };
}

function errorBody(c: Context<ApiEnv>, controlPlane: ControlPlane, organizationId: string, error: string) {
  return { error, reasons: [REASONS[error] ?? "Operația nu a putut fi efectuată."], ...accessAdminPayload(c, controlPlane, organizationId) };
}

function revokeStatus(error: OrganizationAccessError): 404 | 409 {
  return error === "last_owner_removal" ? 409 : 404;
}

type Ctx = { controlPlane: ControlPlane; organizationId: string; actorUserId: string };
function context(c: Context<ApiEnv>): Ctx | null {
  const controlPlane = getControlPlane(c);
  const organization = c.get("organization");
  const user = c.get("cloudUser");
  if (!controlPlane || !organization || !user) return null;
  return { controlPlane, organizationId: organization.organizationId, actorUserId: user.userId };
}

async function body(c: Context<ApiEnv>): Promise<Record<string, unknown>> {
  const parsed = (await c.req.json().catch(() => null)) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

export function registerOrganizationAccessRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/access", (c) => {
    const ctx = context(c);
    if (!ctx) {
      return c.json({ error: "unavailable", reasons: ["Accesul nu este disponibil."] }, 503);
    }
    return c.json(accessAdminPayload(c, ctx.controlPlane, ctx.organizationId));
  });

  app.post("/api/admin/access/memberships/:membershipId/revoke", requireCapability("org.access.manage"), (c) => {
    const ctx = context(c);
    if (!ctx) {
      return c.json({ error: "unavailable", reasons: ["Accesul nu este disponibil."] }, 503);
    }
    const result = revokeOrganizationAccessMember(ctx.controlPlane, {
      organizationId: ctx.organizationId,
      membershipId: c.req.param("membershipId"),
      actorUserId: ctx.actorUserId,
    });
    if (!result.ok) {
      return c.json(errorBody(c, ctx.controlPlane, ctx.organizationId, result.error), revokeStatus(result.error));
    }
    return c.json({ member: result.member, ...accessAdminPayload(c, ctx.controlPlane, ctx.organizationId) });
  });

  app.post("/api/admin/access/memberships/:membershipId/role", requireCapability("org.access.manage"), async (c) => {
    const ctx = context(c);
    if (!ctx) return c.json({ error: "unavailable" }, 503);
    const payload = await body(c);
    const result = changeMembershipRole(ctx.controlPlane, {
      organizationId: ctx.organizationId,
      membershipId: c.req.param("membershipId"),
      role: typeof payload.role === "string" ? payload.role : "",
      actorUserId: ctx.actorUserId,
      env: c.get("env") ?? process.env,
    });
    return respond(c, ctx, result);
  });

  app.post("/api/admin/access/memberships/:membershipId/send-recovery", requireCapability("org.access.manage"), async (c) => {
    const ctx = context(c);
    if (!ctx) return c.json({ error: "unavailable" }, 503);
    const result = await ownerRequestRecovery(ctx.controlPlane, {
      organizationId: ctx.organizationId,
      membershipId: c.req.param("membershipId"),
      actorUserId: ctx.actorUserId,
      sender: configuredAccessMessageSender(c.get("env") ?? process.env),
      linkFor: linkBuilder(c, "resetare-parola"),
    });
    if (!result.ok) return c.json(errorBody(c, ctx.controlPlane, ctx.organizationId, result.error), result.status);
    // D7: neutral acknowledgement; the link never reaches the owner.
    return c.json({ requested: true }, 202);
  });

  app.post("/api/admin/access/invitations", requireCapability("org.access.manage"), async (c) => {
    const ctx = context(c);
    if (!ctx) return c.json({ error: "unavailable" }, 503);
    const payload = await body(c);
    const env = c.get("env") ?? process.env;
    const result = await createInvitation(ctx.controlPlane, {
      organizationId: ctx.organizationId,
      actorUserId: ctx.actorUserId,
      email: typeof payload.email === "string" ? payload.email : "",
      role: typeof payload.role === "string" ? payload.role : "",
      env,
      sender: configuredAccessMessageSender(env),
      linkFor: linkBuilder(c, "invitatie"),
    });
    if (!result.ok) return c.json(errorBody(c, ctx.controlPlane, ctx.organizationId, result.error), result.status);
    return c.json({ ...result.value, ...accessAdminPayload(c, ctx.controlPlane, ctx.organizationId) }, 201);
  });

  app.post("/api/admin/access/invitations/:invitationId/resend", requireCapability("org.access.manage"), async (c) => {
    const ctx = context(c);
    if (!ctx) return c.json({ error: "unavailable" }, 503);
    const result = await resendInvitation(ctx.controlPlane, {
      organizationId: ctx.organizationId,
      invitationId: c.req.param("invitationId"),
      actorUserId: ctx.actorUserId,
      sender: configuredAccessMessageSender(c.get("env") ?? process.env),
      linkFor: linkBuilder(c, "invitatie"),
    });
    if (!result.ok) return c.json(errorBody(c, ctx.controlPlane, ctx.organizationId, result.error), result.status);
    return c.json({ ...result.value, ...accessAdminPayload(c, ctx.controlPlane, ctx.organizationId) });
  });

  app.post("/api/admin/access/invitations/:invitationId/revoke", requireCapability("org.access.manage"), (c) => {
    const ctx = context(c);
    if (!ctx) return c.json({ error: "unavailable" }, 503);
    const result = revokeInvitation(ctx.controlPlane, {
      organizationId: ctx.organizationId,
      invitationId: c.req.param("invitationId"),
      actorUserId: ctx.actorUserId,
    });
    return respond(c, ctx, result);
  });

  app.get("/api/admin/access/events", requireCapability("org.access.manage"), (c) => {
    const ctx = context(c);
    if (!ctx) return c.json({ error: "unavailable" }, 503);
    return c.json({ events: listOrganizationAccessEvents(ctx.controlPlane, ctx.organizationId, c.req.query("before") ?? null) });
  });
}

function respond<T>(c: Context<ApiEnv>, ctx: Ctx, result: AccessResult<T>) {
  if (!result.ok) {
    return c.json(errorBody(c, ctx.controlPlane, ctx.organizationId, result.error), result.status);
  }
  return c.json({ result: result.value, ...accessAdminPayload(c, ctx.controlPlane, ctx.organizationId) });
}
