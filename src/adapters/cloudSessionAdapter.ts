import { readTransportErrorCode, type JsonResult } from "../api/http";
import type { CloudAccessMode, CloudMembershipRole } from "../api/types";
import { asRecord, asString } from "./record";

export type CloudUserPresentation = {
  email: string;
};

export type CloudOrganizationPresentation = {
  organizationId: string;
  displayName: string;
};

export type CloudMembershipPresentation = {
  organizationId: string;
  displayName: string;
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
  return value === "owner" || value === "member" ? value : null;
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
  return { organizationId, displayName };
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
    return [{ organizationId, displayName }];
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
