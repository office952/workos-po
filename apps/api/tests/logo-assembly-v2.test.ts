import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  INSPECT_FINISHED_ASSEMBLY_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSPECT_FINISHED_LOGO_ID,
  LOGO_PRODUCT_CODE,
  MOUNT_LETTERS_ON_PANEL_ID,
  MOUNT_LOGO_ON_PANEL_ID,
  PACK_PRODUCT_ID,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";

const logoValues = {
  "root.inscription": "NORD LOGO",
  "face.finish": "none",
  "face.confirmedAreaMm2": 180000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 8400,
};

const lettersValues = {
  "root.inscription": "LITERE",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function catalogCodes(body: Record<string, unknown>): string[] {
  const tree = body.tree;
  if (!Array.isArray(tree)) {
    return [];
  }
  return tree.flatMap((node) => walk(node));
}

function walk(node: unknown): string[] {
  if (typeof node !== "object" || node === null) {
    return [];
  }
  const record = node as { kind?: unknown; code?: unknown; children?: unknown };
  if (record.kind === "product" && typeof record.code === "string") {
    return [record.code];
  }
  return Array.isArray(record.children) ? record.children.flatMap((child) => walk(child)) : [];
}

async function saveProducts(
  app: ReturnType<typeof createApp>,
  enabled: { letters: boolean; acm: boolean; logo: boolean },
) {
  const response = await app.request("/api/admin/product-enablement", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      products: [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: enabled.letters },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: enabled.acm },
        { templateCode: LOGO_PRODUCT_CODE, enabled: enabled.logo },
      ],
    }),
  });
  expect(response.status).toBe(200);
}

