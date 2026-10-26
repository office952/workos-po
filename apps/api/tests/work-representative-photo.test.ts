// N-021 · the representative photo of a work: chosen, changed, cleared, invalidated, raced.
// Every test runs on its own temporary SQLite file (synthetic), so a second app instance on the same
// file is a second API process and "after refresh" is a fresh read through another connection.
import { mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { CUSTOMER_DOSSIER_PERMISSIONS } from "../src/customerDossier/access.js";
import { writeWorkRepresentativeAtRevision } from "../src/customerDossier/representativePhotos.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { createProductSystemRuntime, type ProductSystemRuntime } from "../src/productSystem/runtime.js";
import { addOrganization, addUser, cleanupCloudTemps, createCloudFixture, loginCloud, MEMBER_PASSWORD, OWNER_PASSWORD } from "./cloud-harness.js";

type Json = Record<string, unknown>;
type App = ReturnType<typeof createApp>;

const temps: string[] = [];
const runtimes: ProductSystemRuntime[] = [];
let previousDataDir: string | undefined;
let dir = "";

beforeEach(() => {
  previousDataDir = process.env.WORKOS_DATA_DIR;
  dir = mkdtempSync(join(tmpdir(), "workos-representative-"));
  temps.push(dir);
  process.env.WORKOS_DATA_DIR = dir;
});

afterEach(() => {
  // Every connection is closed before its folder is removed (Windows keeps open files locked).
  for (const runtime of runtimes.splice(0)) runtime.close();
  if (previousDataDir === undefined) delete process.env.WORKOS_DATA_DIR;
  else process.env.WORKOS_DATA_DIR = previousDataDir;
  for (const item of temps.splice(0)) rmSync(item, { recursive: true, force: true });
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

const sqlitePath = () => join(dir, "plane.sqlite");
const documentsRoot = () => join(dir, "documents");
function runtimeOnFile(): ProductSystemRuntime {
  const runtime = createProductSystemRuntime(sqlitePath(), { documentsRoot: documentsRoot() });
  runtimes.push(runtime);
  return runtime;
}
const appOnFile = () => createApp({ productSystem: runtimeOnFile() });

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
const PDF = new TextEncoder().encode("%PDF-1.4\n% DEMO\n%%EOF\n");

async function send(app: App, method: string, path: string, payload?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: payload === undefined ? {} : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
const json = async (response: Response) => (await response.json()) as Json;

async function customer(app: App, displayName: string): Promise<string> {
  return ((await json(await send(app, "POST", "/api/customers", { displayName }))).customer as Json).customerId as string;
}

async function photo(app: App, customerId: string, title: string, stage: string, links: Array<{ kind: string; subjectId: string }>): Promise<string> {
  const form = new FormData();
  form.set("file", new File([PNG], `${title}.png`, { type: "image/png" }));
  form.set("kind", "PHOTO");
  form.set("photoStage", stage);
  form.set("title", title);
  form.set("links", JSON.stringify(links));
  const response = await app.request(`/api/customers/${customerId}/documents`, { method: "POST", body: form });
  expect(response.status).toBe(201);
  return (await json(response)).documentId as string;
}

async function historicalWork(app: App, customerId: string, title: string): Promise<string> {
  return ((await json(await send(app, "POST", `/api/customers/${customerId}/historical-works`, { title, eventDate: "2021-06" }))).work as Json).workId as string;
}

/** Two WorkOS jobs on one request (two accepted quotes, two orders). */
async function twoJobsOneRequest(app: App, customerId: string): Promise<{ requestId: string; jobs: [string, string] }> {
  const requestId = ((await json(await send(app, "POST", "/api/requests", { customerId, title: "Litere și casetă", description: "Test." }))).request as Json).requestId as string;
  for (const inscription of ["REP1", "REP2"]) {
    const values = { "face.finish": "none", "face.confirmedAreaMm2": 250000, "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500, "root.inscription": inscription };
    const preview = await json(await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values }));
    const quote = ((await json(await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, { manualProductNetPrice: 400, values, reviewId: preview.reviewId, customerId, requestId }))).quoteSnapshot as Json).quoteSnapshotId as string;
    expect((await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quote}/acceptance`)).status).toBeLessThan(300);
    expect((await send(app, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quote}/order`)).status).toBeLessThan(300);
  }
  const jobs = ((await json(await app.request(`/api/customers/${customerId}/workspace`))).workspace as { jobs: Json[] }).jobs.map((job) => job.jobId as string);
  expect(jobs).toHaveLength(2);
  return { requestId, jobs: [jobs[0] as string, jobs[1] as string] };
}

