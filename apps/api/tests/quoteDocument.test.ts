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
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";
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
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
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
  const compiled = await app.request(`/api/products/${productCode}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const compiledBody = await readBody(compiled);
  const customerId = await createCustomer(
    app,
    productCode.includes("ACM") ? "Client Demo ACM" : "Client Demo LETTERS",
  );
  const created = await freezeAcknowledgingRates((acknowledgement) =>
    app.request(`/api/products/${productCode}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manualProductNetPrice: 400,
        values,
        reviewId: compiledBody.reviewId,
        customerId,
        ...acknowledgement,
      }),
    }),
  );
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
    expect(text).toContain("484,00 EUR");
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
    expect(text).toContain("Adâncime casetă / prima întoarcere");
    expect(text).toContain("484,00 EUR");
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

  it("renders an assembly quote PDF with the registry reference and refuses unknown or product quotes", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client Demo Ansamblu");
    const request = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId, title: "Ansamblu PDF", description: "Document ansamblu" }),
    });
    const requestId = ((await readBody(request)).request as JsonObject).requestId as string;
    const post = (path: string, body?: unknown) =>
      app.request(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const review = async (productCode: string, values: Record<string, unknown>) =>
      (await readBody(await post(`/api/products/${productCode}/preview`, { values }))).reviewId;
    const created = await post("/api/assemblies", { requestId });
    const assemblyId = ((await readBody(created)).assembly as JsonObject).assemblyId as string;
    expect(
      (await post(`/api/assemblies/${assemblyId}/members`, {
        manualProductNetPrice: 400,
        role: "SUPPORT_PANEL",
        values: acmValues,
        reviewId: await review(ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues),
      })).status,
    ).toBe(200);
    expect(
      (await post(`/api/assemblies/${assemblyId}/members`, {
        manualProductNetPrice: 400,
        role: "SIGNAGE_LETTERS",
        values: lettersValues,
        reviewId: await review(CANONICAL_PRODUCT_CODE, lettersValues),
      })).status,
    ).toBe(200);
    expect((await post(`/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
    expect(
      (await freezeAcknowledgingRates((body) => post(`/api/assemblies/${assemblyId}/quote`, body)))
        .status,
    ).toBe(200);
    const overview = (await readBody(await app.request("/api/quotes"))).overview as {
      quotes: { quoteSnapshotId: string; kind: string; reference: string }[];
    };
    const assemblyQuote = overview.quotes.find((quote) => quote.kind === "ASSEMBLY");
    expect(assemblyQuote).toBeDefined();

    const response = await app.request(
      `/api/assembly-quotes/${encodeURIComponent(assemblyQuote!.quoteSnapshotId)}/document`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      `Oferta-${assemblyQuote!.reference}.pdf`,
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe("%PDF");
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(1);

    expect(
      (await app.request("/api/assembly-quotes/asmq%3Amissing/document")).status,
    ).toBe(404);
    const { snapshot } = await freezeQuote(CANONICAL_PRODUCT_CODE, lettersValues);
    expect(
      (await app.request(
        `/api/assembly-quotes/${encodeURIComponent(snapshot.quoteSnapshotId as string)}/document`,
      )).status,
    ).toBe(404);
  });

  it("prints every assembly section between the product and the price", () => {
    const text = quoteDocumentDrawLines({
      title: "Ofertă",
      issuerName: "HUB MEDIA PRODUCTION S.R.L.",
      reference: "OF-47542FBC",
      issuedOn: "02.09.2026",
      status: "Ofertă",
      productName: "Panou ACM + litere volumetrice",
      customerDisplayName: "Nord Market Demo SRL",
      configuration: [],
      technicalSummary: [],
      sections: [
        {
          title: "Litere",
          productName: "Litere volumetrice luminoase",
          inscription: "NORD",
          configuration: [{ label: "Adâncime volum", value: "60 mm" }],
          technicalSummary: [],
          price: { label: "Preț net", value: "516,38 EUR" },
        },
        {
          title: "Panou ACM",
          productName: "Panou ACM casetat",
          configuration: [],
          technicalSummary: [{ label: "Lățime exterioară", value: "1.000 mm" }],
          price: { label: "Preț net", value: "98,07 EUR" },
        },
      ],
      commercial: {
        netLabel: "Total ofertă",
        netDisplay: "614,45",
        vatLabel: "TVA 21%",
        vatDisplay: "129,03",
        grossLabel: "Total",
        grossDisplay: "743,48",
        currency: "EUR",
        netPrice: 614.45,
        vatAmount: 129.03,
        vatPercent: 21,
        grossPrice: 743.48,
      },
      filename: "Oferta-OF-47542FBC.pdf",
    }).join("\n");
    const product = text.indexOf("Panou ACM + litere volumetrice");
    const letters = text.indexOf("\nLitere\n");
    const acmPrice = text.indexOf("Preț net: 98,07 EUR");
    expect(product).toBeGreaterThan(-1);
    expect(letters).toBeGreaterThan(product);
    expect(text).toContain("Înscripție: NORD");
    expect(text).toContain("Lățime exterioară: 1.000 mm");
    expect(acmPrice).toBeGreaterThan(letters);
    expect(text.indexOf("Total: 743,48 EUR")).toBeGreaterThan(acmPrice);
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
