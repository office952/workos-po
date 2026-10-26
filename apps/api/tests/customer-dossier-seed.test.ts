import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import type { SeedHttpClient } from "../src/cloud/ownerReviewSeed.js";
import { seedClientDossier, type ClientDossierScenario } from "../src/customerDossier/seed/clientDossierSeed.js";
import { renderDemoImage, renderDemoPdf } from "../src/customerDossier/seed/demoFiles.js";

type Json = Record<string, unknown>;
const temps: string[] = [];
let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.WORKOS_DATA_DIR;
  const dir = mkdtempSync(join(tmpdir(), "workos-dossier-seed-"));
  temps.push(dir);
  process.env.WORKOS_DATA_DIR = dir;
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.WORKOS_DATA_DIR;
  else process.env.WORKOS_DATA_DIR = previousDataDir;
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function inProcess(app: ReturnType<typeof createApp>): SeedHttpClient {
  return {
    async request(method, path, body) {
      const response = await app.request(path, {
        method,
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { ok: response.ok, status: response.status, body: (await response.json().catch(() => null)) as Json | null };
    },
  };
}

const LETTERS_VALUES = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const scenario: ClientDossierScenario = {
  customer: { cui: "RO123", displayName: "Client Seed" },
  sites: [
    { key: "a", fields: { name: "Sediu A", city: "Cluj" } },
    { key: "b", fields: { name: "Sediu B" } },
    { key: "c", fields: { name: "Sediu C" } },
  ],
  siteAssignments: [{ key: "r1", subject: "REQUEST", requestTitle: "Cerere unu", site: "b" }],
  quoteRevisions: [
    { key: "r1-v2", requestTitle: "Cerere unu", productCode: CANONICAL_PRODUCT_CODE, values: { ...LETTERS_VALUES, "root.inscription": "UNU V2" }, manualProductNetPrice: 450 },
  ],
  historicalWorks: [{ key: "w2021", site: "a", fields: { title: "Lucrare 2021", eventDate: "2021-05", reference: "H-21" } }],
  documents: [
    {
      key: "invoice",
      fileName: "factura.pdf",
      file: { pdf: { heading: "Factură", subtitle: "Demo", lines: ["Linie"] } },
      kind: "INVOICE",
      title: "Factură 2021",
      documentNumber: "F-21",
      documentDate: "2021-06-01",
      links: [{ kind: "HISTORICAL_WORK", work: "w2021" }],
    },
    {
      key: "photo",
      fileName: "dupa.png",
      file: { image: { stage: "AFTER", signText: "ALPHA", facade: [200, 200, 200], sign: [0, 80, 160] } },
      kind: "PHOTO",
      photoStage: "AFTER",
      title: "După montaj",
      links: [{ kind: "HISTORICAL_WORK", work: "w2021" }, { kind: "SITE", site: "a" }],
    },
  ],
  commercialTerms: { key: "initial", referenceDocument: null, fields: { paymentTermDays: 30, currency: "RON" } },
};

describe("client dossier seed", () => {
  it("is idempotent, resumable and never overwrites later operator changes", async () => {
    const app = createApp();
    const client = inProcess(app);
    const customer = ((await client.request("POST", "/api/customers", { displayName: "Client Seed", cui: "RO123" })).body?.customer as Json).customerId as string;
    const request = (await client.request("POST", "/api/requests", { customerId: customer, title: "Cerere unu", description: "x" })).body?.request as Json;
    const preview = (await client.request("POST", `/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values: { ...LETTERS_VALUES, "root.inscription": "UNU" } })).body as Json;
    await client.request("POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      values: { ...LETTERS_VALUES, "root.inscription": "UNU" },
      reviewId: preview.reviewId,
      manualProductNetPrice: 400,
      customerId: customer,
      requestId: request.requestId,
    });
    const root = mkdtempSync(join(tmpdir(), "workos-dossier-seed-root-"));
    temps.push(root);
    const upload = async (path: string, form: FormData) => {
      const response = await app.request(path, { method: "POST", body: form });
      return { ok: response.ok, status: response.status, body: (await response.json()) as Json };
    };

    const first = await seedClientDossier({ client, upload, root, scenario });
    expect(first.refused).toEqual([]);
    expect(first.applied).toHaveLength(3 + 1 + 1 + 1 + 2 + 1);
    const dossier = async () => (await client.request("GET", `/api/customers/${customer}/dossier`)).body?.dossier as {
      sites: Json[];
      documents: Json[];
      historicalWorks: Json[];
    };
    const afterFirst = await dossier();
    expect(afterFirst.sites).toHaveLength(3);
    expect(afterFirst.documents).toHaveLength(2);
    const quotes = ((await client.request("GET", "/api/quotes")).body?.overview as { quotes: Json[] }).quotes.filter((quote) => quote.requestId === request.requestId);
    expect(quotes).toHaveLength(2);

    // Second run: nothing applied, nothing duplicated.
    const second = await seedClientDossier({ client, upload, root, scenario });
    expect(second.applied).toEqual([]);
    expect(second.skipped).toHaveLength(first.applied.length);
    expect((await dossier()).documents).toHaveLength(2);

    // The operator renames a site and changes the terms; a run with a lost ledger adopts, never resets.
    const siteA = afterFirst.sites.find((site) => site.name === "Sediu A") as Json;
    await client.request("PATCH", `/api/customers/${customer}/sites/${siteA.siteId}`, { name: "Sediu A redenumit", expectedRevision: siteA.revision });
    await client.request("PUT", `/api/customers/${customer}/commercial-terms`, { paymentTermDays: 45 });
    rmSync(join(root, "client-dossier-seed-ledger.json"));
    const third = await seedClientDossier({ client, upload, root, scenario });
    const final = await dossier();
    // The renamed site is not matched by its old name, so one new "Sediu A" appears; nothing else repeats.
    expect(third.applied).toEqual(["site:a"]);
    expect(final.sites.map((site) => site.name).sort()).toEqual(["Sediu A", "Sediu A redenumit", "Sediu B", "Sediu C"]);
    expect(final.documents).toHaveLength(2);
    expect(final.historicalWorks).toHaveLength(1);
    const terms = (await client.request("GET", `/api/customers/${customer}/commercial-terms`)).body as Json;
    expect((terms.terms as Json).paymentTermDays).toBe(45);
    expect(((await client.request("GET", "/api/quotes")).body?.overview as { quotes: Json[] }).quotes.filter((quote) => quote.requestId === request.requestId)).toHaveLength(2);
  });

  it("uses supplied illustrative images for a visual review copy without adding documents (GO 9)", async () => {
    const app = createApp();
    const client = inProcess(app);
    const customer = ((await client.request("POST", "/api/customers", { displayName: "Client Seed", cui: "RO123" })).body?.customer as Json).customerId as string;
    await client.request("POST", "/api/requests", { customerId: customer, title: "Cerere unu", description: "x" });
    const root = mkdtempSync(join(tmpdir(), "workos-dossier-seed-visual-"));
    temps.push(root);
    const upload = async (path: string, form: FormData) => {
      const response = await app.request(path, { method: "POST", body: form });
      return { ok: response.ok, status: response.status, body: (await response.json()) as Json };
    };
    const figma = renderDemoImage({ stage: "BEFORE", signText: "FIGMA", facade: [10, 20, 30], sign: [40, 50, 60] });
    const provenance = "Imagine ilustrativă generată în Figma AI, nu fotografie reală.";
    const visual = { ...scenario, quoteRevisions: [] };
    const imageSources = { photo: { bytes: figma, contentType: "image/png" as const, provenance } };
    const report = await seedClientDossier({ client, upload, root, scenario: visual, imageSources });
    expect(report.refused).toEqual([]);
    const read = async () => (await client.request("GET", `/api/customers/${customer}/dossier`)).body?.dossier as { documents: Array<Json & { links: Json[]; downloadHref: string }> };
    // The same two documents as the schematic seed: the photo keeps its title, stage, file name and links.
    const documents = (await read()).documents;
    expect(documents).toHaveLength(2);
    const photo = documents.find((document) => document.kind === "PHOTO")!;
    expect(photo).toMatchObject({ title: "După montaj", photoStage: "AFTER", originalFileName: "dupa.png" });
    expect(photo.description).toContain(provenance);
    expect(photo.links).toHaveLength(2);
    const bytes = Buffer.from(await (await app.request(photo.downloadHref)).arrayBuffer());
    expect(bytes.equals(Buffer.from(figma))).toBe(true);
    // A second run adopts the same documents: no duplicate photo.
    const again = await seedClientDossier({ client, upload, root, scenario: visual, imageSources });
    expect(again.applied).toEqual([]);
    expect((await read()).documents).toHaveLength(2);
  });

  it("renders deterministic demo PDFs and PNGs carrying the demo mark", async () => {
    const spec = { heading: "Factură", subtitle: "Demo", lines: ["Linie cu diacritice: ș ț ă î â"] };
    const one = await renderDemoPdf(spec);
    const two = await renderDemoPdf(spec);
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(true);
    expect(Buffer.from(one.subarray(0, 5)).toString()).toBe("%PDF-");
    const png = renderDemoImage({ stage: "SIMULATION", signText: "ALPHA", facade: [1, 2, 3], sign: [4, 5, 6] });
    expect(Array.from(png.subarray(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(Buffer.from(png).includes(Buffer.from("Imagine ilustrativa generata sintetic"))).toBe(true);
  });
});
