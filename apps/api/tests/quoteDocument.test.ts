import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  projectQuoteDocument,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import {
  quoteDocumentDrawLines,
  renderQuoteDocumentPdf,
} from "../src/quoteDocument/renderQuoteDocumentPdf.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersValues = {
  "root.inscription": "WORKOS ăâîșț",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "root.mountingSystem": "steel_angle",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": "40",
  "face.foldCount": "2",
};

async function createCustomer(app: ReturnType<typeof createApp>, displayName: string) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

async function freezeQuote(productCode: string, values: Record<string, unknown>) {
  const app = createApp();
  const compiled = await app.request(`/api/products/${productCode}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const compiledBody = await readBody(compiled);
  const created = await app.request(`/api/products/${productCode}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      definition: compiledBody.definition,
      reviewId: compiledBody.reviewId,
      customerId: await createCustomer(app, productCode.includes("ACM") ? "Client Demo ACM" : "Client Demo LETTERS"),
    }),
  });
  const body = await readBody(created);
  return {
    app,
    snapshot: body.quoteSnapshot as JsonObject,
  };
}

describe("quote document PDF", () => {
  it("renders LETTERS PDF from the persisted snapshot only", async () => {
    const { app, snapshot } = await freezeQuote(CANONICAL_PRODUCT_CODE, lettersValues);
    const quoteSnapshotId = snapshot.quoteSnapshotId as string;
    const response = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/document`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect(bytes.byteLength).toBeGreaterThan(1000);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    const model = projectQuoteDocument(snapshot as never);
    const text = quoteDocumentDrawLines(model).join("\n");
    expect(text).toContain("Ofertă");
    expect(text).toContain("624,82 EUR");
    expect(text).toContain("Litere volumetrice luminoase");
    expect(text).toContain("WORKOS ăâîșț");
    expect(text).toContain("60 mm");
    expect(text).toContain("Client");
    expect(text).toContain("Client Demo LETTERS");
    expect(text).toContain("HUB MEDIA PRODUCTION S.R.L.");
    expect(text).toContain("RO54481582");
    expect(text).not.toMatch(/382,50|EIC|AI_DECISION|markup|qts:/);
    expect(response.headers.get("content-disposition")).toContain(model.filename);
  });

  it("renders ACM PDF from the same generic document path", async () => {
    const { snapshot } = await freezeQuote(ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    const model = projectQuoteDocument(snapshot as never);
    const bytes = await renderQuoteDocumentPdf(model);
    const text = quoteDocumentDrawLines(model).join("\n");
    expect(text).toContain("Panou ACM casetat");
    expect(text).toContain("1.000 mm");
    expect(text).toContain("500 mm");
    expect(text).toContain("40 mm");
    expect(text).toContain("Cornier oțel");
    expect(text).toContain("118,66 EUR");
    expect(text).toContain("Client Demo ACM");
    expect(text).not.toMatch(/72,644|AI_DECISION|PRD-ACM|resourceId/);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
  });

  it("keeps the frozen customer name after the live customer is renamed", async () => {
    const { app, snapshot } = await freezeQuote(CANONICAL_PRODUCT_CODE, lettersValues);
    const customer = snapshot.customer as JsonObject;
    expect(customer.displayName).toBe("Client Demo LETTERS");
    await app.request(`/api/customers/${customer.customerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client Demo NOU" }),
    });
    const reread = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${snapshot.quoteSnapshotId}`,
    );
    const stored = (await readBody(reread)).quoteSnapshot as JsonObject;
    expect((stored.customer as JsonObject).displayName).toBe("Client Demo LETTERS");
    const model = projectQuoteDocument(stored as never);
    expect(model.customerDisplayName).toBe("Client Demo LETTERS");
    expect(quoteDocumentDrawLines(model).join("\n")).toContain("Client Demo LETTERS");
    expect(quoteDocumentDrawLines(model).join("\n")).not.toContain("Client Demo NOU");
  });

  it("returns 404 for a missing snapshot and does not accept client prices", async () => {
    const response = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/qts:missing/document`,
    );
    expect(response.status).toBe(404);
  });

  it("wraps long unexpected inscription without throwing", async () => {
    const { snapshot } = await freezeQuote(CANONICAL_PRODUCT_CODE, {
      ...lettersValues,
      "root.inscription": `Ofertă lungă ${"A".repeat(180)} <script>alert(1)</script> & „teste”`,
    });
    const model = projectQuoteDocument(snapshot as never);
    const bytes = await renderQuoteDocumentPdf(model);
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(quoteDocumentDrawLines(model).join("\n")).toContain("<script>alert(1)</script>");
  });

  it("keeps renderer and route free of product-code branches and live repricing", () => {
    const renderer = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/quoteDocument/renderQuoteDocumentPdf.ts"),
      "utf8",
    );
    const route = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../src/product.ts"),
      "utf8",
    );
    expect(renderer).not.toMatch(/PRD-LETTERS|PRD-ACM|productCode/);
    expect(renderer).not.toMatch(/projectCommercialPrice|compileEic|getProductTemplate/);
    const documentStart = route.indexOf(
      '"/api/products/:productCode/quote-snapshots/:quoteSnapshotId/document"',
    );
    const documentSlice = route.slice(documentStart, documentStart + 900);
    expect(documentSlice).toMatch(/projectQuoteDocument|renderQuoteDocumentPdf/);
    expect(documentSlice).not.toMatch(/projectCommercialPrice|compileEic|compileDefinition/);
  });
});
