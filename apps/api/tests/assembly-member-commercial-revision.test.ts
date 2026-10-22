import { afterEach, describe, expect, it } from "vitest";
import { ACM_CASSETTE_NONE_PRODUCT_CODE, CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { readAssemblyDefinition, readAssemblyQuote, readConfirmedChild } from "../src/assembly/store.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

type Json = Record<string, unknown>;
const runtimes: ReturnType<typeof createProductSystemRuntime>[] = [];
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.close(); });
const acm = { "root.inscription": "PANOU AUDIT", "face.widthMm": 1000, "face.heightMm": 500, "face.cassetteDepthMm": 40 };
const letters = { "root.inscription": "PR92", "face.finish": "none", "face.confirmedAreaMm2": 250000, "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
function setup() {
  const runtime = createProductSystemRuntime(":memory:"); runtimes.push(runtime);
  const app = createApp({ productSystem: runtime });
  const get = async (path: string) => await (await app.request(path)).json() as Json;
  const post = (path: string, value?: unknown) => app.request(path, { method: "POST", headers: { "content-type": "application/json" }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
  const plane = runtime.assemblyPlane();
  const definition = (id: string) => readAssemblyDefinition(plane.db, plane.organizationId, id)!;
  const child = (id: string, role: string) => readConfirmedChild(plane.db, plane.organizationId, definition(id).members.find(m => m.role === role)!.confirmedTruthId)!;
  const save = async (id: string, role: string, price?: number) => {
    const product = role === "SUPPORT_PANEL" ? ACM_CASSETTE_NONE_PRODUCT_CODE : CANONICAL_PRODUCT_CODE;
    const values = role === "SUPPORT_PANEL" ? acm : letters;
    const reviewed = await (await post(`/api/products/${product}/preview`, { values })).json() as Json;
    return post(`/api/assemblies/${id}/members`, { role, values, reviewId: reviewed.reviewId, pricingMethod: "MANUAL_FIXED_PRODUCT", ...(price === undefined ? {} : { manualProductNetPrice: price }) });
  };
  const create = async () => {
    const customer = await (await post("/api/customers", { displayName: "Client sintetic PR92" })).json() as { customer: { customerId: string } };
    const request = await (await post("/api/requests", { customerId: customer.customer.customerId, title: "Audit PR92", description: "Ansamblu sintetic pentru regresia comercială" })).json() as { request: { requestId: string } };
    const created = await (await post("/api/assemblies", { requestId: request.request.requestId })).json() as { assembly: { assemblyId: string } };
    for (const role of ["SUPPORT_PANEL", "SIGNAGE_LETTERS"]) expect((await save(created.assembly.assemblyId, role)).status).toBe(200);
    return created.assembly.assemblyId;
  };
  const confirm = async (id: string) => {
    if (definition(id).status === "STALE") expect((await post(`/api/assemblies/${id}/review`)).status).toBe(200);
    expect((await post(`/api/assemblies/${id}/confirm`)).status).toBe(200);
  };
  const freeze = (id: string) => freezeAcknowledgingRates(body => post(`/api/assemblies/${id}/quote`, body));
  return { runtime, plane, get, post, definition, child, save, create, confirm, freeze };
}

describe("assembly member commercial revisions", () => {
  it("prices technically confirmed members, freezes the new prices and preserves old records and quotes", async () => {
    const api = setup(); const id = await api.create(); await api.confirm(id);
    const old = api.child(id, "SIGNAGE_LETTERS"); const oldJson = JSON.stringify(old);
    expect(old.commercial).toBeNull();
    const acknowledged = await api.save(id, "SIGNAGE_LETTERS", 605);
    expect(acknowledged.status).toBe(200);
    expect(await acknowledged.json()).toMatchObject({ role: "SIGNAGE_LETTERS", confirmed: { customerPrice: { netPrice: 605 } } });
    const saved = api.child(id, "SIGNAGE_LETTERS");
    expect(saved.commercial?.netPrice).toBe(605);
    expect(saved.truthId).not.toBe(old.truthId); expect(saved.truthHash).toBe(old.truthHash);
    expect(JSON.stringify(readConfirmedChild(api.plane.db, old.organizationId, old.truthId))).toBe(oldJson);
    const member = await api.get(`/api/assemblies/${id}/members/SIGNAGE_LETTERS`);
    expect((member.confirmed as { customerPrice: { netPrice: number } }).customerPrice.netPrice).toBe(605);
    expect((await api.save(id, "SIGNAGE_LETTERS", 605)).status).toBe(200);
    expect(api.child(id, "SIGNAGE_LETTERS")).toEqual(saved);
    expect((await api.save(id, "SIGNAGE_LETTERS")).status).toBe(200);
    expect(api.child(id, "SIGNAGE_LETTERS")).toEqual(saved);
    expect((await api.save(id, "SUPPORT_PANEL", 300)).status).toBe(200);
    await api.confirm(id); expect((await api.freeze(id)).status).toBe(200);
    const first = (await api.get(`/api/assemblies/${id}`)).assembly as { quoteSnapshotId: string };
    const quote = readAssemblyQuote(api.plane.db, old.organizationId, first.quoteSnapshotId)!;
    const frozen = JSON.stringify(quote); expect(quote.totals.netPrice).toBe(905);
    expect((await api.save(id, "SIGNAGE_LETTERS", 650)).status).toBe(200);
    expect(api.child(id, "SIGNAGE_LETTERS").commercial?.netPrice).toBe(650);
    await api.confirm(id); expect((await api.freeze(id)).status).toBe(200);
    expect(JSON.stringify(readAssemblyQuote(api.plane.db, old.organizationId, first.quoteSnapshotId))).toBe(frozen);
    const latest = (await api.get(`/api/assemblies/${id}`)).assembly as { quoteSnapshotId: string };
    expect(latest.quoteSnapshotId).not.toBe(first.quoteSnapshotId);
    const accepted = await api.post(`/api/assemblies/${id}/accept`, { quoteSnapshotId: latest.quoteSnapshotId });
    expect(accepted.status).toBe(200);
    const order = await accepted.json() as { order: { orderSnapshotId: string } };
    expect((await api.post(`/api/jobs/${order.order.orderSnapshotId}/production`)).status).toBe(200);
    expect((await api.save(id, "SIGNAGE_LETTERS", 700)).status).toBe(409);
    expect(api.child(id, "SIGNAGE_LETTERS").commercial?.netPrice).toBe(650);
  });
  it("keeps prices separate between assemblies sharing one technical configuration", async () => {
    const api = setup(); const first = await api.create(); const second = await api.create();
    expect((await api.save(first, "SIGNAGE_LETTERS", 605)).status).toBe(200);
    expect(api.child(first, "SIGNAGE_LETTERS").commercial?.netPrice).toBe(605);
    expect(api.child(second, "SIGNAGE_LETTERS").commercial).toBeNull();
    expect((await api.save(second, "SIGNAGE_LETTERS", 410)).status).toBe(200);
    expect(api.child(second, "SIGNAGE_LETTERS").commercial?.netPrice).toBe(410);
    expect(api.child(first, "SIGNAGE_LETTERS").commercial?.netPrice).toBe(605);
  });
  it("names the unpriced member in a freeze refusal", async () => {
    const api = setup(); const id = await api.create();
    expect((await api.save(id, "SUPPORT_PANEL", 300)).status).toBe(200); await api.confirm(id);
    const refused = await api.freeze(id); expect(refused.status).toBe(422);
    expect(await refused.json()).toMatchObject({ error: "incomplete_commercial", reasons: [expect.stringContaining("Litere")] });
  });
});
