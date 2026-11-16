import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_PRODUCT_CODE, OWNER_CONFIRMED_SELLER } from "@workos-final/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import { parseTrustedProxies, resolveClientAddress, UNKNOWN_CLIENT_ADDRESS } from "../src/cloud/clientAddress.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
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
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

/**
 * V1 Organization Access — acceptance closure (Owner GO, points C, D, F).
 * D: client address for rate limiting never trusts spoofable headers by default.
 * F: password-recovery answers do not reveal whether an account exists or is verified.
 * C: scenario 12 — disabled optional modules grant no new action and block nothing independent.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;
type Bindings = { incoming: { socket: { remoteAddress: string } } };
const peer = (remoteAddress: string): Bindings => ({ incoming: { socket: { remoteAddress } } });

async function call(fixture: CloudFixture, cookie: string | null, method: string, path: string, body?: unknown, extra: Record<string, string> = {}, bindings?: Bindings) {
  const headers: Record<string, string> = { origin: ORIGIN, ...extra };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fixture.app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, bindings);
  const text = await response.text();
  let json: Json | null = null;
  try { json = text ? (JSON.parse(text) as Json) : null; } catch { json = null; }
  return { status: response.status, json, response, text };
}

beforeEach(() => {
  resetAccessRateLimits();
  resetCloudLoginAttemptGuard();
});
afterEach(() => cleanupCloudTemps());

describe("D · client address for rate limiting", () => {
  const none = parseTrustedProxies(undefined);
  const loopback = parseTrustedProxies("loopback");

  it("ignores X-Forwarded-For unless the TCP peer is an explicitly trusted proxy", () => {
    expect(resolveClientAddress({ socketAddress: "203.0.113.7", forwardedFor: "198.51.100.1", trustedProxies: none })).toBe("203.0.113.7");
    // Even a loopback peer is not trusted without configuration.
    expect(resolveClientAddress({ socketAddress: "127.0.0.1", forwardedFor: "198.51.100.1", trustedProxies: none })).toBe("127.0.0.1");
    // An untrusted peer claiming to forward is ignored even when proxies are configured.
    expect(resolveClientAddress({ socketAddress: "203.0.113.7", forwardedFor: "198.51.100.1", trustedProxies: loopback })).toBe("203.0.113.7");
  });

  it("behind a trusted proxy takes the right-most untrusted hop, so a client cannot choose its own key", () => {
    expect(resolveClientAddress({ socketAddress: "127.0.0.1", forwardedFor: "198.51.100.9", trustedProxies: loopback })).toBe("198.51.100.9");
    // Spoofed entries prepended by the client are ignored: the proxy appends the real peer last.
    expect(resolveClientAddress({ socketAddress: "127.0.0.1", forwardedFor: "1.2.3.4, 10.0.0.1, 198.51.100.9", trustedProxies: loopback })).toBe("198.51.100.9");
    expect(resolveClientAddress({ socketAddress: "::ffff:127.0.0.1", forwardedFor: "198.51.100.9", trustedProxies: loopback })).toBe("198.51.100.9");
    const chain = parseTrustedProxies("loopback, 10.0.0.5");
    expect(resolveClientAddress({ socketAddress: "127.0.0.1", forwardedFor: "198.51.100.9, 10.0.0.5", trustedProxies: chain })).toBe("198.51.100.9");
  });

  it("fails safe: malformed hops fall back to the proxy address and a missing socket shares one bucket", () => {
    expect(resolveClientAddress({ socketAddress: "127.0.0.1", forwardedFor: "198.51.100.9, not-an-ip", trustedProxies: loopback })).toBe("127.0.0.1");
    expect(resolveClientAddress({ socketAddress: undefined, forwardedFor: "198.51.100.9", trustedProxies: loopback })).toBe(UNKNOWN_CLIENT_ADDRESS);
    expect(parseTrustedProxies("garbage, , 300.1.1.1").size).toBe(0);
  });

  it("without trusted proxies, rotating spoofed X-Forwarded-For does not escape the limit", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test" } });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const r = await call(fixture, null, "POST", "/api/cloud/password-reset/complete", { token: `x${i}`, newPassword: "ParolaNoua123" }, { "x-forwarded-for": `198.51.100.${i}` }, peer("203.0.113.7"));
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 410)).toBe(true);
    expect(statuses[20]).toBe(429);
    // A different real peer is not punished for the attacker.
    expect((await call(fixture, null, "POST", "/api/cloud/password-reset/complete", { token: "y", newPassword: "ParolaNoua123" }, {}, peer("203.0.113.8"))).status).toBe(410);
    fixture.close();
  });

  it("behind a trusted proxy, clients are limited separately and prepending fake hops does not help", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_TRUSTED_PROXIES: "loopback" } });
    for (let i = 0; i < 20; i += 1) {
      expect((await call(fixture, null, "POST", "/api/cloud/password-reset/complete", { token: `a${i}`, newPassword: "ParolaNoua123" }, { "x-forwarded-for": `9.9.9.${i}, 198.51.100.20` }, peer("127.0.0.1"))).status).toBe(410);
    }
    expect((await call(fixture, null, "POST", "/api/cloud/password-reset/complete", { token: "a-last", newPassword: "ParolaNoua123" }, { "x-forwarded-for": "7.7.7.7, 198.51.100.20" }, peer("127.0.0.1"))).status).toBe(429);
    expect((await call(fixture, null, "POST", "/api/cloud/password-reset/complete", { token: "b", newPassword: "ParolaNoua123" }, { "x-forwarded-for": "198.51.100.21" }, peer("127.0.0.1"))).status).toBe(410);
    fixture.close();
  });

  it("successive reset requests hit the per-address limit; legitimate sign-in is unaffected by forged headers", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test" } });
    const { organization } = await addOrganization(fixture, "Firma A");
    await addUser(fixture, { email: "owner@a.test", password: OWNER_PASSWORD, organizationId: organization.organizationId, role: "owner" });
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      statuses.push((await call(fixture, null, "POST", "/api/cloud/password-reset/request", { email: `n${i}@a.test` }, { "x-forwarded-for": `198.51.100.${i}` }, peer("203.0.113.9"))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s === 202)).toBe(true);
    expect(statuses[20]).toBe(429);
    const login = await fixture.app.request("/api/cloud/login", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json", "x-forwarded-for": "6.6.6.6" },
      body: JSON.stringify({ email: "owner@a.test", password: OWNER_PASSWORD }),
    }, peer("203.0.113.9"));
    expect(login.status).toBe(200);
    fixture.close();
  });
});

describe("F · neutral password-recovery answers", () => {
  it("existing verified, existing unverified and unknown emails get the same status and body; only the verified one receives a link", async () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-v1-outbox-"));
    const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ACCESS_OUTBOX_DIR: dir } });
    const { organization } = await addOrganization(fixture, "Firma A");
    const verified = await addUser(fixture, { email: "verificat@a.test", password: OWNER_PASSWORD, organizationId: organization.organizationId, role: "owner" });
    await addUser(fixture, { email: "neverificat@a.test", password: MEMBER_PASSWORD, organizationId: organization.organizationId, role: "member" });
    fixture.controlPlane.db.prepare(`UPDATE users SET email_verified_at = ? WHERE user_id = ?`).run(new Date().toISOString(), verified.userId);

    const cases = ["verificat@a.test", "neverificat@a.test", "inexistent@a.test"];
    const answers: Array<{ status: number; body: string; ms: number[] }> = [];
    for (const email of cases) {
      const ms: number[] = [];
      let last = { status: 0, text: "" };
      for (let i = 0; i < 5; i += 1) {
        resetAccessRateLimits();
        const started = performance.now();
        const r = await call(fixture, null, "POST", "/api/cloud/password-reset/request", { email }, {}, peer("203.0.113.30"));
        ms.push(performance.now() - started);
        last = { status: r.status, text: r.text };
      }
      answers.push({ status: last.status, body: last.text, ms });
    }
    expect(new Set(answers.map((a) => a.status))).toEqual(new Set([202]));
    expect(new Set(answers.map((a) => a.body)).size).toBe(1);
    // Rate limiting is keyed by the submitted email, never by account existence.
    for (const email of ["verificat@a.test", "inexistent@a.test"]) {
      resetAccessRateLimits();
      const seq: number[] = [];
      for (let i = 0; i < 4; i += 1) seq.push((await call(fixture, null, "POST", "/api/cloud/password-reset/request", { email }, {}, peer(`203.0.113.${40 + i}`))).status);
      expect(seq).toEqual([202, 202, 202, 429]);
    }
    const tokens = fixture.controlPlane.db.prepare(`SELECT u.email AS email, count(*) AS n FROM credential_tokens t JOIN users u ON u.user_id = t.user_id WHERE t.purpose = 'PASSWORD_RESET' GROUP BY u.email`).all() as Array<{ email: string; n: number }>;
    expect(tokens.map((t) => t.email)).toEqual(["verificat@a.test"]);
    expect(readdirSync(dir).length).toBeGreaterThan(0);
    const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    // Single local measurement, recorded for the report; no statistical guarantee is asserted.
    console.log(`F_TIMING_MEDIAN_MS ${JSON.stringify(Object.fromEntries(cases.map((email, i) => [email.split("@")[0], Number(median(answers[i].ms).toFixed(1))])))}`);
    fixture.close();
  });
});

describe("A (final wave) · production release follows production.release and the existing eligibility", () => {
  it("Producție releases an eligible confirmed order; Comercial and Atelier are refused; unknown or repeated is handled", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ORG_ROLES_V1: "on" } });
    const { organization } = await addOrganization(fixture, "Firma A");
    await addUser(fixture, { email: "owner@a.test", password: OWNER_PASSWORD, organizationId: organization.organizationId, role: "owner" });
    await addUser(fixture, { email: "member@a.test", password: MEMBER_PASSWORD, organizationId: organization.organizationId, role: "member" });
    const ownerCookie = (await loginCloud(fixture.app, "owner@a.test", OWNER_PASSWORD)).cookie as string;
    const memberCookie = (await loginCloud(fixture.app, "member@a.test", MEMBER_PASSWORD)).cookie as string;
    const accept = async (email: string, role: string) => {
      const invited = await call(fixture, ownerCookie, "POST", "/api/admin/access/invitations", { email, role });
      const token = decodeURIComponent(String(invited.json?.inviteUrl).split("#t=")[1]);
      const accepted = await call(fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua123" });
      expect(accepted.status).toBe(200);
      return cloudCookie(accepted.response) as string;
    };
    const production = await accept("productie@a.test", "production");
    const workshop = await accept("atelier@a.test", "workshop");

    // A confirmed, not yet released order (owner path, existing commercial rules; synthetic seller).
    const { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank } = OWNER_CONFIRMED_SELLER;
    expect((await call(fixture, ownerCookie, "PATCH", "/api/seller", { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank })).status).toBe(200);
    const values = { "root.inscription": "ELIBERARE", "face.finish": "none", "face.confirmedAreaMm2": 250000, "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
    const reviewed = await call(fixture, ownerCookie, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values });
    const customer = await call(fixture, ownerCookie, "POST", "/api/customers", { displayName: "Client eliberare" });
    const frozen = await freezeAcknowledgingRates(
      (body) => fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, { method: "POST", headers: { origin: ORIGIN, cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify(body) }),
      { values, reviewId: reviewed.json?.reviewId, manualProductNetPrice: 400, customerId: (customer.json?.customer as Json).customerId },
    );
    expect(frozen.status, JSON.stringify(await frozen.clone().json())).toBe(200);
    const quoteId = String(((await frozen.json()) as { quoteSnapshot: Json }).quoteSnapshot.quoteSnapshotId);
    const order = await call(fixture, ownerCookie, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(quoteId)}/confirm-order`);
    const jobId = String((order.json?.orderSnapshot as Json).orderSnapshotId);
    const release = (cookie: string, id = jobId) => call(fixture, cookie, "POST", `/api/jobs/${encodeURIComponent(id)}/production`);

    // Refused: roles without production.release (the stage is eligible, the role is not).
    expect((await release(memberCookie)).status).toBe(403);
    expect((await release(workshop)).status).toBe(403);
    // The job sheet data a Producție user reads before releasing: confirmed order, no plan yet.
    const before = await call(fixture, production, "GET", `/api/jobs/${encodeURIComponent(jobId)}`);
    expect(before.status).toBe(200);
    expect((before.json?.execution as Json | null)?.planId ?? null).toBeNull();
    // Permitted: Producție releases through the same route and rules as the owner.
    const released = await release(production);
    expect(released.status).toBe(200);
    expect(released.json?.created).toBe(true);
    // Repeated release is idempotent (no second plan); an unknown order is not eligible.
    const again = await release(production);
    expect(again.status).toBe(200);
    expect(again.json?.created).toBe(false);
    expect((await release(production, "ord:missing")).status).toBe(404);
    fixture.close();
  });
});

describe("C · scenario 12 — disabled optional modules", () => {
  it("grant no new action to Production or Workshop and do not block independent work", async () => {
    const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ORG_ROLES_V1: "on" } });
    const { organization } = await addOrganization(fixture, "Firma A");
    await addUser(fixture, { email: "owner@a.test", password: OWNER_PASSWORD, organizationId: organization.organizationId, role: "owner" });
    const ownerCookie = (await loginCloud(fixture.app, "owner@a.test", OWNER_PASSWORD)).cookie as string;
    const accept = async (email: string, role: string) => {
      const invited = await call(fixture, ownerCookie, "POST", "/api/admin/access/invitations", { email, role });
      expect(invited.status).toBe(201);
      const token = decodeURIComponent(String(invited.json?.inviteUrl).split("#t=")[1]);
      const accepted = await call(fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua123" });
      expect(accepted.status).toBe(200);
      return cloudCookie(accepted.response) as string;
    };
    const production = await accept("productie@a.test", "production");
    const workshop = await accept("atelier@a.test", "workshop");

    // Both optional modules start DISABLED (code default).
    expect((await call(fixture, production, "GET", "/api/admin/external-production")).json).toMatchObject({ mode: "DISABLED" });
    expect((await call(fixture, production, "GET", "/api/admin/material-readiness")).json).toMatchObject({ mode: "DISABLED" });
    const capsBefore = {
      production: (await call(fixture, production, "GET", "/api/cloud/session")).json?.capabilities,
      workshop: (await call(fixture, workshop, "GET", "/api/cloud/session")).json?.capabilities,
    };

    // Nobody but the owner may switch a module on.
    for (const cookie of [production, workshop]) {
      expect((await call(fixture, cookie, "POST", "/api/admin/external-production", { mode: "ENABLED" })).status).toBe(403);
      expect((await call(fixture, cookie, "POST", "/api/admin/material-readiness", { mode: "REQUIRED" })).status).toBe(403);
    }

    // A released plan (independent of the modules) exists and is usable by both roles.
    const values = { "root.inscription": "SCENARIU 12", "face.finish": "none", "face.confirmedAreaMm2": 250000, "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
    const preview = await call(fixture, ownerCookie, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values });
    const accepted = await call(fixture, ownerCookie, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, { values, reviewId: preview.json?.reviewId });
    const snapshotId = (accepted.json?.snapshot as Json).snapshotId as string;
    const released = await call(fixture, production, "POST", `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`);
    expect(released.status).toBe(200);
    const plan = released.json?.executionPlan as { plan: Json; tasks: Json[] };
    const planned = plan.tasks.find((task) => task.status === "PLANNED")!;
    expect((await call(fixture, production, "GET", `/api/execution-plans/${encodeURIComponent(String(plan.plan.planId))}`)).status).toBe(200);
    expect((await call(fixture, workshop, "GET", `/api/execution-plans/${encodeURIComponent(String(plan.plan.planId))}`)).status).toBe(200);

    // Module actions refuse as before (module refusal, not a role grant); Workshop never gets planning actions.
    const external = await call(fixture, production, "POST", `/api/execution-tasks/${encodeURIComponent(String(planned.taskId))}/external`);
    expect(external.status).toBe(409);
    expect(external.json).toMatchObject({ error: "external_production_disabled" });
    expect((await call(fixture, workshop, "POST", `/api/execution-tasks/${encodeURIComponent(String(planned.taskId))}/external`)).status).toBe(403);

    // Owner turns the modules on: capabilities of the scoped roles do not change.
    expect((await call(fixture, ownerCookie, "POST", "/api/admin/external-production", { mode: "ENABLED" })).status).toBe(200);
    expect((await call(fixture, ownerCookie, "POST", "/api/admin/material-readiness", { mode: "REQUIRED" })).status).toBe(200);
    expect((await call(fixture, production, "GET", "/api/cloud/session")).json?.capabilities).toEqual(capsBefore.production);
    expect((await call(fixture, workshop, "GET", "/api/cloud/session")).json?.capabilities).toEqual(capsBefore.workshop);
    expect((await call(fixture, workshop, "POST", `/api/execution-tasks/${encodeURIComponent(String(planned.taskId))}/external`)).status).toBe(403);
    fixture.close();
  });
});
