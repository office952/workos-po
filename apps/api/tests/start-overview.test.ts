import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { projectJobOverview, projectRequestOverview } from "@workos-final/domain";
import { resetAccessRateLimits } from "../src/cloud/accessLifecycle.js";
import type { ApiEnv } from "../src/cloud/context.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { provisionMembership } from "../src/cloud/provision.js";
import { routePolicyFor } from "../src/cloud/routePolicy.js";
import type { ProductSystemRuntime } from "../src/productSystem/runtime.js";
import { registerStartRoutes } from "../src/start/routes.js";
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
 * Start V1-D · the orientation projection per role and per organization.
 * Synthetic, isolated SQLite planes only.
 */

const ORIGIN = "http://127.0.0.1:5173";
type Json = Record<string, unknown>;

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

type StartBody = {
  readAt: string;
  sources: { id: string; status: string }[];
  attention: { entries: Json[]; counts: Record<string, number>; incompleteLevels: string[] };
  continueWork: { status: string; total: number; items: Json[] } | null;
  flow: { id: string; status: string; total: number | null }[];
  activity: string;
  setup: Json | null;
  canCreateRequest: boolean;
};

async function start(fixture: CloudFixture, cookie: string) {
  const response = await call(fixture, cookie, "GET", "/api/start");
  return { ...response, start: response.json?.start as StartBody };
}

/** The switch keeps the session; a rotated session cookie, if any, replaces the previous one. */
function sessionCookieAfter(response: Response, previous: string): string {
  try {
    return cloudCookie(response);
  } catch {
    return previous;
  }
}

async function setup() {
  const fixture = createCloudFixture({ env: { NODE_ENV: "test", WORKOS_ORG_ROLES_V1: "on" } });
  const { organization: orgA } = await addOrganization(fixture, "Firma Start A");
  const { organization: orgB } = await addOrganization(fixture, "Firma Start B");
  await addUser(fixture, { email: "owner@start-a.test", password: OWNER_PASSWORD, organizationId: orgA.organizationId, role: "owner" });
  await addUser(fixture, { email: "member@start-a.test", password: MEMBER_PASSWORD, organizationId: orgA.organizationId, role: "member" });
  const ownerB = await addUser(fixture, { email: "owner@start-b.test", password: OWNER_PASSWORD, organizationId: orgB.organizationId, role: "owner" });
  const owner = (await loginCloud(fixture.app, "owner@start-a.test", OWNER_PASSWORD, orgA.organizationId)).cookie as string;
  const member = (await loginCloud(fixture.app, "member@start-a.test", MEMBER_PASSWORD, orgA.organizationId)).cookie as string;
  const invite = async (email: string, role: string) => {
    const invited = await call(fixture, owner, "POST", "/api/admin/access/invitations", { email, role });
    const token = decodeURIComponent(String(invited.json?.inviteUrl).split("#t=")[1]);
    const accepted = await call(fixture, null, "POST", "/api/cloud/invitations/accept", { token, mode: "new", password: "ParolaNoua123" });
    expect(accepted.status).toBe(200);
    return cloudCookie(accepted.response);
  };
  const production = await invite("productie@start-a.test", "production");
  const workshop = await invite("atelier@start-a.test", "workshop");
  const customer = await call(fixture, owner, "POST", "/api/customers", { displayName: "Client Start Confidențial A" });
  const customerId = String((customer.json?.customer as Json).customerId);
  const request = await call(fixture, owner, "POST", "/api/requests", {
    customerId,
    title: "Cerere Start numai în A",
    description: "Cerere sintetică pentru proiecția Start.",
  });
  expect(request.status).toBeLessThan(300);
  return { fixture, orgA, orgB, ownerB, owner, member, production, workshop };
}

beforeEach(() => {
  resetAccessRateLimits();
  resetCloudLoginAttemptGuard();
});
afterEach(() => cleanupCloudTemps());

