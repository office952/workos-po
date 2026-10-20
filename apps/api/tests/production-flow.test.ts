import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_PRODUCT_CODE, OWNER_CONFIRMED_SELLER } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { addOrganization, addUser, cleanupCloudTemps, createCloudFixture, loginCloud, OWNER_PASSWORD, MEMBER_PASSWORD } from "./cloud-harness.js";

type App = ReturnType<typeof createApp>;
type Json = Record<string, unknown>;
async function body(response: Response): Promise<Json> { return await response.json() as Json; }
function client(app: App, cookie = "") {
  return {
    get: (url: string) => app.request(url, { headers: { cookie } }),
    post: (url: string, value?: unknown) => app.request(url, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    }),
  };
}
async function readyQuote(api: ReturnType<typeof client>) {
  const values = { "root.inscription": "FLUX SINTETIC", "face.finish": "none", "face.confirmedAreaMm2": 250000,
    "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
  const reviewed = await body(await api.post(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { values }));
  const customer = await body(await api.post("/api/customers", { displayName: "Client sintetic flux" }));
  const frozen = await freezeAcknowledgingRates(value => api.post(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, value), {
    values, reviewId: reviewed.reviewId, manualProductNetPrice: 400,
    customerId: (customer.customer as Json).customerId,
  });
  expect(frozen.status, JSON.stringify(await frozen.clone().json())).toBe(200);
  const id = ((await body(frozen)).quoteSnapshot as Json).quoteSnapshotId as string;
  return { id, path: `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(id)}` };
}
afterEach(() => { vi.restoreAllMocks(); resetCloudLoginAttemptGuard(); cleanupCloudTemps(); });

describe("coordinated production flow", () => {
  it("confirms one exact quote and prepares one release and plan under parallel retries", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const api = client(createApp({ productSystem: runtime }));
      const quote = await readyQuote(api);
      const confirmations = await Promise.all([api.post(`${quote.path}/confirm-order`), api.post(`${quote.path}/confirm-order`)]);
      expect(confirmations.map(r => r.status)).toEqual([200, 200]);
      const orders = await Promise.all(confirmations.map(body));
      const id = (orders[0].orderSnapshot as Json).orderSnapshotId as string;
      expect((orders[1].orderSnapshot as Json).orderSnapshotId).toBe(id);
      expect(orders[1].created).toBe(false);
      expect(runtime.readOrderSnapshot(id)?.sourceQuoteSnapshotId).toBe(quote.id);
      const releases = await Promise.all([api.post(`/api/jobs/${id}/production`), api.post(`/api/jobs/${id}/production`)]);
      expect(releases.map(r => r.status)).toEqual([200, 200]);
      const [first, retry] = await Promise.all(releases.map(body));
      expect(retry).toEqual({ ...first, created: false });
      const detail = await body(await api.get(`/api/jobs/${id}`));
      expect((detail.execution as Json).planId).toBe(((first.executionPlan as Json).plan as Json).planId);
      expect(runtime.listOpenExecutionPlans()).toHaveLength(1);
      expect(runtime.readExecutionPlan(((detail.execution as Json).planId as string))?.tasks.every(t => t.status !== "IN_PROGRESS" && t.status !== "COMPLETED" && t.status !== "OUTSIDE")).toBe(true);
    } finally { runtime.close(); }
  });

  it("rolls back acceptance if storing the order fails, then safely retries", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const api = client(createApp({ productSystem: runtime }));
      const quote = await readyQuote(api);
      const failure = vi.spyOn(runtime, "persistOrderSnapshot").mockImplementationOnce(() => { throw new Error("synthetic order write failure"); });
      expect((await api.post(`${quote.path}/confirm-order`)).status).toBe(500);
      expect(runtime.readQuoteAcceptance(quote.id)).toBeNull();
      expect(runtime.readOrderSnapshotByQuote(quote.id)).toBeNull();
      failure.mockRestore();
      expect((await api.post(`${quote.path}/confirm-order`)).status).toBe(200);
    } finally { runtime.close(); }
  });

  it("rolls back a new release if plan persistence fails and repairs a historical release without a plan", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const api = client(createApp({ productSystem: runtime }));
      const quote = await readyQuote(api);
      const order = await body(await api.post(`${quote.path}/confirm-order`));
      const id = (order.orderSnapshot as Json).orderSnapshotId as string;
      vi.spyOn(runtime, "persistExecutionPlan").mockImplementationOnce(() => { throw new Error("synthetic plan write failure"); });
      expect((await api.post(`/api/jobs/${id}/production`)).status).toBe(500);
      expect(runtime.readProductionReleaseByOrder(id)).toBeNull();
      expect(runtime.listOpenExecutionPlans()).toHaveLength(0);
      expect((await api.post(`/api/jobs/${id}/production-release`)).status).toBe(200);
      const existingReleaseId = runtime.readProductionReleaseByOrder(id)?.snapshotId;
      const result = await body(await api.post(`/api/jobs/${id}/production`));
      expect(result.releaseSnapshotId).toBe(existingReleaseId);
      expect(runtime.listOpenExecutionPlans()).toHaveLength(1);
    } finally { runtime.close(); }
  });

  it("keeps Owner authorization and organization isolation on combined and compatibility commands", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Organizație flux");
      const other = await addOrganization(fixture, "Organizație separată");
      await addUser(fixture, { email: "flow-owner@example.test", password: OWNER_PASSWORD, organizationId: org.organization.organizationId, role: "owner" });
      await addUser(fixture, { email: "flow-member@example.test", password: MEMBER_PASSWORD, organizationId: org.organization.organizationId, role: "member" });
      await addUser(fixture, { email: "flow-other@example.test", password: OWNER_PASSWORD, organizationId: other.organization.organizationId, role: "owner" });
      const owner = client(fixture.app, (await loginCloud(fixture.app, "flow-owner@example.test", OWNER_PASSWORD, org.organization.organizationId)).cookie ?? "");
      const member = client(fixture.app, (await loginCloud(fixture.app, "flow-member@example.test", MEMBER_PASSWORD, org.organization.organizationId)).cookie ?? "");
      const outsider = client(fixture.app, (await loginCloud(fixture.app, "flow-other@example.test", OWNER_PASSWORD, other.organization.organizationId)).cookie ?? "");
      const { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank } = OWNER_CONFIRMED_SELLER;
      const ownerCookie = (await loginCloud(fixture.app, "flow-owner@example.test", OWNER_PASSWORD, org.organization.organizationId)).cookie ?? "";
      expect((await fixture.app.request("/api/seller", { method: "PATCH", headers: { cookie: ownerCookie, "content-type": "application/json" }, body: JSON.stringify({ legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank }) })).status).toBe(200);
      const quote = await readyQuote(owner);
      expect((await member.post(`${quote.path}/confirm-order`)).status).toBe(403);
      expect((await member.post(`${quote.path}/acceptance`)).status).toBe(403);
      expect((await member.post(`${quote.path}/order`)).status).toBe(403);
      expect((await outsider.post(`${quote.path}/confirm-order`)).status).toBe(404);
      const order = await body(await owner.post(`${quote.path}/confirm-order`));
      const id = (order.orderSnapshot as Json).orderSnapshotId as string;
      for (const suffix of ["production", "production-release", "execution-plan"]) {
        expect((await member.post(`/api/jobs/${id}/${suffix}`)).status).toBe(403);
        expect((await outsider.post(`/api/jobs/${id}/${suffix}`)).status).toBe(404);
      }
      expect((await member.get(quote.path)).status).toBe(200);
      expect((await member.get(`/api/jobs/${id}`)).status).toBe(200);
      expect((await owner.post(`/api/jobs/${id}/production`)).status).toBe(200);
    } finally { fixture.close(); }
  });
});
