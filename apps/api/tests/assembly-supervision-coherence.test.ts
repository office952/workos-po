import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  LOGO_PRODUCT_CODE,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
  SYNTHETIC_DEMO_SELLER,
  type AssemblyOrderSnapshot,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
  type CloudFixture,
} from "./cloud-harness.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

/**
 * Assembly & Production Supervision Coherence V1 · F-01 (one incomplete-cost exception for product
 * and assembly quotes), F-02 (assembly planned vs actual, per part), F-05 (freeze eligibility and
 * price-only changes). Synthetic SQLite planes only.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;
type Caller = (method: string, path: string, body?: unknown) => Promise<{ status: number; json: Json | null; text: string }>;

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};
const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};
const logoValues = {
  "root.inscription": "NORD LOGO",
  "face.finish": "none",
  "face.confirmedAreaMm2": 180000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 8400,
};
const MEMBERS = {
  SUPPORT_PANEL: { productCode: ACM_CASSETTE_NONE_PRODUCT_CODE, values: acmValues },
  SIGNAGE_LETTERS: { productCode: CANONICAL_PRODUCT_CODE, values: lettersValues },
  SIGNAGE_LOGO: { productCode: LOGO_PRODUCT_CODE, values: logoValues },
} as const;
type Role = keyof typeof MEMBERS;
const EXCEPTION = { incompleteCostAcceptance: { confirm: true, reason: "Costul de ansamblare se confirmă ulterior" } };

afterEach(() => {
  resetCloudLoginAttemptGuard();
  resetAccessRateLimits();
  cleanupCloudTemps();
  vi.restoreAllMocks();
});

function caller(app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }, cookie: string | null): Caller {
  return async (method, path, body) => {
    const headers: Record<string, string> = { origin: ORIGIN };
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let json: Json | null = null;
    try {
      json = text ? (JSON.parse(text) as Json) : null;
    } catch {
      json = null;
    }
    return { status: response.status, json, text };
  };
}

async function organization(fixture: CloudFixture, name: string, slug: string) {
  const { organization: org, paths } = await addOrganization(fixture, name);
  await addUser(fixture, { email: `owner@${slug}.test`, password: OWNER_PASSWORD, organizationId: org.organizationId, role: "owner" });
  await addUser(fixture, { email: `member@${slug}.test`, password: MEMBER_PASSWORD, organizationId: org.organizationId, role: "member" });
  const owner = caller(fixture.app, (await loginCloud(fixture.app, `owner@${slug}.test`, OWNER_PASSWORD, org.organizationId)).cookie as string);
  const member = caller(fixture.app, (await loginCloud(fixture.app, `member@${slug}.test`, MEMBER_PASSWORD, org.organizationId)).cookie as string);
  expect((await owner("PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER })).status).toBe(200);
  expect(
    (
      await owner("POST", "/api/admin/product-enablement", {
        products: Object.values(MEMBERS).map((item) => ({ templateCode: item.productCode, enabled: true })),
      })
    ).status,
  ).toBe(200);
  return { owner, member, sqlitePath: paths.sqlitePath };
}

/** The frozen quote row exactly as stored: the proof that acceptance or a later price never rewrites it. */
function storedQuote(sqlitePath: string, quoteSnapshotId: string): string {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const row = db.prepare("SELECT payload FROM assembly_quote_snapshots WHERE quote_snapshot_id = ?").get(quoteSnapshotId) as { payload: string };
    return row.payload;
  } finally {
    db.close();
  }
}

function storedOrder(sqlitePath: string, orderSnapshotId: string): Json {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const row = db.prepare("SELECT payload FROM assembly_order_snapshots WHERE order_snapshot_id = ?").get(orderSnapshotId) as { payload: string };
    return JSON.parse(row.payload) as Json;
  } finally {
    db.close();
  }
}

async function newAssembly(api: Caller, label: string, withLogo = false): Promise<string> {
  const customer = await api("POST", "/api/customers", { displayName: label });
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await api("POST", "/api/requests", { customerId, title: label, description: "Coerență ansamblu" });
  const requestId = String((request.json?.request as Json).requestId);
  const created = await api("POST", "/api/assemblies", withLogo ? { requestId, kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2 } : { requestId });
  expect(created.status, created.text).toBe(201);
  return String((created.json?.assembly as Json).assemblyId);
}

