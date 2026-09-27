import type { Hono } from "hono";
import type { ControlPlane } from "./controlPlane.js";
import { getControlPlane, isOwner, type ApiEnv } from "./context.js";
import { requireOwnerRole } from "./middleware.js";
import {
  addOrganizationAccessMember,
  isMembershipRole,
  listOrganizationAccessMembers,
  revokeOrganizationAccessMember,
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

function errorStatus(
  error:
    | "already_member"
    | "invalid_password"
    | "invalid_payload"
    | "last_owner_removal"
    | "membership_missing"
    | "password_required"
    | "user_disabled",
): 400 | 403 | 404 | 409 {
  switch (error) {
    case "invalid_payload":
    case "invalid_password":
    case "password_required":
      return 400;
    case "already_member":
    case "last_owner_removal":
    case "user_disabled":
      return 409;
    case "membership_missing":
      return 404;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function operatorReason(
  error:
    | "already_member"
    | "invalid_password"
    | "invalid_payload"
    | "last_owner_removal"
    | "membership_missing"
    | "password_required"
    | "user_disabled",
): string {
  switch (error) {
    case "already_member":
      return "Utilizatorul are deja acces activ în această organizație.";
    case "invalid_password":
      return "Parola nu respectă cerințele minime.";
    case "invalid_payload":
      return "Datele introduse nu sunt valide.";
    case "last_owner_removal":
      return "Nu poți elimina ultimul Owner activ al organizației.";
    case "membership_missing":
      return "Accesul selectat nu mai este disponibil.";
    case "password_required":
      return "Pentru un utilizator nou este necesară o parolă inițială.";
    case "user_disabled":
      return "Contul existent este dezactivat și nu poate fi atașat.";
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

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

  app.post("/api/admin/access/users", requireOwnerRole(), async (c) => {
    const controlPlane = getControlPlane(c);
    if (!controlPlane) {
      return c.json({ error: "unavailable", reasons: ["Accesul nu este disponibil."] }, 503);
    }
    const organization = c.get("organization");
    if (!organization) {
      return c.json({ error: "forbidden" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json(
        { error: "invalid_payload", reasons: [operatorReason("invalid_payload")] },
        400,
      );
    }
    const payload = body as {
      email?: unknown;
      role?: unknown;
      password?: unknown;
      organizationId?: unknown;
    };
    // Organization scope is session-derived only. Ignore/reject client authority.
    if (payload.organizationId !== undefined) {
      return c.json(
        { error: "invalid_payload", reasons: [operatorReason("invalid_payload")] },
        400,
      );
    }
    if (typeof payload.email !== "string" || !isMembershipRole(payload.role)) {
      return c.json(
        { error: "invalid_payload", reasons: [operatorReason("invalid_payload")] },
        400,
      );
    }
    const result = await addOrganizationAccessMember(controlPlane, {
      organizationId: organization.organizationId,
      email: payload.email,
      role: payload.role,
      password: typeof payload.password === "string" ? payload.password : undefined,
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
    return c.json(
      {
        attachedExistingUser: result.attachedExistingUser,
        member: result.member,
        ...accessAdminPayload(controlPlane, organization.organizationId, true),
      },
      201,
    );
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
