import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

type Json = Record<string, unknown>;
type App = ReturnType<typeof createApp>;

const temps: string[] = [];
let previousDataDir: string | undefined;
let previousSqlitePath: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.WORKOS_DATA_DIR;
  previousSqlitePath = process.env.WORKOS_SQLITE_PATH;
  delete process.env.WORKOS_SQLITE_PATH;
  const dir = mkdtempSync(join(tmpdir(), "workos-dossier-"));
  temps.push(dir);
  process.env.WORKOS_DATA_DIR = dir;
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.WORKOS_DATA_DIR;
  else process.env.WORKOS_DATA_DIR = previousDataDir;
  if (previousSqlitePath === undefined) delete process.env.WORKOS_SQLITE_PATH;
  else process.env.WORKOS_SQLITE_PATH = previousSqlitePath;
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n% DEMO — fără valoare comercială\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function body(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

async function send(app: App, method: string, path: string, payload?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: payload === undefined ? {} : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

async function createCustomer(app: App, displayName: string, profile: Json = {}): Promise<string> {
  const created = await body(await send(app, "POST", "/api/customers", { displayName, ...profile }));
  return (created.customer as Json).customerId as string;
}

async function createRequest(app: App, customerId: string, title: string): Promise<string> {
  const created = await body(await send(app, "POST", "/api/requests", { customerId, title, description: "Cerere de test." }));
  return (created.request as Json).requestId as string;
}

async function freezeQuote(app: App, inscription: string, customerId: string, requestId: string): Promise<string> {
  const values = {
    "face.finish": "none",
    "face.confirmedAreaMm2": 250000,
    "volume.depthMm": "60",
    "volume.finish": "none",
    "volume.confirmedPerimeterMm": 12500,
    "root.inscription": inscription,
  };
  const preview = await body(await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values }));
  const created = await body(
    await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      manualProductNetPrice: 400,
      values,
      reviewId: preview.reviewId,
      customerId,
      requestId,
    }),
  );
  return (created.quoteSnapshot as Json).quoteSnapshotId as string;
}

async function acceptAndOrder(app: App, quoteId: string): Promise<void> {
  expect((await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`)).status).toBeLessThan(300);
  expect((await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`)).status).toBeLessThan(300);
}

async function createSite(app: App, customerId: string, fields: Json): Promise<Json> {
  const response = await send(app, "POST", `/api/customers/${customerId}/sites`, fields);
  expect(response.status).toBe(201);
  return (await body(response)).site as Json;
}

async function upload(
  app: App,
  customerId: string,
  file: { bytes: Uint8Array; name: string; type: string },
  fields: Record<string, string>,
): Promise<Response> {
  const form = new FormData();
  form.set("file", new File([file.bytes], file.name, { type: file.type }));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return app.request(`/api/customers/${customerId}/documents`, { method: "POST", body: form });
}

async function dossier(app: App, customerId: string) {
  return (await body(await app.request(`/api/customers/${customerId}/dossier`))).dossier as {
    sites: Json[];
    documents: Array<Json & { links: Json[]; viewHref: string; downloadHref: string }>;
    historicalWorks: Json[];
    permissions: Json;
    linkTargets: Record<string, Json[]>;
  };
}