async function saveMember(api: Caller, assemblyId: string, role: Role, price?: number) {
  const { productCode, values } = MEMBERS[role];
  const preview = await api("POST", `/api/products/${productCode}/preview`, { values });
  expect(preview.status, preview.text).toBe(200);
  const saved = await api("POST", `/api/assemblies/${assemblyId}/members`, {
    role,
    values,
    reviewId: preview.json?.reviewId,
    ...(price === undefined ? {} : { manualProductNetPrice: price }),
  });
  expect(saved.status, saved.text).toBe(200);
}

async function view(api: Caller, assemblyId: string): Promise<Json> {
  const response = await api("GET", `/api/assemblies/${assemblyId}`);
  expect(response.status, response.text).toBe(200);
  return response.json?.assembly as Json;
}

async function freeze(api: Caller, assemblyId: string) {
  const response = await freezeAcknowledgingRates(async (body) => {
    const result = await api("POST", `/api/assemblies/${assemblyId}/quote`, body);
    return new Response(result.text, { status: result.status, headers: { "content-type": "application/json" } });
  });
  return response.status;
}

async function quoted(api: Caller, label: string, prices: Partial<Record<Role, number>>) {
  const assemblyId = await newAssembly(api, label, "SIGNAGE_LOGO" in prices);
  for (const role of Object.keys(prices) as Role[]) {
    await saveMember(api, assemblyId, role, prices[role]);
  }
  expect((await api("POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  expect(await freeze(api, assemblyId)).toBe(200);
  return { assemblyId, quoteSnapshotId: String((await view(api, assemblyId)).quoteSnapshotId) };
}

describe("F-01 · assembly acceptance uses the product incomplete-cost exception", () => {
  it("refuses without the Owner exception, refuses Comercial, records the exception in the frozen order", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Ansamblu", "ansamblu");
    const { assemblyId, quoteSnapshotId } = await quoted(a.owner, "Client Ansamblu", { SUPPORT_PANEL: 300, SIGNAGE_LETTERS: 400 });
    const quotePath = `/api/quotes/${encodeURIComponent(quoteSnapshotId)}`;

    // The server says the exception is needed before anything is sent; Comercial is not told about cost.
    const ownerQuote = await a.owner("GET", quotePath);
    expect(ownerQuote.json?.acceptance).toMatchObject({ canAccept: true, incompleteCostExceptionRequired: true });
    const memberQuote = await a.member("GET", quotePath);
    expect(memberQuote.status).toBe(200);
    expect(memberQuote.json?.acceptance).not.toHaveProperty("incompleteCostExceptionRequired");
    const frozenBefore = storedQuote(a.sqlitePath, quoteSnapshotId);

    const acceptPath = `/api/assemblies/${assemblyId}/accept`;
    const plain = await a.owner("POST", acceptPath, { quoteSnapshotId });
    expect(plain.status).toBe(422);
    expect(plain.json?.error).toBe("incomplete_cost_requires_owner_acceptance");
    const blank = await a.owner("POST", acceptPath, { quoteSnapshotId, incompleteCostAcceptance: { confirm: true, reason: "  " } });
    expect(blank.status).toBe(422);
    const unconfirmed = await a.owner("POST", acceptPath, { quoteSnapshotId, incompleteCostAcceptance: { confirm: false, reason: "motiv" } });
    expect(unconfirmed.status).toBe(422);
    expect((await a.member("POST", acceptPath, { quoteSnapshotId, ...EXCEPTION })).status).toBe(403);
    expect((await view(a.owner, assemblyId)).orderId).toBeNull();

    const accepted = await a.owner("POST", acceptPath, { quoteSnapshotId, ...EXCEPTION });
    expect(accepted.status, accepted.text).toBe(200);
    const order = storedOrder(a.sqlitePath, String((accepted.json?.order as Json).orderSnapshotId));
    expect(order.incompleteCostAcceptance).toMatchObject({
      policy: "INCOMPLETE_COST_ACCEPTANCE_V1",
      quoteSnapshotId,
      costCompleteness: "PARTIAL",
      reason: EXCEPTION.incompleteCostAcceptance.reason,
    });
    expect(typeof (order.incompleteCostAcceptance as Json).acceptedByUserId).toBe("string");
    // D-6 · every part keeps its frozen cost lines in the order.
    for (const child of order.children as Json[]) {
      expect(Array.isArray(child.eicLines)).toBe(true);
    }

    // The frozen quote is unchanged; the Owner reads the recorded exception, Comercial does not.
    const after = await a.owner("GET", quotePath);
    expect(storedQuote(a.sqlitePath, quoteSnapshotId)).toBe(frozenBefore);
    expect(after.json?.incompleteCostAcceptance).toMatchObject({ reason: EXCEPTION.incompleteCostAcceptance.reason });
    expect((await a.member("GET", quotePath)).json).not.toHaveProperty("incompleteCostAcceptance");
    fixture.close();
  });
});

describe("F-05 · freeze eligibility and price-only changes", () => {
  it("names the member without a price and becomes freezable after a price-only save, without a new technical confirmation", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Preț", "pret");
    const assemblyId = await newAssembly(a.owner, "Client Preț");
    await saveMember(a.owner, assemblyId, "SUPPORT_PANEL", 300);
    await saveMember(a.owner, assemblyId, "SIGNAGE_LETTERS");
    expect((await a.owner("POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);

    const blocked = await view(a.owner, assemblyId);
    expect(blocked.status).toBe("CONFIRMED");
    expect(blocked.quoteFreezable).toBe(false);
    expect((blocked.freezeBlockers as Json[]).map((item) => [item.role, item.code])).toEqual([["SIGNAGE_LETTERS", "PRICE_MISSING"]]);
    expect(Object.fromEntries((blocked.memberPrices as Json[]).map((item) => [item.role, item.priced]))).toEqual({
      SUPPORT_PANEL: true,
      SIGNAGE_LETTERS: false,
    });
    const technical = blocked.assemblyTruthHash ?? null;

    // Same configuration, only the price is added: no review / confirm round trip is asked for.
    await saveMember(a.owner, assemblyId, "SIGNAGE_LETTERS", 400);
    const ready = await view(a.owner, assemblyId);
    expect(ready.status).toBe("CONFIRMED");
    expect(ready.freezeBlockers).toEqual([]);
    expect(ready.quoteFreezable).toBe(true);
    expect(ready.assemblyTruthHash ?? null).toBe(technical);
    expect(await freeze(a.owner, assemblyId)).toBe(200);
    fixture.close();
  });

  it("never lets a quote frozen before a price change be accepted, and never rewrites it", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Revizie", "revizie");
    const { assemblyId, quoteSnapshotId: first } = await quoted(a.owner, "Client Revizie Preț", { SUPPORT_PANEL: 300, SIGNAGE_LETTERS: 400 });
    const firstPath = `/api/quotes/${encodeURIComponent(first)}`;
    const frozenBefore = storedQuote(a.sqlitePath, first);

    await saveMember(a.owner, assemblyId, "SIGNAGE_LETTERS", 520);
    const changed = await view(a.owner, assemblyId);
    expect(changed.status).toBe("CONFIRMED");
    expect(changed.quoteFreezable).toBe(true);

    // The earlier frozen quote is still readable and byte-identical, but no longer acceptable.
    const stale = await a.owner("GET", firstPath);
    expect((stale.json?.acceptance as Json).canAccept).toBe(false);
    expect(storedQuote(a.sqlitePath, first)).toBe(frozenBefore);
    const refused = await a.owner("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: first, ...EXCEPTION });
    expect(refused.status).toBe(409);
    expect((await view(a.owner, assemblyId)).orderId).toBeNull();

    expect(await freeze(a.owner, assemblyId)).toBe(200);
    const second = String((await view(a.owner, assemblyId)).quoteSnapshotId);
    expect(second).not.toBe(first);
    const secondQuote = (await a.owner("GET", `/api/quotes/${encodeURIComponent(second)}`)).json?.assemblyQuote as Json;
    expect(JSON.stringify(secondQuote)).toContain("520");
    expect((await a.owner("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: second, ...EXCEPTION })).status).toBe(200);
    fixture.close();
  });
});

describe("F-02 · planned vs actual for an assembly job", () => {
  it.each([
    ["two parts", { SUPPORT_PANEL: 300, SIGNAGE_LETTERS: 400 }, 2],
    ["three parts", { SUPPORT_PANEL: 300, SIGNAGE_LETTERS: 400, SIGNAGE_LOGO: 350 }, 3],
  ] as const)("groups the comparison per part for %s and keeps unknown cost unknown", async (_label, prices, parts) => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Economie", `economie${parts}`);
    const { assemblyId, quoteSnapshotId } = await quoted(a.owner, "Client Economie", prices);
    const accepted = await a.owner("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId, ...EXCEPTION });
    expect(accepted.status, accepted.text).toBe(200);
    const order = storedOrder(a.sqlitePath, String((accepted.json?.order as Json).orderSnapshotId));
    const jobPath = `/api/jobs/${encodeURIComponent(String(order.orderSnapshotId))}`;

    const before = await a.owner("GET", `${jobPath}/economics`);
    expect(before.status).toBe(200);
    expect(before.json).toMatchObject({ available: true, grouping: "PART" });
    expect(before.json?.economics).toMatchObject({ estimatedCost: { completeness: "PARTIAL", acceptedIncomplete: true } });

    expect((await a.owner("POST", `${jobPath}/production`)).status).toBe(200);
    const released = await a.owner("GET", `${jobPath}/economics`);
    const economics = released.json?.economics as Json;
    const allLines = economics.lines as Json[];
    expect(allLines.length).toBeGreaterThan(parts);
    const groups = [...new Set(allLines.map((line) => String(line.groupLabel)))];
    // One group per part plus the assembly operations; a shared resource stays one line per part.
    expect(groups.filter((label) => label !== "Ansamblare")).toHaveLength(parts);
    expect(groups).toContain("Ansamblare");
    const ids = allLines.map((line) => String(line.resourceId));
    expect(new Set(ids).size).toBe(ids.length);
    // Nothing has been consumed: operational cost is unknown, never zero.
    for (const line of allLines) {
      expect(line).toHaveProperty("operationalCost", null);
    }
    // The estimated total is the sum of the parts and the known assembly cost, counted once.
    const children = order.children as { eicTotal: number }[];
    const known = ((order.operationCost as Json | undefined)?.knownTotal as number | undefined) ?? 0;
    const expected = Math.round((children.reduce((sum, child) => sum + child.eicTotal, 0) + known) * 100) / 100;
    expect((economics.estimatedCost as Json).total).toBe(expected);
    expect(economics.operationalCost).toMatchObject({ calculableTotal: null, calculableCount: 0 });

    expect((await a.member("GET", `${jobPath}/economics`)).status).toBe(403);
    fixture.close();
  });

  it("reports an assembly order accepted before cost lines were retained as unavailable, and leaves it unchanged", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const api = caller(createApp({ productSystem: runtime }), null);
      const { assemblyId, quoteSnapshotId } = await quoted(api, "Client Istoric", { SUPPORT_PANEL: 300, SIGNAGE_LETTERS: 400 });
      const accepted = await api("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId, ...EXCEPTION });
      expect(accepted.status, accepted.text).toBe(200);
      const orderId = String((accepted.json?.order as Json).orderSnapshotId);
      const current = runtime.readAssemblyOrder(orderId) as AssemblyOrderSnapshot;
      const historical = {
        ...current,
        children: current.children.map((child) => {
          const copy = { ...child };
          delete (copy as { eicLines?: unknown }).eicLines;
          return copy;
        }),
      } as AssemblyOrderSnapshot;
      const frozen = JSON.stringify(historical);
      vi.spyOn(runtime, "readAssemblyOrder").mockReturnValue(historical);
      const economics = await api("GET", `/api/jobs/${encodeURIComponent(orderId)}/economics`);
      expect(economics.status).toBe(200);
      expect(economics.json?.available).toBe(false);
      expect(String(economics.json?.reason)).toMatch(/nu/i);
      expect(economics.json).not.toHaveProperty("economics");
      expect(JSON.stringify(historical)).toBe(frozen);
    } finally {
      runtime.close();
    }
  });
});

describe("organization isolation for the new assembly payloads", () => {
  it("never serves another organization's assembly, quote or job economics", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma A", "izolare-a");
    const b = await organization(fixture, "Firma B", "izolare-b");
    const { assemblyId, quoteSnapshotId } = await quoted(a.owner, "Client A", { SUPPORT_PANEL: 300, SIGNAGE_LETTERS: 400 });
    const accepted = await a.owner("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId, ...EXCEPTION });
    const orderId = encodeURIComponent(String((accepted.json?.order as Json).orderSnapshotId));

    expect((await b.owner("GET", `/api/assemblies/${assemblyId}`)).status).toBe(404);
    expect((await b.owner("GET", `/api/quotes/${encodeURIComponent(quoteSnapshotId)}`)).status).toBe(404);
    expect((await b.owner("GET", `/api/jobs/${orderId}/economics`)).status).toBe(404);
    expect((await b.owner("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId, ...EXCEPTION })).status).toBe(404);
    fixture.close();
  });
});
