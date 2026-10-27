// N-023 · the customer logo: set, replaced, cleared, retried, raced, refused, isolated and served.
// Every test runs on its own temporary SQLite file (synthetic) with its own documents root; a second
// app instance on the same file is a second API process. All images are generated (logo-fixtures).
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inspectCustomerLogo, MAX_CUSTOMER_LOGO_BYTES } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { CUSTOMER_DOSSIER_PERMISSIONS } from "../src/customerDossier/access.js";
import { insertCustomerLogoRevisionAt } from "../src/customerDossier/logoStore.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { createProductSystemRuntime, type ProductSystemRuntime } from "../src/productSystem/runtime.js";
import { addOrganization, addUser, cleanupCloudTemps, createCloudFixture, loginCloud, MEMBER_PASSWORD, OWNER_PASSWORD } from "./cloud-harness.js";
import { GIF, makeJpeg, makePng, makePngWithHeaderSize, SVG, WEBP_ALPHA, WEBP_ANIMATED, WEBP_LOSSLESS, WEBP_LOSSY } from "./logo-fixtures.js";

type Json = Record<string, unknown>;
type App = ReturnType<typeof createApp>;

const temps: string[] = [];
const runtimes: ProductSystemRuntime[] = [];
let previousDataDir: string | undefined;
let dir = "";

