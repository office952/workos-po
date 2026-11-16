import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, PLEXIGLAS_3MM_OPAL_ID, SYNTHETIC_DEMO_SELLER } from "@workos-final/domain";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  cloudCookie,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
  type CloudFixture,
} from "./cloud-harness.js";

/**
 * Commercial & Financial V1 · offering policy, price exception approvals, incomplete-cost
 * acceptance (AUD-PRICING-002), versioned company identity and planned vs operational economics.
 * Synthetic SQLite planes only.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;
const productPath = `/api/products/${CANONICAL_PRODUCT_CODE}`;
const values = {
  "root.inscription": "CFC",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};
const INTERNAL_KEYS = /"(internalCost|eic|eicTotal|marginAmount|markupAmount|costCompletenessIssues|triggeredRules|minimumMarginPercent|maximumNetValue|plannedCost|actualCost)"/;

afterEach(() => {
  resetCloudLoginAttemptGuard();
  resetAccessRateLimits();
  cleanupCloudTemps();
});

async function call(fixture: CloudFixture, cookie: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { origin: ORIGIN };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fixture.app.request(path, {
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
  return { status: response.status, json, text, response };
}

async function organization(fixture: CloudFixture, name: string, slug: string, configureSeller = true) {
  const { organization: org, paths } = await addOrganization(fixture, name);
  await addUser(fixture, { email: `owner@${slug}.test`, password: OWNER_PASSWORD, organizationId: org.organizationId, role: "owner" });
  await addUser(fixture, { email: `member@${slug}.test`, password: MEMBER_PASSWORD, organizationId: org.organizationId, role: "member" });
  const owner = (await loginCloud(fixture.app, `owner@${slug}.test`, OWNER_PASSWORD, org.organizationId)).cookie as string;
  const member = (await loginCloud(fixture.app, `member@${slug}.test`, MEMBER_PASSWORD, org.organizationId)).cookie as string;
  if (configureSeller) {
    expect((await call(fixture, owner, "PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER })).status).toBe(200);
  }
  const customer = await call(fixture, owner, "POST", "/api/customers", { displayName: `Client ${name}` });
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await call(fixture, owner, "POST", "/api/requests", {
    customerId,
    title: `Cerere ${name}`,
    description: "Cerere sintetică pentru politica de ofertare.",
  });
  const requestId = String((request.json?.request as Json | undefined)?.requestId ?? ((request.json?.detail as Json)?.request as Json)?.requestId);
  return { org, sqlitePath: paths.sqlitePath, owner, member, customerId, requestId };
}

async function confirm(fixture: CloudFixture, cookie: string, extra: Json = {}) {
  const preview = await call(fixture, cookie, "POST", `${productPath}/preview`, { values });
  expect(preview.status).toBe(200);
  const reviewId = String(preview.json?.reviewId);
  const confirmed = await call(fixture, cookie, "POST", `${productPath}/confirm`, { values, reviewId, ...extra });
  expect(confirmed.status, confirmed.text).toBe(200);
  return { reviewId, body: confirmed.json as Json, text: confirmed.text };
}

async function freeze(fixture: CloudFixture, cookie: string, reviewId: string, extra: Json) {
  return call(fixture, cookie, "POST", `${productPath}/quote-snapshots`, { values, reviewId, ...extra });
}

async function setPolicy(fixture: CloudFixture, owner: string, mode: string, rules: Json = {}) {
  const current = await call(fixture, owner, "GET", "/api/admin/offering-policy");
  expect(current.status).toBe(200);
  const version = Number((current.json?.policy as Json).version);
  const saved = await call(fixture, owner, "POST", "/api/admin/offering-policy", { mode, rules, expectedVersion: version });
  expect(saved.status, saved.text).toBe(200);
  return saved.json?.policy as Json;
}

describe("organization offering policy", () => {
  it("keeps OWNER_ONLY by default: the Comercial role neither sets the price nor freezes", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Implicit", "implicit");
    const memberConfirm = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 400 });
    expect(memberConfirm.body.manualProductPriceAuthorized).toBe(false);
    expect((memberConfirm.body.offering as Json).policy).toMatchObject({ mode: "OWNER_ONLY", canSetPrice: false });
    expect(memberConfirm.text).not.toMatch(INTERNAL_KEYS);
    const refused = await freeze(fixture, a.member, memberConfirm.reviewId, {
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 400,
    });
    expect(refused.status).toBe(403);
    expect(refused.json?.error).toBe("offering_not_permitted");
    // The Owner freezes exactly as before V1: no offering record under the platform default.
    const ownerConfirm = await confirm(fixture, a.owner, { requestId: a.requestId, manualProductNetPrice: 400 });
    const frozen = await freeze(fixture, a.owner, ownerConfirm.reviewId, {
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 400,
    });
    expect(frozen.status, frozen.text).toBe(200);
    expect((frozen.json?.quoteSnapshot as Json).offering).toBeUndefined();
    // Policy administration is the Owner's.
    expect((await call(fixture, a.member, "GET", "/api/admin/offering-policy")).status).toBe(403);
    expect(
      (await call(fixture, a.member, "POST", "/api/admin/offering-policy", { mode: "COMMERCIAL_AUTONOMOUS", expectedVersion: 0 })).status,
    ).toBe(403);
    expect((await call(fixture, a.member, "GET", "/api/offering-policy")).json?.policy).toMatchObject({
      mode: "OWNER_ONLY",
      canSetPrice: false,
    });
    fixture.close();
  });

  it("validates, versions and protects the policy; an approval mode needs a rule (fail-closed)", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Versiuni", "versiuni");
    const empty = await call(fixture, a.owner, "POST", "/api/admin/offering-policy", {
      mode: "COMMERCIAL_APPROVAL_POLICY",
      rules: {},
      expectedVersion: 0,
    });
    expect(empty.status).toBe(400);
    expect(empty.json?.error).toBe("invalid_policy");
    const v1 = await setPolicy(fixture, a.owner, "COMMERCIAL_AUTONOMOUS");
    expect(v1).toMatchObject({ version: 1, mode: "COMMERCIAL_AUTONOMOUS", source: "ORGANIZATION" });
    const stale = await call(fixture, a.owner, "POST", "/api/admin/offering-policy", {
      mode: "OWNER_ONLY",
      expectedVersion: 0,
    });
    expect(stale.status).toBe(409);
    await setPolicy(fixture, a.owner, "OWNER_ONLY");
    const history = await call(fixture, a.owner, "GET", "/api/admin/offering-policy");
    expect((history.json?.versions as Json[]).map((row) => row.version)).toEqual([2, 1]);
    expect((history.json?.policy as Json).mode).toBe("OWNER_ONLY");
    fixture.close();
  });

  it("lets an autonomous Comercial price and freeze without seeing internal cost, never accept", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Autonoma", "autonoma");
    await setPolicy(fixture, a.owner, "COMMERCIAL_AUTONOMOUS");
    const memberConfirm = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 450 });
    expect(memberConfirm.body.manualProductPriceAuthorized).toBe(true);
    expect(memberConfirm.text).not.toMatch(INTERNAL_KEYS);
    expect((memberConfirm.body.offering as Json).outcome).toMatchObject({ outcome: "WITHIN_POLICY" });
    const frozen = await freeze(fixture, a.member, memberConfirm.reviewId, {
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 450,
    });
    expect(frozen.status, frozen.text).toBe(200);
    expect(frozen.text).not.toMatch(INTERNAL_KEYS);
    const snapshot = frozen.json?.quoteSnapshot as Json;
    expect(snapshot.offering).toMatchObject({
      policyVersion: 1,
      policyMode: "COMMERCIAL_AUTONOMOUS",
      pricedByRole: "member",
      outcome: "WITHIN_POLICY",
      approval: null,
    });
    const quoteId = encodeURIComponent(String(snapshot.quoteSnapshotId));
    expect((await call(fixture, a.member, "POST", `${productPath}/quote-snapshots/${quoteId}/confirm-order`)).status).toBe(403);
    // A later policy change never rewrites the frozen quote.
    await setPolicy(fixture, a.owner, "OWNER_ONLY");
    const reread = await call(fixture, a.owner, "GET", `${productPath}/quote-snapshots/${quoteId}`);
    expect(((reread.json?.quoteSnapshot as Json) ?? reread.json)?.contentHash ?? (reread.json?.snapshot as Json)?.contentHash).toBe(
      snapshot.contentHash,
    );
    fixture.close();
  });
});

describe("price exception approvals", () => {
  it("requires, binds and records the Owner approval; refuses stale, rejected or foreign approvals", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Aprobari", "aprobari");
    const b = await organization(fixture, "Firma Straina", "straina");
    await setPolicy(fixture, a.owner, "COMMERCIAL_APPROVAL_POLICY", { maximumNetValue: 500 });

    const within = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 480 });
    expect((within.body.offering as Json).outcome).toMatchObject({ outcome: "WITHIN_POLICY" });

    const over = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 900 });
    const offering = over.body.offering as Json;
    expect(offering.outcome).toMatchObject({ outcome: "APPROVAL_REQUIRED" });
    expect(offering.canRequestApproval).toBe(true);
    expect(over.text).not.toMatch(INTERNAL_KEYS);
    const body900 = { customerId: a.customerId, requestId: a.requestId, manualProductNetPrice: 900 };
    const blocked = await freeze(fixture, a.member, over.reviewId, body900);
    expect(blocked.status).toBe(409);
    expect(blocked.json?.error).toBe("price_approval_required");

    const requested = await call(fixture, a.member, "POST", `${productPath}/price-approval-requests`, {
      values,
      reviewId: over.reviewId,
      ...body900,
      approvalNote: "Client cu volum mare",
    });
    expect(requested.status, requested.text).toBe(201);
    expect(requested.text).not.toMatch(INTERNAL_KEYS);
    expect(((requested.json?.offering as Json).approval as Json).status).toBe("REQUESTED");
    // Within the policy there is nothing to approve.
    expect(
      (
        await call(fixture, a.member, "POST", `${productPath}/price-approval-requests`, {
          values,
          reviewId: within.reviewId,
          customerId: a.customerId,
          requestId: a.requestId,
          manualProductNetPrice: 480,
        })
      ).status,
    ).toBe(409);

    // Only the Owner sees and decides; the Owner sees the triggered rule.
    expect((await call(fixture, a.member, "GET", "/api/admin/price-approvals")).status).toBe(403);
    const listed = await call(fixture, a.owner, "GET", "/api/admin/price-approvals?status=REQUESTED");
    const approvals = listed.json?.approvals as Json[];
    expect(approvals).toHaveLength(1);
    expect((approvals[0]!.triggeredRules as Json[])[0]).toMatchObject({ id: "MAXIMUM_NET_VALUE" });
    const approvalId = String(approvals[0]!.approvalId);
    expect(
      (await call(fixture, a.member, "POST", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}/decision`, { decision: "APPROVED" })).status,
    ).toBe(403);
    // Organization isolation: B cannot read or decide A's approval.
    expect((await call(fixture, b.owner, "GET", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}`)).status).toBe(404);
    expect(
      (await call(fixture, b.owner, "POST", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}/decision`, { decision: "APPROVED" })).status,
    ).toBe(404);
    const approved = await call(fixture, a.owner, "POST", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}/decision`, {
      decision: "APPROVED",
      reason: "Client strategic",
    });
    expect(approved.status, approved.text).toBe(200);
    // Decided once: no second decision.
    expect(
      (await call(fixture, a.owner, "POST", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}/decision`, { decision: "REJECTED", reason: "x" })).status,
    ).toBe(409);
    const events = await call(fixture, a.owner, "GET", `/api/admin/price-approvals/${encodeURIComponent(approvalId)}`);
    expect((events.json?.events as Json[]).map((event) => event.kind)).toEqual(["REQUESTED", "APPROVED"]);

    // The approval of 900 does not cover 901 (stale).
    const changed = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 901 });
    expect(((changed.body.offering as Json).approval as Json).status).toBe("STALE");
    const stale = await freeze(fixture, a.member, changed.reviewId, { ...body900, manualProductNetPrice: 901 });
    expect(stale.status).toBe(409);

    const again = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 900 });
    const frozen = await freeze(fixture, a.member, again.reviewId, body900);
    expect(frozen.status, frozen.text).toBe(200);
    const record = (frozen.json?.quoteSnapshot as Json).offering as Json;
    expect(record).toMatchObject({ outcome: "APPROVED_EXCEPTION", pricedByRole: "member", policyVersion: 1 });
    expect((record.approval as Json).approvalId).toBe(approvalId);

    // A rejection carries a mandatory reason and blocks the freeze of that exact variant.
    const other = await confirm(fixture, a.member, { requestId: a.requestId, manualProductNetPrice: 950 });
    const req2 = await call(fixture, a.member, "POST", `${productPath}/price-approval-requests`, {
      values,
      reviewId: other.reviewId,
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 950,
    });
    expect(req2.status).toBe(201);
    const pending = (await call(fixture, a.owner, "GET", "/api/admin/price-approvals?status=REQUESTED")).json?.approvals as Json[];
    const id2 = encodeURIComponent(String(pending[0]!.approvalId));
    expect((await call(fixture, a.owner, "POST", `/api/admin/price-approvals/${id2}/decision`, { decision: "REJECTED" })).status).toBe(400);
    expect(
      (await call(fixture, a.owner, "POST", `/api/admin/price-approvals/${id2}/decision`, { decision: "REJECTED", reason: "Sub prag" })).status,
    ).toBe(200);
    const rejected = await freeze(fixture, a.member, other.reviewId, {
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 950,
    });
    expect(rejected.status).toBe(409);
    expect(rejected.json?.error).toBe("price_approval_rejected");
    // Organization B keeps its own default policy.
    expect((await call(fixture, b.member, "GET", "/api/offering-policy")).json?.policy).toMatchObject({ mode: "OWNER_ONLY" });
    fixture.close();
  });
});

describe("AUD-PRICING-002 · acceptance with incomplete internal cost", () => {
  it("accepts only with an explicit Owner exception and reason, carries it to the order and allows release", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Cost Partial", "partial");
    const db = new Database(a.sqlitePath);
    db.prepare("UPDATE resource_cost_evidence SET superseded_at = ? WHERE resource_id = ? AND superseded_at IS NULL").run(
      new Date().toISOString(),
      PLEXIGLAS_3MM_OPAL_ID,
    );
    db.close();
    const confirmed = await confirm(fixture, a.owner, { requestId: a.requestId, manualProductNetPrice: 700 });
    expect((confirmed.body.eic as Json).completeness).toBe("PARTIAL");
    const frozen = await freeze(fixture, a.owner, confirmed.reviewId, {
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 700,
    });
    expect(frozen.status, frozen.text).toBe(200);
    const quote = frozen.json?.quoteSnapshot as Json;
    const quoteId = encodeURIComponent(String(quote.quoteSnapshotId));
    const orderPath = `${productPath}/quote-snapshots/${quoteId}/confirm-order`;

    const plain = await call(fixture, a.owner, "POST", orderPath);
    expect(plain.status).toBe(422);
    expect(plain.json?.error).toBe("incomplete_cost_requires_owner_acceptance");
    expect((await call(fixture, a.owner, "POST", orderPath, { incompleteCostAcceptance: { confirm: true, reason: " " } })).status).toBe(422);
    expect(
      (await call(fixture, a.member, "POST", orderPath, { incompleteCostAcceptance: { confirm: true, reason: "x" } })).status,
    ).toBe(403);

    const ordered = await call(fixture, a.owner, "POST", orderPath, {
      incompleteCostAcceptance: { confirm: true, reason: "Cost material confirmat ulterior" },
    });
    expect(ordered.status, ordered.text).toBe(200);
    const order = ordered.json?.orderSnapshot as Json;
    expect(order.incompleteCostAcceptance).toMatchObject({
      policy: "INCOMPLETE_COST_ACCEPTANCE_V1",
      costCompleteness: "PARTIAL",
      reason: "Cost material confirmat ulterior",
      quoteContentHash: quote.contentHash,
    });
    // The quote itself is unchanged and still PARTIAL.
    expect(((await call(fixture, a.owner, "GET", `${productPath}/quote-snapshots/${quoteId}`)).text)).toContain(String(quote.contentHash));
    const jobId = encodeURIComponent(String(order.orderSnapshotId));
    const released = await call(fixture, a.owner, "POST", `/api/jobs/${jobId}/production`);
    expect(released.status, released.text).toBe(200);

    const economics = await call(fixture, a.owner, "GET", `/api/jobs/${jobId}/economics`);
    expect(economics.status).toBe(200);
    expect(economics.json?.economics).toMatchObject({
      estimatedCost: { completeness: "PARTIAL", acceptedIncomplete: true },
      estimatedMargin: { value: null },
      confirmedCost: { status: "NOT_MODELLED" },
    });
    expect((await call(fixture, a.member, "GET", `/api/jobs/${jobId}/economics`)).status).toBe(403);
    fixture.close();
  });
});

describe("company identity", () => {
  it("starts unconfigured, validates, versions, protects concurrent edits and never rewrites a frozen quote", async () => {
    const fixture = createCloudFixture();
    const a = await organization(fixture, "Firma Identitate", "identitate", false);
    const b = await organization(fixture, "Firma Vecina", "vecina");
    const empty = await call(fixture, a.owner, "GET", "/api/seller");
    expect(empty.json).toMatchObject({ configured: false, version: 0, canEdit: true, completeness: { status: "UNCONFIGURED" } });
    const memberView = await call(fixture, a.member, "GET", "/api/seller");
    expect(memberView.json?.canEdit).toBe(false);

    const invalid = await call(fixture, a.owner, "PATCH", "/api/seller", {
      legalName: "Firma Identitate SRL",
      fiscalId: "",
      iban: "RO00 GRESIT",
      expectedVersion: 0,
    });
    expect(invalid.status).toBe(400);
    expect((invalid.json?.issues as Json[]).map((issue) => issue.field)).toEqual(["fiscalId", "iban"]);

    const first = await call(fixture, a.owner, "PATCH", "/api/seller", {
      ...SYNTHETIC_DEMO_SELLER,
      legalName: "Firma Identitate SRL",
      expectedVersion: 0,
    });
    expect(first.status, first.text).toBe(200);
    expect(first.json).toMatchObject({ version: 1, completeness: { status: "COMPLETE" } });
    const conflict = await call(fixture, a.owner, "PATCH", "/api/seller", {
      ...SYNTHETIC_DEMO_SELLER,
      legalName: "Alt nume",
      expectedVersion: 0,
    });
    expect(conflict.status).toBe(409);
    expect((await call(fixture, a.member, "PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER, expectedVersion: 1 })).status).toBe(403);
    expect((await call(fixture, a.member, "GET", "/api/seller/versions")).status).toBe(403);

    const confirmed = await confirm(fixture, a.owner, { requestId: a.requestId, manualProductNetPrice: 400 });
    const frozen = await freeze(fixture, a.owner, confirmed.reviewId, {
      customerId: a.customerId,
      requestId: a.requestId,
      manualProductNetPrice: 400,
    });
    expect(frozen.status, frozen.text).toBe(200);
    const quote = frozen.json?.quoteSnapshot as Json;

    const renamed = await call(fixture, a.owner, "PATCH", "/api/seller", {
      ...SYNTHETIC_DEMO_SELLER,
      legalName: "Firma Identitate Redenumită SRL",
      bank: "",
      expectedVersion: 1,
    });
    expect(renamed.status).toBe(200);
    const versions = await call(fixture, a.owner, "GET", "/api/seller/versions");
    expect(versions.json?.currentVersion).toBe(2);
    expect(((versions.json?.versions as Json[])[0]!.changedFields as Json[]).map((field) => field.field)).toEqual([
      "legalName",
      "bank",
    ]);
    const reread = await call(fixture, a.owner, "GET", `${productPath}/quote-snapshots/${encodeURIComponent(String(quote.quoteSnapshotId))}`);
    expect(reread.text).toContain("Firma Identitate SRL");
    expect(reread.text).not.toContain("Redenumită");
    // The neighbour organization keeps its own seller.
    const neighbour = await call(fixture, b.owner, "GET", "/api/seller");
    expect((neighbour.json?.seller as Json).legalName).toBe(SYNTHETIC_DEMO_SELLER.legalName);
    fixture.close();
  });
});

describe("scoped roles never receive commercial or financial data", () => {
  it("refuses Producție and Atelier on the new commercial and financial routes", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ORG_ROLES_V1: "on" } });
    const a = await organization(fixture, "Firma Roluri", "roluri");
    const invite = async (email: string, role: string) => {
      const invited = await call(fixture, a.owner, "POST", "/api/admin/access/invitations", { email, role });
      const token = decodeURIComponent(String(invited.json?.inviteUrl).split("#t=")[1]);
      const accepted = await call(fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua123" });
      expect(accepted.status).toBe(200);
      return cloudCookie(accepted.response);
    };
    const production = await invite("productie@roluri.test", "production");
    const workshop = await invite("atelier@roluri.test", "workshop");
    for (const cookie of [production, workshop]) {
      expect((await call(fixture, cookie, "GET", "/api/offering-policy")).status).toBe(403);
      expect((await call(fixture, cookie, "GET", "/api/admin/offering-policy")).status).toBe(403);
      expect((await call(fixture, cookie, "GET", "/api/admin/price-approvals")).status).toBe(403);
      expect((await call(fixture, cookie, "GET", "/api/seller/versions")).status).toBe(403);
      expect((await call(fixture, cookie, "GET", "/api/jobs/ord%3Ax/economics")).status).toBe(403);
      expect(
        (await call(fixture, cookie, "POST", `${productPath}/price-approval-requests`, { values, requestId: a.requestId })).status,
      ).toBe(403);
    }
    fixture.close();
  });
});
