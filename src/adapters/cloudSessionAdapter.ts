import { readTransportErrorCode, type JsonResult } from "../api/http";
import type { CloudAccessMode, CloudMembershipRole } from "../api/types";
import { asRecord, asString } from "./record";

export type CloudUserPresentation = {
  email: string;
};

export type CloudOrganizationPresentation = {
  organizationId: string;
  displayName: string;
  membershipRole: CloudMembershipRole | null;
  /**
   * V1 Organization Access: server-owned capabilities of the active role. `null` when the server
   * does not send them (single-plane runtime): the UI then shows every module, as before.
   */
  capabilities?: readonly string[] | null;
};

export type CloudMembershipPresentation = {
  organizationId: string;
  displayName: string;
  /** Romanian role label in that organization (shown in the login organization choice). */
  roleLabel?: string | null;
};

export type CloudSessionPresentation = {
  mode: CloudAccessMode;
  authConfigured: boolean;
  user: CloudUserPresentation | null;
  organization: CloudOrganizationPresentation | null;
  memberships: CloudMembershipPresentation[];
};

export type CloudLoginPresentation =
  | { ok: true; session: CloudSessionPresentation }
  | { ok: false; error: string; memberships: CloudMembershipPresentation[] };

function presentRole(value: unknown): CloudMembershipRole | null {
  return value === "owner" || value === "member" || value === "production" || value === "workshop"
    ? value
    : null;
}

function presentCapabilities(value: unknown): readonly string[] | null {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
}

function presentUser(value: unknown): CloudUserPresentation | null {
  const record = asRecord(value);
  const email = asString(record?.email);
  if (!email) {
    return null;
  }
  return { email };
}

function presentOrganization(value: unknown): CloudOrganizationPresentation | null {
  const record = asRecord(value);
  const organizationId = asString(record?.organizationId);
  const displayName = asString(record?.displayName);
  if (!organizationId || !displayName) {
    return null;
  }
  return {
    organizationId,
    displayName,
    membershipRole: presentRole(record?.role),
    capabilities: presentCapabilities(record?.capabilities),
  };
}

export function membershipRoleLabel(
  role: CloudOrganizationPresentation["membershipRole"] | undefined,
): string | null {
  switch (role) {
    case "owner":
      return "Proprietar";
    case "member":
      return "Comercial";
    case "production":
      return "Producție";
    case "workshop":
      return "Atelier";
    case null:
    case undefined:
      return null;
    default: {
      const exhaustive: never = role;
      return exhaustive;
    }
  }
}

export function presentCloudMemberships(value: unknown): CloudMembershipPresentation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (!record) {
      return [];
    }
    const organizationId = asString(record.organizationId);
    const displayName = asString(record.displayName);
    const role = presentRole(record.role);
    if (!organizationId || !displayName || !role || record.status !== "ACTIVE") {
      return [];
    }
    return [{ organizationId, displayName, roleLabel: membershipRoleLabel(role) }];
  });
}

export function presentCloudSession(payload: unknown): CloudSessionPresentation {
  const record = asRecord(payload);
  return {
    mode: record?.mode === "cloud" ? "cloud" : "single_plane",
    authConfigured: record?.authConfigured !== false,
    user: presentUser(record?.user),
    organization: presentOrganization(record?.organization),
    memberships: presentCloudMemberships(record?.memberships),
  };
}

export function presentCloudLoginResult(result: JsonResult): CloudLoginPresentation {
  const memberships = presentCloudMemberships(asRecord(result.body)?.memberships);
  if (!result.ok) {
    return {
      ok: false,
      error: readTransportErrorCode(result.body) ?? "login_failed",
      memberships,
    };
  }

  const session = presentCloudSession(result.body);
  if (!session.user || !session.organization) {
    return { ok: false, error: "login_failed", memberships: session.memberships };
  }

  return {
    ok: true,
    session: {
      ...session,
      mode: "cloud",
      authConfigured: true,
    },
  };
}

export function presentCloudOrganizationSwitchResult(
  result: JsonResult,
): CloudLoginPresentation {
  return presentCloudLoginResult(result);
}