async function reviewId(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, unknown>,
) {
  const response = await app.request(`/api/products/${productCode}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
  return (await json(response)).reviewId as string;
}

async function customerAndRequest(app: ReturnType<typeof createApp>, title: string) {
  const customer = await json(
    await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: title }),
    }),
  );
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await json(
    await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId, title, description: "Sintetic" }),
    }),
  );
  return {
    customerId,
    requestId: (request.request as { requestId: string }).requestId,
  };
}

describe("volumetric logo and assembly v2", () => {
  it("keeps logo out of the default catalog and runs a standalone logo lifecycle", async () => {
    const app = createApp();
    const before = catalogCodes(await json(await app.request("/api/product-catalog")));
    expect(before).toEqual([CANONICAL_PRODUCT_CODE, ACM_CASSETTE_NONE_PRODUCT_CODE]);
    const refused = await app.request(`/api/products/${LOGO_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: logoValues }),
    });
    expect(refused.status).toBe(409);

    await saveProducts(app, { letters: true, acm: true, logo: true });
    const catalog = catalogCodes(await json(await app.request("/api/product-catalog")));
    expect(catalog).toContain(LOGO_PRODUCT_CODE);

    const { customerId } = await customerAndRequest(app, "Logo NORD");
    const reviewed = await reviewId(app, LOGO_PRODUCT_CODE, logoValues);
    const quoted = await app.request(`/api/products/${LOGO_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: logoValues, reviewId: reviewed, customerId }),
    });
    expect(quoted.status, await quoted.clone().text()).toBe(200);
    const quoteId = ((await json(quoted)).quoteSnapshot as { quoteSnapshotId: string }).quoteSnapshotId;
    expect((await app.request(`/api/products/${LOGO_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`, { method: "POST" })).status).toBe(200);
    const ordered = await app.request(`/api/products/${LOGO_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`, {
      method: "POST",
    });
    expect(ordered.status).toBe(200);
    const orderId = ((await json(ordered)).orderSnapshot as { orderSnapshotId: string }).orderSnapshotId;
    const released = await app.request(`/api/products/${LOGO_PRODUCT_CODE}/orders/${orderId}/production-release`, {
      method: "POST",
    });
    expect(released.status).toBe(200);
    const snapshotId = ((await json(released)).snapshot as { snapshotId: string }).snapshotId;
    const planned = await app.request(
      `/api/products/${LOGO_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
      { method: "POST" },
    );
    expect(planned.status).toBe(200);
    const plan = (await json(planned)).executionPlan as { tasks: Array<{ processId: string }> };
    expect(plan.tasks.filter((task) => task.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(1);
    expect(plan.tasks.filter((task) => task.processId === PACK_PRODUCT_ID)).toHaveLength(1);
    expect(plan.tasks.some((task) => task.processId === INSPECT_FINISHED_LETTER_ID)).toBe(false);

    const jobs = ((await json(await app.request("/api/jobs"))).overview as { jobs: Array<Record<string, unknown>> }).jobs;
    expect(jobs.filter((job) => job.kind === "PRODUCT")).toHaveLength(1);
    expect(jobs[0]?.productLabel).toContain("Logo");
    const planning = await app.request(`/api/jobs/${encodeURIComponent(orderId)}/planning`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priority: "URGENT", targetDate: "2026-10-01" }),
    });
    expect(planning.status).toBe(200);
    const job = (await json(planning)).job as { priority: string; targetDate: string };
    expect(job.priority).toBe("URGENT");
    expect(job.targetDate).toBe("2026-10-01");

    await saveProducts(app, { letters: true, acm: true, logo: false });
    const historical = await app.request(`/api/products/${LOGO_PRODUCT_CODE}/quote-snapshots/${quoteId}`);
    expect(historical.status).toBe(200);
    const blocked = await app.request(`/api/products/${LOGO_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: logoValues }),
    });
    expect(blocked.status).toBe(409);
  });

  it("runs assembly v2 with logo only and with letters", async () => {
    const app = createApp();
    await saveProducts(app, { letters: false, acm: true, logo: true });
    const offering = await json(await app.request("/api/assemblies/offering"));
    expect(offering.available).toBe(false);
    const offerings = offering.offerings as Array<{ kind: string; available: boolean }>;
    expect(offerings.find((item) => item.kind === "SIGN_ASSEMBLY_ACM_LETTERS_V1")?.available).toBe(false);
    expect(offerings.find((item) => item.kind === SIGN_ASSEMBLY_ACM_SIGNAGE_V2)?.available).toBe(true);

    const context = await customerAndRequest(app, "ACM + logo");
    const created = await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: context.requestId, kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2 }),
    });
    expect(created.status).toBe(201);
    const opened = (await json(created)).assembly as {
      assemblyId: string;
      label: string;
      scopes: Array<{ id: string }>;
    };
    const assemblyId = opened.assemblyId;
    expect(opened.label).toBe("Panou ACM + logo volumetric");
    expect(opened.scopes.map((item) => item.id)).not.toContain("letters");

    await attach(app, assemblyId, "SUPPORT_PANEL", ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    await attach(app, assemblyId, "SIGNAGE_LOGO", LOGO_PRODUCT_CODE, logoValues);
    const logoOnly = await finishAssembly(app, assemblyId);
    expect(logoOnly.filter((item) => item.processId === MOUNT_LOGO_ON_PANEL_ID)).toHaveLength(1);
    expect(logoOnly.filter((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(0);
    expect(logoOnly.filter((item) => item.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(0);
    expect(logoOnly.filter((item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    expect(logoOnly.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);

    await saveProducts(app, { letters: true, acm: true, logo: true });
    const fullContext = await customerAndRequest(app, "ACM + litere + logo");
    const fullCreated = await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId: fullContext.requestId, kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2 }),
    });
    expect(fullCreated.status).toBe(201);
    const fullOpened = (await json(fullCreated)).assembly as {
      assemblyId: string;
      scopes: Array<{ id: string }>;
    };
    const fullId = fullOpened.assemblyId;
    expect(fullOpened.scopes.map((item) => item.id)).toContain("letters");
    await attach(app, fullId, "SUPPORT_PANEL", ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    await attach(app, fullId, "SIGNAGE_LOGO", LOGO_PRODUCT_CODE, logoValues);
    await attach(app, fullId, "SIGNAGE_LETTERS", CANONICAL_PRODUCT_CODE, lettersValues);
    const full = await finishAssembly(app, fullId);
    expect(full.filter((item) => item.processId === MOUNT_LOGO_ON_PANEL_ID)).toHaveLength(1);
    expect(full.filter((item) => item.processId === MOUNT_LETTERS_ON_PANEL_ID)).toHaveLength(1);
    expect(full.filter((item) => item.processId === INSPECT_FINISHED_LETTER_ID)).toHaveLength(0);
    expect(full.filter((item) => item.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(0);
    expect(full.filter((item) => item.processId === INSPECT_FINISHED_ASSEMBLY_ID)).toHaveLength(1);
    expect(full.filter((item) => item.processId === PACK_PRODUCT_ID)).toHaveLength(1);

    const jobs = ((await json(await app.request("/api/jobs"))).overview as {
      jobs: Array<{ kind: string; memberLabels: string[] }>;
    }).jobs;
    const assemblies = jobs.filter((job) => job.kind === "ASSEMBLY");
    expect(assemblies).toHaveLength(2);
    expect(assemblies.some((job) => job.memberLabels.includes("Logo") && job.memberLabels.includes("Panou ACM"))).toBe(
      true,
    );
    expect(assemblies.some((job) => job.memberLabels.includes("Litere volumetrice"))).toBe(true);
  });
});

async function attach(
  app: ReturnType<typeof createApp>,
  assemblyId: string,
  role: string,
  productCode: string,
  values: Record<string, unknown>,
) {
  const reviewed = await reviewId(app, productCode, values);
  const response = await app.request(`/api/assemblies/${assemblyId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, values, reviewId: reviewed }),
  });
  expect(response.status, await response.clone().text()).toBe(200);
}

async function finishAssembly(app: ReturnType<typeof createApp>, assemblyId: string) {
  expect((await app.request(`/api/assemblies/${assemblyId}/confirm`, { method: "POST" })).status).toBe(200);
  expect((await app.request(`/api/assemblies/${assemblyId}/quote`, { method: "POST" })).status).toBe(200);
  expect((await app.request(`/api/assemblies/${assemblyId}/accept`, { method: "POST" })).status).toBe(200);
  expect((await app.request(`/api/assemblies/${assemblyId}/production`, { method: "POST" })).status).toBe(200);
  const planned = await app.request(`/api/assemblies/${assemblyId}/execution-plan`, { method: "POST" });
  expect(planned.status, await planned.clone().text()).toBe(200);
  const assembly = (await json(await app.request(`/api/assemblies/${assemblyId}`))).assembly as {
    executionPlanId: string;
  };
  const plan = await json(await app.request(`/api/execution-plans/${encodeURIComponent(assembly.executionPlanId)}`));
  const tasks = (plan.executionPlan as { tasks: Array<{ processId: string; scopeLabel: string }> } | undefined)?.tasks
    ?? (plan.tasks as Array<{ processId: string; scopeLabel: string }> | undefined)
    ?? [];
  return tasks;
}