beforeEach(() => {
  previousDataDir = process.env.WORKOS_DATA_DIR;
  dir = mkdtempSync(join(tmpdir(), "workos-logo-"));
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
const json = async (response: Response) => (await response.json()) as Json;

async function customer(app: App, displayName: string): Promise<string> {
  const response = await app.request("/api/customers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
  return ((await json(response)).customer as Json).customerId as string;
}

function putLogo(app: App, customerId: string, file: { bytes: Uint8Array; name: string; type?: string } | null, expectedRevision: unknown, headers: Record<string, string> = {}) {
  const form = new FormData();
  if (file) form.set("file", new File([file.bytes], file.name, { type: file.type ?? "" }));
  if (expectedRevision !== undefined) form.set("expectedRevision", String(expectedRevision));
  return app.request(`/api/customers/${customerId}/logo`, { method: "PUT", headers, body: form });
}
const png = (bytes = makePng()) => ({ bytes, name: "sigla.png", type: "image/png" });
const clearLogo = (app: App, customerId: string, expectedRevision: number | string) =>
  app.request(`/api/customers/${customerId}/logo?expectedRevision=${expectedRevision}`, { method: "DELETE" });

async function workspace(app: App, customerId: string): Promise<Json> {
  return (await json(await app.request(`/api/customers/${customerId}/workspace`))).workspace as Json;
}
async function registryItem(app: App, customerId: string): Promise<Json> {
  const registry = (await json(await app.request("/api/customers"))).registry as { customers: Json[] };
  const item = registry.customers.find((entry) => entry.customerId === customerId);
  if (!item) throw new Error(customerId);
  return item;
}

function stored<T>(sql: string, ...params: unknown[]): T[] {
  const db = new Database(sqlitePath(), { readonly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}
const logoRows = (customerId: string) => stored<Json>("SELECT * FROM customer_logo_revisions WHERE customer_id = ? ORDER BY revision", customerId);
const logoEvents = (customerId: string) =>
  stored<{ event_kind: string; subject_id: string; actor_account_id: string; detail_json: string }>(
    "SELECT event_kind, subject_id, actor_account_id, detail_json FROM customer_dossier_events WHERE customer_id = ? AND event_kind LIKE 'CUSTOMER_LOGO_%' ORDER BY occurred_at, event_id",
    customerId,
  );

function filesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  const files: string[] = [];
  for (const name of readdirSync(path)) {
    const child = join(path, name);
    if (statSync(child).isDirectory()) files.push(...filesUnder(child));
    else files.push(child);
  }
  return files;
}
// The storage folder name of a customer id, as attachmentStorage sanitizes it.
const segment = (customerId: string) => customerId.replace(/[^a-zA-Z0-9._-]+/g, "_");
const logoDir = (customerId: string) => join(documentsRoot(), "customers", segment(customerId), "logo");
const logoFiles = (customerId: string) => filesUnder(logoDir(customerId));

describe("N-023 · customer logo lifecycle", () => {
  it("sets, replaces and clears the logo; every revision and file is kept; the registry and the workspace follow", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Siglă SRL");
    // Without a logo: the monogram (null) and revision 0, in the workspace and the registry.
    expect(await workspace(app, customerId)).toMatchObject({ logo: null, logoRevision: 0 });
    expect((await registryItem(app, customerId)).logo).toBeNull();

    const first = await putLogo(app, customerId, png(), 0);
    expect(first.status).toBe(200);
    const firstBody = await json(first);
    expect(firstBody).toMatchObject({ alreadyApplied: false, logoRevision: 1, logo: { revision: 1, width: 32, height: 32 } });
    const href = (firstBody.logo as Json).contentHref as string;
    expect(href).toBe(`/api/customers/${encodeURIComponent(customerId)}/logo/content?revision=1`);
    // Nothing physical leaks: no storage key, path or hash in the public transport.
    expect(JSON.stringify(firstBody)).not.toMatch(/storage|sha256|[\\/]documents[\\/]/i);
    expect(await workspace(app, customerId)).toMatchObject({ logo: { revision: 1, contentHref: href }, logoRevision: 1 });
    expect((await registryItem(app, customerId)).logo).toMatchObject({ revision: 1, contentHref: href });

    const replaced = await putLogo(app, customerId, { bytes: makeJpeg(24, 16), name: "sigla.jpg", type: "image/jpeg" }, 1);
    expect(await json(replaced)).toMatchObject({ alreadyApplied: false, logoRevision: 2, logo: { revision: 2, width: 24, height: 16 } });
    const cleared = await clearLogo(app, customerId, 2);
    expect(await json(cleared)).toMatchObject({ alreadyApplied: false, logoRevision: 3, logo: null });
    expect(await workspace(app, customerId)).toMatchObject({ logo: null, logoRevision: 3 });
    expect((await registryItem(app, customerId)).logo).toBeNull();
    // Clearing again changes nothing (no fourth revision).
    expect(await json(await clearLogo(app, customerId, 3))).toMatchObject({ alreadyApplied: true, logoRevision: 3 });

    // Revisions: what was stored for each, with its provenance and actor; the cleared one has no file.
    const rows = logoRows(customerId);
    expect(rows.map((row) => [row.revision, row.has_logo, row.mime_type, row.provenance])).toEqual([
      [1, 1, "image/png", "UPLOAD"],
      [2, 1, "image/jpeg", "UPLOAD"],
      [3, 0, null, null],
    ]);
    expect(rows[0]).toMatchObject({ width: 32, height: 32, original_file_name: "sigla.png" });
    expect(typeof rows[0]!.sha256).toBe("string");
    // Both files stay; the history is never deleted.
    expect(logoFiles(customerId)).toHaveLength(2);
    // An earlier revision stays readable; the cleared revision has no content.
    expect((await app.request(href)).status).toBe(200);
    expect((await app.request(`/api/customers/${customerId}/logo/content?revision=3`)).status).toBe(404);
    expect((await app.request(`/api/customers/${customerId}/logo/content`)).status).toBe(404);

    // The journal says who changed what, for this customer.
    const events = logoEvents(customerId);
    expect(events.map((event) => event.event_kind)).toEqual(["CUSTOMER_LOGO_SET", "CUSTOMER_LOGO_SET", "CUSTOMER_LOGO_CLEARED"]);
    expect(events.every((event) => event.subject_id === customerId && event.actor_account_id)).toBe(true);
    expect(JSON.parse(events[1]!.detail_json)).toMatchObject({ revision: 2, previousRevision: 1, mimeType: "image/jpeg", previousSha256: rows[0]!.sha256 });
    expect(JSON.parse(events[2]!.detail_json)).toMatchObject({ revision: 3, previousRevision: 2, sha256: null });

    // A logo is not a dossier document or photo.
    expect(stored<Json>("SELECT COUNT(*) AS n FROM customer_documents")[0]).toEqual({ n: 0 });
  });

  it("serves the logo only checked: SHA-256, nosniff, private cache with ETag, restrictive policy; a corrupt file is refused", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Livrare");
    const bytes = makePng({ width: 40, height: 20 });
    await putLogo(app, customerId, png(bytes), 0);
    const response = await app.request(`/api/customers/${customerId}/logo/content?revision=1`);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-cache");
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="sigla-1.png"');
    const etag = response.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
    const revalidated = await app.request(`/api/customers/${customerId}/logo/content?revision=1`, { headers: { "if-none-match": etag ?? "" } });
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get("x-content-type-options")).toBe("nosniff");
    // Invalid revision parameter.
    expect((await app.request(`/api/customers/${customerId}/logo/content?revision=abc`)).status).toBe(400);
    expect((await app.request(`/api/customers/${customerId}/logo/content?revision=9`)).status).toBe(404);

    // A file changed on disk no longer matches its SHA-256 and is not delivered.
    const [file] = logoFiles(customerId);
    writeFileSync(file!, makePng({ width: 40, height: 20, colour: [255, 0, 0, 255] }));
    expect((await app.request(`/api/customers/${customerId}/logo/content?revision=1`)).status).toBe(409);
    rmSync(file!);
    expect((await app.request(`/api/customers/${customerId}/logo/content?revision=1`)).status).toBe(410);
  });

  it("does not create a revision for no real change, confirms only its own retry, and refuses every other stale revision", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Reluare");
    const bytes = makePng();
    expect((await putLogo(app, customerId, png(bytes), 0)).status).toBe(200);
    // The same logo again on the current revision: already applied, nothing new.
    expect(await json(await putLogo(app, customerId, png(bytes), 1))).toMatchObject({ alreadyApplied: true, logoRevision: 1 });
    // A retry of the first request (its answer was lost): it landed as the next revision, by this actor.
    expect(await json(await putLogo(app, customerId, png(bytes), 0))).toMatchObject({ alreadyApplied: true, logoRevision: 1 });
    expect(logoRows(customerId)).toHaveLength(1);
    expect(logoFiles(customerId)).toHaveLength(1);
    expect(logoEvents(customerId)).toHaveLength(1);

    // A different file on revision 0 is a conflict, with the current logo; nothing written or left.
    const conflict = await putLogo(app, customerId, png(makePng({ colour: [0, 0, 200, 255] })), 0);
    expect(conflict.status).toBe(409);
    expect(await json(conflict)).toMatchObject({ error: "stale_revision", logoRevision: 1, logo: { revision: 1 } });
    // Clearing on a stale revision: conflict too.
    expect((await clearLogo(app, customerId, 0)).status).toBe(409);
    // Once another change moved on, the old retry is no longer "applied".
    await putLogo(app, customerId, png(makePng({ colour: [0, 120, 0, 255] })), 1);
    expect((await putLogo(app, customerId, png(bytes), 0)).status).toBe(409);
    expect(logoRows(customerId)).toHaveLength(2);
    expect(logoFiles(customerId)).toHaveLength(2);
    expect(logoEvents(customerId)).toHaveLength(2);
  });

  it("two concurrent saves on the same revision from two connections: one revision, one 409, no orphan file", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Concurență");
    const other = appOnFile();
    const results = await Promise.all([
      putLogo(app, customerId, png(makePng({ colour: [200, 0, 0, 255] })), 0),
      putLogo(other, customerId, png(makePng({ colour: [0, 0, 200, 255] })), 0),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(logoRows(customerId)).toHaveLength(1);
    expect(logoFiles(customerId)).toHaveLength(1);
    expect(logoEvents(customerId)).toHaveLength(1);

    // The guarded write itself: another connection lands between this request's check and its insert.
    const runtime = runtimeOnFile();
    const plane = runtime.assemblyPlane();
    let pending = true;
    const db = new Proxy(plane.db, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            if (pending && /^\s*INSERT INTO customer_logo_revisions/.test(sql)) {
              pending = false;
              const competitor = new Database(sqlitePath());
              try {
                expect(insertCustomerLogoRevisionAt(competitor, { customerId, expectedRevision: 1, file: null, at: new Date().toISOString(), actorAccountId: "competitor" })).toBe(true);
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
    const lost = await putLogo(raced, customerId, png(makePng({ colour: [0, 150, 0, 255] })), 1);
    expect(lost.status).toBe(409);
    expect(await json(lost)).toMatchObject({ error: "stale_revision", logo: null, logoRevision: 2 });
    // The loser's file was removed; the competitor's revision has no file.
    expect(logoFiles(customerId)).toHaveLength(1);
    expect(logoRows(customerId).map((row) => row.has_logo)).toEqual([1, 0]);
    expect(logoEvents(customerId)).toHaveLength(1);
  });

  it("a storage failure records nothing; a database failure after the file was written leaves no file behind", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Eșec");
    // The customer's logo folder cannot be created: a file is in its place.
    mkdirSync(join(documentsRoot(), "customers", segment(customerId)), { recursive: true });
    writeFileSync(logoDir(customerId), "blocat");
    expect((await putLogo(app, customerId, png(), 0)).status).toBe(503);
    expect(logoRows(customerId)).toHaveLength(0);
    rmSync(logoDir(customerId));

    // The event cannot be written: the transaction rolls back and the new file is removed.
    const runtime = runtimeOnFile();
    const plane = runtime.assemblyPlane();
    const db = new Proxy(plane.db, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            if (/INSERT INTO customer_dossier_events/.test(sql)) throw new Error("disk I/O error (simulated)");
            return target.prepare(sql);
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    runtime.assemblyPlane = () => ({ ...plane, db });
    const failing = createApp({ productSystem: runtime });
    expect((await putLogo(failing, customerId, png(), 0)).status).toBe(500);
    expect(logoRows(customerId)).toHaveLength(0);
    expect(logoFiles(customerId)).toHaveLength(0);
    // And it works afterwards.
    expect((await putLogo(app, customerId, png(), 0)).status).toBe(200);
  });
});

describe("N-023 · accepted and refused files", () => {
  it("accepts real PNG, JPEG and WebP (lossy, lossless, with alpha), with their dimensions", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Formate");
    const files = [
      { bytes: makePng({ width: 300, height: 120 }), name: "a.png", type: "image/png", size: [300, 120] },
      { bytes: makeJpeg(64, 32), name: "b.jpeg", type: "image/jpeg", size: [64, 32] },
      { bytes: makeJpeg(8, 8), name: "c.JPG", type: "", size: [8, 8] },
      { bytes: WEBP_LOSSY, name: "d.webp", type: "image/webp", size: [1, 1] },
      { bytes: WEBP_LOSSLESS, name: "e.webp", type: "application/octet-stream", size: [1, 1] },
      { bytes: WEBP_ALPHA, name: "f", type: "image/webp", size: [1, 1] },
    ];
    let revision = 0;
    for (const file of files) {
      const response = await putLogo(app, customerId, file, revision);
      expect(response.status, file.name).toBe(200);
      revision += 1;
      expect((await json(response)).logo).toMatchObject({ revision, width: file.size[0], height: file.size[1] });
    }
    // The product's own WebP assets (real encoder output) pass the same inspection.
    for (const asset of ["request-intake.webp", "request-intake-surface.webp"]) {
      const bytes = new Uint8Array(readFileSync(new URL(`../../../src/assets/${asset}`, import.meta.url)));
      const inspected = inspectCustomerLogo(bytes, { mimeType: "image/webp", fileName: asset });
      expect(inspected.ok || inspected.reason === "DIMENSIONS", asset).toBe(true);
    }
  });

  it("refuses forbidden, fake, malformed, animated, oversized and empty files, writing nothing", async () => {
    const app = appOnFile();
    const customerId = await customer(app, "Client Refuz");
    const good = makePng();
    const corruptCrc = good.slice();
    corruptCrc[20] = (corruptCrc[20]! + 1) % 256; // inside IHDR, after the length
    const jpeg = makeJpeg(16, 16);
    const cases: Array<{ name: string; bytes: Uint8Array; type: string; status: number; reason?: string }> = [
      { name: "sigla.gif", bytes: GIF, type: "image/gif", status: 422, reason: "UNSUPPORTED_FORMAT" },
      { name: "sigla.svg", bytes: SVG, type: "image/svg+xml", status: 422, reason: "UNSUPPORTED_FORMAT" },
      { name: "sigla.png", bytes: new TextEncoder().encode("nu este o imagine"), type: "image/png", status: 422, reason: "UNSUPPORTED_FORMAT" },
      // Fake extension and fake declared type: the bytes are a PNG.
      { name: "sigla.jpg", bytes: good, type: "", status: 422, reason: "TYPE_MISMATCH" },
      { name: "sigla.png", bytes: good, type: "image/jpeg", status: 422, reason: "TYPE_MISMATCH" },
      { name: "sigla.svg", bytes: good, type: "image/png", status: 422, reason: "TYPE_MISMATCH" },
      // Signature right, structure wrong.
      { name: "sigla.png", bytes: good.subarray(0, good.byteLength - 20), type: "image/png", status: 422, reason: "MALFORMED" },
      { name: "sigla.png", bytes: corruptCrc, type: "image/png", status: 422, reason: "MALFORMED" },
      { name: "sigla.png", bytes: makePngWithHeaderSize(32, 32), type: "image/png", status: 422, reason: "MALFORMED" },
      { name: "sigla.png", bytes: Uint8Array.from([...good, 1, 2, 3]), type: "image/png", status: 422, reason: "MALFORMED" },
      { name: "sigla.jpg", bytes: jpeg.subarray(0, jpeg.byteLength - 2), type: "image/jpeg", status: 422, reason: "MALFORMED" },
      { name: "sigla.jpg", bytes: Uint8Array.from([...jpeg, 0x41, 0x42]), type: "image/jpeg", status: 422, reason: "MALFORMED" },
      { name: "sigla.webp", bytes: WEBP_LOSSY.subarray(0, 30), type: "image/webp", status: 422, reason: "MALFORMED" },
      { name: "sigla.png", bytes: makePng({ extraChunks: [{ type: "acTL", data: new Uint8Array(8), before: "IDAT" }] }), type: "image/png", status: 422, reason: "ANIMATED" },
      { name: "sigla.webp", bytes: WEBP_ANIMATED, type: "image/webp", status: 422, reason: "ANIMATED" },
      { name: "sigla.png", bytes: makePngWithHeaderSize(4097, 10), type: "image/png", status: 422, reason: "DIMENSIONS" },
      { name: "sigla.jpg", bytes: makeJpeg(4104, 8), type: "image/jpeg", status: 422, reason: "DIMENSIONS" },
      { name: "sigla.png", bytes: new Uint8Array(0), type: "image/png", status: 422, reason: "EMPTY" },
      { name: "sigla.png", bytes: new Uint8Array(MAX_CUSTOMER_LOGO_BYTES + 1), type: "image/png", status: 413 },
    ];
    for (const item of cases) {
      const response = await putLogo(app, customerId, item, 0);
      expect(response.status, `${item.name} ${item.reason ?? ""}`).toBe(item.status);
      if (item.reason) expect((await json(response)).reason, item.name).toBe(item.reason);
    }
    // Without a file or a revision.
    expect(await json(await putLogo(app, customerId, null, 0))).toMatchObject({ error: "invalid_payload", field: "file" });
    expect(await json(await putLogo(app, customerId, png(), undefined))).toMatchObject({ error: "invalid_payload", field: "expectedRevision" });
    expect((await putLogo(app, customerId, png(), "-1")).status).toBe(400);
    expect((await putLogo(app, customerId, png(), "1.5")).status).toBe(400);
    expect((await app.request(`/api/customers/${customerId}/logo`, { method: "DELETE" })).status).toBe(400);
    expect(logoRows(customerId)).toHaveLength(0);
    expect(logoFiles(customerId)).toHaveLength(0);
    expect(logoEvents(customerId)).toHaveLength(0);
  });
});

describe("N-023 · customers, organizations, users and permissions", () => {
  it("keeps one customer's logo out of another customer's routes", async () => {
    const app = appOnFile();
    const alpha = await customer(app, "Client Alfa");
    const beta = await customer(app, "Client Beta");
    await putLogo(app, alpha, png(), 0);
    expect((await app.request(`/api/customers/${beta}/logo/content?revision=1`)).status).toBe(404);
    expect((await app.request(`/api/customers/${beta}/logo/content`)).status).toBe(404);
    expect((await registryItem(app, beta)).logo).toBeNull();
    expect((await putLogo(app, "client-inexistent", png(), 0)).status).toBe(404);
    expect((await clearLogo(app, "client-inexistent", 0)).status).toBe(404);
    // Beta's revision counter is its own: its first logo is revision 1, not 2.
    expect(await json(await putLogo(app, beta, png(makePng({ colour: [0, 0, 255, 255] })), 0))).toMatchObject({ logoRevision: 1 });
  });

  it("keeps the logo inside the organization, shared by its users, and gated by session and permission", async () => {
    const fixture = createCloudFixture();
    const alphaOrg = await addOrganization(fixture, "Atelier Alpha");
    const betaOrg = await addOrganization(fixture, "Atelier Beta");
    await addUser(fixture, { email: "owner-a@example.test", password: OWNER_PASSWORD, organizationId: alphaOrg.organization.organizationId, role: "owner" });
    await addUser(fixture, { email: "member-a@example.test", password: MEMBER_PASSWORD, organizationId: alphaOrg.organization.organizationId, role: "member" });
    await addUser(fixture, { email: "owner-b@example.test", password: OWNER_PASSWORD, organizationId: betaOrg.organization.organizationId, role: "owner" });
    const ownerA = (await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD)).cookie ?? "";
    const memberA = (await loginCloud(fixture.app, "member-a@example.test", MEMBER_PASSWORD, alphaOrg.organization.organizationId)).cookie ?? "";
    const ownerB = (await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD)).cookie ?? "";
    const created = await fixture.app.request("/api/customers", { method: "POST", headers: { cookie: ownerA, "content-type": "application/json" }, body: JSON.stringify({ displayName: "Client Alpha" }) });
    const customerId = ((await json(created)).customer as Json).customerId as string;
    const content = `/api/customers/${customerId}/logo/content?revision=1`;

    // A member sets the logo; the owner sees it and can read the file.
    expect((await putLogo(fixture.app, customerId, png(), 0, { cookie: memberA })).status).toBe(200);
    const seen = (await json(await fixture.app.request(`/api/customers/${customerId}/workspace`, { headers: { cookie: ownerA } }))).workspace as Json;
    expect(seen).toMatchObject({ logoRevision: 1, logo: { revision: 1 } });
    expect((await fixture.app.request(content, { headers: { cookie: ownerA } })).status).toBe(200);
    const dossier = (await json(await fixture.app.request(`/api/customers/${customerId}/dossier`, { headers: { cookie: memberA } }))).dossier as Json;
    expect((dossier.permissions as Json).editLogo).toBe(true);

    // Another organization: the customer and its file do not exist there.
    expect((await fixture.app.request(content, { headers: { cookie: ownerB } })).status).toBe(404);
    expect((await putLogo(fixture.app, customerId, png(), 1, { cookie: ownerB })).status).toBe(404);
    expect((await fixture.app.request(`/api/customers/${customerId}/logo?expectedRevision=1`, { method: "DELETE", headers: { cookie: ownerB } })).status).toBe(404);
    // Without a session: refused before anything is read.
    expect((await fixture.app.request(content)).status).toBe(401);
    expect((await putLogo(fixture.app, customerId, png(), 1)).status).toBe(401);
    expect((await fixture.app.request(`/api/customers/${customerId}/logo?expectedRevision=1`, { method: "DELETE" })).status).toBe(401);
    // Without the logo permission (the role matrix narrowed for this test): 403, nothing written.
    const previous = CUSTOMER_DOSSIER_PERMISSIONS.editLogo;
    (CUSTOMER_DOSSIER_PERMISSIONS as Record<string, readonly string[]>).editLogo = ["owner"];
    try {
      expect((await putLogo(fixture.app, customerId, png(makePng({ colour: [9, 9, 9, 255] })), 1, { cookie: memberA })).status).toBe(403);
      expect((await fixture.app.request(`/api/customers/${customerId}/logo?expectedRevision=1`, { method: "DELETE", headers: { cookie: memberA } })).status).toBe(403);
      const narrowed = (await json(await fixture.app.request(`/api/customers/${customerId}/dossier`, { headers: { cookie: memberA } }))).dossier as Json;
      expect((narrowed.permissions as Json).editLogo).toBe(false);
      // Reading stays allowed.
      expect((await fixture.app.request(content, { headers: { cookie: memberA } })).status).toBe(200);
    } finally {
      (CUSTOMER_DOSSIER_PERMISSIONS as Record<string, readonly string[]>).editLogo = previous;
    }
    const after = (await json(await fixture.app.request(`/api/customers/${customerId}/workspace`, { headers: { cookie: ownerA } }))).workspace as Json;
    expect(after).toMatchObject({ logoRevision: 1 });
    fixture.close();
  });
});
