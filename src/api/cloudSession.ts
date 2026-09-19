import {
  presentCloudLoginResult,
  presentCloudOrganizationSwitchResult,
  presentCloudSession,
  type CloudLoginPresentation,
  type CloudSessionPresentation,
} from "../adapters/cloudSessionAdapter";
import { sendJson } from "./http";

export async function fetchCloudSession(): Promise<CloudSessionPresentation> {
  const result = await sendJson("GET", "/api/cloud/session");
  if (!result.ok) {
    throw new Error("cloud_session_unavailable");
  }
  return presentCloudSession(result.body);
}

export async function loginCloud(
  email: string,
  password: string,
  organizationId?: string,
): Promise<CloudLoginPresentation> {
  return presentCloudLoginResult(
    await sendJson("POST", "/api/cloud/login", {
      email,
      password,
      ...(organizationId ? { organizationId } : {}),
    }),
  );
}

export async function logoutCloud(): Promise<void> {
  const result = await sendJson("POST", "/api/cloud/logout");
  if (!result.ok) {
    throw new Error("cloud_logout_failed");
  }
}

export async function switchCloudOrganization(
  organizationId: string,
): Promise<CloudLoginPresentation> {
  return presentCloudOrganizationSwitchResult(
    await sendJson("POST", "/api/cloud/active-organization", { organizationId }),
  );
}
