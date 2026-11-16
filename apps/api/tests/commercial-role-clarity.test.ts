import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, SYNTHETIC_DEMO_SELLER } from "@workos-final/domain";
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
 * Commercial Role Clarity V1 · payload projection per role for unconfirmed internal rates, on the
 * configurator (confirm) and on the frozen quote. Synthetic SQLite planes only.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;
const productPath = `/api/products/${CANONICAL_PRODUCT_CODE}`;
const values = {
  "root.inscription": "ROL",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};
/** The unconfirmed-rate list, its acknowledgement and its reasons ("… neconfirmat"): owner scope only. */
const RATE_DETAIL = /"(rates|acknowledgedByUserId|bindingHash)"\s*:|neconfirmat/;
const INTERNAL_KEYS = /"(internalCost|eic|eicTotal|marginAmount|markupAmount|costCompletenessIssues|plannedCost|actualCost)"/;

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

async function setup() {
  const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ORG_ROLES_V1: "on" } });
  const { organization: org } = await addOrganization(fixture, "Firma Claritate");
  await addUser(fixture, { email: "owner@claritate.test", password: OWNER_PASSWORD, organizationId: org.organizationId, role: "owner" });
  await addUser(fixture, { email: "member@claritate.test", password: MEMBER_PASSWORD, organizationId: org.organizationId, role: "member" });
  const owner = (await loginCloud(fixture.app, "owner@claritate.test", OWNER_PASSWORD, org.organizationId)).cookie as string;
  const commercial = (await loginCloud(fixture.app, "member@claritate.test", MEMBER_PASSWORD, org.organizationId)).cookie as string;
  expect((await call(fixture, owner, "PATCH", "/api/seller", { ...SYNTHETIC_DEMO_SELLER })).status).toBe(200);
  const invite = async (email: string, role: string) => {
    const invited = await call(fixture, owner, "POST", "/api/admin/access/invitations", { email, role });
    const token = decodeURIComponent(String(invited.json?.inviteUrl).split("#t=")[1]);
    const accepted = await call(fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua123" });
    expect(accepted.status).toBe(200);
    return cloudCookie(accepted.response);
  };
  const production = await invite("productie@claritate.test", "production");
  const workshop = await invite("atelier@claritate.test", "workshop");
  const customer = await call(fixture, owner, "POST", "/api/customers", { displayName: "Client Claritate" });
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await call(fixture, owner, "POST", "/api/requests", {
    customerId,
    title: "Cerere claritate roluri",
    description: "Cerere sintetică pentru proiecția pe rol.",
  });
  const requestId = String(
    (request.json?.request as Json | undefined)?.requestId ?? ((request.json?.detail as Json)?.request as Json)?.requestId,
  );
  return { fixture, owner, commercial, production, workshop, customerId, requestId };
}

async function confirm(fixture: CloudFixture, cookie: string, requestId: string) {
  const preview = await call(fixture, cookie, "POST", `${productPath}/preview`, { values });
  if (preview.status !== 200) return { status: preview.status, reviewId: null, body: null, text: preview.text };
  const reviewId = String(preview.json?.reviewId);
  const confirmed = await call(fixture, cookie, "POST", `${productPath}/confirm`, {
    values,
    reviewId,
    requestId,
    manualProductNetPrice: 900,
  });
  return { status: confirmed.status, reviewId, body: confirmed.json, text: confirmed.text };
}

