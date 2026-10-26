// N-020 · PR #99 · concurrent edits of a site, a document and a historical work.
// Two edits made on the same revision: one is saved, the other gets 409 `stale_revision`, never a
// silent overwrite. Each test runs on its own temporary SQLite file (WAL), so two app instances —
// two connections to the same database — can race as two API processes would.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { updateCustomerDocumentAtRevision } from "../src/customerDossier/documents.js";
import { updateHistoricalWorkAtRevision } from "../src/customerDossier/historicalWorks.js";
import { updateCustomerSiteAtRevision } from "../src/customerDossier/sites.js";
import { openSqliteDatabase, type SqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime, type ProductSystemRuntime } from "../src/productSystem/runtime.js";

type Json = Record<string, unknown>;
type App = ReturnType<typeof createApp>;

const temps: string[] = [];
let previousDataDir: string | undefined;
let dir = "";

beforeEach(() => {
  previousDataDir = process.env.WORKOS_DATA_DIR;
  dir = mkdtempSync(join(tmpdir(), "workos-dossier-race-"));
  temps.push(dir);
  process.env.WORKOS_DATA_DIR = dir;
});

// Every connection is closed before its folder is removed (Windows keeps open files locked).
const runtimes: ProductSystemRuntime[] = [];

afterEach(() => {
  for (const runtime of runtimes.splice(0)) runtime.close();
  if (previousDataDir === undefined) delete process.env.WORKOS_DATA_DIR;
  else process.env.WORKOS_DATA_DIR = previousDataDir;
  for (const item of temps.splice(0)) rmSync(item, { recursive: true, force: true });
});

const sqlitePath = () => join(dir, "plane.sqlite");
function runtimeOnFile(): ProductSystemRuntime {
  const runtime = createProductSystemRuntime(sqlitePath(), { documentsRoot: join(dir, "documents") });
  runtimes.push(runtime);
  return runtime;
}

