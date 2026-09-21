import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { provisionNewOrganization } from "../src/cloud/provision.js";
import { startWorkosApi } from "../src/startApi.js";

const EMAIL = "owner-letters-v1@example.test";
const PASSWORD = "OwnerPass12";
const PORT = process.env.WORKOS_LETTERS_V1_PORT?.trim() || "18787";
const HOST = "127.0.0.1";

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const cloudRoot = mkdtempSync(join(tmpdir(), "workos-letters-v1-saas-"));
  mkdirSync(cloudRoot, { recursive: true });
  const staticRoot = resolve(process.cwd(), "..", "..", "dist");
  const provisioned = await provisionNewOrganization({
    cloudRoot,
    displayName: "Atelier Letters V1",
    email: EMAIL,
    password: PASSWORD,
    bootstrapPolicy: "SYNTHETIC_TEST",
  });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WORKOS_CLOUD_ROOT: cloudRoot,
    WORKOS_STATIC_ROOT: staticRoot,
    PORT,
    HOST,
    NODE_ENV: "development",
  };
  delete env.WORKOS_SQLITE_PATH;

  const started = await startWorkosApi(env, { installSignals: true });
  const origin = `http://${started.hostname}:${started.port}`;

  const login = await fetch(`${origin}/api/cloud/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: EMAIL,
      password: PASSWORD,
      organizationId: provisioned.organization.organizationId,
    }),
  });
  if (login.status !== 200) {
    throw new Error(`login_failed:${login.status}`);
  }
  const cookie = login.headers.getSetCookie()[0]?.split(";", 1)[0] ?? "";
  const headers = { cookie, "content-type": "application/json" };
  const seller = await fetch(`${origin}/api/seller`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ legalName: "Atelier Letters Sintetic SRL" }),
  });
  if (seller.status !== 200) {
    throw new Error(`seller_failed:${seller.status}`);
  }
  const customer = await json(
    await fetch(`${origin}/api/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({ displayName: "Client Letters V1" }),
    }),
  );
  const customerId = (customer.customer as { customerId?: string }).customerId;
  const configuratorPath = `/configurator?product=${encodeURIComponent(CANONICAL_PRODUCT_CODE)}&customer=${encodeURIComponent(customerId ?? "")}`;
  const marker = {
    isolatedSyntheticSaas: true,
    origin,
    email: EMAIL,
    password: PASSWORD,
    organizationId: provisioned.organization.organizationId,
    customerId,
    productCode: CANONICAL_PRODUCT_CODE,
    configuratorUrl: `${origin}${configuratorPath}`,
    cloudRoot,
    staticRoot,
    realHubMedia: false,
  };
  writeFileSync(join(cloudRoot, "letters-v1-runtime.json"), JSON.stringify(marker, null, 2));
  console.log(JSON.stringify(marker, null, 2));
}

await main();