const choose = (app: App, customerId: string, body: Json) => send(app, "PUT", `/api/customers/${customerId}/works/representative-photo`, body);

type WorkView = Json & { workId: string; representativePhoto: Json; documents: Json[] };
async function workOf(app: App, customerId: string, workId: string): Promise<WorkView> {
  const items = ((await json(await app.request(`/api/customers/${customerId}/works?pageSize=50`))).works as { items: WorkView[] }).items;
  const item = items.find((entry) => entry.workId === workId);
  if (!item) throw new Error(`work ${workId}`);
  return item;
}

/** What is stored, through a separate read-only connection. */
function storedEvents(kind?: string): Array<{ event_kind: string; subject_id: string; detail_json: string }> {
  const db = new Database(sqlitePath(), { readonly: true });
  try {
    const rows = db.prepare("SELECT event_kind, subject_id, detail_json FROM customer_dossier_events WHERE event_kind LIKE 'WORK_REPRESENTATIVE_%' ORDER BY occurred_at, event_id").all() as Array<{ event_kind: string; subject_id: string; detail_json: string }>;
    return kind ? rows.filter((row) => row.event_kind === kind) : rows;
  } finally {
    db.close();
  }
}
function storedRow(workId: string): Json | undefined {
  const db = new Database(sqlitePath(), { readonly: true });
  try {
    return db.prepare("SELECT * FROM work_representative_photos WHERE work_id = ?").get(workId) as Json | undefined;
  } finally {
    db.close();
  }
}

function filesUnder(root: string): number {
  let count = 0;
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      if (statSync(child).isDirectory()) walk(child);
      else count += 1;
    }
  };
  walk(root);
  return count;
}

