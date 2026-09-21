import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_CASSETTE_NONE_READY_VALUES,
  CANONICAL_PRODUCT_CODE,
  CODE_DEFAULT_ENABLEMENT_GUIDANCE,
  PRODUCT_NOT_ENABLED_FOR_NEW_WORK,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temps: string[] = [];

afterEach(() => {
  cleanupCloudTemps();
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-pe-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function catalogCodes(body: JsonObject): string[] {
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

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const unknownProductCode = "PRD-NOT-A-SHARED-SKU";

function bothProducts(enabledLetters: boolean, enabledAcm: boolean) {
  return [
    { templateCode: CANONICAL_PRODUCT_CODE, enabled: enabledLetters },
    { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: enabledAcm },
  ];
}

async function saveEnablement(
  app: ReturnType<typeof createApp>,
  products: ReturnType<typeof bothProducts>,
  headers: Record<string, string> = {},
) {
  return app.request("/api/admin/product-enablement", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ products }),
  });
}

async function expectProductNotEnabled(response: Response): Promise<void> {
  expect(response.status).toBe(409);
  expect((await readBody(response)).error).toBe(PRODUCT_NOT_ENABLED_FOR_NEW_WORK);
}

async function expectUnknownProduct(response: Response): Promise<void> {
  expect(response.status).toBe(404);
  expect((await readBody(response)).error).toBe("not_found");
}

