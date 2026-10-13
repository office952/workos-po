import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  formatCustomerMoney,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
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
type RegistryItem = {
  quoteSnapshotId: string;
  kind: "PRODUCT" | "ASSEMBLY";
  kindLabel: string;
  assemblyId: string | null;
  sectionCount: number;
  superseded: boolean;
  customerDisplayName: string | null;
  requestId: string | null;
  requestReference: string | null;
  grossDisplay: string;
  currency: string;
  stage: string;
  nextAction: string;
  orderSnapshotId: string | null;
};
type Section = { roleLabel: string; productLabel: string; netPrice: number; vatAmount: number; grossPrice: number };
type AssemblyQuoteEnvelope = {
  quote: RegistryItem;
  assemblyQuote: {
    sections: Section[];
    totals: { netPrice: number; vatAmount: number; grossPrice: number; currency: string };
    superseded: boolean;
    orderSnapshotId: string | null;
    productionSnapshotId: string | null;
  };
  internalCost?: {
    source: string;
    productionPending: boolean;
    sections: { total: number; completeness: string }[];
    production: {
      completeness: string;
      unpricedOperations: { processLabel: string; missingInputs: string[] }[];
    } | null;
  } | null;
  order: { orderSnapshotId: string; href: string } | null;
  request: { requestId: string; href: string } | null;
  assembly: { assemblyId: string; href: string };
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

function quoteAssembly(app: App, assemblyId: string) {
  return freezeAcknowledgingRates((body) => post(app, `/api/assemblies/${assemblyId}/quote`, body));
}

async function reviewId(app: App, productCode: string, values: Record<string, unknown>) {
  const response = await post(app, `/api/products/${productCode}/preview`, { values });
  expect(response.status).toBe(200);
  return (await json(response)).reviewId as string;
}

async function setupRequest(app: App, displayName: string) {
  const customer = await json(await post(app, "/api/customers", { displayName }));
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await json(
    await post(app, "/api/requests", { customerId, title: displayName, description: "Registru oferte" }),
  );
  return { customerId, requestId: (request.request as { requestId: string }).requestId };
}

async function setSeller(app: App) {
  await app.request("/api/seller", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ legalName: "Registru SRL" }),
  });
}