describe("N-021 · representative photo of a work", () => {
  it("chooses, changes and clears a historical work's photo; the automatic rule is the fallback; nothing is copied", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Reprezentativ");
    const workId = await historicalWork(app, customerId, "Firmă 2021");
    const before = await photo(app, customerId, "Fațadă înainte", "BEFORE", [{ kind: "HISTORICAL_WORK", subjectId: workId }]);
    const simulation = await photo(app, customerId, "Simulare", "SIMULATION", [{ kind: "HISTORICAL_WORK", subjectId: workId }]);
    const after = await photo(app, customerId, "După montaj", "AFTER", [{ kind: "HISTORICAL_WORK", subjectId: workId }]);
    const files = filesUnder(documentsRoot());

    expect((await workOf(app, customerId, `historical:${workId}`)).representativePhoto).toEqual({ revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null, invalidatedAt: null });

    // Initial choice: a simulation stays a simulation (its stage is the document's, unchanged).
    const chosen = await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: simulation, expectedRevision: 0 });
    expect(chosen.status).toBe(200);
    expect(((await json(chosen)).selection as Json).revision).toBe(1);
    let view = await workOf(app, customerId, `historical:${workId}`);
    expect(view.representativePhoto).toMatchObject({ status: "MANUAL", documentId: simulation, revision: 1 });
    expect(view.documents.find((document) => document.documentId === simulation)).toMatchObject({ photoStage: "SIMULATION", photoStageLabel: "Simulare" });
    expect(view.stateLabel).toBe("Finalizată");

    // Change: to the before photo; repeating it is acknowledged without a new revision or event.
    expect((await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: before, expectedRevision: 1 })).status).toBe(200);
    const repeat = await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: before, expectedRevision: 2 });
    expect(await json(repeat)).toMatchObject({ alreadyApplied: true, selection: { revision: 2, documentId: before } });

    // Persistence after "refresh": a second app instance on the same database reads the same choice.
    const reopened = appOnFile();
    expect((await workOf(reopened, customerId, `historical:${workId}`)).representativePhoto).toMatchObject({ status: "MANUAL", documentId: before, revision: 2 });
    const history = ((await json(await reopened.request(`/api/customers/${customerId}/history`))).history as { entries: Json[] }).entries;
    expect(history.find((entry) => entry.historicalWorkId === workId)?.representativePhotoId).toBe(before);

    // Back to automatic: the photo and its links stay; the automatic choice (after) applies again.
    expect((await choose(reopened, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: null, expectedRevision: 2 })).status).toBe(200);
    view = await workOf(app, customerId, `historical:${workId}`);
    expect(view.representativePhoto).toMatchObject({ status: "AUTOMATIC", documentId: null, revision: 3 });
    expect(view.documents.map((document) => document.documentId).sort()).toEqual([before, simulation, after].sort());

    // Audit: three changes, three events, with who/what; the repeated choice recorded nothing.
    expect(storedEvents().map((event) => event.event_kind)).toEqual(["WORK_REPRESENTATIVE_PHOTO_SELECTED", "WORK_REPRESENTATIVE_PHOTO_SELECTED", "WORK_REPRESENTATIVE_PHOTO_CLEARED"]);
    expect(JSON.parse(storedEvents()[1]?.detail_json ?? "{}")).toMatchObject({ workKind: "HISTORICAL_WORK", documentId: before, previousDocumentId: simulation, photoStage: "BEFORE", revision: 2 });
    // No file was copied and no document row was added.
    expect(filesUnder(documentsRoot())).toBe(files);
    expect(((await json(await app.request(`/api/customers/${customerId}/dossier`))).dossier as { documents: Json[] }).documents).toHaveLength(3);
  });

  it("keeps two works of one request apart: a request photo is not a work's until linked to it; one photo may represent two works", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Două Lucrări");
    const { requestId, jobs } = await twoJobsOneRequest(app, customerId);
    const requestPhoto = await photo(app, customerId, "Simulare cerere", "SIMULATION", [{ kind: "REQUEST", subjectId: requestId }]);

    // Not linked to the job: refused, nothing stored, no event.
    const refused = await choose(app, customerId, { workKind: "JOB", workId: jobs[0], documentId: requestPhoto, expectedRevision: 0 });
    expect(refused.status).toBe(422);
    expect(await json(refused)).toEqual({ error: "photo_not_eligible", reason: "NOT_LINKED" });
    expect(storedRow(jobs[0])).toBeUndefined();
    // The request photo stays context, never the job's choice; the request has two jobs, so it is shared.
    const first = await workOf(app, customerId, `job:${jobs[0]}`);
    expect(first.representativePhoto).toMatchObject({ status: "AUTOMATIC" });
    expect((first.requestPhotos as Json).shared).toBe(true);

    // Linked explicitly to both jobs (same stored file), it can be chosen for each, separately.
    for (const job of jobs) expect((await send(app, "POST", `/api/customers/${customerId}/documents/${requestPhoto}/links`, { kind: "JOB", subjectId: job })).status).toBe(201);
    expect((await choose(app, customerId, { workKind: "JOB", workId: jobs[0], documentId: requestPhoto, expectedRevision: 0 })).status).toBe(200);
    expect((await workOf(app, customerId, `job:${jobs[0]}`)).representativePhoto).toMatchObject({ status: "MANUAL", documentId: requestPhoto });
    expect((await workOf(app, customerId, `job:${jobs[1]}`)).representativePhoto).toMatchObject({ status: "AUTOMATIC", documentId: null });
    expect((await choose(app, customerId, { workKind: "JOB", workId: jobs[1], documentId: requestPhoto, expectedRevision: 0 })).status).toBe(200);
    expect((await workOf(app, customerId, `job:${jobs[1]}`)).representativePhoto).toMatchObject({ status: "MANUAL", documentId: requestPhoto });

    // Istoric: one project with two works never takes one work's choice as the image of the whole.
    const entries = ((await json(await app.request(`/api/customers/${customerId}/history`))).history as { entries: Json[] }).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]?.representativePhotoId).toBeNull();
    // The dossier lists every work's choice with the revision to name.
    const listed = ((await json(await app.request(`/api/customers/${customerId}/dossier`))).dossier as { representativePhotos: Json[] }).representativePhotos;
    expect(listed.filter((item) => item.status === "MANUAL").map((item) => item.workId).sort()).toEqual([...jobs].sort());
  });

  it("sets the choice aside, with a trace, when the photo is unlinked from the work or stops being a photo", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Dezlegare");
    const workA = await historicalWork(app, customerId, "Lucrare A");
    const workB = await historicalWork(app, customerId, "Lucrare B");
    const shared = await photo(app, customerId, "Comună", "AFTER", [{ kind: "HISTORICAL_WORK", subjectId: workA }, { kind: "HISTORICAL_WORK", subjectId: workB }]);
    const other = await photo(app, customerId, "Alta A", "BEFORE", [{ kind: "HISTORICAL_WORK", subjectId: workA }]);
    expect((await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId: workA, documentId: other, expectedRevision: 0 })).status).toBe(200);
    expect((await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId: workB, documentId: shared, expectedRevision: 0 })).status).toBe(200);

    // Unlinking the shared photo from A touches nothing (A chose another photo).
    await send(app, "DELETE", `/api/customers/${customerId}/documents/${shared}/links?kind=HISTORICAL_WORK&subjectId=${workA}`);
    expect(storedEvents("WORK_REPRESENTATIVE_PHOTO_INVALIDATED")).toHaveLength(0);
    // Unlinking A's chosen photo from A: invalidated, fallback, trace; the photo and its file remain.
    await send(app, "DELETE", `/api/customers/${customerId}/documents/${other}/links?kind=HISTORICAL_WORK&subjectId=${workA}`);
    expect((await workOf(app, customerId, `historical:${workA}`)).representativePhoto).toMatchObject({ status: "INVALIDATED", documentId: null, invalidatedReason: "UNLINKED", revision: 2 });
    expect(storedRow(workA)).toMatchObject({ document_id: null, invalidated_document_id: other, invalidated_reason: "UNLINKED" });
    expect((await app.request(`/api/customers/${customerId}/documents/${other}/content`)).status).toBe(200);
    // B keeps its choice of the shared photo until the document stops being a photo.
    expect((await workOf(app, customerId, `historical:${workB}`)).representativePhoto).toMatchObject({ status: "MANUAL", documentId: shared });
    expect((await send(app, "PATCH", `/api/customers/${customerId}/documents/${shared}`, { kind: "OTHER", expectedRevision: 1 })).status).toBe(200);
    expect((await workOf(app, customerId, `historical:${workB}`)).representativePhoto).toMatchObject({ status: "INVALIDATED", invalidatedReason: "NOT_A_PHOTO" });
    expect(storedEvents("WORK_REPRESENTATIVE_PHOTO_INVALIDATED").map((event) => [event.subject_id, JSON.parse(event.detail_json).reason])).toEqual([
      [workA, "UNLINKED"],
      [workB, "NOT_A_PHOTO"],
    ]);

    // "Revino la alegerea automată" acknowledges the notice (a change: new revision, one event).
    const acknowledged = await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId: workA, documentId: null, expectedRevision: 2 });
    expect(await json(acknowledged)).toMatchObject({ alreadyApplied: false, selection: { documentId: null, invalidated: null, revision: 3 } });
    expect((await workOf(app, customerId, `historical:${workA}`)).representativePhoto).toMatchObject({ status: "AUTOMATIC" });
    // A non-photo can never be chosen.
    expect(await json(await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId: workB, documentId: shared, expectedRevision: 2 }))).toEqual({ error: "photo_not_eligible", reason: "NOT_A_PHOTO" });
  });

  it("refuses stale revisions, other customers' works and photos, and invalid payloads, recording nothing", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Refuzuri");
    const otherCustomer = await customer(app, "Alt Client");
    const workId = await historicalWork(app, customerId, "Lucrare");
    const otherWork = await historicalWork(app, otherCustomer, "Lucrarea altuia");
    const own = await photo(app, customerId, "Proprie", "AFTER", [{ kind: "HISTORICAL_WORK", subjectId: workId }]);
    const foreign = await photo(app, otherCustomer, "Străină", "AFTER", [{ kind: "HISTORICAL_WORK", subjectId: otherWork }]);
    const invoiceForm = new FormData();
    invoiceForm.set("file", new File([PDF], "f.pdf", { type: "application/pdf" }));
    invoiceForm.set("kind", "INVOICE");
    invoiceForm.set("links", JSON.stringify([{ kind: "HISTORICAL_WORK", subjectId: workId }]));
    const invoice = (await json(await app.request(`/api/customers/${customerId}/documents`, { method: "POST", body: invoiceForm }))).documentId as string;

    for (const [payload, field] of [
      [{ workKind: "SITE", workId, documentId: own, expectedRevision: 0 }, "workKind"],
      [{ workKind: "HISTORICAL_WORK", workId: "", documentId: own, expectedRevision: 0 }, "workId"],
      [{ workKind: "HISTORICAL_WORK", workId, documentId: 5, expectedRevision: 0 }, "documentId"],
      [{ workKind: "HISTORICAL_WORK", workId, documentId: own }, "expectedRevision"],
      [{ workKind: "HISTORICAL_WORK", workId, documentId: own, expectedRevision: -1 }, "expectedRevision"],
      [{ workKind: "HISTORICAL_WORK", workId, documentId: own, expectedRevision: "0" }, "expectedRevision"],
    ] as const) {
      const response = await choose(app, customerId, payload);
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ error: "invalid_payload", field });
    }
    // Another customer's work through this customer, and another customer's photo for this work.
    expect((await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId: otherWork, documentId: foreign, expectedRevision: 0 })).status).toBe(422);
    expect(await json(await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: foreign, expectedRevision: 0 }))).toEqual({ error: "photo_not_eligible", reason: "NOT_FOUND" });
    expect(await json(await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: invoice, expectedRevision: 0 }))).toEqual({ error: "photo_not_eligible", reason: "NOT_A_PHOTO" });
    expect((await choose(app, "cust:missing", { workKind: "HISTORICAL_WORK", workId, documentId: own, expectedRevision: 0 })).status).toBe(404);
    // A revision that is not the current one, ahead or behind.
    const ahead = await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: own, expectedRevision: 3 });
    expect(ahead.status).toBe(409);
    expect(await json(ahead)).toEqual({ error: "stale_revision", selection: null });
    expect((await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: own, expectedRevision: 0 })).status).toBe(200);
    const behind = await choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: null, expectedRevision: 0 });
    expect(behind.status).toBe(409);
    expect(await json(behind)).toMatchObject({ error: "stale_revision", selection: { documentId: own, revision: 1 } });
    expect(storedEvents()).toHaveLength(1);
    expect(storedRow(otherWork)).toBeUndefined();
  });

  it("two concurrent choices on the same revision: one is saved, the other gets 409 and records nothing", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Concurență");
    const workId = await historicalWork(app, customerId, "Lucrare disputată");
    const first = await photo(app, customerId, "Prima", "AFTER", [{ kind: "HISTORICAL_WORK", subjectId: workId }]);
    const second = await photo(app, customerId, "A doua", "BEFORE", [{ kind: "HISTORICAL_WORK", subjectId: workId }]);
    // Two API instances (two connections to one database), both on revision 0: both race to create.
    const other = appOnFile();
    const results = await Promise.all([
      choose(app, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: first, expectedRevision: 0 }),
      choose(other, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: second, expectedRevision: 0 }),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(storedEvents("WORK_REPRESENTATIVE_PHOTO_SELECTED")).toHaveLength(1);

    // The guarded write itself: another connection lands between this request's read and its write.
    const runtime = runtimeOnFile();
    const plane = runtime.assemblyPlane();
    let pending = true;
    const db = new Proxy(plane.db, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            if (pending && /^\s*UPDATE work_representative_photos SET document_id = \?/.test(sql)) {
              pending = false;
              const competitor = new Database(sqlitePath());
              try {
                expect(writeWorkRepresentativeAtRevision(competitor, { customerId, workKind: "HISTORICAL_WORK", workId, documentId: null, expectedRevision: 1, at: new Date().toISOString(), actorAccountId: "competitor" })).toBe(true);
              } finally {
                competitor.close();
              }
            }
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    runtime.assemblyPlane = () => ({ ...plane, db });
    const raced = createApp({ productSystem: runtime });
    const winnerId = storedRow(workId)?.document_id === first ? second : first;
    const lost = await choose(raced, customerId, { workKind: "HISTORICAL_WORK", workId, documentId: winnerId, expectedRevision: 1 });
    expect(lost.status).toBe(409);
    expect(await json(lost)).toMatchObject({ error: "stale_revision", selection: { documentId: null, revision: 2 } });
    expect(storedRow(workId)).toMatchObject({ document_id: null, revision: 2 });
    // Only the first winner's event: the competitor wrote directly, the loser recorded nothing.
    expect(storedEvents()).toHaveLength(1);
  });
});

