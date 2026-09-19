import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BOND_LETTER_BODY_ID,
  CANONICAL_PRODUCT_CODE,
  MCH_CNC_4020_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  MCH_CNC_CANT_LITERE_ID,
  PLACE_LED_MODULES_ID,
  WC_ASSEMBLY_01_ID,
  WC_ASSEMBLY_02_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import {
  completeTaskAs,
  sessionCookieViaHttp,
  startTaskAs,
} from "./operator-test-helpers.js";

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

async function createCustomer(
  app: ReturnType<typeof createApp>,
  displayName = "Client Demo",
) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  const body = await readBody(created);
  return (body.customer as JsonObject).customerId as string;
}

async function createExecutor(app: ReturnType<typeof createApp>, name = "Executor test") {
  const created = await app.request("/api/people", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  const body = await readBody(created);
  return (body.person as JsonObject).personId as string;
}

async function assignExecutor(
  app: ReturnType<typeof createApp>,
  taskId: unknown,
  personId: string,
) {
  return app.request(`/api/execution-tasks/${taskId}/executor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ personId }),
  });
}

async function compileReady() {
  const response = await createApp().request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues }),
    },
  );
  const body = await readBody(response);
  return {
    definition: body.definition as JsonObject,
    reviewId: body.reviewId as string,
  };
}

describe("product catalog API", () => {
  it("projects the family, front-lit category, and canonical product", async () => {
    const response = await createApp().request("/api/product-catalog");
    expect(response.status).toBe(200);
    const body = await readBody(response);
    const tree = JSON.stringify(body.tree);
    expect(tree).toContain("Litere și semne volumetrice luminoase");
    expect(tree).toContain("Litere volumetrice luminoase cu iluminare față");
    expect(tree).toContain(CANONICAL_PRODUCT_CODE);
    expect(tree).not.toContain('"code":"letters"');
  });
});

describe("product configuration API", () => {
  it("returns the canonical product and form schema", async () => {
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}`,
    );
    expect(response.status).toBe(200);
    const body = await readBody(response);
    const template = body.template as JsonObject;
    expect(template.code).toBe(CANONICAL_PRODUCT_CODE);
    expect(template.legacyReference).toBe("TPL-VOLUMETRIC-LETTERS_v2");
  });

  it("compiles a valid draft to a ready definition", async () => {
    const compiled = await compileReady();
    expect(compiled.definition.readiness).toBe("ready");
    expect(compiled.reviewId).toBe(compiled.definition.reviewId);
    expect(compiled.definition.templateCode).toBe(CANONICAL_PRODUCT_CODE);
  });

  it("rejects confirmation while the reviewed definition is blocked", async () => {
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...readyValues, "root.inscription": "" },
        }),
      },
    );
    const body = await readBody(response);
    const confirm = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: body.definition,
          reviewId: body.reviewId,
        }),
      },
    );
    expect(confirm.status).toBe(422);
  });

  it("rejects confirmation of a different definition than the one reviewed", async () => {
    const reviewed = await compileReady();
    const changed = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...readyValues, "root.inscription": "CHANGED" },
        }),
      },
    );
    const changedBody = await readBody(changed);
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: changedBody.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    expect(response.status).toBe(409);
  });

  it("confirms the reviewed definition and returns partial EIC", async () => {
    const reviewed = await compileReady();
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    expect(response.status).toBe(200);
    const body = await readBody(response);
    const truth = body.truth as JsonObject;
    const aggregate = body.aggregate as JsonObject;
    const eic = body.eic as JsonObject;
    expect(truth.status).toBe("CONFIRMED_IN_RUNTIME");
    const quantities = aggregate.quantities as Array<{
      componentId: string;
      value: number;
    }>;
    expect(quantities.find((item) => item.componentId === "VOLUME")?.value).toBe(12.5);
    expect(quantities.find((item) => item.componentId === "FACE")?.value).toBe(0.25);
    expect(quantities.find((item) => item.componentId === "BACK")?.value).toBe(0.25);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.geometryLabel).toBe("Geometrie confirmată");
    expect(eic.completenessReasons).toEqual([]);
    expect(JSON.stringify(eic)).not.toMatch(/Geometrie din Analyzer/);
    expect(eic.total).toBe(382.5);
    expect(eic.currency).toBe("EUR");
    expect((eic.excludedComponentLabels as string[])).toEqual([]);
    const commercialPrice = body.commercialPrice as JsonObject;
    expect(commercialPrice.completeness).toBe("COMPLETE");
    expect(commercialPrice.markupPercent).toBe(35);
    expect(commercialPrice.vatPercent).toBe(21);
    expect(commercialPrice.currency).toBe("EUR");
    expect(commercialPrice.markupAmount).toBe(133.88);
    expect(commercialPrice.netPrice).toBe(516.38);
    expect(commercialPrice.vatAmount).toBe(108.44);
    expect(commercialPrice.grossPrice).toBe(624.82);
    expect(JSON.stringify(commercialPrice)).not.toMatch(/FACE|VOLUME|BACK|LIGHTING/);
    const preview = body.executionPlanPreview as JsonObject;
    expect(preview.status).toBe("PREVIEW");
    expect(preview.operationCount).toBeGreaterThan(0);
    expect(preview.summary).toEqual(
      expect.objectContaining({
        internalCostTotal: 382.5,
        internalCostCompleteness: "COMPLETE",
      }),
    );
    expect(JSON.stringify(preview)).not.toMatch(/ExecutionTask|startTask|assignedTo/);
  });

  it("keeps commercial PARTIAL when planned EIC is PARTIAL", async () => {
    const compiled = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...readyValues, "face.finish": "vinyl", "face.color": "alb" },
        }),
      },
    );
    const reviewed = await readBody(compiled);
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    expect(response.status).toBe(200);
    const body = await readBody(response);
    const eic = body.eic as JsonObject;
    const commercialPrice = body.commercialPrice as JsonObject;
    expect(eic.completeness).toBe("PARTIAL");
    expect(commercialPrice.completeness).toBe("PARTIAL");
    expect(commercialPrice.unavailableReasons).toEqual([
      "Costul intern nu este complet pentru această configurație.",
    ]);
  });

  it.each([
    { depthMm: "30", eicTotal: 370, gross: 604.4 },
    { depthMm: "80", eicTotal: 395, gross: 645.23 },
    { depthMm: "100", eicTotal: 407.5, gross: 665.66 },
  ] as const)(
    "confirms COMPLETE commercial for none/none $depthMm mm",
    async ({ depthMm, eicTotal, gross }) => {
      const compiled = await createApp().request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            values: { ...readyValues, "volume.depthMm": depthMm },
          }),
        },
      );
      const reviewed = await readBody(compiled);
      const response = await createApp().request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            definition: reviewed.definition,
            reviewId: reviewed.reviewId,
          }),
        },
      );
      expect(response.status).toBe(200);
      const body = await readBody(response);
      const eic = body.eic as JsonObject;
      const commercialPrice = body.commercialPrice as JsonObject;
      expect(eic.completeness).toBe("COMPLETE");
      expect(eic.total).toBe(eicTotal);
      expect(commercialPrice.completeness).toBe("COMPLETE");
      expect(commercialPrice.grossPrice).toBe(gross);
    },
  );

  it.each([
    { depthMm: "30", eicTotal: 370, gross: 604.4 },
    { depthMm: "80", eicTotal: 395, gross: 645.23 },
    { depthMm: "100", eicTotal: 407.5, gross: 665.66 },
  ] as const)(
    "freezes a quote snapshot for none/none $depthMm mm",
    async ({ depthMm, eicTotal, gross }) => {
      const app = createApp();
      const compiled = await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            values: { ...readyValues, "volume.depthMm": depthMm },
          }),
        },
      );
      const reviewed = await readBody(compiled);
      const response = await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            definition: reviewed.definition,
            reviewId: reviewed.reviewId,
            customerId: await createCustomer(app),
          }),
        },
      );
      expect(response.status).toBe(200);
      const body = await readBody(response);
      const snapshot = body.quoteSnapshot as JsonObject;
      expect(snapshot.status).toBe("FROZEN");
      expect((snapshot.eic as JsonObject).completeness).toBe("COMPLETE");
      expect((snapshot.eic as JsonObject).total).toBe(eicTotal);
      expect((snapshot.commercial as JsonObject).completeness).toBe("COMPLETE");
      expect((snapshot.commercial as JsonObject).grossPrice).toBe(gross);
    },
  );

  it("freezes a quote snapshot from server-confirmed truth without production side effects", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const payload = {
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
      customerId: await createCustomer(app),
    };
    const first = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const second = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const created = await readBody(first);
    const reused = await readBody(second);
    const snapshot = created.quoteSnapshot as JsonObject;
    const commercial = snapshot.commercial as JsonObject;
    const eic = snapshot.eic as JsonObject;
    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect((reused.quoteSnapshot as JsonObject).quoteSnapshotId).toBe(
      snapshot.quoteSnapshotId,
    );
    expect(snapshot.status).toBe("FROZEN");
    expect((snapshot.customer as JsonObject).displayName).toBe("Client Demo");
    expect(eic.total).toBe(382.5);
    expect(commercial.policyId).toBe("DEFAULT_COMMERCIAL_POLICY");
    expect(commercial.policyVersion).toBe(1);
    expect(commercial.markupPercent).toBe(35);
    expect(commercial.vatPercent).toBe(21);
    expect(commercial.grossPrice).toBe(624.82);
    expect(commercial.discountAmount).toBe(0);
    expect(commercial.adjustmentAmount).toBe(0);
    expect(JSON.stringify(snapshot)).not.toMatch(/ExecutionPlan|ExecutionTask|inventory/);

    const read = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${snapshot.quoteSnapshotId}`,
    );
    expect(read.status).toBe(200);
    const stored = ((await readBody(read)).quoteSnapshot as JsonObject).commercial as JsonObject;
    expect(stored.grossPrice).toBe(624.82);

    const plans = await app.request(`/api/execution-plans/missing`);
    expect(plans.status).toBe(404);
    const inventory = await app.request("/api/inventory");
    const items = ((await readBody(inventory)).inventory as { items: Array<JsonObject> })
      .items;
    expect(items.every((item) => item.movementCount === 0)).toBe(true);
  });

  it("records quote acceptance against a persisted snapshot without side effects", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quote = (await readBody(createdQuote)).quoteSnapshot as JsonObject;
    const quoteId = quote.quoteSnapshotId as string;
    const acceptPath = `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`;
    const first = await app.request(acceptPath, { method: "POST" });
    const second = await app.request(acceptPath, { method: "POST" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const created = await readBody(first);
    const reused = await readBody(second);
    const decision = created.acceptanceDecision as JsonObject;
    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect((reused.acceptanceDecision as JsonObject).acceptanceId).toBe(
      decision.acceptanceId,
    );
    expect(decision.quoteSnapshotId).toBe(quoteId);
    expect(decision.quoteContentHash).toBe(quote.contentHash);
    expect(typeof decision.acceptedAt).toBe("string");
    expect((created.quoteSnapshot as JsonObject).status).toBe("FROZEN");
    expect((created.quoteSnapshot as JsonObject).commercial as JsonObject).toMatchObject({
      grossPrice: 624.82,
    });
    expect(((created.quoteSnapshot as JsonObject).eic as JsonObject).total).toBe(382.5);
    expect(created.orderSnapshot).toBeUndefined();

    const read = await app.request(acceptPath);
    expect(read.status).toBe(200);
    expect(((await readBody(read)).acceptanceDecision as JsonObject).quoteContentHash).toBe(
      quote.contentHash,
    );

    const rereadQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}`,
    );
    expect(((await readBody(rereadQuote)).quoteSnapshot as JsonObject).status).toBe("FROZEN");

    expect((await app.request("/api/execution-plans/missing")).status).toBe(404);
    const inventory = await app.request("/api/inventory");
    const items = ((await readBody(inventory)).inventory as { items: Array<JsonObject> })
      .items;
    expect(items.every((item) => item.movementCount === 0)).toBe(true);
  });

  it("does not accept an unknown or mismatched quote snapshot", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    const missing = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/qts:missing/acceptance`,
      { method: "POST" },
    );
    const mismatch = await app.request(
      `/api/products/other-product/quote-snapshots/${quoteId}/acceptance`,
      { method: "POST" },
    );
    expect(missing.status).toBe(404);
    expect(mismatch.status).toBe(404);
  });

  it("creates an order snapshot from accepted quote without calculating or side effects", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quote = (await readBody(createdQuote)).quoteSnapshot as JsonObject;
    const quoteId = quote.quoteSnapshotId as string;
    const acceptPath = `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`;
    const accepted = await app.request(acceptPath, { method: "POST" });
    const acceptance = (await readBody(accepted)).acceptanceDecision as JsonObject;
    const orderPath = `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`;
    const first = await app.request(orderPath, { method: "POST" });
    const second = await app.request(orderPath, { method: "POST" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const created = await readBody(first);
    const reused = await readBody(second);
    const order = created.orderSnapshot as JsonObject;
    const commercial = order.commercial as JsonObject;
    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect((reused.orderSnapshot as JsonObject).orderSnapshotId).toBe(
      order.orderSnapshotId,
    );
    expect((reused.orderSnapshot as JsonObject).createdAt).toBe(order.createdAt);
    expect(order.status).toBe("FROZEN");
    expect(order.sourceQuoteSnapshotId).toBe(quoteId);
    expect(order.sourceQuoteContentHash).toBe(quote.contentHash);
    expect(order.sourceAcceptanceId).toBe(acceptance.acceptanceId);
    expect((order.eic as JsonObject).total).toBe(382.5);
    expect(commercial.markupPercent).toBe(35);
    expect(commercial.vatPercent).toBe(21);
    expect(commercial.grossPrice).toBe(624.82);
    expect(created.productionSnapshot).toBeUndefined();
    expect(created.executionPlan).toBeUndefined();
    expect((created.quoteSnapshot as JsonObject).status).toBe("FROZEN");

    const byQuote = await app.request(orderPath);
    expect(byQuote.status).toBe(200);
    expect(((await readBody(byQuote)).orderSnapshot as JsonObject).commercial as JsonObject).toMatchObject({
      grossPrice: 624.82,
    });
    const byId = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${order.orderSnapshotId}`,
    );
    expect(byId.status).toBe(200);
    expect(((await readBody(byId)).orderSnapshot as JsonObject).eic as JsonObject).toMatchObject({
      total: 382.5,
    });

    const rereadQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}`,
    );
    expect(((await readBody(rereadQuote)).quoteSnapshot as JsonObject).status).toBe("FROZEN");
    const rereadAcceptance = await app.request(acceptPath);
    expect(((await readBody(rereadAcceptance)).acceptanceDecision as JsonObject).acceptanceId).toBe(
      acceptance.acceptanceId,
    );
    expect((await app.request("/api/execution-plans/missing")).status).toBe(404);
    const inventory = await app.request("/api/inventory");
    const items = ((await readBody(inventory)).inventory as { items: Array<JsonObject> })
      .items;
    expect(items.every((item) => item.movementCount === 0)).toBe(true);
  });

  it("does not create an order from a frozen quote without acceptance", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    const missingAcceptance = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
      { method: "POST" },
    );
    const unknown = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/qts:missing/order`,
      { method: "POST" },
    );
    const mismatch = await app.request(
      `/api/products/other-product/quote-snapshots/${quoteId}/order`,
      { method: "POST" },
    );
    expect(missingAcceptance.status).toBe(422);
    expect((await readBody(missingAcceptance)).error).toBe("quote_not_accepted");
    expect(unknown.status).toBe(404);
    expect(mismatch.status).toBe(404);
  });

  it("does not compile or reprice on the order create path", () => {
    const source = readFileSync(new URL("../src/product.ts", import.meta.url), "utf8");
    const start = source.indexOf('"/api/products/:productCode/quote-snapshots/:quoteSnapshotId/order"');
    const end = source.indexOf('"/api/products/:productCode/orders/:orderSnapshotId"');
    const createPath = source.slice(start, end);
    expect(createPath).toContain("freezeOrderSnapshot");
    expect(createPath).not.toMatch(/compileDefinition|compileAggregate|compileEic|compileAcceptedProduct/);
    expect(createPath).not.toMatch(/projectCommercialPrice|composeProductProcesses|listActiveCostEvidence/);
  });

  it("releases production from a frozen order without live compile or side effects", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`,
      { method: "POST" },
    );
    const createdOrder = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
      { method: "POST" },
    );
    const order = (await readBody(createdOrder)).orderSnapshot as JsonObject;
    const orderId = order.orderSnapshotId as string;
    const releasePath = `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderId}/production-release`;
    const first = await app.request(releasePath, { method: "POST" });
    const second = await app.request(releasePath, { method: "POST" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const created = await readBody(first);
    const reused = await readBody(second);
    const snapshot = created.snapshot as JsonObject;
    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect((reused.snapshot as JsonObject).snapshotId).toBe(snapshot.snapshotId);
    expect((reused.snapshot as JsonObject).createdAt).toBe(snapshot.createdAt);
    expect(snapshot.releaseSource).toBe("ORDER");
    expect(snapshot.sourceOrderSnapshotId).toBe(orderId);
    expect(snapshot.sourceOrderContentHash).toBe(order.contentHash);
    expect((snapshot.operations as unknown[]).length).toBe(12);
    expect((snapshot.eic as JsonObject).total).toBe(382.5);
    expect(created.executionPlan).toBeUndefined();
    expect((created.orderSnapshot as JsonObject).commercial as JsonObject).toMatchObject({
      grossPrice: 624.82,
    });

    const readBack = await app.request(releasePath);
    expect(readBack.status).toBe(200);
    expect(((await readBody(readBack)).snapshot as JsonObject).sourceOrderSnapshotId).toBe(orderId);
    expect((await app.request("/api/execution-plans/missing")).status).toBe(404);
    const inventory = await app.request("/api/inventory");
    const items = ((await readBody(inventory)).inventory as { items: Array<JsonObject> }).items;
    expect(items.every((item) => item.movementCount === 0)).toBe(true);
    const unknown = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/ord:missing/production-release`,
      { method: "POST" },
    );
    const mismatch = await app.request(
      `/api/products/other-product/orders/${orderId}/production-release`,
      { method: "POST" },
    );
    expect(unknown.status).toBe(404);
    expect(mismatch.status).toBe(404);
  });

  it("does not compile or reprice on the production-release path", () => {
    const source = readFileSync(new URL("../src/product.ts", import.meta.url), "utf8");
    const start = source.indexOf(
      '"/api/products/:productCode/orders/:orderSnapshotId/production-release"',
    );
    const end = source.indexOf(
      '"/api/products/:productCode/accepted-production-snapshots/:snapshotId"',
    );
    const releasePath = source.slice(start, end);
    expect(releasePath).toContain("freezeProductionReleaseFromOrder");
    expect(releasePath).not.toMatch(/compileDefinition|compileAggregate|compileEic/);
    expect(releasePath).not.toMatch(/projectCommercialPrice|composeProductProcesses/);
    expect(releasePath).not.toMatch(/freezeAcceptedProductionSnapshot|compileAcceptedProduct/);
  });

  it("creates an execution plan from the order release without live compile or side effects", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`,
      { method: "POST" },
    );
    const createdOrder = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
      { method: "POST" },
    );
    const order = (await readBody(createdOrder)).orderSnapshot as JsonObject;
    const released = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${order.orderSnapshotId}/production-release`,
      { method: "POST" },
    );
    const snapshot = (await readBody(released)).snapshot as JsonObject;
    const snapshotId = snapshot.snapshotId as string;
    const planPath = `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`;
    const first = await app.request(planPath, { method: "POST" });
    const second = await app.request(planPath, { method: "POST" });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const created = await readBody(first);
    const reused = await readBody(second);
    const view = created.executionPlan as { plan: JsonObject; tasks: Array<JsonObject> };
    expect(created.created).toBe(true);
    expect(reused.created).toBe(false);
    expect(view.plan.sourceSnapshotId).toBe(snapshotId);
    expect(view.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(view.tasks).toHaveLength(12);
    expect(view.plan.eicTotal).toBeUndefined();
    expect(view.tasks.every((task) => task.status === "PLANNED")).toBe(true);
    expect(view.tasks.every((task) => task.startedAt == null)).toBe(true);
    const readBack = await app.request(planPath);
    expect(readBack.status).toBe(200);
    expect(
      ((await readBody(readBack)).executionPlan as { plan: JsonObject }).plan.sourceSnapshotId,
    ).toBe(snapshotId);
    const inventory = await app.request("/api/inventory");
    const items = ((await readBody(inventory)).inventory as { items: Array<JsonObject> }).items;
    expect(items.every((item) => item.movementCount === 0)).toBe(true);
    const unknown = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/aps:missing/execution-plan`,
      { method: "POST" },
    );
    expect(unknown.status).toBe(404);
  });

  it("keeps the execution plan on the frozen release after live product mutation", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const createdQuote = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`,
      { method: "POST" },
    );
    const createdOrder = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
      { method: "POST" },
    );
    const order = (await readBody(createdOrder)).orderSnapshot as JsonObject;
    const released = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${order.orderSnapshotId}/production-release`,
      { method: "POST" },
    );
    const snapshot = (await readBody(released)).snapshot as JsonObject;
    const snapshotId = snapshot.snapshotId as string;
    const live = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          ...readyValues,
          "face.finish": "vinyl",
          "face.color": "alb",
        },
      }),
    });
    expect(live.status).toBe(200);
    const planPath = `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`;
    const created = await readBody(await app.request(planPath, { method: "POST" }));
    const view = created.executionPlan as { plan: JsonObject; tasks: Array<JsonObject> };
    expect(view.plan.sourceSnapshotId).toBe(snapshotId);
    expect(view.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(view.tasks).toHaveLength(12);
    expect(view.plan.eicTotal).toBeUndefined();
    expect((snapshot.operations as unknown[]).length).toBe(12);
  });

  it("does not compile or reprice on the execution-plan path", () => {
    const source = readFileSync(new URL("../src/product.ts", import.meta.url), "utf8");
    const start = source.indexOf(
      '"/api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan"',
    );
    const end = source.indexOf('"/api/execution-plans/:planId"');
    const planPath = source.slice(start, end);
    expect(planPath).toContain("materializeExecutionPlanFromSnapshot");
    expect(planPath).toContain("assertOrderReleaseReadyForExecution");
    expect(planPath).not.toMatch(/compileDefinition|compileAggregate|compileEic/);
    expect(planPath).not.toMatch(/projectCommercialPrice|composeProductProcesses/);
  });

  it("rejects a PARTIAL configuration from becoming a quote snapshot", async () => {
    const app = createApp();
    const compiled = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...readyValues, "face.finish": "vinyl", "face.color": "alb" },
        }),
      },
    );
    const reviewed = await readBody(compiled);
    const response = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
          customerId: await createCustomer(app),
        }),
      },
    );
    expect(response.status).toBe(422);
    const body = await readBody(response);
    expect(body.error).toBe("incomplete_offer");
    expect(body.quoteSnapshot).toBeUndefined();
  });

  it("does not let a draft override product-fixed identity", async () => {
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: {
            ...readyValues,
            "face.materialFamily": "aluminum",
            "face.opticalType": "transparent",
            "lighting.mode": "halo",
          },
        }),
      },
    );
    const body = await readBody(response);
    const definition = body.definition as { values: Record<string, unknown> };
    expect(definition.values["face.materialFamily"]).toBe("plexiglas");
    expect(definition.values["face.opticalType"]).toBe("opal");
    expect(definition.values["lighting.mode"]).toBe("front_lit");
  });

  it("freezes an accepted production snapshot idempotently without tasks", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const payload = {
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
    };
    const first = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const firstBody = await readBody(first);
    const snapshot = firstBody.snapshot as JsonObject;
    expect(first.status).toBe(200);
    expect(firstBody.created).toBe(true);
    expect(snapshot.status).toBe("ACCEPTED");
    expect(snapshot.eic).toEqual(
      expect.objectContaining({ total: 382.5, completeness: "COMPLETE" }),
    );
    expect((snapshot.operations as unknown[]).length).toBe(12);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /ExecutionTask|eligibleProviders|assignedProvider|startTask/,
    );

    const second = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const secondBody = await readBody(second);
    expect(second.status).toBe(200);
    expect(secondBody.created).toBe(false);
    expect((secondBody.snapshot as JsonObject).snapshotId).toBe(snapshot.snapshotId);
    expect((secondBody.snapshot as JsonObject).createdAt).toBe(snapshot.createdAt);

    const read = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}`,
    );
    expect(read.status).toBe(200);
    const readBodyJson = await readBody(read);
    expect((readBodyJson.snapshot as JsonObject).contentHash).toBe(snapshot.contentHash);

    const mutate = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: "{}" },
    );
    expect(mutate.status).toBe(404);
  });

  it("materializes an idempotent planned execution plan from the frozen snapshot", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const payload = {
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
    };
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const snapshot = (await readBody(accepted)).snapshot as JsonObject;
    const first = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const firstBody = await readBody(first);
    const view = firstBody.executionPlan as {
      plan: JsonObject;
      tasks: Array<JsonObject>;
    };
    expect(first.status).toBe(200);
    expect(firstBody.created).toBe(true);
    expect(view.plan.status).toBe("PLANNED");
    expect(view.plan.sourceSnapshotId).toBe(snapshot.snapshotId);
    expect(view.plan.eicTotal).toBeUndefined();
    expect(view.tasks).toHaveLength(12);
    expect(view.tasks.every((item) => item.assignedProvider === null)).toBe(true);
    expect(view.tasks.every((item) => item.assignedExecutor === null)).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/startTask|employeeId|plannedStart|capacity/);
    expect(JSON.stringify(snapshot)).not.toMatch(/personId|assignedExecutor|people/);

    const second = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const secondBody = await readBody(second);
    expect(secondBody.created).toBe(false);
    expect((secondBody.executionPlan as { plan: JsonObject }).plan.planId).toBe(
      view.plan.planId,
    );

    const read = await app.request(`/api/execution-plans/${view.plan.planId}`);
    expect(read.status).toBe(200);
    const readView = (await readBody(read)).executionPlan as { tasks: Array<JsonObject> };
    expect(readView.tasks).toHaveLength(12);
    expect(
      readView.tasks.filter((item) => item.providerRequirement === "NOT_REQUIRED"),
    ).toHaveLength(9);
    expect(
      readView.tasks.find((item) => item.processLabel === "Control calitate final")
        ?.requiresProvider,
    ).toBe(false);
    expect(
      readView.tasks.some((item) =>
        JSON.stringify(item.eligibleProviders).includes("CNC 4020"),
      ),
    ).toBe(true);
  });

  it("assigns a provider and starts/completes a root task without mutating cost", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const payload = {
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
    };
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const snapshot = (await readBody(accepted)).snapshot as JsonObject;
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const view = (await readBody(created)).executionPlan as {
      plan: JsonObject;
      progressStatus: string;
      tasks: Array<JsonObject>;
    };
    const backCnc = view.tasks.find(
      (item) =>
        item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    ) as JsonObject;
    const lighting = view.tasks.find(
      (item) => item.processId === PLACE_LED_MODULES_ID,
    ) as JsonObject;
    const bond = view.tasks.find((item) => item.processId === BOND_LETTER_BODY_ID) as JsonObject;
    const inspect = view.tasks.find(
      (item) => item.processLabel === "Control calitate final",
    ) as JsonObject;
    const faceCnc = view.tasks.find(
      (item) =>
        item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Față",
    ) as JsonObject;

    const ineligible = await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: WC_ASSEMBLY_01_ID }),
    });
    expect(ineligible.status).toBe(422);
    expect((await readBody(ineligible)).error).toBe("ineligible_provider");

    const noProvider = await app.request(`/api/execution-tasks/${inspect.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect(noProvider.status).toBe(422);

    const assignCnc = await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect(assignCnc.status).toBe(200);
    const assignedView = (await readBody(assignCnc)).executionPlan as {
      tasks: Array<JsonObject>;
    };
    expect(
      (assignedView.tasks.find((item) => item.taskId === backCnc.taskId)?.assignedProvider as JsonObject)
        .label,
    ).toBe("CNC 4020");

    const personId = await createExecutor(app);
    const cookie = await sessionCookieViaHttp(app, personId);
    const assignWithSession = await app.request(
      `/api/execution-tasks/${backCnc.taskId}/provider`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
      },
    );
    expect(assignWithSession.status).toBe(200);
    const assignWithSessionView = (await readBody(assignWithSession)).executionPlan as {
      tasks: Array<JsonObject>;
    };
    const assignedCnc = assignWithSessionView.tasks.find(
      (item) => item.taskId === backCnc.taskId,
    );
    expect(assignedCnc?.canClaimStart).toBe(true);
    expect(assignedCnc?.operatorRelation).not.toBe("identify_required");
    const blockedLighting = await startTaskAs(app, String(lighting.taskId), cookie);
    expect(blockedLighting.status).toBe(409);
    expect((await readBody(blockedLighting)).error).toBe("dependencies_incomplete");

    const assignLighting = await app.request(`/api/execution-tasks/${lighting.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "WC_LED_ASSEMBLY" }),
    });
    expect(assignLighting.status).toBe(422);
    expect((await readBody(assignLighting)).error).toBe("ineligible_provider");
    const lightingStartBefore = await startTaskAs(app, String(lighting.taskId), cookie);
    expect(lightingStartBefore.status).toBe(409);
    expect((await readBody(lightingStartBefore)).error).toBe("dependencies_incomplete");

    const completeBeforeStart = await completeTaskAs(
      app,
      String(backCnc.taskId),
      cookie,
    );
    expect(completeBeforeStart.status).toBe(409);

    const beforeStart = Date.now();
    const started = await startTaskAs(app, String(backCnc.taskId), cookie);
    const startedBody = await readBody(started);
    const startedView = startedBody.executionPlan as {
      progressStatus: string;
      plan: JsonObject;
      tasks: Array<JsonObject>;
    };
    const startedTask = startedView.tasks.find((item) => item.taskId === backCnc.taskId) as JsonObject;
    expect(started.status).toBe(200);
    expect(startedTask.status).toBe("IN_PROGRESS");
    expect(typeof startedTask.startedAt).toBe("string");
    expect(Date.parse(startedTask.startedAt as string)).toBeGreaterThanOrEqual(beforeStart - 1000);
    expect(startedView.progressStatus).toBe("IN_PROGRESS");
    expect(startedView.plan.eicTotal).toBeUndefined();
    expect(startedView.plan.sourceSnapshotHash).toBe(snapshot.contentHash);

    const reassignAfterStart = await app.request(
      `/api/execution-tasks/${backCnc.taskId}/provider`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
      },
    );
    expect(reassignAfterStart.status).toBe(409);

    const assignFace = await app.request(`/api/execution-tasks/${faceCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect(assignFace.status).toBe(200);
    const startFace = await startTaskAs(app, String(faceCnc.taskId), cookie);
    const parallel = (await readBody(startFace)).executionPlan as { tasks: Array<JsonObject> };
    expect(
      parallel.tasks.filter(
        (item) =>
          (item.taskId === backCnc.taskId || item.taskId === faceCnc.taskId) &&
          item.status === "IN_PROGRESS",
      ),
    ).toHaveLength(2);

    const completed = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: 12.5,
      note: "Executat conform fișei",
    });
    const completedView = (await readBody(completed)).executionPlan as {
      tasks: Array<JsonObject>;
    };
    const done = completedView.tasks.find((item) => item.taskId === backCnc.taskId) as JsonObject;
    const released = completedView.tasks.find((item) => item.taskId === lighting.taskId) as JsonObject;
    expect(done.status).toBe("COMPLETED");
    expect(typeof done.completedAt).toBe("string");
    expect(done.completion).toMatchObject({
      outcome: "COMPLETED_AS_PLANNED",
      completedQuantity: 12.5,
      completedQuantityUnit: "m",
      note: "Executat conform fișei",
    });
    expect(done.completedQuantityLabel).toBe("Realizat: 12,5 m");
    expect(done.varianceLabel).toBe("Conform planului");
    expect((done.quantities as Array<JsonObject>)[0]?.value).toBe(12.5);
    expect(released.canStart).toBe(true);
    expect(released.waitingFor).toEqual([]);

    const restart = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(restart.status).toBe(409);

    const firstAssembly = await app.request(`/api/execution-tasks/${bond.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: WC_ASSEMBLY_01_ID }),
    });
    expect(firstAssembly.status).toBe(422);
    expect((await readBody(firstAssembly)).error).toBe("ineligible_provider");
    const secondAssembly = await app.request(`/api/execution-tasks/${bond.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: WC_ASSEMBLY_02_ID }),
    });
    expect(secondAssembly.status).toBe(422);
    expect((await readBody(secondAssembly)).error).toBe("ineligible_provider");
  });

  it("requires a session, claims an empty task, and respects preassignment", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    const snapshot = (await readBody(accepted)).snapshot as JsonObject;
    expect(JSON.stringify(snapshot)).not.toMatch(/personId|assignedExecutor/);
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const view = (await readBody(created)).executionPlan as { tasks: Array<JsonObject> };
    const backCnc = view.tasks.find(
      (item) =>
        item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    ) as JsonObject;
    const inspect = view.tasks.find(
      (item) => item.processLabel === "Control calitate final",
    ) as JsonObject;

    const invalidSession = await app.request(`/api/execution-tasks/${backCnc.taskId}/start`, {
      method: "POST",
    });
    expect(invalidSession.status).toBe(401);
    expect((await readBody(invalidSession)).error).toBe("invalid_session");

    const firstId = await createExecutor(app, "Executor unu");
    const firstCookie = await sessionCookieViaHttp(app, firstId);
    const missingProvider = await startTaskAs(app, String(backCnc.taskId), firstCookie);
    expect(missingProvider.status).toBe(422);
    expect((await readBody(missingProvider)).error).toBe("missing_assignment");

    await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    const unknown = await assignExecutor(app, backCnc.taskId, "per:unknown");
    expect(unknown.status).toBe(422);
    expect((await readBody(unknown)).error).toBe("unknown_person");

    const retiredId = await createExecutor(app, "Executor retras");
    await app.request(`/api/people/${retiredId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    const retiredAssign = await assignExecutor(app, backCnc.taskId, retiredId);
    expect(retiredAssign.status).toBe(422);
    expect((await readBody(retiredAssign)).error).toBe("retired_person");

    const secondId = await createExecutor(app, "Executor doi");
    const secondCookie = await sessionCookieViaHttp(app, secondId);
    expect((await assignExecutor(app, backCnc.taskId, firstId)).status).toBe(200);
    const reassigned = await assignExecutor(app, backCnc.taskId, secondId);
    const reassignedView = (await readBody(reassigned)).executionPlan as {
      tasks: Array<JsonObject>;
    };
    expect(
      (reassignedView.tasks.find((item) => item.taskId === backCnc.taskId)
        ?.assignedExecutor as JsonObject).label,
    ).toBe("Executor doi");

    const reservedOther = await startTaskAs(app, String(backCnc.taskId), firstCookie);
    expect(reservedOther.status).toBe(409);
    expect((await readBody(reservedOther)).error).toBe("already_started_by_other");

    const started = await startTaskAs(app, String(backCnc.taskId), secondCookie);
    const startedView = (await readBody(started)).executionPlan as {
      plan: JsonObject;
      tasks: Array<JsonObject>;
    };
    const startedTask = startedView.tasks.find((item) => item.taskId === backCnc.taskId) as JsonObject;
    expect(started.status).toBe(200);
    expect((startedTask.assignedExecutor as JsonObject).id).toBe(secondId);
    expect((startedTask.assignedExecutor as JsonObject).label).toBe("Executor doi");
    expect(startedView.plan.eicTotal).toBeUndefined();

    const locked = await assignExecutor(app, backCnc.taskId, firstId);
    expect(locked.status).toBe(409);
    expect((await readBody(locked)).error).toBe("reassignment_locked");

    await app.request(`/api/people/${secondId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Executor doi redenumit" }),
    });
    const completed = await completeTaskAs(app, String(backCnc.taskId), secondCookie, {
      completedQuantity: 12.5,
    });
    const done = ((await readBody(completed)).executionPlan as { tasks: Array<JsonObject> }).tasks.find(
      (item) => item.taskId === backCnc.taskId,
    ) as JsonObject;
    expect(done.status).toBe("COMPLETED");
    expect(done.assignedExecutor).toEqual({ id: secondId, label: "Executor doi" });
    expect((done.quantities as Array<JsonObject>)[0]?.value).toBe(12.5);

    await app.request(`/api/people/${secondId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    expect((await assignExecutor(app, inspect.taskId, firstId)).status).toBe(200);
    const inspectStart = await startTaskAs(app, String(inspect.taskId), firstCookie);
    expect(inspectStart.status).toBe(409);
    expect((await readBody(inspectStart)).error).toBe("dependencies_incomplete");
  });

  it("executes the reachable LETTERS DAG and does not complete the plan with open tasks", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    const snapshot = (await readBody(accepted)).snapshot as JsonObject;
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const initial = (await readBody(created)).executionPlan as {
      progress: JsonObject;
      tasks: Array<JsonObject>;
    };
    expect(initial.progress).toMatchObject({
      total: 12,
      completed: 0,
      planned: 12,
      noProvider: 0,
      status: "PLANNED",
    });

    const task = (label: string, scope: string) =>
      initial.tasks.find((item) => item.processLabel === label && item.scopeLabel === scope) as JsonObject;

    const personId = await createExecutor(app);
    const cookie = await sessionCookieViaHttp(app, personId);

    async function execute(taskId: unknown, providerId?: string) {
      if (providerId) {
        const assigned = await app.request(`/api/execution-tasks/${taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId }),
        });
        expect(assigned.status).toBe(200);
      }
      const started = await startTaskAs(app, String(taskId), cookie);
      expect(started.status).toBe(200);
      const startedView = (await readBody(started)).executionPlan as { tasks: Array<JsonObject> };
      const current = startedView.tasks.find((item) => item.taskId === taskId) as JsonObject;
      const measurable = current.measurableQuantity as JsonObject | undefined;
      const completed = await completeTaskAs(
        app,
        String(taskId),
        cookie,
        measurable ? { completedQuantity: measurable.value } : {},
      );
      expect(completed.status).toBe(200);
      return (await readBody(completed)).executionPlan as {
        progress: JsonObject;
        plan: JsonObject;
        tasks: Array<JsonObject>;
      };
    }

    await execute(task("Debitare foaie CNC", "Față").taskId, MCH_CNC_4020_ID);
    await execute(task("Debitare foaie CNC", "Spate").taskId, MCH_CNC_4020_ID);
    await execute(task("Formare profil aluminiu", "Volum").taskId, MCH_CNC_CANT_LITERE_ID);
    await execute(task("Montare module LED", "Iluminare").taskId);
    await execute(task("Cablare electrică", "Iluminare").taskId);
    await execute(task("Pregătire sursă de alimentare", "Iluminare").taskId);
    await execute(task("Probă aprindere", "Iluminare").taskId);
    await execute(task("Lipire față-volum", "Corp").taskId);
    const finalView = await execute(task("Închidere corp", "Corp").taskId);

    expect(finalView.progress).toEqual({
      total: 12,
      completed: 9,
      inProgress: 0,
      planned: 3,
      waitingDependencies: 2,
      noProvider: 0,
      noExecutor: 3,
      varianceCount: 0,
      status: "IN_PROGRESS",
    });
    expect(finalView.plan.eicTotal).toBeUndefined();
    expect(finalView.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(
      finalView.tasks.filter(
        (item) =>
          item.status === "PLANNED" &&
          (item.processLabel === "Probă uniformitate" ||
            item.processLabel === "Control calitate final" ||
            item.processLabel === "Ambalare"),
      ),
    ).toHaveLength(3);
    expect(JSON.stringify(finalView)).not.toMatch(
      /employeeId|inventoryEngine|scrap|schedule|capacity|pontaj|costEngine/,
    );
  });

  it("records completion evidence separately from planned quantity", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    const snapshot = (await readBody(accepted)).snapshot as JsonObject;
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const view = (await readBody(created)).executionPlan as { tasks: Array<JsonObject> };
    const backCnc = view.tasks.find(
      (item) =>
        item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    ) as JsonObject;
    const lighting = view.tasks.find(
      (item) => item.processId === PLACE_LED_MODULES_ID,
    ) as JsonObject;
    const wire = view.tasks.find((item) => item.processLabel === "Cablare electrică") as JsonObject;
    const personId = await createExecutor(app);
    const cookie = await sessionCookieViaHttp(app, personId);

    await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    await startTaskAs(app, String(backCnc.taskId), cookie);

    const missing = await completeTaskAs(app, String(backCnc.taskId), cookie);
    expect(missing.status).toBe(422);
    expect((await readBody(missing)).error).toBe("invalid_quantity");

    const negative = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: -1,
    });
    expect(negative.status).toBe(422);

    const notNumber = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: "12.5",
    });
    expect(notNumber.status).toBe(400);

    const completedCnc = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: 12.5,
    });
    const cncView = (await readBody(completedCnc)).executionPlan as { tasks: Array<JsonObject> };
    const cncDone = cncView.tasks.find((item) => item.taskId === backCnc.taskId) as JsonObject;
    expect(cncDone.completion).toMatchObject({
      outcome: "COMPLETED_AS_PLANNED",
      completedQuantity: 12.5,
      completedQuantityUnit: "m",
    });

    await startTaskAs(app, String(lighting.taskId), cookie);
    const completedLed = await completeTaskAs(app, String(lighting.taskId), cookie, {
      completedQuantity: 123,
      note: "2 module înlocuite în timpul montajului",
    });
    const ledView = (await readBody(completedLed)).executionPlan as {
      progress: JsonObject;
      plan: JsonObject;
      tasks: Array<JsonObject>;
    };
    const ledDone = ledView.tasks.find((item) => item.taskId === lighting.taskId) as JsonObject;
    expect(ledDone.status).toBe("COMPLETED");
    expect(ledDone.completion).toMatchObject({
      outcome: "COMPLETED_WITH_VARIANCE",
      completedQuantity: 123,
      completedQuantityUnit: "buc",
    });
    expect(ledDone.completedQuantityLabel).toBe("Realizat: 123 buc");
    expect(ledDone.varianceLabel).toBe("Diferență față de plan: -2 buc");
    expect((ledDone.quantities as Array<JsonObject>)[0]?.value).toBe(125);
    expect(ledView.progress.varianceCount).toBe(1);
    expect(ledView.progress.status).toBe("IN_PROGRESS");
    expect(ledView.plan.eicTotal).toBeUndefined();
    expect(ledView.plan.sourceSnapshotHash).toBe(snapshot.contentHash);

    const rewrite = await completeTaskAs(app, String(lighting.taskId), cookie, {
      completedQuantity: 125,
      note: "rescrie",
    });
    const rewriteView = (await readBody(rewrite)).executionPlan as { tasks: Array<JsonObject> };
    const stillLed = rewriteView.tasks.find((item) => item.taskId === lighting.taskId) as JsonObject;
    expect(rewrite.status).toBe(200);
    expect(stillLed.completion).toMatchObject({
      outcome: "COMPLETED_WITH_VARIANCE",
      completedQuantity: 123,
      note: "2 module înlocuite în timpul montajului",
    });

    await startTaskAs(app, String(wire.taskId), cookie);
    const unexpected = await completeTaskAs(app, String(wire.taskId), cookie, {
      completedQuantity: 1,
    });
    expect(unexpected.status).toBe(422);
    const completedWire = await completeTaskAs(app, String(wire.taskId), cookie, {
      note: "Executat conform fișei",
    });
    const wireDone = (
      (await readBody(completedWire)).executionPlan as { tasks: Array<JsonObject> }
    ).tasks.find((item) => item.taskId === wire.taskId) as JsonObject;
    expect(wireDone.completion).toMatchObject({
      outcome: "COMPLETED_AS_PLANNED",
      completedQuantity: null,
      note: "Executat conform fișei",
    });
    expect(wireDone.completedQuantityLabel).toBeNull();
    expect(JSON.stringify(ledView)).not.toMatch(/employeeId|inventoryEngine|scrap|pontaj|costEngine/);
  });

  it("records actual consumption on complete and keeps it immutable", async () => {
    const reviewed = await compileReady();
    const app = createApp();
    const accepted = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: reviewed.definition,
          reviewId: reviewed.reviewId,
        }),
      },
    );
    const snapshot = (await readBody(accepted)).snapshot as JsonObject;
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const view = (await readBody(created)).executionPlan as { tasks: Array<JsonObject> };
    const backCnc = view.tasks.find(
      (item) =>
        item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    ) as JsonObject;
    const lighting = view.tasks.find(
      (item) => item.processId === PLACE_LED_MODULES_ID,
    ) as JsonObject;
    const personId = await createExecutor(app);
    const cookie = await sessionCookieViaHttp(app, personId);

    await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    await startTaskAs(app, String(backCnc.taskId), cookie);

    const unknownResource = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: 12.5,
      actualConsumption: [{ resourceId: PLEXIGLAS_3MM_OPAL_ID, actualQuantity: 0.87 }],
    });
    expect(unknownResource.status).toBe(422);
    expect((await readBody(unknownResource)).error).toBe("invalid_resource");

    const completedCnc = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: 12.5,
    });
    expect(completedCnc.status).toBe(200);

    await startTaskAs(app, String(lighting.taskId), cookie);

    const badUnit = await completeTaskAs(app, String(lighting.taskId), cookie, {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: "MAT-LED-MODULE", actualQuantity: 127, unit: "m2" }],
    });
    expect(badUnit.status).toBe(422);
    expect((await readBody(badUnit)).error).toBe("invalid_unit");

    const completedLed = await completeTaskAs(app, String(lighting.taskId), cookie, {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: "MAT-LED-MODULE", actualQuantity: 127 }],
    });
    const ledView = (await readBody(completedLed)).executionPlan as {
      plan: JsonObject;
      tasks: Array<JsonObject>;
      actualInternalCost: JsonObject;
    };
    const ledDone = ledView.tasks.find((item) => item.taskId === lighting.taskId) as JsonObject;
    expect(ledDone.actualConsumption).toEqual([
      expect.objectContaining({
        resourceId: "MAT-LED-MODULE",
        resourceLabel: "Modul LED 12V",
        actualQuantity: 127,
        unit: "buc",
      }),
    ]);
    expect((ledDone.resourceDemands as Array<JsonObject>)[0]).toBeTruthy();
    expect(
      (ledDone.resourceDemands as Array<JsonObject>).find(
        (item) => item.resourceId === "MAT-LED-MODULE",
      )?.quantity,
    ).toBe(125);
    expect(ledView.plan.eicTotal).toBeUndefined();
    expect(ledView.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(ledView.actualInternalCost).toBeUndefined();
    expect(JSON.stringify(ledView)).not.toMatch(
      /costEngine|quoteOrchestrator|inventoryEngine|warehouse|FIFO|margin|VAT/,
    );

    const rewrite = await completeTaskAs(app, String(lighting.taskId), cookie, {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: "MAT-LED-MODULE", actualQuantity: 200 }],
    });
    const stillLed = (
      (await readBody(rewrite)).executionPlan as { tasks: Array<JsonObject> }
    ).tasks.find((item) => item.taskId === lighting.taskId) as JsonObject;
    expect(rewrite.status).toBe(200);
    expect((stillLed.actualConsumption as Array<JsonObject>)[0]?.actualQuantity).toBe(127);

    const inventory = await app.request("/api/inventory");
    const inventoryBody = await readBody(inventory);
    const ledStock = (
      (inventoryBody.inventory as { items: Array<JsonObject> }).items
    ).find((item) => item.resourceId === "MAT-LED-MODULE") as JsonObject;
    expect(ledStock.balance).toBe(-127);
    expect(ledStock.statusLabel).toBe("Sold negativ");
    const ledDetail = await app.request("/api/inventory/MAT-LED-MODULE");
    const ledDetailBody = await readBody(ledDetail);
    expect((ledDetailBody.movements as Array<JsonObject>)).toHaveLength(1);
    expect((ledDetailBody.movements as Array<JsonObject>)[0]).toMatchObject({
      quantityDelta: -127,
      movementTypeLabel: "Consum producție",
    });
    const replayInventory = await app.request("/api/inventory/MAT-LED-MODULE");
    expect(((await readBody(replayInventory)).movements as Array<JsonObject>)).toHaveLength(1);
  });
});

describe("inventory API", () => {
  it("projects stockable materials and records an owner adjustment as a movement", async () => {
    const app = createApp();
    const listed = await app.request("/api/inventory");
    expect(listed.status).toBe(200);
    const body = await readBody(listed);
    const items = (body.inventory as { items: Array<JsonObject> }).items;
    expect(items.some((item) => item.resourceId === "MAT-LED-MODULE")).toBe(true);
    expect(items.some((item) => item.resourceId === "SVC-CNC-FACE")).toBe(false);
    expect(items.every((item) => item.status === "NO_MOVEMENTS")).toBe(true);

    const service = await app.request("/api/inventory/SVC-CNC-FACE/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantityDelta: 10 }),
    });
    expect(service.status).toBe(404);

    const adjusted = await app.request("/api/inventory/MAT-LED-MODULE/adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quantityDelta: 200, note: "Stoc inițial" }),
    });
    expect(adjusted.status).toBe(200);
    const adjustedBody = await readBody(adjusted);
    const led = (
      (adjustedBody.inventory as { items: Array<JsonObject> }).items
    ).find((item) => item.resourceId === "MAT-LED-MODULE") as JsonObject;
    expect(led.balance).toBe(200);
    expect(led.statusLabel).toBe("În stoc");
    expect(JSON.stringify(adjustedBody)).not.toMatch(/purchaseOrder|reservation|warehouse|FIFO/);
  });
});