async function standaloneQuote(app: App, customerId: string, requestId: string) {
  const review = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
  const created = await post(app, `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    values: lettersValues,
    reviewId: review,
    customerId,
    requestId,
  });
  expect(created.status).toBe(200);
  return ((await json(created)).quoteSnapshot as { quoteSnapshotId: string }).quoteSnapshotId;
}

async function quotedAssembly(app: App, requestId: string) {
  const created = await post(app, "/api/assemblies", { requestId });
  expect(created.status).toBe(201);
  const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
  const acmReview = await reviewId(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
  const lettersReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { role: "SUPPORT_PANEL", values: acmValues, reviewId: acmReview })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { role: "SIGNAGE_LETTERS", values: lettersValues, reviewId: lettersReview })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  expect((await quoteAssembly(app, assemblyId)).status).toBe(200);
  return assemblyId;
}

async function registry(app: App) {
  const body = await json(await app.request("/api/quotes"));
  return body.overview as { summary: { total: number; assemblies: number }; quotes: RegistryItem[] };
}

async function envelope(app: App, quoteSnapshotId: string): Promise<AssemblyQuoteEnvelope> {
  const response = await app.request(`/api/quotes/${encodeURIComponent(quoteSnapshotId)}`);
  expect(response.status).toBe(200);
  return (await json(response)) as unknown as AssemblyQuoteEnvelope;
}

function cents(values: readonly number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100);
}

describe("unified Oferte registry", () => {
  it("lists standalone and assembly quotes once each with kind, customer, request and totals", async () => {
    const app = createApp();
    await setSeller(app);
    const plain = await setupRequest(app, "Client Simplu");
    const standaloneId = await standaloneQuote(app, plain.customerId, plain.requestId);
    const composed = await setupRequest(app, "Client Ansamblu");
    const assemblyId = await quotedAssembly(app, composed.requestId);

    const overview = await registry(app);
    expect(overview.summary).toMatchObject({ total: 2, assemblies: 1 });
    expect(new Set(overview.quotes.map((item) => item.quoteSnapshotId)).size).toBe(2);
    const standalone = overview.quotes.find((item) => item.kind === "PRODUCT");
    const assembly = overview.quotes.find((item) => item.kind === "ASSEMBLY");
    expect(standalone).toMatchObject({
      quoteSnapshotId: standaloneId,
      kindLabel: "Produs",
      sectionCount: 1,
      requestId: plain.requestId,
      customerDisplayName: "Client Simplu",
    });
    expect(assembly).toMatchObject({
      kindLabel: "Ansamblu",
      assemblyId,
      sectionCount: 2,
      superseded: false,
      requestId: composed.requestId,
      customerDisplayName: "Client Ansamblu",
      currency: "EUR",
      stage: "QUOTE_CREATED",
      nextAction: "OPEN_ASSEMBLY",
      orderSnapshotId: null,
    });
    expect(assembly?.requestReference).toEqual(expect.any(String));

    const detail = await envelope(app, assembly?.quoteSnapshotId ?? "");
    expect(detail.assemblyQuote.sections).toHaveLength(2);
    expect(detail.assemblyQuote.sections.map((section) => section.roleLabel).sort()).toEqual(
      ["Litere", "Panou ACM"],
    );
    const { totals } = detail.assemblyQuote;
    expect(cents(detail.assemblyQuote.sections.map((section) => section.netPrice))).toBe(Math.round(totals.netPrice * 100));
    expect(cents(detail.assemblyQuote.sections.map((section) => section.vatAmount))).toBe(Math.round(totals.vatAmount * 100));
    expect(cents(detail.assemblyQuote.sections.map((section) => section.grossPrice))).toBe(Math.round(totals.grossPrice * 100));
    expect(totals.grossPrice).toBeGreaterThan(totals.netPrice);
    expect(assembly?.grossDisplay).toBe(formatCustomerMoney(totals.grossPrice));
    expect(detail.request?.requestId).toBe(composed.requestId);
    expect(detail.assembly.assemblyId).toBe(assemblyId);

    const assemblyView = (await json(await app.request(`/api/assemblies/${assemblyId}`))).assembly as {
      quote: { grossPrice: number; sections: unknown[] };
    };
    expect(assemblyView.quote.grossPrice).toBe(totals.grossPrice);
    expect(assemblyView.quote.sections).toHaveLength(2);

    const requestDetail = (await json(await app.request(`/api/requests/${composed.requestId}`))).detail as {
      nextAction: string;
      assemblies: { quoteSnapshotId: string | null }[];
    };
    expect(requestDetail.nextAction).toBe("OPEN_ASSEMBLY");
    expect(requestDetail.assemblies[0]?.quoteSnapshotId).toBe(assembly?.quoteSnapshotId);
  });

  it("follows the assembly quote to its order and keeps the frozen quote immutable", async () => {
    const app = createApp();
    const { requestId } = await setupRequest(app, "Client Comandă");
    const assemblyId = await quotedAssembly(app, requestId);
    const quoteSnapshotId = (await registry(app)).quotes[0]?.quoteSnapshotId ?? "";
    const before = await envelope(app, quoteSnapshotId);
    const assemblyBeforeRead = await json(await app.request(`/api/assemblies/${assemblyId}`));
    await envelope(app, quoteSnapshotId);
    await registry(app);
    expect(await json(await app.request(`/api/assemblies/${assemblyId}`))).toEqual(assemblyBeforeRead);
    expect(before.internalCost).toMatchObject({ source: "CONFIRMED_MEMBERS", productionPending: true, production: null });

    expect((await post(app, `/api/assemblies/${assemblyId}/accept`)).status).toBe(200);
    const ordered = (await registry(app)).quotes[0];
    expect(ordered).toMatchObject({ stage: "ORDER_CREATED", nextAction: "OPEN_ORDER" });
    expect(ordered?.orderSnapshotId).toEqual(expect.stringMatching(/^asmo:/));
    const afterOrder = await envelope(app, quoteSnapshotId);
    expect(afterOrder.order?.href).toBe(`/jobs/${encodeURIComponent(ordered?.orderSnapshotId ?? "")}`);
    expect((await app.request(`/api/jobs/${encodeURIComponent(ordered?.orderSnapshotId ?? "")}`)).status).toBe(200);
    expect(afterOrder.assemblyQuote.sections).toEqual(before.assemblyQuote.sections);
    expect(afterOrder.assemblyQuote.totals).toEqual(before.assemblyQuote.totals);
    expect(afterOrder.internalCost?.source).toBe("ORDER");

    expect((await post(app, `/api/assemblies/${assemblyId}/production`)).status).toBe(200);
    const released = await envelope(app, quoteSnapshotId);
    expect(released.assemblyQuote.productionSnapshotId).toEqual(expect.stringMatching(/^asmp:/));
    expect(released.assemblyQuote.totals).toEqual(before.assemblyQuote.totals);
    expect(released.internalCost?.productionPending).toBe(false);
    expect(released.internalCost?.production?.completeness).toBe("PARTIAL");
    const unpriced = released.internalCost?.production?.unpricedOperations ?? [];
    expect(unpriced.length).toBeGreaterThan(0);
    for (const operation of unpriced) {
      expect(operation.missingInputs.length).toBeGreaterThan(0);
    }
    const assemblyAfter = (await json(await app.request(`/api/assemblies/${assemblyId}`))).assembly as {
      productionCost: { total: number } | null;
    };
    expect(assemblyAfter.productionCost?.total).toBeGreaterThan(0);
    expect(released.assemblyQuote.totals.grossPrice).not.toBe(assemblyAfter.productionCost?.total);
  });

  it("keeps a superseded assembly quote reachable and marks the newer one current", async () => {
    const app = createApp();
    const { requestId } = await setupRequest(app, "Client Revizie");
    const assemblyId = await quotedAssembly(app, requestId);
    const firstId = (await registry(app)).quotes[0]?.quoteSnapshotId ?? "";
    const changed = { ...lettersValues, "root.inscription": "NOU" };
    const changedReview = await reviewId(app, CANONICAL_PRODUCT_CODE, changed);
    expect((await post(app, `/api/assemblies/${assemblyId}/members`, { role: "SIGNAGE_LETTERS", values: changed, reviewId: changedReview })).status).toBe(200);
    expect((await post(app, `/api/assemblies/${assemblyId}/review`)).status).toBe(200);
    expect((await post(app, `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
    expect((await quoteAssembly(app, assemblyId)).status).toBe(200);

    const quotes = (await registry(app)).quotes.filter((item) => item.assemblyId === assemblyId);
    expect(quotes).toHaveLength(2);
    expect(quotes.find((item) => item.quoteSnapshotId === firstId)?.superseded).toBe(true);
    expect(quotes.find((item) => item.quoteSnapshotId !== firstId)?.superseded).toBe(false);
    expect((await envelope(app, firstId)).assemblyQuote.superseded).toBe(true);
  });

  it("works for standalone-only organisations and keeps history when assembly products are disabled", async () => {
    const app = createApp();
    await setSeller(app);
    const plain = await setupRequest(app, "Doar Standalone");
    await standaloneQuote(app, plain.customerId, plain.requestId);
    const standaloneOnly = await registry(app);
    expect(standaloneOnly.summary.assemblies).toBe(0);
    expect(standaloneOnly.quotes.every((item) => item.kind === "PRODUCT")).toBe(true);

    const composed = await setupRequest(app, "Istoric Ansamblu");
    await quotedAssembly(app, composed.requestId);
    const disabled = await post(app, "/api/admin/product-enablement", {
      products: [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: false },
        { templateCode: "PRD-LOGO-FRONTLIT-PLEXI-AL06", enabled: false },
      ],
    });
    expect(disabled.status).toBe(200);
    expect((await json(await app.request("/api/assemblies/offering"))).available).toBe(false);

    const after = await registry(app);
    const historical = after.quotes.find((item) => item.kind === "ASSEMBLY");
    expect(historical).toBeDefined();
    expect(["OPEN_ASSEMBLY", "OPEN_ORDER"]).toContain(historical?.nextAction);
    expect((await envelope(app, historical?.quoteSnapshotId ?? "")).assemblyQuote.sections).toHaveLength(2);
    expect((await post(app, "/api/assemblies", { requestId: composed.requestId })).status).toBe(409);
  });

  it("returns not_found for unknown quote identities", async () => {
    const app = createApp();
    expect((await app.request("/api/quotes/asmq%3Amissing")).status).toBe(404);
    expect((await app.request("/api/quotes/qts%3Amissing")).status).toBe(404);
  });
});
