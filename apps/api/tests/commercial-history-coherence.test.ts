import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE, CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { acceptCurrentAssemblyQuote } from "./fixtures/assemblyAcceptance.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

const lettersValues = {
  "root.inscription": "WORKOS",
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

type App = ReturnType<typeof createApp>;
type Json = Record<string, unknown>;
type QuoteItem = {
  quoteSnapshotId: string;
  kind: "PRODUCT" | "ASSEMBLY";
  assemblyId: string | null;
  superseded: boolean;
  customerId: string | null;
  customerDisplayName: string | null;
  requestId: string | null;
  grossDisplay: string;
  stage: string;
  nextAction: string;
  needsAttention: boolean;
  attentionLabel: string | null;
  orderSnapshotId: string | null;
};
type Workspace = {
  summary: { quoteCount: number; quoteNeedsAction: number };
  quotes: QuoteItem[];
  recentActivity: { label: string }[];
};
type RegistryRow = { customerId: string; quoteCount: number };
type RequestDetail = {
  linkedOffers: QuoteItem[];
  assemblies: { assemblyId: string; quoteSnapshotId: string | null; orderSnapshotId: string | null }[];
  nextAction: string;
  canChangeCustomer: boolean;
};

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

function post(app: App, path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function reviewId(app: App, productCode: string, values: Record<string, unknown>) {
  const response = await post(app, `/api/products/${productCode}/preview`, { values });
  expect(response.status).toBe(200);
  return (await json(response)).reviewId as string;
}

async function customer(app: App, displayName: string) {
  const created = await json(await post(app, "/api/customers", { displayName }));
  return (created.customer as { customerId: string }).customerId;
}

async function request(app: App, customerId: string, title: string) {
  const created = await json(
    await post(app, "/api/requests", { customerId, title, description: "Istoric comercial" }),
  );
  return (created.request as { requestId: string }).requestId;
}

async function productQuote(
  app: App,
  customerId: string,
  requestId: string | null,
  inscription = "WORKOS",
) {
  const values = { ...lettersValues, "root.inscription": inscription };
  const review = await reviewId(app, CANONICAL_PRODUCT_CODE, values);
  const created = await post(app, `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    manualProductNetPrice: 400,
    values,
    reviewId: review,
    customerId,
    ...(requestId ? { requestId } : {}),
  });
  expect(created.status).toBe(200);
  return ((await json(created)).quoteSnapshot as { quoteSnapshotId: string }).quoteSnapshotId;
}

function freezeAssembly(app: App, assemblyId: string) {
  return freezeAcknowledgingRates((body) => post(app, `/api/assemblies/${assemblyId}/quote`, body));
}

async function quotedAssembly(app: App, requestId: string) {
  const created = await post(app, "/api/assemblies", { requestId });
  expect(created.status).toBe(201);
  const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
  const acmReview = await reviewId(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
  const lettersReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { manualProductNetPrice: 400, role: "SUPPORT_PANEL", values: acmValues, reviewId: acmReview })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { manualProductNetPrice: 400, role: "SIGNAGE_LETTERS", values: lettersValues, reviewId: lettersReview })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  expect((await freezeAssembly(app, assemblyId)).status).toBe(200);
  return assemblyId;
}

async function requoteAssembly(app: App, assemblyId: string) {
  const changed = { ...lettersValues, "root.inscription": "WORKOS NOU" };
  const review = await reviewId(app, CANONICAL_PRODUCT_CODE, changed);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { manualProductNetPrice: 400, role: "SIGNAGE_LETTERS", values: changed, reviewId: review })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/review`)).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  expect((await freezeAssembly(app, assemblyId)).status).toBe(200);
}

async function registryQuotes(app: App) {
  return ((await json(await app.request("/api/quotes"))).overview as { quotes: QuoteItem[] }).quotes;
}

async function workspace(app: App, customerId: string) {
  const response = await app.request(`/api/customers/${customerId}/workspace`);
  expect(response.status).toBe(200);
  return (await json(response)).workspace as Workspace;
}

async function customerRegistry(app: App) {
  const body = await json(await app.request("/api/customers"));
  return (body.registry as { customers: RegistryRow[] }).customers;
}

async function requestDetail(app: App, requestId: string) {
  const response = await app.request(`/api/requests/${requestId}`);
  expect(response.status).toBe(200);
  return (await json(response)).detail as RequestDetail;
}

function ids(items: readonly { quoteSnapshotId: string }[]) {
  return items.map((item) => item.quoteSnapshotId);
}

/** Advanced company: products, an assembly with two frozen versions, the newer accepted into an order. */
async function advancedWorld() {
  const app = createApp();
  const alpha = await customer(app, "Client Alfa");
  const beta = await customer(app, "Client Beta");
  const mixedRequest = await request(app, alpha, "Fațadă completă");
  const emptyRequest = await request(app, alpha, "Cerere fără ofertă");
  const betaRequest = await request(app, beta, "Doar litere");
  const productId = await productQuote(app, alpha, mixedRequest);
  const unlinkedProductId = await productQuote(app, alpha, null, "FARA CERERE");
  const betaProductId = await productQuote(app, beta, betaRequest, "BETA");
  expect(new Set([productId, unlinkedProductId, betaProductId]).size).toBe(3);
  const assemblyId = await quotedAssembly(app, mixedRequest);
  const historicalId = (await registryQuotes(app)).find((item) => item.assemblyId === assemblyId)
    ?.quoteSnapshotId ?? "";
  await requoteAssembly(app, assemblyId);
  const currentId = (await registryQuotes(app)).find(
    (item) => item.assemblyId === assemblyId && item.quoteSnapshotId !== historicalId,
  )?.quoteSnapshotId ?? "";
  expect(historicalId).not.toBe("");
  expect(currentId).not.toBe("");
  return {
    app,
    alpha,
    beta,
    mixedRequest,
    emptyRequest,
    betaRequest,
    productId,
    unlinkedProductId,
    betaProductId,
    assemblyId,
    historicalId,
    currentId,
  };
}

describe("unified customer commercial history", () => {
  it("shows product and assembly quotes for the right customer once each, with history and order", async () => {
    const world = await advancedWorld();
    const { app } = world;
    expect((await acceptCurrentAssemblyQuote(app, world.assemblyId)).status).toBe(200);
    const registryBefore = await registryQuotes(app);

    const alpha = await workspace(app, world.alpha);
    expect(new Set(ids(alpha.quotes)).size).toBe(alpha.quotes.length);
    expect(ids(alpha.quotes).sort()).toEqual(
      [world.productId, world.unlinkedProductId, world.historicalId, world.currentId].sort(),
    );
    expect(alpha.summary.quoteCount).toBe(4);
    expect(alpha.quotes.every((item) => item.customerId === world.alpha)).toBe(true);
    expect(alpha.quotes.filter((item) => item.kind === "ASSEMBLY")).toHaveLength(2);

    const current = alpha.quotes.find((item) => item.quoteSnapshotId === world.currentId);
    expect(current).toMatchObject({
      kind: "ASSEMBLY",
      superseded: false,
      stage: "ORDER_CREATED",
      nextAction: "OPEN_ORDER",
      needsAttention: false,
      requestId: world.mixedRequest,
      customerDisplayName: "Client Alfa",
    });
    expect(current?.orderSnapshotId).toEqual(expect.stringMatching(/^asmo:/));
    expect((await app.request(`/api/jobs/${encodeURIComponent(current?.orderSnapshotId ?? "")}`)).status).toBe(200);

    const historical = alpha.quotes.find((item) => item.quoteSnapshotId === world.historicalId);
    expect(historical).toMatchObject({
      superseded: true,
      stage: "QUOTE_CREATED",
      needsAttention: false,
      attentionLabel: "Înlocuită de o versiune mai nouă",
      orderSnapshotId: null,
    });

    // Two open product quotes need acceptance; the historical assembly version and the ordered one do not.
    expect(alpha.summary.quoteNeedsAction).toBe(2);
    expect(alpha.recentActivity.filter((item) => item.label.startsWith("Ofertă"))).toHaveLength(4);

    const beta = await workspace(app, world.beta);
    expect(ids(beta.quotes)).toEqual([world.betaProductId]);
    expect(beta.summary.quoteCount).toBe(1);
    for (const id of [world.productId, world.unlinkedProductId, world.historicalId, world.currentId]) {
      expect(ids(beta.quotes)).not.toContain(id);
    }

    const registry = await customerRegistry(app);
    expect(registry.find((row) => row.customerId === world.alpha)?.quoteCount).toBe(4);
    expect(registry.find((row) => row.customerId === world.beta)?.quoteCount).toBe(1);

    // Customer collections are the registry items, unchanged: same price display, same stage.
    for (const item of alpha.quotes) {
      const fromRegistry = registryBefore.find((row) => row.quoteSnapshotId === item.quoteSnapshotId);
      expect(item).toEqual(fromRegistry);
    }
    expect(await registryQuotes(app)).toEqual(registryBefore);
  });

  it("refuses to accept the historical assembly version after the current one became an order", async () => {
    const world = await advancedWorld();
    const { app } = world;
    expect((await acceptCurrentAssemblyQuote(app, world.assemblyId)).status).toBe(200);
    const stale = await post(app, `/api/assemblies/${world.assemblyId}/accept`, {
      quoteSnapshotId: world.historicalId,
    });
    expect(stale.status).toBeGreaterThanOrEqual(400);
    const alpha = await workspace(app, world.alpha);
    expect(alpha.quotes.filter((item) => item.orderSnapshotId !== null)).toHaveLength(1);
    expect(alpha.quotes.find((item) => item.quoteSnapshotId === world.historicalId)?.orderSnapshotId).toBeNull();
  });

  it("keeps a product-only customer unchanged and adds assemblies later without rewriting earlier quotes", async () => {
    const app = createApp();
    const small = await customer(app, "Atelier Mic");
    const smallRequest = await request(app, small, "Litere simple");
    const productId = await productQuote(app, small, smallRequest);

    const before = await workspace(app, small);
    expect(before.quotes.map((item) => item.kind)).toEqual(["PRODUCT"]);
    expect(before.summary).toMatchObject({ quoteCount: 1, quoteNeedsAction: 1 });
    const detailBefore = await requestDetail(app, smallRequest);
    expect(ids(detailBefore.linkedOffers)).toEqual([productId]);
    expect(detailBefore.assemblies).toEqual([]);
    const productBefore = before.quotes[0];

    const laterRequest = await request(app, small, "Ansamblu ulterior");
    const assemblyId = await quotedAssembly(app, laterRequest);
    const after = await workspace(app, small);
    expect(after.summary.quoteCount).toBe(2);
    expect(after.quotes.find((item) => item.quoteSnapshotId === productId)).toEqual(productBefore);
    expect(after.quotes.find((item) => item.kind === "ASSEMBLY")).toMatchObject({ assemblyId, superseded: false });
    expect(ids((await requestDetail(app, smallRequest)).linkedOffers)).toEqual([productId]);

    const disabled = await post(app, "/api/admin/product-enablement", {
      products: [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
        { templateCode: "PRD-LOGO-FRONTLIT-PLEXI-AL06", enabled: false },
      ],
    });
    expect(disabled.status).toBe(200);
    expect(await workspace(app, small)).toEqual(after);
  });
});

describe("unified request linked offers", () => {
  it("lists the request's product and every assembly snapshot, and excludes other requests", async () => {
    const world = await advancedWorld();
    const { app } = world;
    expect((await acceptCurrentAssemblyQuote(app, world.assemblyId)).status).toBe(200);

    const detail = await requestDetail(app, world.mixedRequest);
    expect(new Set(ids(detail.linkedOffers)).size).toBe(detail.linkedOffers.length);
    expect(ids(detail.linkedOffers).sort()).toEqual(
      [world.productId, world.historicalId, world.currentId].sort(),
    );
    expect(detail.linkedOffers[0]).toMatchObject({ quoteSnapshotId: world.productId, kind: "PRODUCT" });
    expect(detail.linkedOffers.every((item) => item.requestId === world.mixedRequest)).toBe(true);
    expect(ids(detail.linkedOffers)).not.toContain(world.betaProductId);
    expect(ids(detail.linkedOffers)).not.toContain(world.unlinkedProductId);

    const assemblyOffers = detail.linkedOffers.filter((item) => item.kind === "ASSEMBLY");
    expect(assemblyOffers).toHaveLength(2);
    expect(new Set(assemblyOffers.map((item) => item.assemblyId))).toEqual(new Set([world.assemblyId]));
    expect(assemblyOffers.find((item) => item.quoteSnapshotId === world.historicalId)).toMatchObject({
      superseded: true,
      orderSnapshotId: null,
      needsAttention: false,
    });
    const ordered = assemblyOffers.find((item) => item.quoteSnapshotId === world.currentId);
    expect(ordered).toMatchObject({ superseded: false, stage: "ORDER_CREATED" });

    // The technical assembly panel still tracks the current snapshot and its order.
    expect(detail.assemblies).toHaveLength(1);
    expect(detail.assemblies[0]).toMatchObject({
      assemblyId: world.assemblyId,
      quoteSnapshotId: world.currentId,
      orderSnapshotId: ordered?.orderSnapshotId,
    });
    expect(detail.nextAction).toBe("OPEN_ASSEMBLY");
    expect(detail.canChangeCustomer).toBe(false);

    const registry = await registryQuotes(app);
    for (const offer of detail.linkedOffers) {
      expect(offer).toEqual(registry.find((item) => item.quoteSnapshotId === offer.quoteSnapshotId));
    }

    expect((await requestDetail(app, world.emptyRequest)).linkedOffers).toEqual([]);
    const productOnly = await requestDetail(app, world.betaRequest);
    expect(ids(productOnly.linkedOffers)).toEqual([world.betaProductId]);
    expect(productOnly.assemblies).toEqual([]);
  });

  it("keeps the request list projection unchanged for product-only and assembly requests", async () => {
    const world = await advancedWorld();
    const { app } = world;
    const overview = (await json(await app.request("/api/requests"))).overview as {
      requests: { requestId: string; linkedQuoteCount: number; linkedQuoteSnapshotId: string | null; nextAction: string }[];
    };
    const mixed = overview.requests.find((item) => item.requestId === world.mixedRequest);
    expect(mixed).toMatchObject({ linkedQuoteCount: 1, linkedQuoteSnapshotId: world.productId, nextAction: "OPEN_ASSEMBLY" });
    const productOnly = overview.requests.find((item) => item.requestId === world.betaRequest);
    expect(productOnly).toMatchObject({ linkedQuoteCount: 1, linkedQuoteSnapshotId: world.betaProductId, nextAction: "OPEN_QUOTE" });
  });
});