describe("N-021 · organizations, users and permissions", () => {
  it("keeps the choice inside the organization, shared by its users, and gated by the document permission", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const beta = await addOrganization(fixture, "Atelier Beta");
    await addUser(fixture, { email: "owner-a@example.test", password: OWNER_PASSWORD, organizationId: alpha.organization.organizationId, role: "owner" });
    await addUser(fixture, { email: "member-a@example.test", password: MEMBER_PASSWORD, organizationId: alpha.organization.organizationId, role: "member" });
    await addUser(fixture, { email: "owner-b@example.test", password: OWNER_PASSWORD, organizationId: beta.organization.organizationId, role: "owner" });
    const as = (cookie: string) => async (method: string, path: string, payload?: unknown) => {
      const response = await fixture.app.request(path, {
        method,
        headers: payload === undefined ? { cookie } : { cookie, "content-type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      return { status: response.status, body: (await response.json().catch(() => null)) as Json };
    };
    const ownerA = as((await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD)).cookie ?? "");
    const memberA = as((await loginCloud(fixture.app, "member-a@example.test", MEMBER_PASSWORD, alpha.organization.organizationId)).cookie ?? "");
    const ownerB = as((await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD)).cookie ?? "");
    const ownerACookie = (await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD)).cookie ?? "";

    const customerA = ((await ownerA("POST", "/api/customers", { displayName: "Client Alpha" })).body.customer as Json).customerId as string;
    const workA = ((await ownerA("POST", `/api/customers/${customerA}/historical-works`, { title: "Lucrare Alpha", eventDate: "2022" })).body.work as Json).workId as string;
    const form = new FormData();
    form.set("file", new File([PNG], "a.png", { type: "image/png" }));
    form.set("kind", "PHOTO");
    form.set("photoStage", "AFTER");
    form.set("links", JSON.stringify([{ kind: "HISTORICAL_WORK", subjectId: workA }]));
    const photoA = ((await (await fixture.app.request(`/api/customers/${customerA}/documents`, { method: "POST", headers: { cookie: ownerACookie }, body: form })).json()) as Json).documentId as string;
    const path = `/api/customers/${customerA}/works/representative-photo`;

    // The member chooses; the owner sees the same choice (shared by the organization's users).
    expect((await memberA("PUT", path, { workKind: "HISTORICAL_WORK", workId: workA, documentId: photoA, expectedRevision: 0 })).status).toBe(200);
    const seen = ((await ownerA("GET", `/api/customers/${customerA}/works`)).body.works as { items: Json[] }).items[0]?.representativePhoto;
    expect(seen).toMatchObject({ status: "MANUAL", documentId: photoA, revision: 1 });

    // Another organization: the customer, the work and the photo do not exist there.
    expect((await ownerB("PUT", path, { workKind: "HISTORICAL_WORK", workId: workA, documentId: null, expectedRevision: 1 })).status).toBe(404);
    // Without a session: refused before anything is read.
    expect((await fixture.app.request(path, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ workKind: "HISTORICAL_WORK", workId: workA, documentId: null, expectedRevision: 1 }) })).status).toBe(401);
    // Without the document permission (the role matrix narrowed for this test): 403, nothing written.
    const previous = CUSTOMER_DOSSIER_PERMISSIONS.editDocuments;
    (CUSTOMER_DOSSIER_PERMISSIONS as Record<string, readonly string[]>).editDocuments = ["owner"];
    try {
      expect((await memberA("PUT", path, { workKind: "HISTORICAL_WORK", workId: workA, documentId: null, expectedRevision: 1 })).status).toBe(403);
      expect((((await memberA("GET", `/api/customers/${customerA}/dossier`)).body.dossier as Json).permissions as Json).editDocuments).toBe(false);
    } finally {
      (CUSTOMER_DOSSIER_PERMISSIONS as Record<string, readonly string[]>).editDocuments = previous;
    }
    const after = ((await ownerA("GET", `/api/customers/${customerA}/works`)).body.works as { items: Json[] }).items[0]?.representativePhoto;
    expect(after).toMatchObject({ status: "MANUAL", documentId: photoA, revision: 1 });
    fixture.close();
  });
});