async function send(app: App, method: string, path: string, payload?: unknown): Promise<Response> {
  return app.request(path, {
    method,
    headers: payload === undefined ? {} : { "content-type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

type Fixture = { customerId: string; otherCustomerId: string; siteId: string; documentId: string; workId: string };

async function fixture(app: App): Promise<Fixture> {
  const customer = async (displayName: string) => ((await json(await send(app, "POST", "/api/customers", { displayName }))).customer as Json).customerId as string;
  const customerId = await customer("Probă concurență SRL");
  const otherCustomerId = await customer("Alt client SRL");
  const site = (await json(await send(app, "POST", `/api/customers/${customerId}/sites`, { name: "Sediu inițial" }))).site as Json;
  const form = new FormData();
  form.set("file", new File([new TextEncoder().encode("%PDF-1.4\n% DEMO\n%%EOF\n")], "factura.pdf", { type: "application/pdf" }));
  form.set("kind", "INVOICE");
  form.set("title", "Factură inițială");
  const uploaded = await app.request(`/api/customers/${customerId}/documents`, { method: "POST", body: form });
  expect(uploaded.status).toBe(201);
  const documentId = (await json(uploaded)).documentId as string;
  const work = (await json(await send(app, "POST", `/api/customers/${customerId}/historical-works`, { title: "Lucrare inițială", eventDate: "2021" }))).work as Json;
  return { customerId, otherCustomerId, siteId: site.siteId as string, documentId, workId: work.workId as string };
}

/** What is stored, read through a separate connection: value, revision, update events. */
function stored(route: Route, f: Fixture): { value: string; revision: number; updateEvents: number } {
  const db = new Database(sqlitePath(), { readonly: true });
  try {
    const row = db.prepare(`SELECT ${route.column} AS value, revision FROM ${route.table} WHERE ${route.key} = ?`).get(route.id(f)) as { value: string; revision: number };
    const events = db
      .prepare(`SELECT COUNT(*) AS n FROM customer_dossier_events WHERE subject_id = ? AND event_kind = ?`)
      .get(route.id(f), route.updateEvent) as { n: number };
    return { value: row.value, revision: row.revision, updateEvents: events.n };
  } finally {
    db.close();
  }
}

type Route = {
  name: string;
  path: (f: Fixture, customerId?: string) => string;
  field: string;
  table: string;
  key: string;
  column: string;
  updateEvent: string;
  id: (f: Fixture) => string;
  initial: string;
  /** The 409 body the client reads: the code, and for sites and works the current version. */
  conflictBody: (body: Json) => void;
  /** Another edit landing between this request's read and its write (another connection). */
  competing: (db: SqliteDatabase, f: Fixture, value: string) => boolean;
};

const routes: Route[] = [
  {
    name: "PATCH documents/:documentId",
    path: (f, customerId = f.customerId) => `/api/customers/${customerId}/documents/${f.documentId}`,
    field: "title",
    table: "customer_documents",
    key: "document_id",
    column: "title",
    updateEvent: "DOCUMENT_METADATA_UPDATED",
    id: (f) => f.documentId,
    initial: "Factură inițială",
    conflictBody: (body) => expect(body).toEqual({ error: "stale_revision" }),
    competing: (db, f, value) => {
      const row = db.prepare("SELECT * FROM customer_documents WHERE document_id = ?").get(f.documentId) as Json;
      return updateCustomerDocumentAtRevision(
        db,
        {
          documentId: f.documentId,
          customerId: f.customerId,
          kind: row.kind,
          photoStage: row.photo_stage,
          title: value,
          documentNumber: row.document_number,
          documentDate: row.document_date,
          description: row.description,
        } as never,
        1,
      );
    },
  },
  {
    name: "PATCH sites/:siteId",
    path: (f, customerId = f.customerId) => `/api/customers/${customerId}/sites/${f.siteId}`,
    field: "name",
    table: "customer_sites",
    key: "site_id",
    column: "name",
    updateEvent: "SITE_UPDATED",
    id: (f) => f.siteId,
    initial: "Sediu inițial",
    conflictBody: (body) => {
      expect(body.error).toBe("stale_revision");
      expect((body.site as Json).revision).toBe(2);
    },
    competing: (db, f, value) => {
      const row = db.prepare("SELECT * FROM customer_sites WHERE site_id = ?").get(f.siteId) as Json;
      return updateCustomerSiteAtRevision(
        db,
        {
          siteId: f.siteId,
          customerId: f.customerId,
          name: value,
          address: row.address,
          city: row.city,
          contactName: row.contact_name,
          phone: row.phone,
          accessNotes: row.access_notes,
          status: row.status,
          updatedAt: new Date().toISOString(),
        } as never,
        1,
      );
    },
  },
  {
    name: "PATCH historical-works/:workId",
    path: (f, customerId = f.customerId) => `/api/customers/${customerId}/historical-works/${f.workId}`,
    field: "title",
    table: "customer_historical_works",
    key: "work_id",
    column: "title",
    updateEvent: "HISTORICAL_WORK_UPDATED",
    id: (f) => f.workId,
    initial: "Lucrare inițială",
    conflictBody: (body) => {
      expect(body.error).toBe("stale_revision");
      expect((body.work as Json).revision).toBe(2);
    },
    competing: (db, f, value) => {
      const row = db.prepare("SELECT * FROM customer_historical_works WHERE work_id = ?").get(f.workId) as Json;
      return updateHistoricalWorkAtRevision(
        db,
        {
          workId: f.workId,
          customerId: f.customerId,
          siteId: row.site_id,
          siteSnapshot: null,
          title: value,
          reference: row.reference,
          description: row.description,
          eventDate: row.event_date,
          eventDateEnd: row.event_date_end,
          updatedAt: new Date().toISOString(),
        } as never,
        1,
      );
    },
  },
];

/**
 * The runtime's database, wrapped so that the next guarded UPDATE of `table` first lets another
 * connection write the same row. This is the interleaving two API instances can produce; production
 * code is not touched, only the test's view of the database.
 */
function interleaveBeforeGuardedWrite(runtime: ProductSystemRuntime, table: string, otherWrite: () => void): void {
  const plane = runtime.assemblyPlane();
  let pending = true;
  const db = new Proxy(plane.db, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => {
          if (pending && new RegExp(`^\\s*UPDATE ${table} `).test(sql) && /AND revision = \?/.test(sql)) {
            pending = false;
            otherWrite();
          }
          return target.prepare(sql);
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });
  runtime.assemblyPlane = () => ({ ...plane, db });
}

describe.each(routes)("$name — revision guard", (route) => {
  it("requires expectedRevision as a positive integer and writes nothing without it", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    for (const payload of [{}, { expectedRevision: "1" }, { expectedRevision: 0 }, { expectedRevision: -1 }, { expectedRevision: 1.5 }, { expectedRevision: null }]) {
      const response = await send(app, "PATCH", route.path(f), { [route.field]: "Fără revizie", ...payload });
      expect(response.status).toBe(400);
      expect(await json(response)).toEqual({ error: "invalid_payload", field: "expectedRevision" });
    }
    expect(stored(route, f)).toEqual({ value: route.initial, revision: 1, updateEvents: 0 });
  });

  it("refuses a stale revision with the conflict the interface reads", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    expect((await send(app, "PATCH", route.path(f), { [route.field]: "Valoare A", expectedRevision: 1 })).status).toBe(200);
    const stale = await send(app, "PATCH", route.path(f), { [route.field]: "Valoare B", expectedRevision: 1 });
    expect(stale.status).toBe(409);
    route.conflictBody(await json(stale));
    const ahead = await send(app, "PATCH", route.path(f), { [route.field]: "Valoare C", expectedRevision: 7 });
    expect(ahead.status).toBe(409);
    expect(stored(route, f)).toEqual({ value: "Valoare A", revision: 2, updateEvents: 1 });
  });

  it("keeps the other answers: unchanged values, another client's id, unknown id, invalid value", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    const same = await send(app, "PATCH", route.path(f), { [route.field]: route.initial, expectedRevision: 1 });
    expect(same.status).toBe(200);
    expect((await json(same)).alreadyApplied).toBe(true);
    expect((await send(app, "PATCH", route.path(f, f.otherCustomerId), { [route.field]: "Străin", expectedRevision: 1 })).status).toBe(404);
    expect((await send(app, "PATCH", route.path(f).replace(/[^/]+$/, "necunoscut"), { [route.field]: "X", expectedRevision: 1 })).status).toBe(404);
    expect((await send(app, "PATCH", route.path(f), { [route.field]: "", expectedRevision: 1 })).status).toBe(400);
    expect(stored(route, f)).toEqual({ value: route.initial, revision: 1, updateEvents: 0 });
  });

  it("two simultaneous edits on the same revision in one instance: one 200, one 409", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    const responses = await Promise.all([
      send(app, "PATCH", route.path(f), { [route.field]: "Valoare A", expectedRevision: 1 }),
      send(app, "PATCH", route.path(f), { [route.field]: "Valoare B", expectedRevision: 1 }),
    ]);
    const statuses = responses.map((response) => response.status);
    expect([...statuses].sort()).toEqual([200, 409]);
    const winner = statuses[0] === 200 ? "Valoare A" : "Valoare B";
    route.conflictBody(await json(responses[statuses.indexOf(409)]!));
    expect(stored(route, f)).toEqual({ value: winner, revision: 2, updateEvents: 1 });
  });

  it("two simultaneous edits through two instances on the same database: one 200, one 409", async () => {
    const first = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(first);
    const second = createApp({ productSystem: runtimeOnFile() });
    const responses = await Promise.all([
      send(first, "PATCH", route.path(f), { [route.field]: "Valoare A", expectedRevision: 1 }),
      send(second, "PATCH", route.path(f), { [route.field]: "Valoare B", expectedRevision: 1 }),
    ]);
    const statuses = responses.map((response) => response.status);
    expect([...statuses].sort()).toEqual([200, 409]);
    const winner = statuses[0] === 200 ? "Valoare A" : "Valoare B";
    expect(stored(route, f)).toEqual({ value: winner, revision: 2, updateEvents: 1 });
  });

  it("another connection writing between the read and the write: 409, its value kept, no event, no false success", async () => {
    const runtime = runtimeOnFile();
    const app = createApp({ productSystem: runtime });
    const f = await fixture(app);
    const other = openSqliteDatabase(sqlitePath());
    let otherApplied = false;
    interleaveBeforeGuardedWrite(runtime, route.table, () => {
      otherApplied = route.competing(other, f, "Valoarea celeilalte instanțe");
    });
    try {
      const response = await send(app, "PATCH", route.path(f), { [route.field]: "Valoarea acestei cereri", expectedRevision: 1 });
      expect(otherApplied).toBe(true);
      expect(response.status).toBe(409);
      route.conflictBody(await json(response));
      // Only the other connection's edit is stored; this request recorded nothing.
      expect(stored(route, f)).toEqual({ value: "Valoarea celeilalte instanțe", revision: 2, updateEvents: 0 });
    } finally {
      other.close();
    }
  });
});

