import type { Hono } from "hono";
import type { ControlPlane } from "./controlPlane.js";
import { getControlPlane, isOwner, type ApiEnv } from "./context.js";
import { requireOwnerRole } from "./middleware.js";
import {
  listOrganizationAccessMembers,
  revokeOrganizationAccessMember,
  type OrganizationAccessError,
} from "./organizationAccess.js";

function accessAdminPayload(
  controlPlane: ControlPlane,
  organizationId: string,
  canEdit: boolean,
) {
  return {
    canEdit,
    members: listOrganizationAccessMembers(controlPlane, organizationId).map((member) => ({
      membershipId: member.membershipId,
      email: member.email,
      role: member.role,
      status: member.status,
      userStatus: member.userStatus,
      createdAt: member.createdAt,
    })),
  };
}

function errorStatus(error: OrganizationAccessError): 404 | 409 {
  switch (error) {
    case "last_owner_removal":
      return 409;
    case "membership_missing":
      return 404;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function operatorReason(error: OrganizationAccessError): string {
  switch (error) {
    case "last_owner_removal":
      return "Nu poți elimina ultimul Owner activ al organizației.";
    case "membership_missing":
      return "Accesul selectat nu mai este disponibil.";
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

/**
 * Owner access admin V1: list + revoke only.
 * POST /api/admin/access/users is not registered — Owner must not create or
 * probe global Cloud identities from the browser API.
 */
export function registerOrganizationAccessRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/access", (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) {
      return c.json({ error: "unavailable", reasons: ["Accesul nu este disponibil."] }, 503);
    }
    const organization = c.get("organization");
    if (!organization) {
      return c.json({ error: "forbidden" }, 403);
    }
    return c.json(accessAdminPayload(controlPlane, organization.organizationId, isOwner(c)));
  });

  app.post("/api/admin/access/memberships/:membershipId/revoke", requireOwnerRole(), (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) {
      return c.json({ error: "unavailable", reasons: ["Accesul nu este disponibil."] }, 503);
    }
    const organization = c.get("organization");
    if (!organization) {
      return c.json({ error: "forbidden" }, 403);
    }
    const membershipId = c.req.param("membershipId");
    const result = revokeOrganizationAccessMember(controlPlane, {
      organizationId: organization.organizationId,
      membershipId,
    });
    if (!result.ok) {
      return c.json(
        {
          error: result.error,
          reasons: [operatorReason(result.error)],
          ...accessAdminPayload(controlPlane, organization.organizationId, true),
        },
        errorStatus(result.error),
      );
    }
    return c.json({
      member: result.member,
      ...accessAdminPayload(controlPlane, organization.organizationId, true),
    });
  });
}
