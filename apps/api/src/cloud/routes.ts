import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { OPERATOR_SESSION_COOKIE } from "../operator/store.js";
import {
  CLOUD_SESSION_COOKIE,
  CLOUD_SESSION_MAX_AGE_SEC,
} from "./controlPlane.js";
import type { ApiEnv } from "./context.js";
import { PlaneIdentityError } from "./planeIdentity.js";

export function registerCloudRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/cloud/session", (c) => {
    if (c.get("accessMode") !== "cloud") {
      return c.json({ mode: "single_plane", user: null, organization: null, memberships: [] });
    }
    const controlPlane = c.get("controlPlane");
    if (!controlPlane) {
      return c.json({
        mode: "cloud",
        authConfigured: false,
        user: null,
        organization: null,
        memberships: [],
      });
    }
    const cookie = getCookie(c, CLOUD_SESSION_COOKIE);
    const resolved = controlPlane.resolveSession(cookie);
    if (!resolved.ok) {
      return c.json({ mode: "cloud", user: null, organization: null, memberships: [] });
    }
    const organization = controlPlane.getOrganization(resolved.session.activeOrganizationId);
    const membership = controlPlane.getActiveMembership(
      resolved.user.userId,
      resolved.session.activeOrganizationId,
    );
    if (!organization || organization.status !== "ACTIVE" || !membership) {
      controlPlane.revokeSession(cookie);
      return c.json({ mode: "cloud", user: null, organization: null, memberships: [] });
    }
    const memberships = controlPlane.listMembershipsForUser(resolved.user.userId);
    return c.json({
      mode: "cloud",
      user: { userId: resolved.user.userId, email: resolved.user.email },
      organization: {
        organizationId: organization.organizationId,
        displayName: organization.displayName,
        slug: organization.slug,
        role: membership.role,
      },
      memberships,
    });
  });

  app.post("/api/cloud/login", async (c) => {
    if (c.get("accessMode") !== "cloud") {
      return c.json({ error: "cloud_disabled" }, 404);
    }
    const controlPlane = c.get("controlPlane");
    if (!controlPlane) {
      return c.json({ error: "cloud_disabled" }, 404);
    }
    const body = (await c.req.json().catch(() => null)) as {
      email?: unknown;
      password?: unknown;
      organizationId?: unknown;
    } | null;
    const email = typeof body?.email === "string" ? body.email : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const verified = await controlPlane.verifyLogin(email, password);
    if (!verified.ok) {
      const status = verified.error === "rate_limited" ? 429 : verified.error === "disabled" ? 403 : 401;
      return c.json({ error: verified.error }, status);
    }
    const memberships = controlPlane
      .listMembershipsForUser(verified.user.userId)
      .filter((item) => item.status === "ACTIVE");
    if (memberships.length === 0) {
      return c.json({ error: "no_membership" }, 403);
    }
    const requested =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
    let organizationId = memberships[0]?.organizationId ?? "";
    if (memberships.length > 1) {
      if (!requested) {
        return c.json(
          {
            error: "organization_selection_required",
            memberships,
          },
          409,
        );
      }
      const selected = memberships.find((item) => item.organizationId === requested);
      if (!selected) {
        return c.json({ error: "forbidden" }, 403);
      }
      organizationId = selected.organizationId;
    } else if (requested && requested !== organizationId) {
      return c.json({ error: "forbidden" }, 403);
    }
    let created: ReturnType<typeof controlPlane.createSession>;
    try {
      created = controlPlane.createSession({
        userId: verified.user.userId,
        activeOrganizationId: organizationId,
      });
    } catch {
      return c.json({ error: "no_membership" }, 403);
    }
    const { session, rawToken } = created;
    setCloudSessionCookie(c, rawToken);
    const organization = controlPlane.getOrganization(organizationId);
    const membership = memberships.find((item) => item.organizationId === organizationId);
    return c.json({
      mode: "cloud",
      user: { userId: verified.user.userId, email: verified.user.email },
      organization: organization
        ? {
            organizationId: organization.organizationId,
            displayName: organization.displayName,
            slug: organization.slug,
            role: membership?.role ?? null,
          }
        : null,
      memberships,
      session: { sessionId: session.sessionId, expiresAt: session.expiresAt },
    });
  });

  app.post("/api/cloud/logout", (c) => {
    const controlPlane = c.get("controlPlane");
    const registry = c.get("runtimeRegistry");
    const operatorToken = getCookie(c, OPERATOR_SESSION_COOKIE);
    if (controlPlane && registry) {
      const resolved = controlPlane.resolveSession(getCookie(c, CLOUD_SESSION_COOKIE));
      if (resolved.ok) {
        const descriptor = controlPlane.getPlaneByOrganization(
          resolved.session.activeOrganizationId,
        );
        if (descriptor) {
          try {
            const runtime = registry.getOrOpen(descriptor, controlPlane.cloudRoot);
            if (operatorToken) {
              runtime.logoutOperatorSession(operatorToken);
            }
          } catch (error) {
            if (!(error instanceof PlaneIdentityError)) {
              throw error;
            }
          }
        }
      }
      controlPlane.revokeSession(getCookie(c, CLOUD_SESSION_COOKIE));
    }
    deleteCookie(c, CLOUD_SESSION_COOKIE, { path: "/" });
    deleteCookie(c, OPERATOR_SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  app.post("/api/cloud/active-organization", async (c) => {
    if (c.get("accessMode") !== "cloud") {
      return c.json({ error: "cloud_disabled" }, 404);
    }
    const controlPlane = c.get("controlPlane");
    const user = c.get("cloudUser");
    const current = c.get("organization");
    const runtime = c.get("productSystem");
    if (!controlPlane || !user) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const body = (await c.req.json().catch(() => null)) as { organizationId?: unknown } | null;
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId.trim() : "";
    if (!organizationId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const membership = controlPlane.getActiveMembership(user.userId, organizationId);
    const organization = controlPlane.getOrganization(organizationId);
    if (!membership || !organization) {
      return c.json({ error: "forbidden" }, 403);
    }
    if (organization.status !== "ACTIVE") {
      return c.json({ error: "organization_disabled" }, 403);
    }
    const resolved = controlPlane.resolveSession(getCookie(c, CLOUD_SESSION_COOKIE));
    if (!resolved.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const operatorToken = getCookie(c, OPERATOR_SESSION_COOKIE);
    if (runtime && operatorToken && current?.organizationId !== organizationId) {
      runtime.logoutOperatorSession(operatorToken);
    }
    deleteCookie(c, OPERATOR_SESSION_COOKIE, { path: "/" });
    const switchedSession = controlPlane.switchActiveOrganization(
      resolved.session.sessionId,
      organizationId,
    );
    if (!switchedSession) {
      return c.json({ error: "forbidden" }, 403);
    }
    const memberships = controlPlane.listMembershipsForUser(user.userId);
    return c.json({
      mode: "cloud",
      user: { userId: user.userId, email: user.email },
      organization: {
        organizationId: organization.organizationId,
        displayName: organization.displayName,
        slug: organization.slug,
        role: membership.role,
      },
      memberships,
    });
  });
}

function setCloudSessionCookie(c: Context<ApiEnv>, rawToken: string): void {
  const env = c.get("env") ?? process.env;
  setCookie(c, CLOUD_SESSION_COOKIE, rawToken, {
    httpOnly: true,
    path: "/",
    sameSite: "Lax",
    secure: env.NODE_ENV === "production",
    maxAge: CLOUD_SESSION_MAX_AGE_SEC,
  });
}