describe("GET /api/start · roles", () => {
  it("is governed by the route policy and refuses a session-less or workshop caller", async () => {
    const ctx = await setup();
    try {
      expect(routePolicyFor("GET", "/api/start")?.capability).toBe("org.settings.read");
      expect((await call(ctx.fixture, null, "GET", "/api/start")).status).toBe(401);
      const workshop = await call(ctx.fixture, ctx.workshop, "GET", "/api/start");
      expect(workshop.status).toBe(403);
      expect(workshop.text).not.toContain("Cerere Start numai în A");
    } finally {
      ctx.fixture.close();
    }
  });

  it("gives the owner every stage, the approvals source and the request to continue", async () => {
    const ctx = await setup();
    try {
      const { status, start: body, response } = await start(ctx.fixture, ctx.owner);
      expect(status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(body.sources.map((source) => [source.id, source.status])).toEqual([
        ["REQUESTS", "READY"],
        ["QUOTES", "READY"],
        ["JOBS", "READY"],
        ["PRICE_APPROVALS", "READY"],
        ["SETUP", "READY"],
      ]);
      expect(body.flow.map((stage) => [stage.id, stage.total])).toEqual([
        ["REQUESTS", 1],
        ["QUOTES", 0],
        ["JOBS", 0],
        ["EXECUTION", 0],
      ]);
      expect(body.activity).toBe("PRESENT");
      expect(body.attention.entries).toEqual([]);
      expect(body.continueWork).toMatchObject({ status: "READY", total: 1 });
      expect(body.continueWork?.items[0]).toMatchObject({
        title: "Cerere Start numai în A",
        nextActionLabel: "Alege produsul",
        target: { kind: "REQUEST_PRODUCT" },
      });
      expect(Number.isNaN(Date.parse(body.readAt))).toBe(false);
    } finally {
      ctx.fixture.close();
    }
  });

  it("gives Comercial the commercial stages without the approvals source", async () => {
    const ctx = await setup();
    try {
      const { start: body } = await start(ctx.fixture, ctx.member);
      expect(body.sources.map((source) => source.id)).toEqual(["REQUESTS", "QUOTES", "JOBS", "SETUP"]);
      expect(body.flow.map((stage) => stage.id)).toEqual(["REQUESTS", "QUOTES", "JOBS", "EXECUTION"]);
      expect(body.continueWork?.total).toBe(1);
      expect(body.setup).toMatchObject({ canManage: false });
    } finally {
      ctx.fixture.close();
    }
  });

  it("gives Producție no offers, no approvals and no commercial next steps", async () => {
    const ctx = await setup();
    try {
      const { status, start: body, text } = await start(ctx.fixture, ctx.production);
      expect(status).toBe(200);
      expect(body.sources.map((source) => source.id)).toEqual(["REQUESTS", "JOBS", "SETUP"]);
      expect(body.flow.map((stage) => stage.id)).toEqual(["REQUESTS", "JOBS", "EXECUTION"]);
      expect(body.continueWork).toBeNull();
      expect(body.canCreateRequest).toBe(false);
      expect(text).not.toMatch(/EUR|grossDisplay|netPrice/);
    } finally {
      ctx.fixture.close();
    }
  });
});

describe("GET /api/start · organization isolation", () => {
  it("shows organization B nothing that belongs to organization A", async () => {
    const ctx = await setup();
    try {
      const ownerB = (await loginCloud(ctx.fixture.app, "owner@start-b.test", OWNER_PASSWORD, ctx.orgB.organizationId)).cookie as string;
      const { status, start: body, text } = await start(ctx.fixture, ownerB);
      expect(status).toBe(200);
      expect(body.activity).toBe("NONE");
      expect(body.flow.every((stage) => stage.total === 0)).toBe(true);
      expect(body.continueWork).toMatchObject({ total: 0, items: [] });
      expect(text).not.toContain("Cerere Start numai în A");
      expect(text).not.toContain("Client Start Confidențial A");
    } finally {
      ctx.fixture.close();
    }
  });

  it("re-reads the projection for the new organization after a switch, in both directions", async () => {
    const ctx = await setup();
    try {
      // The owner of B also becomes Comercial in A: one account, two organizations.
      provisionMembership(ctx.fixture.controlPlane, {
        userId: ctx.ownerB.userId,
        organizationId: ctx.orgA.organizationId,
        role: "member",
      });
      const login = await loginCloud(ctx.fixture.app, "owner@start-b.test", OWNER_PASSWORD, ctx.orgB.organizationId);
      let cookie = login.cookie as string;
      expect((await start(ctx.fixture, cookie)).start.activity).toBe("NONE");

      const toA = await call(ctx.fixture, cookie, "POST", "/api/cloud/active-organization", {
        organizationId: ctx.orgA.organizationId,
      });
      expect(toA.status).toBe(200);
      cookie = sessionCookieAfter(toA.response, cookie);
      const inA = await start(ctx.fixture, cookie);
      expect(inA.start.activity).toBe("PRESENT");
      expect(inA.text).toContain("Cerere Start numai în A");
      // In A this account is Comercial: no approvals source, although it owns B.
      expect(inA.start.sources.map((source) => source.id)).not.toContain("PRICE_APPROVALS");

      const toB = await call(ctx.fixture, cookie, "POST", "/api/cloud/active-organization", {
        organizationId: ctx.orgB.organizationId,
      });
      expect(toB.status).toBe(200);
      cookie = sessionCookieAfter(toB.response, cookie);
      const backInB = await start(ctx.fixture, cookie);
      expect(backInB.start.activity).toBe("NONE");
      expect(backInB.text).not.toContain("Cerere Start numai în A");
      expect(backInB.start.sources.map((source) => source.id)).toContain("PRICE_APPROVALS");
    } finally {
      ctx.fixture.close();
    }
  });
});

describe("GET /api/start · partial source failure", () => {
  it("answers with the readable sources and marks the failed one unavailable, without a zero", async () => {
    const runtime = {
      listRequestOverview: () => projectRequestOverview([]),
      listQuoteOverview: () => {
        throw new Error("synthetic quote source failure");
      },
      listJobOverview: () => projectJobOverview([]),
      assemblyPlane: () => ({ organizationId: "org:x", db: { prepare: () => ({ all: () => [] }) } }),
      listPriceApprovals: () => [],
      resolveProductEnablement: () => ({ ok: true, enabledTemplateCodes: ["PRD"] }),
      listPeople: () => [],
    } as unknown as ProductSystemRuntime;
    const app = new Hono<ApiEnv>();
    app.use("/api/*", async (c, next) => {
      c.set("accessMode", "single_plane");
      c.set("productSystem", runtime);
      await next();
    });
    registerStartRoutes(app);

    const response = await app.request("/api/start");
    expect(response.status).toBe(200);
    const body = ((await response.json()) as { start: StartBody }).start;
    expect(body.sources.find((source) => source.id === "QUOTES")?.status).toBe("UNAVAILABLE");
    expect(body.sources.filter((source) => source.status === "READY").map((source) => source.id)).toEqual([
      "REQUESTS",
      "JOBS",
      "PRICE_APPROVALS",
      "SETUP",
    ]);
    expect(body.flow.find((stage) => stage.id === "QUOTES")).toMatchObject({ status: "UNAVAILABLE", total: null });
    expect(body.flow.find((stage) => stage.id === "REQUESTS")).toMatchObject({ status: "READY", total: 0 });
    expect(body.attention.incompleteLevels).toEqual(["ATTENTION"]);
    // With a source missing, the organization is not declared empty.
    expect(body.activity).toBe("UNKNOWN");
  });
});