describe("guarded writes across two connections to the same database", () => {
  it("the second write on the same revision changes nothing", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    const a = openSqliteDatabase(sqlitePath());
    const b = openSqliteDatabase(sqlitePath());
    try {
      for (const route of routes) {
        expect(route.competing(a, f, "Prima conexiune")).toBe(true);
        expect(route.competing(b, f, "A doua conexiune")).toBe(false);
        expect(stored(route, f)).toEqual({ value: "Prima conexiune", revision: 2, updateEvents: 0 });
      }
    } finally {
      a.close();
      b.close();
    }
  });
});

describe("PUT commercial-terms — control, unchanged by this correction", () => {
  it("two simultaneous saves on the same revision: one 200, one 409, append-only revisions kept", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    const path = `/api/customers/${f.customerId}/commercial-terms`;
    expect((await send(app, "PUT", path, { paymentTermDays: 30 })).status).toBe(200);
    const responses = await Promise.all([
      send(app, "PUT", path, { paymentTermDays: 45, expectedRevision: 1 }),
      send(app, "PUT", path, { paymentTermDays: 60, expectedRevision: 1 }),
    ]);
    const statuses = responses.map((response) => response.status);
    expect([...statuses].sort()).toEqual([200, 409]);
    const read = await json(await app.request(path));
    expect((read.revisions as Json[]).map((item) => item.revision)).toEqual([2, 1]);
    expect((read.terms as Json).paymentTermDays).toBe(statuses[0] === 200 ? 45 : 60);
  });

  it("documented behavior: a save without expectedRevision is accepted as a new revision (nothing is lost)", async () => {
    const app = createApp({ productSystem: runtimeOnFile() });
    const f = await fixture(app);
    const path = `/api/customers/${f.customerId}/commercial-terms`;
    expect((await send(app, "PUT", path, { paymentTermDays: 30 })).status).toBe(200);
    expect((await send(app, "PUT", path, { paymentTermDays: 45 })).status).toBe(200);
    const read = await json(await app.request(path));
    expect((read.revisions as Json[]).map((item) => item.revision)).toEqual([2, 1]);
  });
});
