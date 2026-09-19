import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { CLOUD_SESSION_COOKIE } from "../src/cloud/controlPlane.js";
import {
  openProvisionedControlPlane,
  provisionCloudUser,
  provisionMembership,
  provisionOrganizationWithPlane,
} from "../src/cloud/provision.js";
import { createRuntimeRegistry } from "../src/cloud/runtimeRegistry.js";
import type { BootstrapPolicy, ControlPlane, MembershipRole } from "../src/cloud/controlPlane.js";
import type { RuntimeRegistry } from "../src/cloud/runtimeRegistry.js";

export const OWNER_PASSWORD = "OwnerPass12";
export const MEMBER_PASSWORD = "MemberPass12";

export type CloudFixture = {
  cloudRoot: string;
  controlPlane: ControlPlane;
  registry: RuntimeRegistry;
  app: ReturnType<typeof createApp>;
  close(): void;
};

const temps: string[] = [];

export function trackTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-cloud-"));
  temps.push(dir);
  return dir;
}

export function cleanupCloudTemps(): void {
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may briefly keep a handle on a closed SQLite file.
    }
  }
}

export function openCloudFixture(
  cloudRoot: string,
  options: { env?: NodeJS.ProcessEnv } = {},
): CloudFixture {
  const controlPlane = openProvisionedControlPlane(cloudRoot);
  const registry = createRuntimeRegistry();
  const app = createApp({
    cloud: { controlPlane, registry },
    env: options.env,
  });
  return {
    cloudRoot,
    controlPlane,
    registry,
    app,
    close() {
      registry.closeAll();
      controlPlane.close();
    },
  };
}

export function createCloudFixture(options: { env?: NodeJS.ProcessEnv } = {}): CloudFixture {
  return openCloudFixture(trackTempDir(), options);
}

export async function addOrganization(
  fixture: CloudFixture,
  displayName: string,
  bootstrapPolicy: BootstrapPolicy = "SYNTHETIC_TEST",
) {
  return provisionOrganizationWithPlane(fixture.controlPlane, {
    displayName,
    bootstrapPolicy,
  });
}

export async function addUser(
  fixture: CloudFixture,
  input: { email: string; password: string; organizationId: string; role: MembershipRole },
) {
  const user = await provisionCloudUser(fixture.controlPlane, {
    email: input.email,
    password: input.password,
  });
  provisionMembership(fixture.controlPlane, {
    userId: user.userId,
    organizationId: input.organizationId,
    role: input.role,
  });
  if (fixture.controlPlane.countOwnerMemberships(input.organizationId) > 0) {
    const organization = fixture.controlPlane.getOrganization(input.organizationId);
    if (organization && organization.status !== "ACTIVE") {
      fixture.controlPlane.activateOrganization(input.organizationId);
    }
  }
  return user;
}

export function cloudCookie(response: Response): string {
  const cookies = response.headers.getSetCookie();
  const line = cookies.find((item) => item.startsWith(`${CLOUD_SESSION_COOKIE}=`));
  if (!line) {
    throw new Error("missing cloud session cookie");
  }
  return line.split(";", 1)[0] ?? "";
}

export async function loginCloud(
  app: ReturnType<typeof createApp>,
  email: string,
  password: string,
  organizationId?: string,
) {
  const response = await app.request("/api/cloud/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, organizationId }),
  });
  return {
    response,
    cookie: response.status === 200 ? cloudCookie(response) : null,
    body: (await response.json()) as Record<string, unknown>,
  };
}
