import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app.js";
import { provisionNewOrganization } from "../src/cloud/provision.js";
import { openProvisionedControlPlane } from "../src/cloud/provision.js";
import { createRuntimeRegistry } from "../src/cloud/runtimeRegistry.js";

const EMAIL = "owner.wave3@example.test";
const ORG_NAME = "Atelier Sintetic";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function main(): Promise<void> {
  const cloudRoot = requiredEnv("WORKOS_WAVE3_CLOUD_ROOT");
  const password = requiredEnv("WORKOS_WAVE3_CLOUD_PASSWORD");
  mkdirSync(cloudRoot, { recursive: true });
  const marker = join(cloudRoot, "wave3-provisioned.json");
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
      const headers = {
        cookie,
        "content-type": "application/json",
      };
      const pin = process.env.WORKOS_WAVE3_OPERATOR_PIN?.trim();
      if (pin) {
        await seedPerson(app, headers, "Operator eligibil", pin, true);
        await seedPerson(app, headers, "Operator neeligibil", pin, false);
      }
      const planId = await seedBlockedJob(app, headers);
      if (planId) {
        writeFileSync(join(cloudRoot, "seeded-plan.txt"), planId, { encoding: "utf8" });
      }
    } finally {
      registry.closeAll();
      controlPlane.close();
    }
    writeFileSync(
      marker,
      JSON.stringify({ organization: ORG_NAME, email: EMAIL, provisioned: true }),
    );
  }
  writeFileSync(
    join(cloudRoot, "owner-auth.txt"),
    [
      "SYNTHETIC Cloud fixture. Do not commit. Do not use real accounts.",
      `email=${EMAIL}`,
      `password=${password}`,
      process.env.WORKOS_WAVE3_OPERATOR_PIN
        ? `operatorPin=${process.env.WORKOS_WAVE3_OPERATOR_PIN}`
        : "operatorPin=not-configured",
      existsSync(join(cloudRoot, "seeded-plan.txt"))
        ? "seededPlan=present"
        : "seededPlan=missing",
      "Identify operators from Atelier after Cloud login.",
    ].join("\n"),
    { encoding: "utf8" },
  );
}

async function seedPerson(
  app: ReturnType<typeof createApp>,
  headers: { cookie: string; "content-type": string },
  displayName: string,
  pin: string,
  assignSkills: boolean,
): Promise<void> {
  const created = await app.request("/api/people", {
    method: "POST",
    headers,
    body: JSON.stringify({ displayName }),
  });
  if (!created.ok) {
    return;
  }
  const body = (await created.json()) as { person?: { personId?: string } };
  const personId = body.person?.personId;
  if (!personId) {
    return;
  }
  await app.request(`/api/people/${encodeURIComponent(personId)}/operator-pin`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ pin, confirmPin: pin }),
  });
  if (!assignSkills) {
    return;
  }
  const listed = await app.request("/api/people/skills", { headers });
  const skills = ((await listed.json()) as { skills?: Array<{ skillId: string; code: string }> })
    .skills ?? [];
  for (const code of [
    "SK_CNC_OPERATOR",
    "SK_LETTER_CANT_OPERATOR",
    "SK_ASSEMBLY",
    "SK_VINYL_APPLICATOR",
    "SK_ELECTRICIAN",
  ]) {
    const skill = skills.find((item) => item.code === code);
    if (!skill) {
      continue;
    }
    await app.request(`/api/people/${encodeURIComponent(personId)}/skills`, {
      method: "POST",
      headers,
      body: JSON.stringify({ skillId: skill.skillId }),
    });
  }
}

async function seedBlockedJob(
  app: ReturnType<typeof createApp>,
  headers: { cookie: string; "content-type": string },
): Promise<string | null> {
  const productCode = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";
  await app.request("/api/seller", {
    method: "PATCH",
    headers,
    body: JSON.stringify({ legalName: "Atelier Sintetic SRL" }),
  });
  const compiled = await app.request(`/api/products/${productCode}/compile`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      values: {
        "root.inscription": "W3-CLOUD",
        "face.finish": "none",
        "face.confirmedAreaMm2": 250000,
        "volume.depthMm": "60",
        "volume.finish": "none",
        "volume.confirmedPerimeterMm": 12500,
      },
    }),
  });
  if (!compiled.ok) {
    return null;
  }
  const compiledBody = (await compiled.json()) as {
    definition?: unknown;
    reviewId?: string;
  };
  const customer = await app.request("/api/customers", {
    method: "POST",
    headers,
    body: JSON.stringify({ displayName: "Client sintetic W3" }),
  });
  if (!customer.ok) {
    return null;
  }
  const customerId = ((await customer.json()) as { customer?: { customerId?: string } }).customer
    ?.customerId;
  const quote = await app.request(`/api/products/${productCode}/quote-snapshots`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      definition: compiledBody.definition,
      reviewId: compiledBody.reviewId,
      customerId,
    }),
  });
  if (!quote.ok) {
    return null;
  }
  const quoteId = ((await quote.json()) as { quoteSnapshot?: { quoteSnapshotId?: string } })
    .quoteSnapshot?.quoteSnapshotId;
  if (!quoteId) {
    return null;
  }
  await app.request(`/api/products/${productCode}/quote-snapshots/${quoteId}/acceptance`, {
    method: "POST",
    headers,
  });
  const order = await app.request(`/api/products/${productCode}/quote-snapshots/${quoteId}/order`, {
    method: "POST",
    headers,
  });
  if (!order.ok) {
    return null;
  }
  const orderSnapshot = ((await order.json()) as { orderSnapshot?: { orderSnapshotId?: string } })
    .orderSnapshot;
  if (!orderSnapshot?.orderSnapshotId) {
    return null;
  }
  const released = await app.request(
    `/api/products/${productCode}/orders/${orderSnapshot.orderSnapshotId}/production-release`,
    { method: "POST", headers },
  );
  if (!released.ok) {
    return null;
  }
  const snapshotId = ((await released.json()) as { snapshot?: { snapshotId?: string } }).snapshot
    ?.snapshotId;
  if (!snapshotId) {
    return null;
  }
  const plan = await app.request(
    `/api/products/${productCode}/accepted-production-snapshots/${snapshotId}/execution-plan`,
    { method: "POST", headers },
  );
  if (!plan.ok) {
    return null;
  }
  return (
    ((await plan.json()) as { executionPlan?: { plan?: { planId?: string } } }).executionPlan?.plan
      ?.planId ?? null
  );
}

void main();
