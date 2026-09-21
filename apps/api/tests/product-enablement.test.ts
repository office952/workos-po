import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
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

describe("product enablement admin", () => {
  it("creates the table without rows and defaults both shared products on", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM organization_product_enablement_versions")
      .get() as { count: number };
    expect(count.count).toBe(0);
    db.close();
  });

  it("defaults the new-work catalog to both shared templates", async () => {
    const app = createApp();
    const listed = await readBody(await app.request("/api/admin/product-enablement"));
    expect(listed.resolutionOk).toBe(true);
    expect(listed.source).toBe("CODE_DEFAULT");
    expect(listed.canEdit).toBe(true);
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

  it("hides a disabled template from new work and keeps historical quotes open", async () => {
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

    const saved = await app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: false },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: true },
        ],
      }),
    });
    expect(saved.status).toBe(200);
    const admin = await readBody(saved);
    expect(admin.source).toBe("ORGANIZATION");
    expect(admin.activeVersion).toBe(1);

    const catalog = await readBody(await app.request("/api/product-catalog"));
    expect(catalogCodes(catalog)).toEqual([ACM_CASSETTE_NONE_PRODUCT_CODE]);

    const blockedPreview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: lettersValues }),
    });
    expect(blockedPreview.status).toBe(409);
    expect((await readBody(blockedPreview)).error).toBe(PRODUCT_NOT_ENABLED_FOR_NEW_WORK);

    const historical = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}`,
    );
    expect(historical.status).toBe(200);

    const reenabled = await app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: true },
        ],
      }),
    });
    expect(reenabled.status).toBe(200);
    const openAgain = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: lettersValues }),
    });
    expect(openAgain.status).toBe(200);
  });

  it("rejects unknown templates and lets members read but not write", async () => {
    const app = createApp();
    const invalid = await app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: "PRD-NOT-SHARED", enabled: true },
        ],
      }),
    });
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
    const memberPost = await fixture.app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: {
        cookie: member.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
        ],
      }),
    });
    expect(memberPost.status).toBe(403);

    const owner = await loginCloud(
      fixture.app,
      "owner-pe@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const ownerSave = await fixture.app.request("/api/admin/product-enablement", {
      method: "POST",
      headers: {
        cookie: owner.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        products: [
          { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
          { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
        ],
      }),
    });
    expect(ownerSave.status).toBe(200);
    fixture.close();
  });
});
