import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { isScopedOrganizationRole, roleCan, type OrganizationCapability } from "@workos-final/domain";
import { organizationRolesV1Enabled } from "./rolesFlag.js";
import { opsLog } from "../ops/log.js";
import { PUBLIC_ACCOUNT_PATHS } from "./publicPaths.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import { PlaneIdentityError } from "./planeIdentity.js";
import {
  CLOUD_SESSION_COOKIE,
  type ControlPlane,
} from "./controlPlane.js";
import type { ApiEnv } from "./context.js";
import type { RuntimeRegistry } from "./runtimeRegistry.js";

const PUBLIC_PATHS = new Set([
  "/api/health",
  "/api/ready",
  "/api/cloud/login",
  "/api/cloud/session",
  "/api/cloud/logout",
  // V1 Organization Access: single-use token flows (they authenticate with their own token).
  ...PUBLIC_ACCOUNT_PATHS,
]);

export function attachSinglePlaneRuntime(
  runtime: ProductSystemRuntime,
  env: NodeJS.ProcessEnv,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    c.set("accessMode", "single_plane");
    c.set("env", env);
    c.set("productSystem", runtime);
    await next();
  };
}

export function attachCloudHost(
  controlPlane: ControlPlane,
  registry: RuntimeRegistry,
  env: NodeJS.ProcessEnv,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    c.set("accessMode", "cloud");
    c.set("env", env);
    c.set("controlPlane", controlPlane);
    c.set("runtimeRegistry", registry);
    await next();
  };
}

export function requireCloudSession(): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (c.get("accessMode") !== "cloud") {
      await next();
      return;
    }
    if (PUBLIC_PATHS.has(c.req.path)) {
      await next();
      return;
    }
    const controlPlane = c.get("controlPlane");
    if (!controlPlane) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const resolved = controlPlane.resolveSession(getCookie(c, CLOUD_SESSION_COOKIE));
    if (!resolved.ok) {
      return c.json({ error: "invalid_session" }, 401);
    }
    const organization = controlPlane.getOrganization(
      resolved.session.activeOrganizationId,
    );
    if (!organization) {
      return c.json({ error: "invalid_session" }, 401);
    }
    if (organization.status !== "ACTIVE") {
      return c.json({ error: "organization_disabled" }, 403);
    }
    const membership = controlPlane.getActiveMembership(
      resolved.user.userId,
      organization.organizationId,
    );
    if (!membership) {
      return c.json({ error: "forbidden" }, 403);
    }
    // V1 forward recovery: with WORKOS_ORG_ROLES_V1 off, the scoped roles are inactive by code.
    if (isScopedOrganizationRole(membership.role) && !organizationRolesV1Enabled(c.get("env") ?? process.env)) {
      return c.json({ error: "forbidden", reason: "roles_not_enabled" }, 403);
    }
    const descriptor = controlPlane.getPlaneByOrganization(organization.organizationId);
    const registry = c.get("runtimeRegistry");
    if (!descriptor || !registry) {
      return c.json({ error: "plane_unavailable" }, 503);
    }
    try {
      const runtime = registry.getOrOpen(descriptor, controlPlane.cloudRoot);
      runtime.assertBoundPlaneIdentity({
        planeId: descriptor.planeId,
        organizationId: descriptor.organizationId,
      });
      c.set("cloudUser", resolved.user);
      c.set("membership", membership);
      c.set("organization", organization);
      c.set("planeDescriptor", descriptor);
      c.set("productSystem", runtime);
    } catch (error) {
      if (error instanceof PlaneIdentityError) {
        opsLog("error", "plane_identity_failed", {
          code: error.code,
          organizationId: organization.organizationId,
          planeId: descriptor.planeId,
        });
        return c.json({ error: error.code }, 503);
      }
      throw error;
    }
    await next();
  };
}

export function requireOwnerRole(): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (c.get("accessMode") !== "cloud") {
      await next();
      return;
    }
    if (c.get("membership")?.role !== "owner") {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}

/**
 * V1 Organization Access: route gate on an explicit capability. Outside Cloud (single-plane) it is
 * a no-op, exactly like requireOwnerRole(). An unknown role holds no capability.
 */
export function requireCapability(capability: OrganizationCapability): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (c.get("accessMode") !== "cloud") {
      await next();
      return;
    }
    if (!roleCan(c.get("membership")?.role, capability)) {
      return c.json({ error: "forbidden" }, 403);
    }
    await next();
  };
}
