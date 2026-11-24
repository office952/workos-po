import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  DEFAULT_COMMERCIAL_POLICY,
  LAB_SITE_INSTALL_ID,
  SITE_INSTALLATION_SCOPE_ID,
  SVC_SITE_ELECTRICAL_INCLUDED_ID,
  SYNTHETIC_DEMO_SELLER,
  projectManualFixedServicePrice,
} from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
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
 * Commercial coherence R2: assembly freeze eligibility follows the installation refusal,
 * and live installation VAT uses the same organization policy the freeze persists.
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

afterEach(() => {
  resetCloudLoginAttemptGuard();
  resetAccessRateLimits();
  cleanupCloudTemps();
});

function caller(app: CloudFixture["app"], cookie: string): Caller {
  return async (method, path, body) => {
    const headers: Record<string, string> = { origin: ORIGIN, cookie };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await app.request(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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

function policyBody(vatPercent: number) {
  return {
    markupPercent: DEFAULT_COMMERCIAL_POLICY.markupPercent,
    vatPercent,
    defaultDiscountPercent: 0,
    defaultAdjustment: 0,
  };
}

function installationGross(vatPercent: number) {
  return projectManualFixedServicePrice(
    { netPrice: 700 },
    { ...DEFAULT_COMMERCIAL_POLICY, vatPercent },
  ).grossPrice;
}

async function organization(fixture: CloudFixture, name: string, slug: string, vatPercent: number) {
  const { organization: org, paths } = await addOrganization(fixture, name);
  await addUser(fixture, {
    email: `owner@${slug}.test`,
    password: OWNER_PASSWORD,
    organizationId: org.organizationId,
    role: "owner",
  });
  await addUser(fixture, {
    email: `member@${slug}.test`,
    password: MEMBER_PASSWORD,
    organizationId: org.organizationId,
    role: "member",
  });
  const owner = caller(
    fixture.app,
    (await loginCloud(fixture.app, `owner@${slug}.test`, OWNER_PASSWORD, org.organizationId)).cookie as string,
  );
  const member = caller(
    fixture.app,
    (await loginCloud(fixture.app, `member@${slug}.test`, MEMBER_PASSWORD, org.organizationId)).cookie as string,
  );
  expect((await owner("PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER })).status).toBe(200);
  expect((await owner("POST", "/api/admin/commercial-policy", policyBody(vatPercent))).status).toBe(200);
  return { owner, member, sqlitePath: paths.sqlitePath, organizationId: org.organizationId };
}

function evidenceRows(body: Json | null): Json[] {
  if (!body) return [];
  if (Array.isArray(body.costEvidence)) return body.costEvidence as Json[];
  const admin = body.admin;
  if (admin && typeof admin === "object" && Array.isArray((admin as Json).costEvidence)) {
    return (admin as Json).costEvidence as Json[];
  }
  return [];
}

async function upsertEvidence(
  api: Caller,
  resourceId: string,
  amount: number,
  note: string,
) {
  const admin = await api("GET", "/api/resources-admin");
  const existing = evidenceRows(admin.json).find((row) => row.resourceId === resourceId);
  if (typeof existing?.evidenceRowId === "string") {
    return api(
      "PATCH",
      `/api/resources-admin/cost-evidence/${encodeURIComponent(existing.evidenceRowId)}`,
      { amount, note },
    );
  }
  return api("POST", "/api/resources-admin/cost-evidence", { resourceId, amount, note });
}

async function installationRequest(api: Caller, label: string) {
  const customer = await api("POST", "/api/customers", { displayName: label });
  expect(customer.status, customer.text).toBe(201);
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await api("POST", "/api/requests", {
    customerId,
    title: label,
    description: "Coerență comercială",
  });
  expect(request.status, request.text).toBe(201);
  const requestId = String((request.json?.request as Json).requestId);
  const requestPath = `/api/requests/${encodeURIComponent(requestId)}`;
  expect((await api("PATCH", "/api/operational-services/SITE_INSTALLATION", { offerMode: "INTERNAL" })).status).toBe(200);
  expect((await api("PATCH", requestPath, { optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] })).status).toBe(200);
  const facts = await api("PATCH", `${requestPath}/installation-facts`, {
    expectedVersion: 0,
    street: "Strada Fabricii 10",
    city: "București",
    measurementStatus: "OFFICE_MEASURED",
    facadeType: "CONCRETE",
    fixingMethod: "MECHANICAL_ANCHOR",
    siteElectrical: "INCLUDED",
    crewSize: 2,
    plannedDurationHours: 6,
  });
  expect(facts.status, facts.text).toBe(200);
  const labor = await upsertEvidence(api, LAB_SITE_INSTALL_ID, 28, "Tarif sintetic montaj.");
  expect(labor.status, labor.text).toBeGreaterThanOrEqual(200);
  expect(labor.status).toBeLessThan(300);
  expect((await api("PATCH", `${requestPath}/installation-price`, { netPrice: 700 })).status).toBe(200);
  return { requestId, requestPath, customerId };
}

async function saveMember(api: Caller, assemblyId: string, role: "SUPPORT_PANEL" | "SIGNAGE_LETTERS", price: number) {
  const productCode = role === "SUPPORT_PANEL" ? ACM_CASSETTE_NONE_PRODUCT_CODE : CANONICAL_PRODUCT_CODE;
  const values = role === "SUPPORT_PANEL" ? acmValues : lettersValues;
  const preview = await api("POST", `/api/products/${productCode}/preview`, { values });
  expect(preview.status, preview.text).toBe(200);
  const saved = await api("POST", `/api/assemblies/${assemblyId}/members`, {
    role,
    values,
    reviewId: preview.json?.reviewId,
    manualProductNetPrice: price,
  });
  expect(saved.status, saved.text).toBe(200);
}

function storedQuote(sqlitePath: string, quoteSnapshotId: string): string {
  const db = new Database(sqlitePath, { readonly: true });
  try {
    const row = db
      .prepare("SELECT payload FROM assembly_quote_snapshots WHERE quote_snapshot_id = ?")
      .get(quoteSnapshotId) as { payload: string };
    return row.payload;
  } finally {
    db.close();
  }
}

function installationSectionGross(assembly: Json): number {
  const quote = assembly.quote as Json;
  const sections = quote.sections as Json[];
  const section = sections.find((item) => item.title === "Montaj la locație");
  if (!section || typeof section.grossPrice !== "number") {
    throw new Error("missing installation section");
  }
  return section.grossPrice;
}

describe("commercial coherence R2", () => {
  it("blocks freeze without electrical evidence, then keeps live and frozen VAT on the organization policy", async () => {
    const fixture = createCloudFixture();
    const primary = await organization(fixture, "Firma Coerenta", "coerenta", 19);
    const installed = await installationRequest(primary.owner, "Client Coerenta");
    const created = await primary.owner("POST", "/api/assemblies", { requestId: installed.requestId });
    expect(created.status, created.text).toBe(201);
    const assemblyId = String((created.json?.assembly as Json).assemblyId);
    await saveMember(primary.owner, assemblyId, "SUPPORT_PANEL", 2400);
    await saveMember(primary.owner, assemblyId, "SIGNAGE_LETTERS", 1800);
    expect((await primary.owner("POST", `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);

    const blocked = await primary.owner("GET", `/api/assemblies/${assemblyId}`);
    expect(blocked.status).toBe(200);
    const blockedAssembly = blocked.json?.assembly as Json;
    expect(blockedAssembly.quoteFreezable).toBe(false);
    expect(blockedAssembly.installationFreezeReasons).toEqual(
      expect.arrayContaining([expect.stringMatching(/evidență de cost confirmată/)]),
    );
    const refused = await primary.owner("POST", `/api/assemblies/${assemblyId}/quote`, {});
    expect(refused.status).toBe(422);
    expect(refused.json?.error).toBe("incomplete_offer");
    expect(refused.json?.reasons).toEqual(blockedAssembly.installationFreezeReasons);

    const electrical = await upsertEvidence(
      primary.owner,
      SVC_SITE_ELECTRICAL_INCLUDED_ID,
      40,
      "Racord inclus confirmat.",
    );
    expect(electrical.status, electrical.text).toBeGreaterThanOrEqual(200);
    expect(electrical.status).toBeLessThan(300);

    const ready = await primary.owner("GET", `/api/assemblies/${assemblyId}`);
    expect((ready.json?.assembly as Json).quoteFreezable).toBe(true);
    expect((ready.json?.assembly as Json).installationFreezeReasons).toEqual([]);

    const frozenResponse = await freezeAcknowledgingRates(async (body) => {
      const result = await primary.owner("POST", `/api/assemblies/${assemblyId}/quote`, body);
      return new Response(result.text, {
        status: result.status,
        headers: { "content-type": "application/json" },
      });
    });
    expect(frozenResponse.status).toBe(200);
    const frozenJson = (await frozenResponse.json()) as Json;
    const frozenAssembly = frozenJson.assembly as Json;
    const quoteSnapshotId = String(frozenAssembly.quoteSnapshotId);
    const frozenGross = installationSectionGross(frozenAssembly);
    expect(frozenGross).toBe(installationGross(19));

    const live = await primary.owner("GET", installed.requestPath);
    const scope = (live.json?.detail as Json).installationScope as Json;
    expect(scope.commercialNetPrice).toBe(700);
    expect(scope.commercialVatPercent).toBe(19);
    expect(scope.commercialPolicySource).toBe("ORGANIZATION");
    expect(scope.commercialGrossPrice).toBe(frozenGross);
    expect(scope.ownerInternalCost).not.toMatchObject({ total: scope.commercialNetPrice });

    const quotePath = `/api/quotes/${encodeURIComponent(quoteSnapshotId)}`;
    const ownerQuote = await primary.owner("GET", quotePath);
    expect(ownerQuote.json?.acceptance).toMatchObject({ canAccept: true, incompleteCostExceptionRequired: true });
    const plainAccept = await primary.owner("POST", `/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId });
    expect(plainAccept.status).toBe(422);
    expect(plainAccept.json?.error).toBe("incomplete_cost_requires_owner_acceptance");
    expect((await primary.member("POST", `/api/assemblies/${assemblyId}/accept`, {
      quoteSnapshotId,
      incompleteCostAcceptance: { confirm: true, reason: "Nu este rolul comercial." },
    })).status).toBe(403);

    const payloadBefore = storedQuote(primary.sqlitePath, quoteSnapshotId);
    expect((await primary.owner("POST", "/api/admin/commercial-policy", policyBody(20))).status).toBe(200);
    expect(storedQuote(primary.sqlitePath, quoteSnapshotId)).toBe(payloadBefore);
    const afterPolicy = await primary.owner("GET", `/api/assemblies/${assemblyId}`);
    expect(installationSectionGross(afterPolicy.json?.assembly as Json)).toBe(frozenGross);
    const liveAfter = await primary.owner("GET", installed.requestPath);
    const scopeAfter = (liveAfter.json?.detail as Json).installationScope as Json;
    expect(scopeAfter.commercialVatPercent).toBe(20);
    expect(scopeAfter.commercialGrossPrice).toBe(installationGross(20));
    expect(scopeAfter.commercialGrossPrice).not.toBe(frozenGross);

    const other = await organization(fixture, "Firma Izolata", "izolata", 9);
    const otherInstallation = await installationRequest(other.owner, "Client Izolat");
    const otherElectrical = await upsertEvidence(
      other.owner,
      SVC_SITE_ELECTRICAL_INCLUDED_ID,
      40,
      "Racord firma izolată.",
    );
    expect(otherElectrical.status, otherElectrical.text).toBeGreaterThanOrEqual(200);
    expect(otherElectrical.status).toBeLessThan(300);
    const otherLive = await other.owner("GET", otherInstallation.requestPath);
    const otherScope = (otherLive.json?.detail as Json).installationScope as Json;
    expect(otherScope.commercialVatPercent).toBe(9);
    expect(otherScope.commercialGrossPrice).toBe(installationGross(9));
    expect((await other.owner("GET", installed.requestPath)).status).toBe(404);
    expect((await other.owner("GET", `/api/assemblies/${assemblyId}`)).status).toBe(404);
    expect((await primary.owner("GET", otherInstallation.requestPath)).status).toBe(404);

    fixture.close();
  });
});
