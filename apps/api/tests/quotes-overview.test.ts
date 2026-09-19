import { describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE, CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.mountingSystem": "steel_angle",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": "40",
  "face.foldCount": "2",
};

async function compileReady(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
  inscription: string,
) {
  const response = await app.request(`/api/products/${productCode}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      values: { ...values, "root.inscription": inscription },
    }),
  });
  const body = await readBody(response);
  return {
    definition: body.definition as JsonObject,
    reviewId: body.reviewId as string,
  };
}

async function createCustomer(app: ReturnType<typeof createApp>, displayName: string) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

async function createQuote(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
  inscription: string,
) {
  const reviewed = await compileReady(app, productCode, values, inscription);
  const created = await app.request(`/api/products/${productCode}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
      customerId: await createCustomer(app, `Client ${inscription}`),
    }),
  });
  return (await readBody(created)).quoteSnapshot as JsonObject;
}

describe("quote overview API", () => {
  it("projects frozen quotes without becoming a second quote authority", async () => {
    const app = createApp();
    const created = await createQuote(app, CANONICAL_PRODUCT_CODE, lettersValues, "QTA");
    const accepted = await createQuote(app, CANONICAL_PRODUCT_CODE, lettersValues, "QTB");
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${accepted.quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    const ordered = await createQuote(app, CANONICAL_PRODUCT_CODE, lettersValues, "QTC");
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${ordered.quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    const order = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${ordered.quoteSnapshotId}/order`,
      { method: "POST" },
    );
    const orderSnapshot = (await readBody(order)).orderSnapshot as JsonObject;
    const acm = await createQuote(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues, "QTD");

    const response = await app.request("/api/quotes");
    expect(response.status).toBe(200);
    const overview = (await readBody(response)).overview as {
      summary: JsonObject;
      quotes: Array<JsonObject>;
    };
    expect(overview.quotes).toHaveLength(4);
    expect(JSON.stringify(overview)).not.toMatch(/contentHash|schemaVersion|SENT|draft|CostEngine/);

    const byInscription = Object.fromEntries(
      overview.quotes.map((item) => [item.inscription, item]),
    );
    expect(byInscription.QTA).toMatchObject({
      stage: "QUOTE_CREATED",
      stageLabel: "Creată",
      nextActionLabel: "Marchează acceptată",
      needsAttention: true,
      customerDisplayName: "Client QTA",
      grossDisplay: "624,82",
      currency: "EUR",
    });
    expect(String(byInscription.QTA.href)).toBe(
      `/quotes/${encodeURIComponent(String(byInscription.QTA.quoteSnapshotId))}`,
    );
    expect(String(byInscription.QTA.reference)).toMatch(/^OF-/);
    expect(byInscription.QTB).toMatchObject({
      stage: "QUOTE_ACCEPTED",
      nextActionLabel: "Creează comanda",
    });
    expect(byInscription.QTC).toMatchObject({
      stage: "ORDER_CREATED",
      nextActionLabel: "Deschide comanda",
      needsAttention: false,
      orderSnapshotId: orderSnapshot.orderSnapshotId,
    });
    expect(String(byInscription.QTC.href)).toBe(
      `/quotes/${encodeURIComponent(String(byInscription.QTC.quoteSnapshotId))}`,
    );
    expect(byInscription.QTD).toMatchObject({
      productCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      stage: "QUOTE_CREATED",
      customerDisplayName: "Client QTD",
    });
    expect(overview.summary).toMatchObject({
      total: 4,
      needsAttention: 3,
      accepted: 1,
      ordered: 1,
    });
    expect(created.quoteSnapshotId).toBe(byInscription.QTA.quoteSnapshotId);
    expect(acm.quoteSnapshotId).toBe(byInscription.QTD.quoteSnapshotId);

    const missing = await app.request("/api/quotes/qts:missing");
    expect(missing.status).toBe(404);
    const detail = await app.request(
      `/api/quotes/${encodeURIComponent(String(created.quoteSnapshotId))}`,
    );
    expect(detail.status).toBe(200);
    const detailBody = await readBody(detail);
    expect(detailBody.quote).toMatchObject({
      quoteSnapshotId: created.quoteSnapshotId,
      inscription: "QTA",
    });
    expect((detailBody.quoteSnapshot as JsonObject).quoteSnapshotId).toBe(
      created.quoteSnapshotId,
    );
  });
});