async function history(app: App, customerId: string, query = "") {
  return (await body(await app.request(`/api/customers/${customerId}/history${query}`))).history as {
    total: number;
    page: number;
    pageCount: number;
    entries: Array<Json & { documents: Json[]; matchedOn: string[] }>;
    facets: { years: number[]; sites: Json[]; states: Json[] };
    totals: Json;
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("customer dossier — sites", () => {
  it("serves a simple customer with no site, one site, and a customer with three sites", async () => {
    const app = createApp();
    const simple = await createCustomer(app, "Client Simplu");
    const empty = await dossier(app, simple);
    expect(empty.sites).toEqual([]);
    expect(empty.documents).toEqual([]);
    expect((await history(app, simple)).total).toBe(0);
    const requestSimple = await createRequest(app, simple, "Firmă luminoasă");
    expect((await history(app, simple)).entries.map((entry) => entry.title)).toEqual(["Firmă luminoasă"]);

    const one = await createCustomer(app, "Client Un Sediu");
    const only = await createSite(app, one, { name: "Sediu unic", address: "Str. Unu 1", city: "Cluj-Napoca" });
    expect(only).toMatchObject({ status: "ACTIVE", revision: 1, statusLabel: "Activ" });

    const multi = await createCustomer(app, "Client Trei Sedii");
    await createSite(app, multi, { name: "Depozit", address: "Str. Depozitului 3", city: "Turda", accessNotes: "Acces camion doar dimineața" });
    const office = await createSite(app, multi, { name: "Birouri", address: "Bd. Eroilor 10", city: "Cluj-Napoca", contactName: "Ioana", phone: "0700 000 001" });
    await createSite(app, multi, { name: "Showroom", address: "Calea Florești 5", city: "Cluj-Napoca" });
    const listed = await dossier(app, multi);
    expect(listed.sites.map((site) => site.name)).toEqual(["Birouri", "Depozit", "Showroom"]);

    // Deactivate, never delete; an inactive site cannot receive a new assignment.
    const deactivated = await send(app, "PATCH", `/api/customers/${multi}/sites/${office.siteId}`, { status: "INACTIVE", expectedRevision: 1 });
    expect(deactivated.status).toBe(200);
    expect(((await body(deactivated)).site as Json).statusLabel).toBe("Inactiv");
    const stale = await send(app, "PATCH", `/api/customers/${multi}/sites/${office.siteId}`, { name: "Birouri vechi", expectedRevision: 1 });
    expect(stale.status).toBe(409);
    const requestMulti = await createRequest(app, multi, "Totem showroom");
    const inactive = await send(app, "PUT", `/api/customers/${multi}/site-assignments`, { subjectKind: "REQUEST", subjectId: requestMulti, siteId: office.siteId });
    expect(inactive.status).toBe(409);
    expect((await dossier(app, multi)).sites).toHaveLength(3);

    // A request of another customer cannot be placed on this customer's site.
    const foreign = await send(app, "PUT", `/api/customers/${one}/site-assignments`, { subjectKind: "REQUEST", subjectId: requestSimple, siteId: only.siteId });
    expect(foreign.status).toBe(422);
    // The site of another customer is refused too.
    const otherSite = await send(app, "PUT", `/api/customers/${multi}/site-assignments`, { subjectKind: "REQUEST", subjectId: requestMulti, siteId: only.siteId });
    expect(otherSite.status).toBe(422);
    expect((await send(app, "POST", `/api/customers/${one}/sites`, { name: "" })).status).toBe(400);
  });
});

describe("customer dossier — documents and photos", () => {
  it("uploads, associates, previews and downloads one stored file referenced from several views", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client Documente");
    const site = await createSite(app, customerId, { name: "Fabrica", city: "Arad" });
    const requestId = await createRequest(app, customerId, "Panou fațadă");

    const created = await upload(app, customerId, { bytes: PDF_BYTES, name: "factura-118.pdf", type: "application/pdf" }, {
      kind: "INVOICE",
      title: "Factură montaj panou",
      documentNumber: "F-2025-118",
      documentDate: "2025-03-14",
      links: JSON.stringify([{ kind: "REQUEST", subjectId: requestId }]),
    });
    expect(created.status).toBe(201);
    const documentId = (await body(created)).documentId as string;

    // Later association: the same document also belongs to the site.
    const linked = await send(app, "POST", `/api/customers/${customerId}/documents/${documentId}/links`, { kind: "SITE", subjectId: site.siteId });
    expect(linked.status).toBe(201);
    expect((await send(app, "POST", `/api/customers/${customerId}/documents/${documentId}/links`, { kind: "SITE", subjectId: site.siteId })).status).toBe(200);

    const listed = await dossier(app, customerId);
    const document = listed.documents.find((item) => item.documentId === documentId);
    expect(document).toMatchObject({ kindLabel: "Factură", documentNumber: "F-2025-118", preview: "PDF", revision: 1 });
    expect(document?.links.map((link) => link.kind)).toEqual(["REQUEST", "SITE"]);

    const inline = await app.request(document?.viewHref ?? "");
    expect(inline.status).toBe(200);
    expect(inline.headers.get("content-type")).toBe("application/pdf");
    expect(inline.headers.get("content-disposition")).toMatch(/^inline;/);
    const download = await app.request(document?.downloadHref ?? "");
    expect(download.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(sha256(new Uint8Array(await download.arrayBuffer()))).toBe(sha256(PDF_BYTES));

    // One file on disk for one document, whatever the number of links.
    const customerDir = join(process.env.WORKOS_DATA_DIR ?? "", "documents", "customers", customerId.replace(/[^a-zA-Z0-9._-]+/g, "_"));
    expect(readdirSync(customerDir).filter((name) => !name.startsWith("."))).toHaveLength(1);

    // A photo needs a stage; it previews inline.
    expect((await upload(app, customerId, { bytes: PNG_BYTES, name: "fatada.png", type: "image/png" }, { kind: "PHOTO" })).status).toBe(400);
    const photo = await upload(app, customerId, { bytes: PNG_BYTES, name: "fatada.png", type: "image/png" }, {
      kind: "PHOTO",
      photoStage: "BEFORE",
      description: "Fațada înainte de montaj",
      links: JSON.stringify([{ kind: "SITE", subjectId: site.siteId }]),
    });
    expect(photo.status).toBe(201);
    const photoView = (await dossier(app, customerId)).documents.find((item) => item.kind === "PHOTO");
    expect(photoView).toMatchObject({ photoStageLabel: "Înainte", preview: "IMAGE", title: "fatada" });

    // A text file never renders inline.
    const text = await upload(app, customerId, { bytes: new TextEncoder().encode("<script>x</script>"), name: "nota.html", type: "text/html" }, { kind: "OTHER" });
    const textId = (await body(text)).documentId as string;
    const forced = await app.request(`/api/customers/${customerId}/documents/${textId}/content?disposition=inline`);
    expect(forced.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(forced.headers.get("x-content-type-options")).toBe("nosniff");

    // Metadata edit keeps the bytes; unlinking leaves the document in place.
    const renamed = await send(app, "PATCH", `/api/customers/${customerId}/documents/${documentId}`, { title: "Factură finală", expectedRevision: 1 });
    expect(((await body(renamed)) as Json).revision).toBe(2);
    expect((await send(app, "DELETE", `/api/customers/${customerId}/documents/${documentId}/links?kind=SITE&subjectId=${encodeURIComponent(site.siteId as string)}`)).status).toBe(200);
    const after = (await dossier(app, customerId)).documents.find((item) => item.documentId === documentId);
    expect(after?.links.map((link) => link.kind)).toEqual(["REQUEST"]);
    expect(sha256(new Uint8Array(await (await app.request(after?.downloadHref ?? "")).arrayBuffer()))).toBe(sha256(PDF_BYTES));
  });

  it("refuses associations and downloads across customers of the same organization", async () => {
    const app = createApp();
    const alpha = await createCustomer(app, "Alpha");
    const beta = await createCustomer(app, "Beta");
    const betaRequest = await createRequest(app, beta, "Cererea lui Beta");
    const betaSite = await createSite(app, beta, { name: "Sediu Beta" });

    const refused = await upload(app, alpha, { bytes: PDF_BYTES, name: "contract.pdf", type: "application/pdf" }, {
      kind: "CONTRACT",
      links: JSON.stringify([{ kind: "REQUEST", subjectId: betaRequest }]),
    });
    expect(refused.status).toBe(422);
    const contract = await upload(app, alpha, { bytes: PDF_BYTES, name: "contract.pdf", type: "application/pdf" }, { kind: "CONTRACT" });
    const documentId = (await body(contract)).documentId as string;
    expect((await send(app, "POST", `/api/customers/${alpha}/documents/${documentId}/links`, { kind: "SITE", subjectId: betaSite.siteId })).status).toBe(422);
    expect((await send(app, "POST", `/api/customers/${beta}/documents/${documentId}/links`, { kind: "SITE", subjectId: betaSite.siteId })).status).toBe(404);
    expect((await app.request(`/api/customers/${beta}/documents/${documentId}/content`)).status).toBe(404);
    expect((await send(app, "PUT", `/api/customers/${beta}/commercial-terms`, { referenceDocumentId: documentId })).status).toBe(422);
    expect((await dossier(app, beta)).documents).toEqual([]);
  });
});

describe("customer dossier — history", () => {
  it("finds a 2021 historical work and opens its invoice and photo without walking the commercial flow", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client Istoric", { address: "Str. Veche 1" });
    const warehouse = await createSite(app, customerId, { name: "Depozit Nord", address: "Str. Industriei 7", city: "Oradea" });
    const shop = await createSite(app, customerId, { name: "Magazin Centru", city: "Oradea" });
    const work = await send(app, "POST", `/api/customers/${customerId}/historical-works`, {
      title: "Litere volumetrice depozit",
      reference: "HIST-2021-04",
      description: "Montaj realizat înainte de WorkOS.",
      eventDate: "2021-06",
      siteId: warehouse.siteId,
    });
    expect(work.status).toBe(201);
    const workId = ((await body(work)).work as Json).workId as string;
    expect((await send(app, "POST", `/api/customers/${customerId}/historical-works`, { title: "Viitor", eventDate: "2999" })).status).toBe(400);

    await upload(app, customerId, { bytes: PDF_BYTES, name: "factura.pdf", type: "application/pdf" }, {
      kind: "INVOICE",
      title: "Factură litere depozit",
      documentNumber: "AC-0421",
      documentDate: "2021-07-02",
      links: JSON.stringify([{ kind: "HISTORICAL_WORK", subjectId: workId }]),
    });
    await upload(app, customerId, { bytes: PNG_BYTES, name: "dupa.png", type: "image/png" }, {
      kind: "PHOTO",
      photoStage: "AFTER",
      title: "Litere montate",
      links: JSON.stringify([{ kind: "HISTORICAL_WORK", subjectId: workId }]),
    });

    // Current work in WorkOS: one request on the shop site with two quotes, one accepted and ordered.
    const requestId = await createRequest(app, customerId, "Casetă luminoasă magazin");
    await send(app, "PUT", `/api/customers/${customerId}/site-assignments`, { subjectKind: "REQUEST", subjectId: requestId, siteId: shop.siteId });
    await freezeQuote(app, "CAS1", customerId, requestId);
    const accepted = await freezeQuote(app, "CAS2", customerId, requestId);
    await acceptAndOrder(app, accepted);
    await createRequest(app, customerId, "Autocolant vitrină");

    const all = await history(app, customerId);
    expect(all.total).toBe(3);
    expect(all.facets.years).toContain(2021);
    const project = all.entries.find((entry) => entry.title === "Casetă luminoasă magazin");
    // One quote ordered (job not released yet), one still waiting: the branches keep their own states.
    expect(project).toMatchObject({ kind: "PROJECT", state: null, states: ["OFERTARE", "COMANDA_CREATA"], stateLabel: "Ramuri în stări diferite" });
    expect((project?.branches as Json[]).map((branch) => branch.state)).toEqual(["OFERTARE", "COMANDA_CREATA"]);
    expect((project?.site as Json).name).toBe("Magazin Centru");
    expect(all.entries.find((entry) => entry.title === "Autocolant vitrină")?.state).toBe("OFERTARE");

    // By year, by site, by text in document metadata, by reference.
    const byYear = await history(app, customerId, "?year=2021");
    expect(byYear.entries.map((entry) => entry.title)).toEqual(["Litere volumetrice depozit"]);
    const bySite = await history(app, customerId, `?site=${encodeURIComponent(warehouse.siteId as string)}`);
    expect(bySite.total).toBe(1);
    const byInvoice = await history(app, customerId, "?q=ac-0421");
    expect(byInvoice.entries[0]).toMatchObject({ kind: "HISTORICAL_WORK", provenance: "HISTORICAL_RECORD" });
    expect(byInvoice.entries[0]?.matchedOn).toEqual(["Factură: Factură litere depozit"]);
    expect((await history(app, customerId, "?q=HIST-2021")).total).toBe(1);
    // N-020 · every word typed is found in the same entry: the site ("nord") and the documented year.
    for (const q of ["nord 2021", "2021 Nord", "  NORD   2021 "]) {
      const found = await history(app, customerId, `?q=${encodeURIComponent(q)}`);
      expect(found.entries.map((entry) => entry.title)).toEqual(["Litere volumetrice depozit"]);
      expect(found.entries[0]?.matchedOn.slice(0, 2)).toEqual(["Sediu", "Anul 2021"]);
    }
    expect((await history(app, customerId, `?q=${encodeURIComponent("nord 2026")}`)).total).toBe(0);
    expect((await history(app, customerId, `?q=${encodeURIComponent("nord 2021")}&year=2026`)).total).toBe(0);
    expect((await history(app, customerId, `?q=${encodeURIComponent("magazin 2021")}`)).total).toBe(0);
    expect((await history(app, customerId, "?state=FINALIZAT")).entries.map((entry) => entry.kind)).toEqual(["HISTORICAL_WORK"]);


    // Direct access from the result: the photo and the invoice open from their hrefs.
    const found = byYear.entries[0];
    const photo = found?.documents.find((item) => item.kind === "PHOTO") as Json;
    const invoice = found?.documents.find((item) => item.kind === "INVOICE") as Json;
    const photoResponse = await app.request(photo.viewHref as string);
    expect(photoResponse.status).toBe(200);
    expect(photoResponse.headers.get("content-type")).toBe("image/png");
    expect(sha256(new Uint8Array(await (await app.request(invoice.downloadHref as string)).arrayBuffer()))).toBe(sha256(PDF_BYTES));

    // Pagination is deterministic.
    const page1 = await history(app, customerId, "?pageSize=2&page=1");
    const page2 = await history(app, customerId, "?pageSize=2&page=2");
    expect(page1.pageCount).toBe(2);
    expect([...page1.entries, ...page2.entries].map((entry) => entry.entryId)).toEqual(all.entries.map((entry) => entry.entryId));
    expect((await history(app, customerId, "?pageSize=2&page=1")).entries.map((entry) => entry.entryId)).toEqual(page1.entries.map((entry) => entry.entryId));
    // Provenance (server filter and server counts): the WorkOS projects, the historical record, and
    // a loose uploaded document without a request or work, which has no production state.
    await upload(app, customerId, { bytes: PDF_BYTES, name: "contract.pdf", type: "application/pdf" }, { kind: "CONTRACT", title: "Contract-cadru", documentNumber: "CC-1", documentDate: "2025-10-15" });
    const withUpload = await history(app, customerId);
    expect(withUpload.total).toBe(4);
    const provenances = (withUpload.facets as unknown as { provenances: Json[] }).provenances;
    expect(provenances.map((item) => [item.provenance, item.count])).toEqual([["WORKOS", 2], ["HISTORICAL_RECORD", 1], ["UPLOAD", 1]]);
    const uploads = await history(app, customerId, "?provenance=UPLOAD");
    expect(uploads.entries.map((entry) => [entry.kind, entry.state, entry.title])).toEqual([["DOCUMENT", null, "Contract-cadru"]]);
    expect((await history(app, customerId, "?provenance=UPLOAD&state=OFERTARE")).total).toBe(0);
    expect((await history(app, customerId, "?provenance=nope")).total).toBe(4);
    expect((withUpload.totals as unknown as Json).uploads).toBe(1);
  });

  it("keeps every quote and job of a request once, with explicit branches and states (review N-020)", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client Ramuri");
    const site = await createSite(app, customerId, { name: "Hală" });
    const requestId = await createRequest(app, customerId, "Litere hală");
    const first = await freezeQuote(app, "RAM1", customerId, requestId);
    const second = await freezeQuote(app, "RAM2", customerId, requestId);
    await acceptAndOrder(app, first);
    await acceptAndOrder(app, second);
    const open = await freezeQuote(app, "RAM3", customerId, requestId);
    const workspace = (await body(await app.request(`/api/customers/${customerId}/workspace`))).workspace as { jobs: Json[]; quotes: Json[] };
    expect(workspace.jobs).toHaveLength(2);
    const secondOrder = workspace.quotes.find((item) => item.quoteSnapshotId === second)?.orderSnapshotId;
    const secondJob = workspace.jobs.find((item) => item.orderSnapshotId === secondOrder) as Json;
    await send(app, "PUT", `/api/customers/${customerId}/site-assignments`, { subjectKind: "JOB", subjectId: secondJob.jobId, siteId: site.siteId });
    await upload(app, customerId, { bytes: PNG_BYTES, name: "ram2.png", type: "image/png" }, {
      kind: "PHOTO",
      photoStage: "AFTER",
      title: "Ramura doi montată",
      links: JSON.stringify([{ kind: "JOB", subjectId: secondJob.jobId }]),
    });

    const all = await history(app, customerId);
    expect(all.total).toBe(1);
    const entry = all.entries[0] as unknown as Json & { documents: Json[]; branches: Array<Json & { quote: Json | null; job: Json | null; site: Json | null }> };
    expect(entry.branches.map((branch) => branch.quote?.quoteSnapshotId)).toEqual([first, second, open]);
    expect(entry.branches.filter((branch) => branch.job)).toHaveLength(2);
    for (const branch of entry.branches.filter((item) => item.job)) {
      expect(branch.orderSnapshotId).toBe((branch.job as Json).orderSnapshotId);
      expect(branch.state).toBe("COMANDA_CREATA");
      expect(branch.stateLabel).not.toBe("În execuție");
    }
    expect(entry.branches[2]?.state).toBe("OFERTARE");
    expect(entry.state).toBeNull();
    expect(entry.documents.map((document) => document.title)).toEqual(["Ramura doi montată"]);
    expect(entry.branches.find((branch) => branch.job?.jobId === secondJob.jobId)?.site?.name).toBe("Hală");

    for (const state of ["COMANDA_CREATA", "OFERTARE"]) expect((await history(app, customerId, `?state=${state}`)).total).toBe(1);
    expect((await history(app, customerId, "?state=FINALIZAT")).total).toBe(0);
    expect((await history(app, customerId, `?site=${encodeURIComponent(site.siteId as string)}`)).total).toBe(1);
    expect((await history(app, customerId, "?q=RAM3")).total).toBe(1);
  });

  it("lists every work of the client once — WorkOS jobs and historical records — with coherent counts (N-020 Lucrări)", async () => {
    const app = createApp();
    const customerId = await createCustomer(app, "Client Lucrări");
    const onlyHistorical = await createCustomer(app, "Client Doar Istoric");
    const nothing = await createCustomer(app, "Client Fără Lucrări");
    const requestId = await createRequest(app, customerId, "Casetă și litere");
    const first = await freezeQuote(app, "LUC1", customerId, requestId);
    const second = await freezeQuote(app, "LUC2", customerId, requestId);
    await freezeQuote(app, "LUC3", customerId, requestId);
    await acceptAndOrder(app, first);
    await acceptAndOrder(app, second);
    const other = await createRequest(app, customerId, "Doar ofertă");
    await freezeQuote(app, "LUC4", customerId, other);
    const work2021 = ((await body(await send(app, "POST", `/api/customers/${customerId}/historical-works`, { title: "Firmă 2021", eventDate: "2021-06" }))).work as Json).workId as string;
    await send(app, "POST", `/api/customers/${customerId}/historical-works`, { title: "Autocolant 2025", eventDate: "2025-11" });
    await send(app, "POST", `/api/customers/${onlyHistorical}/historical-works`, { title: "Unică istorică", eventDate: "2019" });
    await createRequest(app, nothing, "Cerere fără ofertă");
    await upload(app, customerId, { bytes: PDF_BYTES, name: "f2021.pdf", type: "application/pdf" }, {
      kind: "INVOICE",
      title: "Factură 2021",
      documentNumber: "F-2021-1",
      links: JSON.stringify([{ kind: "HISTORICAL_WORK", subjectId: work2021 }]),
    });

    const works = async (id: string, query = "") =>
      (await body(await app.request(`/api/customers/${id}/works${query}`))).works as {
        total: number;
        pageCount: number;
        totals: Json;
        items: Array<Json & { documents: Json[]; job: Json | null }>;
      };
    const all = await works(customerId);
    // Two jobs from one request (open quotes and the quote-only request add nothing) + two historical works.
    expect(all.totals).toEqual({ all: 4, workos: 2, historical: 2 });
    expect(all.items.filter((item) => item.job).map((item) => item.job?.jobId)).toHaveLength(2);
    expect(new Set(all.items.map((item) => item.workId)).size).toBe(4);
    expect((await works(customerId, "?kind=HISTORICAL&year=2021")).items.map((item) => item.title)).toEqual(["Firmă 2021"]);
    const filtered = await works(customerId, "?kind=WORKOS");
    expect([filtered.total, filtered.totals.all]).toEqual([2, 4]);
    const paged = await works(customerId, "?pageSize=3&page=2");
    expect([paged.items.length, paged.pageCount, paged.totals.all]).toEqual([1, 2, 4]);

    // The same documents for the same work in Lucrări and in Istoric.
    const fromWorks = all.items.find((item) => item.historicalWorkId === work2021)?.documents;
    const fromHistory = (await history(app, customerId, "?year=2021")).entries[0]?.documents;
    expect(fromWorks?.map((item) => item.documentId)).toEqual(fromHistory?.map((item) => item.documentId));
    expect(fromWorks).toHaveLength(1);

    // The counts of the Clienți family say the same thing: workCount = WorkOS jobs + historical works.
    const summary = ((await body(await app.request(`/api/customers/${customerId}/workspace`))).workspace as { summary: Json }).summary;
    expect(summary).toMatchObject({ jobCount: 2, historicalWorkCount: 2, workCount: 4 });
    const registry = ((await body(await app.request("/api/customers"))).registry as { customers: Json[] }).customers;
    expect(registry.find((item) => item.customerId === customerId)).toMatchObject({ jobCount: 2, historicalWorkCount: 2, workCount: 4 });
    expect(registry.find((item) => item.customerId === onlyHistorical)).toMatchObject({ jobCount: 0, workCount: 1 });
    expect((await works(onlyHistorical)).totals).toEqual({ all: 1, workos: 0, historical: 1 });
    expect((await works(nothing)).totals).toEqual({ all: 0, workos: 0, historical: 0 });
  });

  it("updates current data without altering history or frozen documents", async () => {
    const sqlite = join(process.env.WORKOS_DATA_DIR ?? "", "plane.sqlite");
    const runtime = createProductSystemRuntime(sqlite, { documentsRoot: join(process.env.WORKOS_DATA_DIR ?? "", "documents") });
    const app = createApp({ productSystem: runtime });
    const customerId = await createCustomer(app, "Client Schimbări", { address: "Adresa veche 1", city: "Iași" });
    const site = await createSite(app, customerId, { name: "Atelier", address: "Str. Fabricii 2", city: "Iași" });
    const requestId = await createRequest(app, customerId, "Firmă atelier");
    await send(app, "PUT", `/api/customers/${customerId}/site-assignments`, { subjectKind: "REQUEST", subjectId: requestId, siteId: site.siteId });
    const quoteId = await freezeQuote(app, "ATL1", customerId, requestId);
    await acceptAndOrder(app, quoteId);
    await send(app, "POST", `/api/customers/${customerId}/historical-works`, { title: "Prima firmă", eventDate: "2021-03-10", siteId: site.siteId });
    const terms1 = await send(app, "PUT", `/api/customers/${customerId}/commercial-terms`, { paymentTermDays: 30, advancePercent: 50, currency: "RON", legalName: "Client Schimbări SRL" });
    expect(terms1.status).toBe(200);
    const frozen = () => {
      const db = new Database(sqlite, { readonly: true });
      try {
        return db.prepare("SELECT content_hash, payload FROM quote_snapshots WHERE quote_snapshot_id = ?").get(quoteId) as Json;
      } finally {
        db.close();
      }
    };
    const quoteBefore = frozen();

    // Current data changes: customer address, site address and name, payment terms.
    expect((await send(app, "PATCH", `/api/customers/${customerId}`, { address: "Adresa nouă 99" })).status).toBe(200);
    expect((await send(app, "PATCH", `/api/customers/${customerId}/sites/${site.siteId}`, { name: "Atelier mutat", address: "Str. Nouă 5", expectedRevision: site.revision })).status).toBe(200);
    const terms2 = await send(app, "PUT", `/api/customers/${customerId}/commercial-terms`, { paymentTermDays: 15, expectedRevision: 1 });
    expect(((await body(terms2)).terms as Json).revision).toBe(2);
    expect((await send(app, "PUT", `/api/customers/${customerId}/commercial-terms`, { paymentTermDays: 10, expectedRevision: 1 })).status).toBe(409);

    // Frozen quote untouched; history keeps the site as it was; the old terms revision remains.
    expect(frozen()).toEqual(quoteBefore);
    const entries = (await history(app, customerId)).entries;
    for (const entry of entries) {
      expect((entry.site as Json).name).toBe("Atelier mutat");
      expect(entry.siteAtTimeLabel).toBe("Atelier · Str. Fabricii 2, Iași");
    }
    const terms = await body(await app.request(`/api/customers/${customerId}/commercial-terms`));
    expect(terms.revisions).toHaveLength(2);
    expect((terms.terms as Json).paymentTermDays).toBe(15);
    expect((terms.terms as Json).advancePercent).toBe(50);
    const db = new Database(sqlite, { readonly: true });
    try {
      const first = db.prepare("SELECT fields_json FROM customer_commercial_terms_revisions WHERE customer_id = ? AND revision = 1").get(customerId) as { fields_json: string };
      expect(JSON.parse(first.fields_json)).toMatchObject({ paymentTermDays: 30, advancePercent: 50 });
      const events = db.prepare("SELECT event_kind FROM customer_dossier_events WHERE customer_id = ? ORDER BY occurred_at, event_id").all(customerId) as Json[];
      expect(events.map((event) => event.event_kind)).toEqual(
        expect.arrayContaining(["SITE_CREATED", "SITE_ASSIGNED", "HISTORICAL_WORK_RECORDED", "COMMERCIAL_TERMS_RECORDED", "SITE_UPDATED"]),
      );
    } finally {
      db.close();
    }
    // Unknown values stay empty; an invalid value is refused, not coerced.
    expect((terms.fields as Json).registrationNumber).toBeNull();
    expect((await send(app, "PUT", `/api/customers/${customerId}/commercial-terms`, { advancePercent: 140 })).status).toBe(400);
    runtime.close();
  });
});
