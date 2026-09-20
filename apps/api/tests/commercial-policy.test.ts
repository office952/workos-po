import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { persistCommercialPolicySave } from "../src/commercial/policyStore.js";
import { applyMigrations, openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
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
  const dir = mkdtempSync(join(tmpdir(), "workos-cp-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const vinylValues = {
  ...readyValues,
  "face.finish": "vinyl",
  "face.color": "alb",
};

async function createCustomer(app: ReturnType<typeof createApp>, name = "Client CF1") {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

async function compile(
  app: ReturnType<typeof createApp>,
  values: Record<string, string | number> = readyValues,
) {
  const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  return readBody(response);
}

describe("commercial policy persistence", () => {
  it("creates the table without rows or organization_id", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    applyMigrations(db);
    const count = db
      .prepare("SELECT COUNT(*) AS count FROM commercial_policy_versions")
      .get() as { count: number };
    expect(count.count).toBe(0);
    const columns = db
      .prepare("PRAGMA table_info(commercial_policy_versions)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("organization_id");
    db.close();
  });

  it("rejects a second ACTIVE and keeps the first version", () => {
    const sqlitePath = tempSqlitePath();
    const db = openSqliteDatabase(sqlitePath);
    const first = persistCommercialPolicySave(db, {
      markupPercent: 30,
      vatPercent: 19,
      defaultDiscountPercent: 0,
      defaultAdjustment: 0,
    });
    expect(first.ok).toBe(true);
    expect(() =>
      db.prepare(
        `
        INSERT INTO commercial_policy_versions (
          policy_version_row_id, policy_id, version, status, label,
          markup_percent, vat_percent, default_discount_percent, default_adjustment,
          currency, rounding, source, effective_from, created_at, supersedes_version
        ) VALUES (?, ?, ?, 'ACTIVE', 'x', 31, 21, 0, 0, 'EUR', 0.01, 'ORGANIZATION', ?, ?, 1)
      `,
      ).run("cpv-dup", "DEFAULT_COMMERCIAL_POLICY", 2, "2026-09-20T00:00:00.000Z", "2026-09-20T00:00:00.000Z"),
    ).toThrow();
    const after = db
      .prepare("SELECT COUNT(*) AS count FROM commercial_policy_versions WHERE status = 'ACTIVE'")
      .get() as { count: number };
    expect(after.count).toBe(1);
    db.close();
  });

  it("supersedes version 1 and retains history", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    const first = runtime.saveCommercialPolicy({
      markupPercent: 30,
      vatPercent: 19,
      defaultDiscountPercent: 0,
      defaultAdjustment: 0,
    });
    const second = runtime.saveCommercialPolicy({
      markupPercent: 32,
      vatPercent: 21,
      defaultDiscountPercent: 1,
      defaultAdjustment: 2,
    });
    expect(first.ok && second.ok).toBe(true);
    const history = runtime.listCommercialPolicyVersions();
    expect(history).toHaveLength(2);
    expect(history[0]?.status).toBe("RETIRED");
    expect(history[1]?.status).toBe("ACTIVE");
    expect(history[1]?.supersedesVersion).toBe(1);
    runtime.close();
  });
});

describe("commercial policy API", () => {
  it("shows CODE_DEFAULT before organization save", async () => {
    const app = createApp();
    const response = await app.request("/api/admin/commercial-policy");
    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body.source).toBe("CODE_DEFAULT");
    expect(body.guidance).toMatch(/nu au fost încă confirmate/i);
    expect(body.history).toEqual([]);
  });

  it("saves an organization version and uses it on a new quote", async () => {
    const app = createApp();
    const saved = await app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: 40,
        vatPercent: 19,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    expect(saved.status).toBe(200);
    const savedBody = await readBody(saved);
    expect(savedBody.source).toBe("ORGANIZATION");
    expect(savedBody.activeVersion).toBe(1);

    const compiled = await compile(app);
    const confirmed = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
      }),
    });
    const confirmBody = await readBody(confirmed);
    const price = confirmBody.commercialPrice as JsonObject;
    expect(price.policyVersion).toBe(1);
    expect(price.markupPercent).toBe(40);
    expect(price.vatPercent).toBe(19);
    expect((confirmBody.commercialPolicy as JsonObject).source).toBe("ORGANIZATION");
  });

  it("rejects an invalid POST without creating a version", async () => {
    const app = createApp();
    const response = await app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: -5,
        vatPercent: 21,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    expect(response.status).toBe(400);
    const listed = await readBody(await app.request("/api/admin/commercial-policy"));
    expect(listed.history).toEqual([]);
    expect(listed.source).toBe("CODE_DEFAULT");
  });

  it("freezes old policy provenance and keeps it after a later save", async () => {
    const app = createApp();
    const customerId = await createCustomer(app);
    await app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: 30,
        vatPercent: 21,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    const compiled = await compile(app);
    const firstQuote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        customerId,
      }),
    });
    const first = (await readBody(firstQuote)).quoteSnapshot as JsonObject;
    const firstCommercial = first.commercial as JsonObject;
    expect(firstCommercial.policySource).toBe("ORGANIZATION");
    expect(firstCommercial.policyVersion).toBe(1);
    expect(firstCommercial.markupPercent).toBe(30);

    await app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: 50,
        vatPercent: 19,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    const secondQuote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        customerId,
      }),
    });
    const second = (await readBody(secondQuote)).quoteSnapshot as JsonObject;
    expect((second.commercial as JsonObject).markupPercent).toBe(50);
    expect((second.commercial as JsonObject).policyVersion).toBe(2);

    const reread = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${first.quoteSnapshotId}`,
      ),
    );
    expect(((reread.quoteSnapshot as JsonObject).commercial as JsonObject).markupPercent).toBe(30);
    expect(((reread.quoteSnapshot as JsonObject).commercial as JsonObject).policyVersion).toBe(1);
  });

  it("allows a manual product freeze when cost-plus is unavailable", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client manual");
    const compiled = await compile(app, vinylValues);
    const confirmed = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        manualProductNetPrice: 400,
      }),
    });
    const confirmBody = await readBody(confirmed);
    const price = confirmBody.commercialPrice as JsonObject;
    expect(price.commercialStrategy).toBe("MANUAL_FIXED_PRODUCT");
    expect(price.netPrice).toBe(400);
    expect(price.vatPercent).toBe(21);
    expect((confirmBody.commercialExperience as JsonObject).quoteBlocker).toBeNull();

    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        customerId,
        manualProductNetPrice: 400,
      }),
    });
    expect(frozen.status).toBe(200);
    const snapshot = (await readBody(frozen)).quoteSnapshot as JsonObject;
    expect((snapshot.commercial as JsonObject).commercialStrategy).toBe("MANUAL_FIXED_PRODUCT");
    expect((snapshot.commercial as JsonObject).manualNetPrice).toBe(400);
    expect((snapshot.eic as JsonObject | undefined)?.completeness ?? "PARTIAL").not.toBe("COMPLETE");
  });

  it("blocks freeze when neither calculated nor manual price is valid", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client blocat");
    const compiled = await compile(app, vinylValues);
    const frozen = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
        customerId,
      }),
    });
    expect(frozen.status).toBe(422);
    const body = await readBody(frozen);
    expect(JSON.stringify(body.reasons)).toMatch(/preț comercial valid/i);
  });

  it("rejects unauthorized commercial policy writes in cloud mode", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Org CF1");
    await addUser(fixture, {
      email: "owner-cf1@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-cf1@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const member = await loginCloud(
      fixture.app,
      "member-cf1@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const denied = await fixture.app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { cookie: member.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: 33,
        vatPercent: 21,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    expect(denied.status).toBe(403);

    const owner = await loginCloud(
      fixture.app,
      "owner-cf1@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const allowed = await fixture.app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { cookie: owner.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: 33,
        vatPercent: 21,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    expect(allowed.status).toBe(200);
    fixture.close();
  });

  it("keeps commercial policy data inside the operational plane", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Alpha CF1");
    const beta = await addOrganization(fixture, "Beta CF1");
    await addUser(fixture, {
      email: "owner-alpha@test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "owner-beta@test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    const alphaOwner = await loginCloud(
      fixture.app,
      "owner-alpha@test",
      OWNER_PASSWORD,
      alpha.organization.organizationId,
    );
    await fixture.app.request("/api/admin/commercial-policy", {
      method: "POST",
      headers: { cookie: alphaOwner.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({
        markupPercent: 44,
        vatPercent: 19,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      }),
    });
    const betaOwner = await loginCloud(
      fixture.app,
      "owner-beta@test",
      OWNER_PASSWORD,
      beta.organization.organizationId,
    );
    const betaPolicy = await readBody(
      await fixture.app.request("/api/admin/commercial-policy", {
        headers: { cookie: betaOwner.cookie ?? "" },
      }),
    );
    expect(betaPolicy.source).toBe("CODE_DEFAULT");
    expect(betaPolicy.history).toEqual([]);
    fixture.close();
  });
});
