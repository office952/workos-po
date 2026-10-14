import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  LAB_SITE_INSTALL_ID,
  OWNER_CONFIRMED_SELLER,
  PLEXIGLAS_3MM_OPAL_ID,
  SITE_INSTALLATION_SCOPE_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

type JsonObject = Record<string, unknown>;
type Requester = {
  request: (path: string, init?: RequestInit) => Response | Promise<Response>;
};

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

const readyValues = {
  "root.inscription": "ACK",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const MAT_VINYL_ORACAL_651_ID = "MAT-VINYL-ORACAL-651";
const LAB_VINYL_FACE_ID = "LAB-VINYL-FACE";

const vinylValues = { ...readyValues, "face.finish": "vinyl", "face.color": "alb" };

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function api(app: Requester, cookie = "") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return {
    get: (path: string) => app.request(path, { headers }),
    send: (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}
type Api = ReturnType<typeof api>;

const productPath = `/api/products/${CANONICAL_PRODUCT_CODE}`;

async function preview(client: Api, values: JsonObject, requestId?: string) {
  const response = await client.send("POST", `${productPath}/preview`, {
    values,
    ...(requestId ? { requestId } : {}),
  });
  expect(response.status).toBe(200);
  return (await readBody(response)).reviewId as string;
}

async function confirm(client: Api, values: JsonObject, extra: JsonObject = {}) {
  const reviewId = await preview(client, values, extra.requestId as string | undefined);
  const response = await client.send("POST", `${productPath}/confirm`, {
    values,
    reviewId,
    ...extra,
  });
  expect(response.status).toBe(200);
  const body = await readBody(response);
  return {
    reviewId,
    body,
    disclosure: body.rateAcknowledgement as JsonObject | null,
  };
}

function freeze(
  client: Api,
  values: JsonObject,
  reviewId: string,
  customerId: string,
  extra: JsonObject = {},
) {
  return client.send("POST", `${productPath}/quote-snapshots`, {
    values,
    reviewId,
    customerId,
    ...extra,
  });
}

async function createCustomer(client: Api, displayName = "Client sintetic ACK") {
  const body = await readBody(
    await client.send("POST", "/api/customers", { displayName }),
  );
  return (body.customer as JsonObject).customerId as string;
}

async function quoteCount(client: Api): Promise<number> {
  const overview = (await readBody(await client.get("/api/quotes"))).overview as {
    quotes: unknown[];
  };
  return overview.quotes.length;
}

async function configureSeller(client: Api) {
  const { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank } =
    OWNER_CONFIRMED_SELLER;
  const response = await client.send("PATCH", "/api/seller", {
    legalName,
    brand,
    fiscalId,
    tradeRegister,
    address,
    locality,
    iban,
    bank,
  });
  expect(response.status).toBe(200);
}

async function costEvidenceRows(client: Api): Promise<JsonObject[]> {
  const admin = await readBody(await client.get("/api/resources-admin"));
  return (admin.costEvidence as JsonObject[] | undefined) ?? [];
}

async function confirmAllRates(client: Api) {
  for (const row of await costEvidenceRows(client)) {
    if (typeof row.evidenceRowId !== "string" || typeof row.amount !== "number") {
      continue;
    }
    const written = await client.send(
      "PATCH",
      `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`,
      { amount: row.amount, note: "Confirmat în test sintetic" },
    );
    expect(written.status).toBe(200);
  }
}

async function rateRow(client: Api, resourceId: string): Promise<JsonObject> {
  const row = (await costEvidenceRows(client)).find(
    (item) => item.resourceId === resourceId,
  );
  expect(row).toBeDefined();
  return row as JsonObject;
}

async function cloudOrganization(
  fixture: ReturnType<typeof createCloudFixture>,
  name: string,
  slug: string,
) {
  const org = await addOrganization(fixture, name);
  const organizationId = org.organization.organizationId;
  await addUser(fixture, {
    email: `owner-${slug}@example.test`,
    password: OWNER_PASSWORD,
    organizationId,
    role: "owner",
  });
  await addUser(fixture, {
    email: `member-${slug}@example.test`,
    password: MEMBER_PASSWORD,
    organizationId,
    role: "member",
  });
  const ownerLogin = await loginCloud(
    fixture.app,
    `owner-${slug}@example.test`,
    OWNER_PASSWORD,
    organizationId,
  );
  const memberLogin = await loginCloud(
    fixture.app,
    `member-${slug}@example.test`,
    MEMBER_PASSWORD,
    organizationId,
  );
  const owner = api(fixture.app, ownerLogin.cookie ?? "");
  const member = api(fixture.app, memberLogin.cookie ?? "");
  await configureSeller(owner);
  const customerId = await createCustomer(owner);
  return { org, organizationId, owner, member, customerId };
}

function scopedRates(disclosure: JsonObject | null | undefined): JsonObject[] {
  return (disclosure?.rates as JsonObject[] | undefined) ?? [];
}

const acmPath = `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}`;
const acmValues = {
  "root.inscription": "PANOU ACK",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

async function buildAssembly(client: Api, customerName: string, customerId?: string) {
  const request = await readBody(
    await client.send("POST", "/api/requests", {
      customerId: customerId ?? (await createCustomer(client, customerName)),
      title: "Panou ACM + litere sintetic",
      description: "Ansamblu sintetic pentru tarife neconfirmate.",
    }),
  );
  const requestId = (request.request as JsonObject).requestId as string;
  const created = await client.send("POST", "/api/assemblies", { requestId });
  expect(created.status).toBe(201);
  const assemblyId = ((await readBody(created)).assembly as JsonObject).assemblyId as string;
  const acmReview = (await readBody(
    await client.send("POST", `${acmPath}/preview`, { values: acmValues }),
  )).reviewId;
  const lettersReview = await preview(client, vinylValues);
  for (const member of [
    { role: "SUPPORT_PANEL", values: acmValues, reviewId: acmReview },
    { role: "SIGNAGE_LETTERS", values: vinylValues, reviewId: lettersReview },
  ]) {
    const attached = await client.send("POST", `/api/assemblies/${assemblyId}/members`, member);
    expect(attached.status).toBe(200);
  }
  expect((await client.send("POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  return { assemblyId, requestId };
}

async function assemblyView(client: Api, assemblyId: string): Promise<JsonObject> {
  const response = await client.get(`/api/assemblies/${assemblyId}`);
  expect(response.status).toBe(200);
  return (await readBody(response)).assembly as JsonObject;
}

function quoteAssembly(client: Api, assemblyId: string, rateAcknowledgement?: JsonObject) {
  return client.send(
    "POST",
    `/api/assemblies/${assemblyId}/quote`,
    rateAcknowledgement ? { rateAcknowledgement } : {},
  );
}

describe("unconfirmed rate acknowledgement — standalone product (single plane)", () => {
  it("1. lets a quote on confirmed rates freeze through the normal flow", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const { reviewId, disclosure } = await confirm(client, readyValues);
    expect(disclosure?.status).toBe("NOT_REQUIRED");
    expect(scopedRates(disclosure)).toEqual([]);
    const frozen = await freeze(client, readyValues, reviewId, customerId);
    expect(frozen.status).toBe(200);
    const snapshot = (await readBody(frozen)).quoteSnapshot as JsonObject;
    expect(snapshot.rateAcknowledgement).toBeUndefined();
  });

  it("2–4. discloses unconfirmed rates, refuses freeze without acknowledgement, and records an authorized one", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const { reviewId, disclosure, body } = await confirm(client, vinylValues);
    expect(disclosure).toMatchObject({
      status: "REQUIRED",
      impact: "DRIVES_SELLING_PRICE",
      canAcknowledge: true,
    });
    expect(typeof disclosure?.bindingHash).toBe("string");
    const rates = scopedRates(disclosure);
    expect(rates.map((rate) => rate.resourceId).sort()).toEqual(
      [LAB_VINYL_FACE_ID, MAT_VINYL_ORACAL_651_ID].sort(),
    );
    const vinyl = rates.find((rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID);
    expect(vinyl).toMatchObject({
      label: "Folie Oracal 651",
      sourceLabel: "Evidență legacy",
      reason: "Tarif preluat din evidența veche, neconfirmat",
      amount: 9,
      currency: "EUR",
      unitLabel: "m²",
    });
    expect((body.commercialPrice as JsonObject).completeness).toBe("COMPLETE");
    expect((body.eic as JsonObject).completeness).toBe("COMPLETE");
    expect((body.eic as JsonObject).verificationStatus).toBe("NEEDS_VERIFICATION");

    const before = await quoteCount(client);
    const refused = await freeze(client, vinylValues, reviewId, customerId);
    expect(refused.status).toBe(422);
    const refusedBody = await readBody(refused);
    expect(refusedBody.error).toBe("rate_acknowledgement_required");
    expect(scopedRates(refusedBody.rateAcknowledgement as JsonObject)).toHaveLength(2);
    expect(await quoteCount(client)).toBe(before);

    const accepted = await freeze(client, vinylValues, reviewId, customerId, {
      rateAcknowledgement: {
        bindingHash: disclosure?.bindingHash,
        acknowledgedByUserId: "spoofed-user",
        acknowledgedAt: "1999-01-01T00:00:00.000Z",
      },
    });
    expect(accepted.status).toBe(200);
    const snapshot = (await readBody(accepted)).quoteSnapshot as JsonObject;
    const acknowledgement = snapshot.rateAcknowledgement as JsonObject;
    expect(acknowledgement.acknowledgedByUserId).toBe("local");
    expect(acknowledgement.acknowledgedAt).toBe(snapshot.createdAt);
    expect(acknowledgement.acknowledgedAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(scopedRates(acknowledgement)).toHaveLength(2);
    expect(await quoteCount(client)).toBe(before + 1);
  });

  it("6. invalidates an acknowledgement when the quote preview changes", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const first = await confirm(client, vinylValues, {
      quoteCommercialTerms: { markupPercent: 30, discountPercent: 0, adjustmentAmount: 0 },
    });
    const changedTerms = await freeze(client, vinylValues, first.reviewId, customerId, {
      quoteCommercialTerms: { markupPercent: 35, discountPercent: 0, adjustmentAmount: 0 },
      rateAcknowledgement: { bindingHash: first.disclosure?.bindingHash },
    });
    expect(changedTerms.status).toBe(409);
    expect((await readBody(changedTerms)).error).toBe("rate_acknowledgement_stale");

    const changedValues = { ...vinylValues, "root.inscription": "ACK NOU" };
    const changedReview = await preview(client, changedValues);
    const changedConfiguration = await freeze(client, changedValues, changedReview, customerId, {
      quoteCommercialTerms: { markupPercent: 30, discountPercent: 0, adjustmentAmount: 0 },
      rateAcknowledgement: { bindingHash: first.disclosure?.bindingHash },
    });
    expect(changedConfiguration.status).toBe(409);
  });

  it("7, 19. invalidates an acknowledgement when an organization rate changes before freeze, without confirming rates globally", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const first = await confirm(client, vinylValues);
    const acknowledged = await freeze(client, vinylValues, first.reviewId, customerId, {
      rateAcknowledgement: { bindingHash: first.disclosure?.bindingHash },
    });
    expect(acknowledged.status).toBe(200);
    const vinylRow = await rateRow(client, MAT_VINYL_ORACAL_651_ID);
    expect(vinylRow.classificationLabel).toBe("Default de dezvoltare");
    expect(vinylRow.sourceLabel).toBe("Evidență legacy");

    const second = await confirm(client, { ...vinylValues, "root.inscription": "ACK 2" });
    expect(second.disclosure?.status).toBe("REQUIRED");
    const changed = await client.send(
      "PATCH",
      `/api/resources-admin/cost-evidence/${encodeURIComponent(String(vinylRow.evidenceRowId))}`,
      { amount: 11, note: "Tarif sintetic schimbat între previzualizare și înghețare." },
    );
    expect(changed.status).toBe(200);
    const stale = await freeze(
      client,
      { ...vinylValues, "root.inscription": "ACK 2" },
      second.reviewId,
      customerId,
      { rateAcknowledgement: { bindingHash: second.disclosure?.bindingHash } },
    );
    expect(stale.status).toBe(409);
    const staleBody = await readBody(stale);
    expect(staleBody.error).toBe("rate_acknowledgement_stale");
    const fresh = staleBody.rateAcknowledgement as JsonObject;
    expect(fresh.bindingHash).not.toBe(second.disclosure?.bindingHash);
    expect(scopedRates(fresh).map((rate) => rate.resourceId)).toEqual([LAB_VINYL_FACE_ID]);
  });

  it("9. keeps a missing commercial price a hard block even with an acknowledgement", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const costPlus = await confirm(client, vinylValues);
    const manualMissing = await freeze(client, vinylValues, costPlus.reviewId, customerId, {
      pricingMethod: "MANUAL_FIXED_PRODUCT",
      rateAcknowledgement: { bindingHash: costPlus.disclosure?.bindingHash },
    });
    expect(manualMissing.status).toBe(422);
    expect((await readBody(manualMissing)).error).toBe("incomplete_offer");
  });

  it("10. keeps an invalid pricing result a hard block even with an acknowledgement", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const costPlus = await confirm(client, vinylValues);
    const before = await quoteCount(client);
    const negative = await freeze(client, vinylValues, costPlus.reviewId, customerId, {
      quoteCommercialTerms: { markupPercent: 0, discountPercent: 0, adjustmentAmount: -100000 },
      rateAcknowledgement: { bindingHash: costPlus.disclosure?.bindingHash },
    });
    expect([400, 422]).toContain(negative.status);
    expect(["invalid_quote_terms", "incomplete_offer"]).toContain(
      (await readBody(negative)).error,
    );
    const invalidDiscount = await freeze(client, vinylValues, costPlus.reviewId, customerId, {
      quoteCommercialTerms: { markupPercent: 30, discountPercent: 150, adjustmentAmount: 0 },
      rateAcknowledgement: { bindingHash: costPlus.disclosure?.bindingHash },
    });
    expect(invalidDiscount.status).toBe(400);
    expect(await quoteCount(client)).toBe(before);
  });

  it("12. keeps the manual commercial price contract: disclosure only, no acknowledgement recorded", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const manual = await confirm(client, vinylValues, {
      pricingMethod: "MANUAL_FIXED_PRODUCT",
      manualProductNetPrice: 777,
    });
    expect(manual.disclosure).toMatchObject({
      status: "DISCLOSURE_ONLY",
      impact: "INTERNAL_COST_ONLY",
      canAcknowledge: false,
      bindingHash: null,
    });
    const frozen = await freeze(client, vinylValues, manual.reviewId, customerId, {
      pricingMethod: "MANUAL_FIXED_PRODUCT",
      manualProductNetPrice: 777,
    });
    expect(frozen.status).toBe(200);
    const snapshot = (await readBody(frozen)).quoteSnapshot as JsonObject;
    expect((snapshot.commercial as JsonObject).manualNetPrice).toBe(777);
    expect(snapshot.rateAcknowledgement).toBeUndefined();
  });

  it("16–18. preserves frozen totals through PDF and order, survives rate changes, and is idempotent", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const { reviewId, disclosure } = await confirm(client, vinylValues);
    const acknowledgement = { rateAcknowledgement: { bindingHash: disclosure?.bindingHash } };
    const [first, concurrent] = await Promise.all([
      freeze(client, vinylValues, reviewId, customerId, acknowledgement),
      freeze(client, vinylValues, reviewId, customerId, acknowledgement),
    ]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    const firstBody = await readBody(first);
    const concurrentBody = await readBody(concurrent);
    const snapshot = firstBody.quoteSnapshot as JsonObject;
    expect((concurrentBody.quoteSnapshot as JsonObject).quoteSnapshotId).toBe(
      snapshot.quoteSnapshotId,
    );
    expect([firstBody.created, concurrentBody.created].filter(Boolean)).toHaveLength(1);
    const repeated = await freeze(client, vinylValues, reviewId, customerId, acknowledgement);
    expect((await readBody(repeated)).created).toBe(false);
    const bypass = await freeze(client, vinylValues, reviewId, customerId);
    expect(bypass.status).toBe(422);

    const quoteId = encodeURIComponent(String(snapshot.quoteSnapshotId));
    const grossPrice = (snapshot.commercial as JsonObject).grossPrice;
    const vinylRow = await rateRow(client, MAT_VINYL_ORACAL_651_ID);
    expect(
      (await client.send(
        "PATCH",
        `/api/resources-admin/cost-evidence/${encodeURIComponent(String(vinylRow.evidenceRowId))}`,
        { amount: 20, note: "Tarif curent schimbat după înghețare." },
      )).status,
    ).toBe(200);
    const reread = (await readBody(
      await client.get(`${productPath}/quote-snapshots/${quoteId}`),
    )).quoteSnapshot as JsonObject;
    expect(reread.contentHash).toBe(snapshot.contentHash);
    expect((reread.commercial as JsonObject).grossPrice).toBe(grossPrice);
    expect(reread.rateAcknowledgement).toEqual(snapshot.rateAcknowledgement);
    expect(
      scopedRates(reread.rateAcknowledgement as JsonObject).find(
        (rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID,
      )?.amount,
    ).toBe(9);

    const pdf = await client.get(`${productPath}/quote-snapshots/${quoteId}/document`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    expect(
      (await client.send("POST", `${productPath}/quote-snapshots/${quoteId}/acceptance`)).status,
    ).toBe(200);
    const ordered = await client.send("POST", `${productPath}/quote-snapshots/${quoteId}/order`);
    expect(ordered.status).toBe(200);
    const order = (await readBody(ordered)).orderSnapshot as JsonObject;
    expect((order.commercial as JsonObject).grossPrice).toBe(grossPrice);
  });

  it("treats AI-generated ACM rates as unconfirmed without changing the EIC verification status", async () => {
    const client = api(createApp());
    const customerId = await createCustomer(client);
    const reviewId = (await readBody(
      await client.send("POST", `${acmPath}/preview`, { values: acmValues }),
    )).reviewId as string;
    const confirmed = await client.send("POST", `${acmPath}/confirm`, {
      values: acmValues,
      reviewId,
    });
    expect(confirmed.status).toBe(200);
    const body = await readBody(confirmed);
    const disclosure = body.rateAcknowledgement as JsonObject;
    expect(disclosure).toMatchObject({ status: "REQUIRED", canAcknowledge: true });
    const rates = scopedRates(disclosure);
    expect(rates.length).toBeGreaterThan(0);
    expect(
      rates.every(
        (rate) =>
          rate.sourceLabel === "Decizie AI / default de dezvoltare" &&
          rate.reason === "Valoare generată automat (AI), neconfirmată de owner",
      ),
    ).toBe(true);
    expect((body.eic as JsonObject).verificationStatus).toBe("CONFIRMED");

    const refused = await client.send("POST", `${acmPath}/quote-snapshots`, {
      values: acmValues,
      reviewId,
      customerId,
    });
    expect(refused.status).toBe(422);
    expect((await readBody(refused)).error).toBe("rate_acknowledgement_required");
  });

  it("15. requires an Owner acknowledgement bound to the exact ACM + letters assembly before its quote freezes", async () => {
    const client = api(createApp());
    const { assemblyId } = await buildAssembly(client, "Client ansamblu ACK");
    const pending = await assemblyView(client, assemblyId);
    const requirement = pending.rateAcknowledgement as JsonObject;
    expect(requirement).toMatchObject({
      status: "REQUIRED",
      impact: "DRIVES_SELLING_PRICE",
      canAcknowledge: true,
    });
    expect(typeof requirement.bindingHash).toBe("string");
    const rates = scopedRates(requirement);
    const acmRates = rates.filter((rate) => String(rate.context).startsWith("Panou ACM"));
    expect(acmRates.length).toBeGreaterThan(0);
    expect(
      acmRates.every((rate) => rate.reason === "Valoare generată automat (AI), neconfirmată de owner"),
    ).toBe(true);
    expect(rates.find((rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID)).toMatchObject({
      reason: "Tarif preluat din evidența veche, neconfirmat",
      amount: 9,
    });

    const missing = await quoteAssembly(client, assemblyId);
    expect(missing.status).toBe(422);
    const missingBody = await readBody(missing);
    expect(missingBody.error).toBe("rate_acknowledgement_required");
    expect((missingBody.rateAcknowledgement as JsonObject).bindingHash).toBe(requirement.bindingHash);
    const fabricated = await quoteAssembly(client, assemblyId, { bindingHash: "fabricated" });
    expect(fabricated.status).toBe(409);
    expect((await readBody(fabricated)).error).toBe("rate_acknowledgement_stale");
    expect((await assemblyView(client, assemblyId)).quote).toBeNull();
    expect(await quoteCount(client)).toBe(0);

    const acknowledgement = {
      bindingHash: requirement.bindingHash,
      acknowledgedByUserId: "spoofed-user",
      acknowledgedAt: "1999-01-01T00:00:00.000Z",
    };
    const [first, concurrent] = await Promise.all([
      quoteAssembly(client, assemblyId, acknowledgement),
      quoteAssembly(client, assemblyId, acknowledgement),
    ]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    expect((await quoteAssembly(client, assemblyId, acknowledgement)).status).toBe(200);
    expect(await quoteCount(client)).toBe(1);

    const quoted = await assemblyView(client, assemblyId);
    expect(quoted.rateAcknowledgement).toBeNull();
    const frozen = quoted.frozenRateAcknowledgement as JsonObject;
    expect(frozen.acknowledgedByUserId).toBe("local");
    expect(frozen.acknowledgedAt).not.toBe("1999-01-01T00:00:00.000Z");
    expect(scopedRates(frozen)).toEqual(rates);
  });

  it("15b. keeps assembly totals, PDF and order identical to a quote on confirmed rates and survives later rate changes", async () => {
    const unconfirmed = api(createApp());
    const acknowledged = await buildAssembly(unconfirmed, "Client ansamblu ACK");
    const requirement = (await assemblyView(unconfirmed, acknowledged.assemblyId))
      .rateAcknowledgement as JsonObject;
    expect(
      (await quoteAssembly(unconfirmed, acknowledged.assemblyId, {
        bindingHash: requirement.bindingHash,
      })).status,
    ).toBe(200);

    const confirmedClient = api(createApp());
    await confirmAllRates(confirmedClient);
    const plain = await buildAssembly(confirmedClient, "Client ansamblu ACK");
    expect((await assemblyView(confirmedClient, plain.assemblyId)).rateAcknowledgement).toMatchObject({
      status: "NOT_REQUIRED",
      bindingHash: null,
    });
    expect((await quoteAssembly(confirmedClient, plain.assemblyId)).status).toBe(200);
    const plainView = await assemblyView(confirmedClient, plain.assemblyId);
    expect(plainView.frozenRateAcknowledgement).toBeNull();

    const quote = (await assemblyView(unconfirmed, acknowledged.assemblyId)).quote as JsonObject;
    expect(quote).toEqual(plainView.quote);

    const vinylRow = await rateRow(unconfirmed, MAT_VINYL_ORACAL_651_ID);
    expect(
      (await unconfirmed.send(
        "PATCH",
        `/api/resources-admin/cost-evidence/${encodeURIComponent(String(vinylRow.evidenceRowId))}`,
        { amount: 20, note: "Tarif curent schimbat după înghețare." },
      )).status,
    ).toBe(200);
    const after = await assemblyView(unconfirmed, acknowledged.assemblyId);
    expect(after.quote).toEqual(quote);
    expect(
      scopedRates(after.frozenRateAcknowledgement as JsonObject).find(
        (rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID,
      )?.amount,
    ).toBe(9);

    const registry = (await readBody(await unconfirmed.get("/api/quotes"))).overview as {
      quotes: { quoteSnapshotId: string; kind: string }[];
    };
    const assemblyQuote = registry.quotes.find((item) => item.kind === "ASSEMBLY");
    expect(assemblyQuote).toBeDefined();
    const pdf = await unconfirmed.get(
      `/api/assembly-quotes/${encodeURIComponent(String(assemblyQuote?.quoteSnapshotId))}/document`,
    );
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("application/pdf");
    const accepted = await unconfirmed.send("POST", `/api/assemblies/${acknowledged.assemblyId}/accept`, {
      quoteSnapshotId: (await assemblyView(unconfirmed, acknowledged.assemblyId)).quoteSnapshotId,
    });
    expect(accepted.status).toBe(200);
    expect(((await readBody(accepted)).assembly as JsonObject).orderId).toEqual(expect.any(String));
  });

  it("15c. invalidates an assembly acknowledgement when a member is reconfirmed on a changed rate", async () => {
    const client = api(createApp());
    const { assemblyId } = await buildAssembly(client, "Client ansamblu ACK");
    const first = (await assemblyView(client, assemblyId)).rateAcknowledgement as JsonObject;
    const vinylRow = await rateRow(client, MAT_VINYL_ORACAL_651_ID);
    expect(
      (await client.send(
        "PATCH",
        `/api/resources-admin/cost-evidence/${encodeURIComponent(String(vinylRow.evidenceRowId))}`,
        { amount: 11, note: "Tarif sintetic schimbat înainte de ofertă." },
      )).status,
    ).toBe(200);
    const changedLetters = { ...vinylValues, "root.inscription": "ACK NOU" };
    expect(
      (await client.send("POST", `/api/assemblies/${assemblyId}/members`, {
        role: "SIGNAGE_LETTERS",
        values: changedLetters,
        reviewId: await preview(client, changedLetters),
      })).status,
    ).toBe(200);
    await client.send("POST", `/api/assemblies/${assemblyId}/review`);
    expect((await client.send("POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);

    const stale = await quoteAssembly(client, assemblyId, { bindingHash: first.bindingHash });
    expect(stale.status).toBe(409);
    const fresh = (await readBody(stale)).rateAcknowledgement as JsonObject;
    expect(fresh.bindingHash).not.toBe(first.bindingHash);
    expect(scopedRates(fresh).some((rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID)).toBe(false);
    expect((await quoteAssembly(client, assemblyId, { bindingHash: fresh.bindingHash })).status).toBe(200);
  });
});

describe("unconfirmed rate acknowledgement — SaaS organizations", () => {
  it("5, 8, 20. enforces owner authority, financial scoping and tenancy", async () => {
    const fixture = createCloudFixture();
    const alpha = await cloudOrganization(fixture, "Atelier ACK Alpha", "ack-alpha");
    const beta = await cloudOrganization(fixture, "Atelier ACK Beta", "ack-beta");

    const ownerConfirm = await confirm(alpha.owner, readyValues);
    expect(ownerConfirm.disclosure?.status).toBe("REQUIRED");
    const platformRates = scopedRates(ownerConfirm.disclosure);
    expect(platformRates.length).toBeGreaterThan(0);
    expect(
      platformRates.every(
        (rate) =>
          rate.sourceLabel === "Valoare implicită de platformă" &&
          rate.reason === "Valoare implicită de platformă, neconfirmată de firmă" &&
          typeof rate.amount === "number",
      ),
    ).toBe(true);

    const memberConfirm = await confirm(alpha.member, readyValues);
    expect(memberConfirm.disclosure?.status).toBe("REQUIRED");
    expect(memberConfirm.disclosure?.canAcknowledge).toBe(false);
    expect(memberConfirm.disclosure?.bindingHash).toBeNull();
    expect(JSON.stringify(memberConfirm.body)).not.toContain(
      String(ownerConfirm.disclosure?.bindingHash),
    );
    const memberRates = scopedRates(memberConfirm.disclosure);
    expect(memberRates.length).toBe(platformRates.length);
    expect(memberRates.some((rate) => "amount" in rate || "quantity" in rate)).toBe(false);

    const memberRefused = await freeze(
      alpha.member,
      readyValues,
      memberConfirm.reviewId,
      alpha.customerId,
    );
    expect(memberRefused.status).toBe(403);
    const memberRefusedBody = await readBody(memberRefused);
    expect(memberRefusedBody.error).toBe("rate_acknowledgement_forbidden");
    expect((memberRefusedBody.rateAcknowledgement as JsonObject).bindingHash).toBeNull();
    const memberWithHash = await freeze(
      alpha.member,
      readyValues,
      memberConfirm.reviewId,
      alpha.customerId,
      { rateAcknowledgement: { bindingHash: ownerConfirm.disclosure?.bindingHash } },
    );
    expect(memberWithHash.status).toBe(403);
    expect(await quoteCount(alpha.owner)).toBe(0);

    const betaConfirm = await confirm(beta.owner, readyValues);
    expect(betaConfirm.disclosure?.bindingHash).not.toBe(ownerConfirm.disclosure?.bindingHash);
    const crossTenant = await freeze(beta.owner, readyValues, betaConfirm.reviewId, beta.customerId, {
      rateAcknowledgement: { bindingHash: ownerConfirm.disclosure?.bindingHash },
    });
    expect(crossTenant.status).toBe(409);
    expect((await readBody(crossTenant)).error).toBe("rate_acknowledgement_stale");

    const acknowledged = await freeze(
      alpha.owner,
      readyValues,
      ownerConfirm.reviewId,
      alpha.customerId,
      { rateAcknowledgement: { bindingHash: ownerConfirm.disclosure?.bindingHash } },
    );
    expect(acknowledged.status).toBe(200);
    const snapshot = (await readBody(acknowledged)).quoteSnapshot as JsonObject;
    const acknowledgement = snapshot.rateAcknowledgement as JsonObject;
    expect(acknowledgement.acknowledgedByUserId).toMatch(/^usr:/);
    const quoteId = encodeURIComponent(String(snapshot.quoteSnapshotId));

    const memberView = (await readBody(
      await alpha.member.get(`${productPath}/quote-snapshots/${quoteId}`),
    )).quoteSnapshot as JsonObject;
    const memberAck = memberView.rateAcknowledgement as JsonObject;
    expect(scopedRates(memberAck).length).toBe(platformRates.length);
    expect(JSON.stringify(memberAck)).not.toMatch(/"amount"|"quantity"|bindingHash/);
    expect((await beta.owner.get(`${productPath}/quote-snapshots/${quoteId}`)).status).toBe(404);
    expect(await quoteCount(beta.owner)).toBe(0);

    const stillUnconfirmed = await rateRow(alpha.owner, PLEXIGLAS_3MM_OPAL_ID);
    expect(stillUnconfirmed.sourceLabel).toBe("Valoare implicită de platformă");
    fixture.close();
  });

  it("assembly: scopes the binding to the Owner, refuses commercial users and isolates tenants", async () => {
    const fixture = createCloudFixture();
    const alpha = await cloudOrganization(fixture, "Atelier ACK Ansamblu A", "ack-asm-alpha");
    const beta = await cloudOrganization(fixture, "Atelier ACK Ansamblu B", "ack-asm-beta");
    const { assemblyId } = await buildAssembly(alpha.owner, "", alpha.customerId);
    const ownerView = (await assemblyView(alpha.owner, assemblyId)).rateAcknowledgement as JsonObject;
    expect(ownerView).toMatchObject({ status: "REQUIRED", canAcknowledge: true });
    expect(typeof ownerView.bindingHash).toBe("string");

    const memberAssembly = await assemblyView(alpha.member, assemblyId);
    const memberView = memberAssembly.rateAcknowledgement as JsonObject;
    expect(memberView).toMatchObject({ status: "REQUIRED", canAcknowledge: false, bindingHash: null });
    expect(scopedRates(memberView)).toHaveLength(scopedRates(ownerView).length);
    expect(JSON.stringify(memberAssembly)).not.toContain(String(ownerView.bindingHash));
    expect(JSON.stringify(memberView)).not.toMatch(/"amount"|"quantity"/);
    const memberQuote = await quoteAssembly(alpha.member, assemblyId, {
      bindingHash: ownerView.bindingHash,
    });
    expect(memberQuote.status).toBe(403);

    expect((await beta.owner.get(`/api/assemblies/${assemblyId}`)).status).toBe(404);
    expect(
      (await quoteAssembly(beta.owner, assemblyId, { bindingHash: ownerView.bindingHash })).status,
    ).not.toBe(200);
    const betaAssembly = await buildAssembly(beta.owner, "", beta.customerId);
    const betaView = (await assemblyView(beta.owner, betaAssembly.assemblyId))
      .rateAcknowledgement as JsonObject;
    expect(betaView.bindingHash).not.toBe(ownerView.bindingHash);
    const crossTenant = await quoteAssembly(beta.owner, betaAssembly.assemblyId, {
      bindingHash: ownerView.bindingHash,
    });
    expect(crossTenant.status).toBe(409);
    expect(await quoteCount(alpha.owner)).toBe(0);
    expect(await quoteCount(beta.owner)).toBe(0);

    const acknowledged = await quoteAssembly(alpha.owner, assemblyId, {
      bindingHash: ownerView.bindingHash,
    });
    expect(acknowledged.status).toBe(200);
    const frozen = (await assemblyView(alpha.owner, assemblyId)).frozenRateAcknowledgement as JsonObject;
    expect(frozen.acknowledgedByUserId).toMatch(/^usr:/);
    const memberFrozen = (await assemblyView(alpha.member, assemblyId))
      .frozenRateAcknowledgement as JsonObject;
    expect(JSON.stringify(memberFrozen)).not.toMatch(/"amount"|"quantity"|bindingHash/);
    expect(await quoteCount(beta.owner)).toBe(0);
    fixture.close();
  });

  it("assembly: re-prices legacy members on current rates without touching history", async () => {
    const fixture = createCloudFixture();
    const alpha = await cloudOrganization(fixture, "Atelier ACK Istoric", "ack-asm-legacy");
    const beta = await cloudOrganization(fixture, "Atelier ACK Istoric B", "ack-asm-legacy-b");
    const { assemblyId } = await buildAssembly(alpha.owner, "", alpha.customerId);
    const historicalAck = (await assemblyView(alpha.owner, assemblyId))
      .rateAcknowledgement as JsonObject;
    expect(
      (await quoteAssembly(alpha.owner, assemblyId, { bindingHash: historicalAck.bindingHash }))
        .status,
    ).toBe(200);
    const historicalQuote = (await assemblyView(alpha.owner, assemblyId)).quote as JsonObject;

    const sqlitePath = alpha.org.paths.sqlitePath;
    const readRows = () => {
      const db = new Database(sqlitePath, { readonly: true });
      const rows = {
        children: db
          .prepare(`SELECT truth_id, content_hash, payload FROM confirmed_child_products ORDER BY truth_id`)
          .all() as { truth_id: string; payload: string }[],
        truths: db.prepare(`SELECT * FROM assembly_truths ORDER BY assembly_truth_id`).all(),
        quotes: db.prepare(`SELECT * FROM assembly_quote_snapshots ORDER BY rowid`).all(),
      };
      db.close();
      return rows;
    };
    const db = new Database(sqlitePath);
    const stripped = db
      .prepare(
        `UPDATE confirmed_child_products SET payload = json_remove(payload, '$.unconfirmedRates')`,
      )
      .run();
    db.close();
    expect(stripped.changes).toBe(2);
    const legacy = readRows();

    expect((await assemblyView(alpha.owner, assemblyId)).rateAcknowledgement).toBeNull();
    const refused = await quoteAssembly(alpha.owner, assemblyId, { bindingHash: "fabricated" });
    expect(refused.status).toBe(422);
    const refusedBody = await readBody(refused);
    expect(refusedBody.error).toBe("stale_child");
    expect(String((refusedBody.reasons as string[])[0])).toContain("Reconfirmă produsul");

    const vinylRow = await rateRow(alpha.owner, MAT_VINYL_ORACAL_651_ID);
    expect(
      (await alpha.owner.send(
        "PATCH",
        `/api/resources-admin/cost-evidence/${encodeURIComponent(String(vinylRow.evidenceRowId))}`,
        { amount: 13, note: "Tarif curent schimbat după confirmarea istorică." },
      )).status,
    ).toBe(200);

    const reconfirm = async (client: Api, role: string) => {
      const values = role === "SUPPORT_PANEL" ? acmValues : vinylValues;
      const path = role === "SUPPORT_PANEL" ? acmPath : productPath;
      const reviewId = (await readBody(
        await client.send("POST", `${path}/preview`, { values }),
      )).reviewId;
      return client.send("POST", `/api/assemblies/${assemblyId}/members`, { role, values, reviewId });
    };
    expect((await reconfirm(alpha.member, "SIGNAGE_LETTERS")).status).toBe(403);
    const [letters, lettersAgain] = await Promise.all([
      reconfirm(alpha.owner, "SIGNAGE_LETTERS"),
      reconfirm(alpha.owner, "SIGNAGE_LETTERS"),
    ]);
    expect(letters.status).toBe(200);
    expect(lettersAgain.status).toBe(200);
    expect((await reconfirm(alpha.owner, "SUPPORT_PANEL")).status).toBe(200);
    expect((await alpha.owner.send("POST", `/api/assemblies/${assemblyId}/review`)).status).toBe(200);
    expect((await alpha.owner.send("POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);

    const recovered = readRows();
    expect(recovered.truths).toHaveLength(legacy.truths.length + 1);
    expect(recovered.truths).toEqual(expect.arrayContaining(legacy.truths));
    expect(recovered.quotes).toEqual(legacy.quotes);
    for (const row of legacy.children) {
      expect(recovered.children.find((item) => item.truth_id === row.truth_id)).toEqual(row);
    }
    const reevaluated = recovered.children.filter((row) => row.truth_id.startsWith("pctr:"));
    expect(reevaluated).toHaveLength(2);
    for (const row of reevaluated) {
      const payload = JSON.parse(row.payload) as JsonObject;
      expect(payload.rateEvidenceBasis).toMatchObject({ kind: "CURRENT_RATE_REEVALUATION" });
      expect(
        legacy.children.some(
          (item) => item.truth_id === (payload.rateEvidenceBasis as JsonObject).reevaluatedFromTruthId,
        ),
      ).toBe(true);
    }

    const requirement = (await assemblyView(alpha.owner, assemblyId))
      .rateAcknowledgement as JsonObject;
    expect(requirement).toMatchObject({ status: "REQUIRED", canAcknowledge: true });
    const rates = scopedRates(requirement);
    expect(rates.every((rate) => String(rate.context).includes("Reevaluat la tarifele curente"))).toBe(true);
    expect(rates.some((rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID)).toBe(false);
    expect(
      scopedRates(historicalAck).find((rate) => rate.resourceId === MAT_VINYL_ORACAL_651_ID)?.amount,
    ).toBe(9);
    expect(
      rates.length > 0 &&
        rates.every((rate) => rate.reason === "Valoare implicită de platformă, neconfirmată de firmă"),
    ).toBe(true);
    expect(requirement.bindingHash).not.toBe(historicalAck.bindingHash);

    const memberAssembly = await assemblyView(alpha.member, assemblyId);
    expect((memberAssembly.rateAcknowledgement as JsonObject).bindingHash).toBeNull();
    expect(JSON.stringify(memberAssembly)).not.toContain(String(requirement.bindingHash));
    expect(JSON.stringify(memberAssembly.rateAcknowledgement)).not.toMatch(/"amount"|"quantity"/);
    expect(
      (await quoteAssembly(alpha.member, assemblyId, { bindingHash: requirement.bindingHash })).status,
    ).toBe(403);
    expect((await beta.owner.get(`/api/assemblies/${assemblyId}`)).status).toBe(404);
    const betaAssembly = await buildAssembly(beta.owner, "", beta.customerId);
    const crossTenant = await quoteAssembly(beta.owner, betaAssembly.assemblyId, {
      bindingHash: requirement.bindingHash,
    });
    expect(crossTenant.status).toBe(409);
    expect(await quoteCount(beta.owner)).toBe(0);

    const stale = await quoteAssembly(alpha.owner, assemblyId, {
      bindingHash: historicalAck.bindingHash,
    });
    expect(stale.status).toBe(409);
    expect((await quoteAssembly(alpha.owner, assemblyId)).status).toBe(422);
    const [first, concurrent] = await Promise.all([
      quoteAssembly(alpha.owner, assemblyId, { bindingHash: requirement.bindingHash }),
      quoteAssembly(alpha.owner, assemblyId, { bindingHash: requirement.bindingHash }),
    ]);
    expect(first.status).toBe(200);
    expect(concurrent.status).toBe(200);
    expect(
      (await quoteAssembly(alpha.owner, assemblyId, { bindingHash: requirement.bindingHash })).status,
    ).toBe(200);
    expect(await quoteCount(alpha.owner)).toBe(2);

    const quoted = await assemblyView(alpha.owner, assemblyId);
    const newQuote = quoted.quote as JsonObject;
    expect(typeof newQuote.grossPrice).toBe("number");
    expect(newQuote.grossPrice).not.toBe(historicalQuote.grossPrice);
    expect(
      scopedRates(quoted.frozenRateAcknowledgement as JsonObject).every((rate) =>
        String(rate.context).includes("Reevaluat la tarifele curente"),
      ),
    ).toBe(true);
    expect(readRows().quotes.slice(0, legacy.quotes.length)).toEqual(legacy.quotes);

    const registry = (await readBody(await alpha.owner.get("/api/quotes"))).overview as {
      quotes: { quoteSnapshotId: string; kind: string }[];
    };
    const assemblyQuoteIds = registry.quotes
      .filter((item) => item.kind === "ASSEMBLY")
      .map((item) => item.quoteSnapshotId);
    expect(new Set(assemblyQuoteIds).size).toBe(2);
    for (const quoteSnapshotId of assemblyQuoteIds) {
      const pdf = await alpha.owner.get(
        `/api/assembly-quotes/${encodeURIComponent(quoteSnapshotId)}/document`,
      );
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("content-type")).toContain("application/pdf");
    }
    const accepted = await alpha.owner.send("POST", `/api/assemblies/${assemblyId}/accept`, {
      quoteSnapshotId: (await assemblyView(alpha.owner, assemblyId)).quoteSnapshotId,
    });
    expect(accepted.status).toBe(200);
    expect(((await readBody(accepted)).assembly as JsonObject).orderId).toEqual(expect.any(String));
    fixture.close();
  });

  it("1 (SaaS). freezes normally once the organization confirms its rates", async () => {
    const fixture = createCloudFixture();
    const alpha = await cloudOrganization(fixture, "Atelier ACK Confirmat", "ack-confirmed");
    await confirmAllRates(alpha.owner);
    const confirmed = await confirm(alpha.member, readyValues);
    expect(confirmed.disclosure?.status).toBe("NOT_REQUIRED");
    const frozen = await freeze(alpha.member, readyValues, confirmed.reviewId, alpha.customerId);
    expect(frozen.status).toBe(200);
    expect(((await readBody(frozen)).quoteSnapshot as JsonObject).rateAcknowledgement).toBeUndefined();
    fixture.close();
  });

  it("9, 11. keeps a missing rate a hard block for cost-plus and keeps internal PARTIAL cost independent of a manual price", async () => {
    const fixture = createCloudFixture();
    const alpha = await cloudOrganization(fixture, "Atelier ACK Lipsa", "ack-missing");
    const db = new Database(alpha.org.paths.sqlitePath);
    db.prepare(
      `UPDATE resource_cost_evidence SET superseded_at = ? WHERE resource_id = ? AND superseded_at IS NULL`,
    ).run(new Date().toISOString(), PLEXIGLAS_3MM_OPAL_ID);
    db.close();

    const costPlus = await confirm(alpha.owner, readyValues);
    expect((costPlus.body.eic as JsonObject).completeness).toBe("PARTIAL");
    expect((costPlus.body.commercialPrice as JsonObject).completeness).not.toBe("COMPLETE");
    expect(costPlus.disclosure?.bindingHash).toBeNull();
    expect(
      scopedRates(costPlus.disclosure).some((rate) => rate.resourceId === PLEXIGLAS_3MM_OPAL_ID),
    ).toBe(false);
    const blocked = await freeze(alpha.owner, readyValues, costPlus.reviewId, alpha.customerId, {
      rateAcknowledgement: { bindingHash: "fabricated" },
    });
    expect(blocked.status).toBe(422);
    expect((await readBody(blocked)).error).toBe("incomplete_offer");

    const manual = await confirm(alpha.owner, readyValues, {
      pricingMethod: "MANUAL_FIXED_PRODUCT",
      manualProductNetPrice: 900,
    });
    expect((manual.body.commercialPrice as JsonObject).completeness).toBe("COMPLETE");
    expect((manual.body.eic as JsonObject).completeness).toBe("PARTIAL");
    expect(manual.disclosure?.status).toBe("DISCLOSURE_ONLY");
    const frozen = await freeze(alpha.owner, readyValues, manual.reviewId, alpha.customerId, {
      pricingMethod: "MANUAL_FIXED_PRODUCT",
      manualProductNetPrice: 900,
    });
    expect(frozen.status).toBe(200);
    const snapshot = (await readBody(frozen)).quoteSnapshot as JsonObject;
    expect((snapshot.eic as JsonObject).completeness).toBe("PARTIAL");
    expect((snapshot.commercial as JsonObject).netPrice).toBe(900);
    expect(snapshot.rateAcknowledgement).toBeUndefined();
    fixture.close();
  });

  it("13. treats the site installation rate separately from product rate acknowledgement", async () => {
    const fixture = createCloudFixture();
    const alpha = await cloudOrganization(fixture, "Atelier ACK Montaj", "ack-install");
    const owner = alpha.owner;
    expect(
      (await owner.send("PATCH", "/api/operational-services/SITE_INSTALLATION", {
        offerMode: "INTERNAL",
      })).status,
    ).toBe(200);
    const requestId = String(
      ((await readBody(
        await owner.send("POST", "/api/requests", {
          customerId: alpha.customerId,
          title: "Litere cu montaj sintetic",
          description: "Cerere sintetică pentru tarife neconfirmate și montaj.",
        }),
      )).request as JsonObject).requestId,
    );
    const requestPath = `/api/requests/${encodeURIComponent(requestId)}`;
    expect(
      (await owner.send("PATCH", requestPath, {
        optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      })).status,
    ).toBe(200);
    expect(
      (await owner.send("PATCH", `${requestPath}/installation-facts`, {
        expectedVersion: 0,
        street: "Strada Sintetică 1",
        city: "București",
        measurementStatus: "OFFICE_MEASURED",
        facadeType: "CONCRETE",
        fixingMethod: "MECHANICAL_ANCHOR",
        siteElectrical: "NOT_APPLICABLE",
        crewSize: 2,
        plannedDurationHours: 3,
      })).status,
    ).toBe(200);
    expect(
      (await owner.send("POST", "/api/resources-admin/cost-evidence", {
        resourceId: LAB_SITE_INSTALL_ID,
        amount: 25,
        note: "Tarif sintetic montaj intern.",
      })).status,
    ).toBe(201);
    expect(
      (await owner.send("PATCH", `${requestPath}/installation-price`, { netPrice: 200 })).status,
    ).toBe(200);

    const priced = await confirm(owner, readyValues, { requestId });
    expect(priced.disclosure?.status).toBe("REQUIRED");
    expect(
      scopedRates(priced.disclosure).some((rate) => rate.resourceId === LAB_SITE_INSTALL_ID),
    ).toBe(false);
    const refused = await freeze(owner, readyValues, priced.reviewId, alpha.customerId, {
      requestId,
    });
    expect(refused.status).toBe(422);
    expect((await readBody(refused)).error).toBe("rate_acknowledgement_required");
    const frozen = await freeze(owner, readyValues, priced.reviewId, alpha.customerId, {
      requestId,
      rateAcknowledgement: { bindingHash: priced.disclosure?.bindingHash },
    });
    expect(frozen.status).toBe(200);
    const snapshot = (await readBody(frozen)).quoteSnapshot as JsonObject;
    expect(snapshot.schemaVersion).toBe(2);
    const productNet = (snapshot.commercial as JsonObject).netPrice as number;
    expect((snapshot.jobCommercial as JsonObject).netPrice).toBe(
      Math.round((productNet + 200) * 100) / 100,
    );
    const quoteId = encodeURIComponent(String(snapshot.quoteSnapshotId));
    const pdf = await owner.get(`${productPath}/quote-snapshots/${quoteId}/document`);
    expect(pdf.status).toBe(200);
    fixture.close();
  });
});