describe("product enablement admin", () => {
  it("creates the table without rows and defaults both shared products on", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM organization_product_enablement_versions")
      .get() as { count: number };
    expect(count.count).toBe(0);
    db.close();
  });

  it("defaults the new-work catalog to the frozen V1 pair", async () => {
    const app = createApp();
    const listed = await readBody(await app.request("/api/admin/product-enablement"));
    expect(listed.resolutionOk).toBe(true);
    expect(listed.source).toBe("CODE_DEFAULT");
    expect(listed.canEdit).toBe(true);
    expect(listed.guidance).toBe(CODE_DEFAULT_ENABLEMENT_GUIDANCE);
    const products = listed.products as JsonObject[];
    expect(products.map((item) => item.templateCode)).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
    expect(products.every((item) => item.enabled === true)).toBe(true);
    const catalog = await readBody(await app.request("/api/product-catalog"));
    expect(catalogCodes(catalog)).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
  });

  it("keeps a frozen historical lineage operable after the product is disabled", async () => {
    const app = createApp();
    const customer = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client enablement" }),
    });
    const customerId = ((await readBody(customer)).customer as JsonObject).customerId as string;
    const preview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: lettersValues }),
      }),
    );
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: lettersValues,
        reviewId: preview.reviewId,
        customerId,
      }),
    });
    expect(frozen.status).toBe(200);
    const quoteSnapshotId = ((await readBody(frozen)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;

    const saved = await saveEnablement(app, bothProducts(false, true));
    expect(saved.status).toBe(200);
    expect((await readBody(saved)).activeVersion).toBe(1);

    const catalog = await readBody(await app.request("/api/product-catalog"));
    expect(catalogCodes(catalog)).toEqual([ACM_CASSETTE_NONE_PRODUCT_CODE]);

    const historical = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}`,
    );
    expect(historical.status).toBe(200);

    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    expect(accepted.status).toBe(200);
    expect((await readBody(accepted)).created).toBe(true);

    const ordered = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/order`,
      { method: "POST" },
    );
    expect(ordered.status).toBe(200);
    const order = (await readBody(ordered)).orderSnapshot as JsonObject;
    const orderSnapshotId = order.orderSnapshotId as string;

    const released = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderSnapshotId}/production-release`,
      { method: "POST" },
    );
    expect(released.status).toBe(200);
    const snapshotId = ((await readBody(released)).snapshot as JsonObject).snapshotId as string;

    const planned = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
      { method: "POST" },
    );
    expect(planned.status).toBe(200);
    const plan = ((await readBody(planned)).executionPlan as JsonObject).plan as JsonObject;

    const planRead = await app.request(`/api/execution-plans/${plan.planId as string}`);
    expect(planRead.status).toBe(200);

    const reenabled = await saveEnablement(app, bothProducts(true, true));
    expect(reenabled.status).toBe(200);
    const openAgain = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: lettersValues }),
    });
    expect(openAgain.status).toBe(200);
  });

  it("rejects every new-work surface for a disabled known SKU", async () => {
    const app = createApp();
    const saved = await saveEnablement(app, bothProducts(true, false));
    expect(saved.status).toBe(200);

    const json = {
      method: "POST" as const,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: ACM_CASSETTE_NONE_READY_VALUES }),
    };

    await expectProductNotEnabled(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}`),
    );
    await expectProductNotEnabled(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/process-composition`),
    );
    await expectProductNotEnabled(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/compile`, json),
    );
    await expectProductNotEnabled(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/preview`, json),
    );
    await expectProductNotEnabled(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, json),
    );
    await expectProductNotEnabled(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/quote-snapshots`, json),
    );
    await expectProductNotEnabled(
      await app.request(
        `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/accepted-production-snapshot`,
        json,
      ),
    );
  });

  it("keeps unknown products as present-then-404, not enablement failure", async () => {
    const app = createApp();
    const json = {
      method: "POST" as const,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: lettersValues }),
    };

    await expectUnknownProduct(await app.request(`/api/products/${unknownProductCode}`));
    await expectUnknownProduct(
      await app.request(`/api/products/${unknownProductCode}/process-composition`),
    );
    await expectUnknownProduct(await app.request(`/api/products/${unknownProductCode}/compile`, json));
    await expectUnknownProduct(await app.request(`/api/products/${unknownProductCode}/preview`, json));
    await expectUnknownProduct(await app.request(`/api/products/${unknownProductCode}/confirm`, json));
    await expectUnknownProduct(
      await app.request(`/api/products/${unknownProductCode}/quote-snapshots`, json),
    );
    await expectUnknownProduct(
      await app.request(`/api/products/${unknownProductCode}/accepted-production-snapshot`, json),
    );
  });

  it("applies the first organization save once and increments only on change", async () => {
    const app = createApp();
    const first = await saveEnablement(app, bothProducts(true, false));
    expect(first.status).toBe(200);
    const firstBody = await readBody(first);
    expect(firstBody.alreadyApplied).toBe(false);
    expect(firstBody.activeVersion).toBe(1);
    expect((firstBody.history as JsonObject[]).length).toBe(1);

    const same = await saveEnablement(app, bothProducts(true, false));
    expect(same.status).toBe(200);
    const sameBody = await readBody(same);
    expect(sameBody.alreadyApplied).toBe(true);
    expect(sameBody.activeVersion).toBe(1);
    expect((sameBody.history as JsonObject[]).length).toBe(1);

    const changed = await saveEnablement(app, bothProducts(true, true));
    expect(changed.status).toBe(200);
    const changedBody = await readBody(changed);
    expect(changedBody.alreadyApplied).toBe(false);
    expect(changedBody.activeVersion).toBe(2);
    expect((changedBody.history as JsonObject[]).length).toBe(2);
  });

  it("isolates organization product selection on synthetic Cloud", async () => {
    const fixtureA = createCloudFixture();
    const fixtureB = createCloudFixture();
    const orgA = await addOrganization(fixtureA, "Org A enablement");
    const orgB = await addOrganization(fixtureB, "Org B enablement");
    await addUser(fixtureA, {
      email: "owner-a@test",
      password: OWNER_PASSWORD,
      organizationId: orgA.organization.organizationId,
      role: "owner",
    });
    await addUser(fixtureB, {
      email: "owner-b@test",
      password: OWNER_PASSWORD,
      organizationId: orgB.organization.organizationId,
      role: "owner",
    });
    const ownerA = await loginCloud(
      fixtureA.app,
      "owner-a@test",
      OWNER_PASSWORD,
      orgA.organization.organizationId,
    );
    const ownerB = await loginCloud(
      fixtureB.app,
      "owner-b@test",
      OWNER_PASSWORD,
      orgB.organization.organizationId,
    );
    const cookieA = { cookie: ownerA.cookie ?? "" };
    const cookieB = { cookie: ownerB.cookie ?? "" };

    const disabledA = await saveEnablement(fixtureA.app, bothProducts(true, false), cookieA);
    expect(disabledA.status).toBe(200);

    const catalogA = catalogCodes(
      await readBody(await fixtureA.app.request("/api/product-catalog", { headers: cookieA })),
    );
    const catalogB = catalogCodes(
      await readBody(await fixtureB.app.request("/api/product-catalog", { headers: cookieB })),
    );
    expect(catalogA).toEqual([CANONICAL_PRODUCT_CODE]);
    expect(catalogB).toEqual([CANONICAL_PRODUCT_CODE, ACM_CASSETTE_NONE_PRODUCT_CODE]);

    const adminA = await readBody(
      await fixtureA.app.request("/api/admin/product-enablement", { headers: cookieA }),
    );
    const adminB = await readBody(
      await fixtureB.app.request("/api/admin/product-enablement", { headers: cookieB }),
    );
    const productsA = adminA.products as JsonObject[];
    const productsB = adminB.products as JsonObject[];
    expect(adminA.source).toBe("ORGANIZATION");
    expect(productsA.find((item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE)?.enabled).toBe(
      false,
    );
    expect(adminB.source).toBe("CODE_DEFAULT");
    expect(productsB.find((item) => item.templateCode === ACM_CASSETTE_NONE_PRODUCT_CODE)?.enabled).toBe(
      true,
    );

    const changedA = await saveEnablement(fixtureA.app, bothProducts(false, false), cookieA);
    expect(changedA.status).toBe(200);
    const catalogBAfter = catalogCodes(
      await readBody(await fixtureB.app.request("/api/product-catalog", { headers: cookieB })),
    );
    const adminBAfter = await readBody(
      await fixtureB.app.request("/api/admin/product-enablement", { headers: cookieB }),
    );
    expect(catalogBAfter).toEqual([CANONICAL_PRODUCT_CODE, ACM_CASSETTE_NONE_PRODUCT_CODE]);
    expect(adminBAfter.source).toBe("CODE_DEFAULT");
    fixtureA.close();
    fixtureB.close();
  });

  it("rejects unknown templates and lets members read but not write", async () => {
    const app = createApp();
    const invalid = await saveEnablement(app, [
      { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
      { templateCode: unknownProductCode, enabled: true },
    ]);
    expect(invalid.status).toBe(400);

    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Org enablement");
    await addUser(fixture, {
      email: "owner-pe@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-pe@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const member = await loginCloud(
      fixture.app,
      "member-pe@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const memberGet = await readBody(
      await fixture.app.request("/api/admin/product-enablement", {
        headers: { cookie: member.cookie ?? "" },
      }),
    );
    expect(memberGet.canEdit).toBe(false);
    const memberPost = await saveEnablement(fixture.app, bothProducts(true, false), {
      cookie: member.cookie ?? "",
    });
    expect(memberPost.status).toBe(403);

    const owner = await loginCloud(
      fixture.app,
      "owner-pe@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const ownerSave = await saveEnablement(fixture.app, bothProducts(true, false), {
      cookie: owner.cookie ?? "",
    });
    expect(ownerSave.status).toBe(200);
    fixture.close();
  });
});
