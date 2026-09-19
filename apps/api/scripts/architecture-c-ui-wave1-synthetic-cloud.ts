import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { openProvisionedControlPlane, provisionNewOrganization } from "../src/cloud/provision.js";
import { createRuntimeRegistry } from "../src/cloud/runtimeRegistry.js";

const EMAIL = "owner.wave1@example.test";
const ORG_NAME = "Atelier Demo";
const LEGAL_NAME =
  "Societatea Comercială Demonstrativă pentru Nume Legal Foarte Lung S.R.L.";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const cloudRoot = requiredEnv("WORKOS_WAVE1_CLOUD_ROOT");
  const password = requiredEnv("WORKOS_WAVE1_CLOUD_PASSWORD");
  mkdirSync(cloudRoot, { recursive: true });
  const marker = join(cloudRoot, "wave1-provisioned.json");
  if (!existsSync(marker)) {
    await provisionNewOrganization({
      cloudRoot,
      displayName: ORG_NAME,
      email: EMAIL,
      password,
      bootstrapPolicy: "SYNTHETIC_TEST",
    });
    const controlPlane = openProvisionedControlPlane(cloudRoot);
    const registry = createRuntimeRegistry();
    const app = createApp({ cloud: { controlPlane, registry } });
    try {
      const login = await app.request("/api/cloud/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: EMAIL, password }),
      });
      if (!login.ok) {
        throw new Error("synthetic_cloud_login_failed");
      }
      const cookie = login.headers
        .getSetCookie()
        .find((item) => item.startsWith("workos_cloud_session="))
        ?.split(";", 1)[0];
      if (!cookie) {
        throw new Error("synthetic_cloud_cookie_missing");
      }
      const seller = await app.request("/api/seller", {
        method: "PATCH",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ legalName: LEGAL_NAME }),
      });
      if (!seller.ok) {
        throw new Error("synthetic_seller_legal_name_failed");
      }
    } finally {
      registry.closeAll();
      controlPlane.close();
    }
    writeFileSync(
      marker,
      JSON.stringify({
        organization: ORG_NAME,
        email: EMAIL,
        legalNameSeeded: true,
        provisioned: true,
      }),
    );
  }
  writeFileSync(
    join(cloudRoot, "owner-auth.txt"),
    [
      "SYNTHETIC Cloud fixture. Do not commit. Do not use real accounts.",
      `email=${EMAIL}`,
      `password=${password}`,
      `organization=${ORG_NAME}`,
      `legalName=${LEGAL_NAME}`,
    ].join("\n"),
    { encoding: "utf8" },
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "wave1_cloud_failed"}\n`);
  process.exitCode = 1;
});