describe("Commercial Role Clarity V1 · request decisions are discoverable by the Comercial", () => {
  it("shows close/reopen to the roles holding requests.outcome.manage, never to Producție or Atelier", async () => {
    const { fixture, owner, commercial, production, workshop, requestId } = await setup();
    const commercialView = async (cookie: string) =>
      ((await call(fixture, cookie, "GET", `/api/requests/${encodeURIComponent(requestId)}`)).json?.detail as Json | undefined)
        ?.commercial as Json | undefined;
    const open = await commercialView(commercial);
    expect(open).toMatchObject({ state: "OPEN", canClose: true, canReopen: false });
    expect(open?.availableActions).toContain("CLOSE_OFFERLESS");
    expect(open?.availableActions).not.toContain("ACCEPT_QUOTE");
    expect((await commercialView(owner))?.canClose).toBe(true);
    for (const cookie of [production, workshop]) {
      const response = await call(fixture, cookie, "GET", `/api/requests/${encodeURIComponent(requestId)}`);
      if (response.status === 200) {
        const view = (response.json?.detail as Json | undefined)?.commercial as Json | undefined;
        expect(view?.canClose ?? false).toBe(false);
        expect(view?.canReopen ?? false).toBe(false);
      } else {
        expect([403, 404]).toContain(response.status);
      }
      const refused = await call(fixture, cookie, "POST", `/api/requests/${encodeURIComponent(requestId)}/commercial/decisions`, {
        groups: [],
        close: true,
        closeReason: "Nu este rolul meu.",
        expectedRevision: Number(open?.revision ?? 0),
        operationId: `role-clarity-refused-${Math.random().toString(36).slice(2)}`,
      });
      expect(refused.status).toBe(403);
    }
    const closed = await call(fixture, commercial, "POST", `/api/requests/${encodeURIComponent(requestId)}/commercial/decisions`, {
      groups: [],
      close: true,
      closeReason: "Clientul a amânat proiectul.",
      expectedRevision: Number(open?.revision ?? 0),
      operationId: "role-clarity-close",
    });
    expect(closed.status, closed.text).toBe(200);
    const afterClose = await commercialView(commercial);
    expect(afterClose).toMatchObject({ state: "CLOSED", canClose: false, canReopen: true });
    expect(JSON.stringify(afterClose)).not.toMatch(/"accountId":"[^"]/);
    const reopened = await call(fixture, commercial, "POST", `/api/requests/${encodeURIComponent(requestId)}/commercial/reopen`, {
      reason: "Clientul a revenit.",
      expectedRevision: Number(afterClose?.revision ?? 0),
      operationId: "role-clarity-reopen",
    });
    expect(reopened.status, reopened.text).toBe(200);
    expect(await commercialView(commercial)).toMatchObject({ state: "OPEN", canClose: true });
    fixture.close();
  });
});

describe("Commercial Role Clarity V1 · unconfirmed internal rates per role", () => {
  it("keeps the full rate list for the Owner and sends Comercial, Producție and Atelier none of it", async () => {
    const { fixture, owner, commercial, production, workshop, customerId, requestId } = await setup();

    // Owner: the internal-cost disclosure with the rate list and amounts, unchanged.
    const ownerConfirm = await confirm(fixture, owner, requestId);
    expect(ownerConfirm.status, ownerConfirm.text).toBe(200);
    const ownerAck = ownerConfirm.body?.rateAcknowledgement as Json | null;
    expect(ownerAck).toMatchObject({ status: "DISCLOSURE_ONLY", impact: "INTERNAL_COST_ONLY" });
    const ownerRates = ownerAck?.rates as Json[];
    expect(ownerRates.length).toBeGreaterThan(0);
    expect(ownerRates[0]).toHaveProperty("amount");
    expect(ownerRates[0]).toHaveProperty("label");

    // Comercial: no disclosure at all (the rates affect only the internal cost), no internal keys.
    const commercialConfirm = await confirm(fixture, commercial, requestId);
    expect(commercialConfirm.status, commercialConfirm.text).toBe(200);
    expect(commercialConfirm.body?.rateAcknowledgement ?? null).toBeNull();
    expect(commercialConfirm.text).not.toMatch(RATE_DETAIL);
    expect(commercialConfirm.text).not.toMatch(INTERNAL_KEYS);

    // Producție and Atelier: no commercial confirmation payload with rates.
    for (const cookie of [production, workshop]) {
      const scoped = await confirm(fixture, cookie, requestId);
      if (scoped.status === 200) {
        expect(scoped.body?.rateAcknowledgement ?? null).toBeNull();
        expect(scoped.text).not.toMatch(RATE_DETAIL);
        expect(scoped.text).not.toMatch(INTERNAL_KEYS);
      } else {
        expect([401, 403, 404]).toContain(scoped.status);
      }
    }

    // Frozen quote: the Comercial reads it without any rate detail; Producție and Atelier are refused.
    const frozen = await call(fixture, owner, "POST", `${productPath}/quote-snapshots`, {
      values,
      reviewId: ownerConfirm.reviewId,
      customerId,
      requestId,
      manualProductNetPrice: 900,
    });
    expect(frozen.status, frozen.text).toBe(200);
    const quoteId = encodeURIComponent(String((frozen.json?.quoteSnapshot as Json).quoteSnapshotId));
    const commercialQuote = await call(fixture, commercial, "GET", `${productPath}/quote-snapshots/${quoteId}`);
    expect(commercialQuote.status).toBe(200);
    expect(commercialQuote.text).not.toMatch(RATE_DETAIL);
    expect(commercialQuote.text).not.toMatch(INTERNAL_KEYS);
    expect((await call(fixture, production, "GET", `${productPath}/quote-snapshots/${quoteId}`)).status).toBe(403);
    expect((await call(fixture, workshop, "GET", `${productPath}/quote-snapshots/${quoteId}`)).status).toBe(403);
    fixture.close();
  });
});
