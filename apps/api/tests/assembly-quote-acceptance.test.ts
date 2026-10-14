import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  LOGO_PRODUCT_CODE,
  OWNER_CONFIRMED_SELLER,
  SIGN_ASSEMBLY_ACM_SIGNAGE_V2,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

type Json = Record<string, unknown>;
type Requester = { request: (path: string, init?: RequestInit) => Response | Promise<Response> };
type Client = ReturnType<typeof client>;
type Acceptance = { canAccept: boolean; reason: string | null };

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

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

function client(app: Requester, cookie = "") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) {
    headers.cookie = cookie;
  }
  return {
    get: (path: string) => app.request(path, { headers }),
    post: (path: string, body?: unknown) =>
      app.request(path, {
        method: "POST",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
  };
}

function sellerPatch() {
  const { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank } = OWNER_CONFIRMED_SELLER;
  return { legalName, brand, fiscalId, tradeRegister, address, locality, iban, bank };
}

async function json(response: Response): Promise<Json> {
  return (await response.json()) as Json;
}

async function reviewId(api: Client, productCode: string, values: Json): Promise<string> {
  const response = await api.post(`/api/products/${productCode}/preview`, { values });
  expect(response.status).toBe(200);
  return (await json(response)).reviewId as string;
}

async function assemblyView(api: Client, assemblyId: string): Promise<Json> {
  const response = await api.get(`/api/assemblies/${assemblyId}`);
  expect(response.status).toBe(200);
  return (await json(response)).assembly as Json;
}

async function quoteEnvelope(api: Client, quoteSnapshotId: string): Promise<Json> {
  const response = await api.get(`/api/quotes/${encodeURIComponent(quoteSnapshotId)}`);
  expect(response.status).toBe(200);
  return json(response);
}

async function assemblyOrders(api: Client): Promise<number> {
  const overview = (await json(await api.get("/api/jobs"))).overview as { jobs: { kind: string }[] };
  return overview.jobs.filter((job) => job.kind === "ASSEMBLY").length;
}

function freeze(api: Client, assemblyId: string) {
  return freezeAcknowledgingRates((body) => api.post(`/api/assemblies/${assemblyId}/quote`, body));
}

async function quotedAssembly(api: Client, label: string) {
  const customer = await json(await api.post("/api/customers", { displayName: label }));
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await json(
    await api.post("/api/requests", { customerId, title: label, description: "Acceptare ofertă exactă" }),
  );
  const requestId = (request.request as { requestId: string }).requestId;
  const created = await api.post("/api/assemblies", { requestId });
  expect(created.status).toBe(201);
  const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
  for (const member of [
    { role: "SUPPORT_PANEL", values: acmValues, reviewId: await reviewId(api, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues) },
    { role: "SIGNAGE_LETTERS", values: lettersValues, reviewId: await reviewId(api, CANONICAL_PRODUCT_CODE, lettersValues) },
  ]) {
    expect((await api.post(`/api/assemblies/${assemblyId}/members`, member)).status).toBe(200);
  }
  expect((await api.post(`/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  expect((await assemblyView(api, assemblyId)).quoteFreezable).toBe(true);
  expect((await freeze(api, assemblyId)).status).toBe(200);
  const view = await assemblyView(api, assemblyId);
  expect(view.quoteFreezable).toBe(false);
  return { assemblyId, requestId, quoteSnapshotId: view.quoteSnapshotId as string };
}

async function changeLetters(api: Client, assemblyId: string): Promise<void> {
  const changed = { ...lettersValues, "root.inscription": "NOU" };
  const changedReview = await reviewId(api, CANONICAL_PRODUCT_CODE, changed);
  expect(
    (await api.post(`/api/assemblies/${assemblyId}/members`, { role: "SIGNAGE_LETTERS", values: changed, reviewId: changedReview })).status,
  ).toBe(200);
}

async function reconfirm(api: Client, assemblyId: string): Promise<void> {
  expect((await api.post(`/api/assemblies/${assemblyId}/review`)).status).toBe(200);
  expect((await api.post(`/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
}

async function revise(api: Client, assemblyId: string): Promise<string> {
  await changeLetters(api, assemblyId);
  await reconfirm(api, assemblyId);
  expect((await assemblyView(api, assemblyId)).quoteFreezable).toBe(true);
  expect((await freeze(api, assemblyId)).status).toBe(200);
  return (await assemblyView(api, assemblyId)).quoteSnapshotId as string;
}

describe("assembly quote acceptance bound to the reviewed snapshot", () => {
  it("creates exactly one order for the exact current quote and refuses a repeat", async () => {
    const api = client(createApp());
    const { assemblyId, quoteSnapshotId } = await quotedAssembly(api, "Client Exact");
    expect(quoteSnapshotId).toMatch(/^asmq:/);
    expect((await quoteEnvelope(api, quoteSnapshotId)).acceptance).toEqual<Acceptance>({ canAccept: true, reason: null });

    const accepted = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId });
    expect(accepted.status).toBe(200);
    const body = await json(accepted);
    const order = body.order as { orderSnapshotId: string; sourceQuoteSnapshotId: string };
    expect(order.sourceQuoteSnapshotId).toBe(quoteSnapshotId);
    expect((body.assembly as { orderId: string }).orderId).toBe(order.orderSnapshotId);
    expect(await assemblyOrders(api)).toBe(1);

    const after = await quoteEnvelope(api, quoteSnapshotId);
    expect(after.acceptance).toEqual<Acceptance>({ canAccept: false, reason: null });
    expect((after.order as { orderSnapshotId: string }).orderSnapshotId).toBe(order.orderSnapshotId);

    const repeated = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId });
    expect(repeated.status).toBe(409);
    expect(await json(repeated)).toMatchObject({
      error: "assembly_quote_already_accepted",
      orderSnapshotId: order.orderSnapshotId,
    });
    expect(await assemblyOrders(api)).toBe(1);
  });

  it("refuses an acceptance without the reviewed quote identity", async () => {
    const api = client(createApp());
    const { assemblyId } = await quotedAssembly(api, "Client Fără Identitate");
    for (const body of [undefined, {}, { quoteSnapshotId: "" }, { quoteSnapshotId: 7 }]) {
      const refused = await api.post(`/api/assemblies/${assemblyId}/accept`, body);
      expect(refused.status).toBe(400);
      expect((await json(refused)).error).toBe("quote_identity_required");
    }
    expect(await assemblyOrders(api)).toBe(0);
    expect((await assemblyView(api, assemblyId)).orderId).toBeNull();
  });

  it("never turns a superseded or foreign snapshot into an order for the newer quote", async () => {
    const api = client(createApp());
    const { assemblyId, quoteSnapshotId: firstId } = await quotedAssembly(api, "Client Revizie");
    const secondId = await revise(api, assemblyId);
    expect(secondId).not.toBe(firstId);

    const historical = await quoteEnvelope(api, firstId);
    expect((historical.assemblyQuote as { superseded: boolean }).superseded).toBe(true);
    expect((historical.acceptance as Acceptance).canAccept).toBe(false);
    expect((historical.acceptance as Acceptance).reason).toMatch(/Versiune înlocuită/);
    expect((await quoteEnvelope(api, secondId)).acceptance).toEqual<Acceptance>({ canAccept: true, reason: null });

    for (const stale of [firstId, "asmq:unknown"]) {
      const refused = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: stale });
      expect(refused.status).toBe(409);
      expect(await json(refused)).toMatchObject({
        error: "assembly_quote_superseded",
        currentQuoteSnapshotId: secondId,
      });
    }
    const other = await quotedAssembly(api, "Alt Ansamblu");
    const crossed = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: other.quoteSnapshotId });
    expect(crossed.status).toBe(409);
    expect(await assemblyOrders(api)).toBe(0);
    expect((await quoteEnvelope(api, secondId)).order).toBeNull();
    expect((await quoteEnvelope(api, other.quoteSnapshotId)).order).toBeNull();

    expect((await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: secondId })).status).toBe(200);
    expect(await assemblyOrders(api)).toBe(1);
    expect((await quoteEnvelope(api, firstId)).order).toBeNull();
    expect((await quoteEnvelope(api, firstId)).acceptance).toMatchObject({ canAccept: false });
  });

  it("refuses the last frozen quote once the assembly configuration it priced is no longer confirmed", async () => {
    const api = client(createApp());
    const { assemblyId, quoteSnapshotId: quoteA } = await quotedAssembly(api, "Client Configurație");

    await changeLetters(api, assemblyId);
    const stale = await assemblyView(api, assemblyId);
    expect(stale.status).toBe("STALE");
    expect(stale.quoteSnapshotId).toBe(quoteA);
    const whileStale = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteA });
    expect(whileStale.status).toBe(409);
    const staleRefusal = await json(whileStale);
    expect(staleRefusal.error).toBe("assembly_quote_stale_configuration");
    expect(staleRefusal).not.toHaveProperty("currentQuoteSnapshotId");
    expect((await quoteEnvelope(api, quoteA)).acceptance).toMatchObject({ canAccept: false });
    expect(await assemblyOrders(api)).toBe(0);

    await reconfirm(api, assemblyId);
    const reconfirmed = await assemblyView(api, assemblyId);
    expect(reconfirmed.status).toBe("CONFIRMED");
    expect(reconfirmed.quoteSnapshotId).toBe(quoteA);
    expect(reconfirmed.quoteFreezable).toBe(true);
    const afterReconfirm = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteA });
    expect(afterReconfirm.status).toBe(409);
    const refusal = await json(afterReconfirm);
    expect(refusal.error).toBe("assembly_quote_stale_configuration");
    expect((refusal.reasons as string[])[0]).toMatch(/ofertă nouă/);
    const envelopeA = await quoteEnvelope(api, quoteA);
    expect((envelopeA.assemblyQuote as { superseded: boolean }).superseded).toBe(false);
    expect((envelopeA.acceptance as Acceptance).canAccept).toBe(false);
    expect((envelopeA.acceptance as Acceptance).reason).toBe((refusal.reasons as string[])[0]);
    expect(await assemblyOrders(api)).toBe(0);
    expect(envelopeA.order).toBeNull();

    expect((await freeze(api, assemblyId)).status).toBe(200);
    const quoteB = (await assemblyView(api, assemblyId)).quoteSnapshotId as string;
    expect(quoteB).not.toBe(quoteA);
    expect((await quoteEnvelope(api, quoteA)).acceptance).toMatchObject({ canAccept: false });
    expect((await quoteEnvelope(api, quoteB)).acceptance).toEqual<Acceptance>({ canAccept: true, reason: null });
    const replayA = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteA });
    expect(replayA.status).toBe(409);
    expect(await json(replayA)).toMatchObject({ error: "assembly_quote_superseded", currentQuoteSnapshotId: quoteB });

    const accepted = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteB });
    expect(accepted.status).toBe(200);
    const order = (await json(accepted)).order as { orderSnapshotId: string; sourceQuoteSnapshotId: string };
    expect(order.sourceQuoteSnapshotId).toBe(quoteB);
    expect(await assemblyOrders(api)).toBe(1);
    expect((await quoteEnvelope(api, quoteA)).order).toBeNull();
    const repeated = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteB });
    expect(repeated.status).toBe(409);
    expect(await json(repeated)).toMatchObject({ error: "assembly_quote_already_accepted", orderSnapshotId: order.orderSnapshotId });
    expect(await assemblyOrders(api)).toBe(1);
  });

  it("refuses a quote frozen before a member was added and the assembly reconfirmed", async () => {
    const api = client(createApp());
    const enabled = await api.post("/api/admin/product-enablement", {
      products: [CANONICAL_PRODUCT_CODE, ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE].map((templateCode) => ({
        templateCode,
        enabled: true,
      })),
    });
    expect(enabled.status).toBe(200);
    const customer = await json(await api.post("/api/customers", { displayName: "Client Logo" }));
    const customerId = (customer.customer as { customerId: string }).customerId;
    const request = await json(await api.post("/api/requests", { customerId, title: "Logo", description: "Membru adăugat" }));
    const requestId = (request.request as { requestId: string }).requestId;
    const created = await api.post("/api/assemblies", { requestId, kind: SIGN_ASSEMBLY_ACM_SIGNAGE_V2 });
    expect(created.status).toBe(201);
    const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
    const attach = async (role: string, productCode: string, values: Json) =>
      expect(
        (await api.post(`/api/assemblies/${assemblyId}/members`, { role, values, reviewId: await reviewId(api, productCode, values) }))
          .status,
      ).toBe(200);
    await attach("SUPPORT_PANEL", ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    await attach("SIGNAGE_LOGO", LOGO_PRODUCT_CODE, logoValues);
    expect((await api.post(`/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
    expect((await freeze(api, assemblyId)).status).toBe(200);
    const quoteA = (await assemblyView(api, assemblyId)).quoteSnapshotId as string;

    await attach("SIGNAGE_LETTERS", CANONICAL_PRODUCT_CODE, lettersValues);
    expect((await assemblyView(api, assemblyId)).status).toBe("STALE");
    const whileStale = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteA });
    expect(whileStale.status).toBe(409);
    expect((await json(whileStale)).error).toBe("assembly_quote_stale_configuration");
    expect(await assemblyOrders(api)).toBe(0);

    await reconfirm(api, assemblyId);
    const reconfirmed = await assemblyView(api, assemblyId);
    expect(reconfirmed.status).toBe("CONFIRMED");
    expect(reconfirmed.quoteSnapshotId).toBe(quoteA);
    expect(reconfirmed.quoteFreezable).toBe(true);

    const refused = await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId: quoteA });
    expect(refused.status).toBe(409);
    expect((await json(refused)).error).toBe("assembly_quote_stale_configuration");
    expect((await quoteEnvelope(api, quoteA)).acceptance).toMatchObject({ canAccept: false });
    expect((await quoteEnvelope(api, quoteA)).order).toBeNull();
    expect(await assemblyOrders(api)).toBe(0);
  });

  it("keeps a quote acceptable when the assembly is reconfirmed with the same configuration", async () => {
    const api = client(createApp());
    const { assemblyId, quoteSnapshotId } = await quotedAssembly(api, "Client Neschimbat");
    expect((await api.post(`/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
    const after = await assemblyView(api, assemblyId);
    expect(after.status).toBe("CONFIRMED");
    expect(after.quoteSnapshotId).toBe(quoteSnapshotId);
    expect(after.quoteFreezable).toBe(false);
    expect((await quoteEnvelope(api, quoteSnapshotId)).acceptance).toEqual<Acceptance>({ canAccept: true, reason: null });
    expect((await api.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId })).status).toBe(200);
    expect(await assemblyOrders(api)).toBe(1);
  });

  it("lets a member read the quote but never accept it, and isolates organizations", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Atelier Acceptare");
    const organizationId = org.organization.organizationId;
    await addUser(fixture, { email: "owner-acc@example.test", password: OWNER_PASSWORD, organizationId, role: "owner" });
    await addUser(fixture, { email: "member-acc@example.test", password: MEMBER_PASSWORD, organizationId, role: "member" });
    const other = await addOrganization(fixture, "Atelier Străin");
    await addUser(fixture, {
      email: "owner-other@example.test",
      password: OWNER_PASSWORD,
      organizationId: other.organization.organizationId,
      role: "owner",
    });
    const ownerCookie = (await loginCloud(fixture.app, "owner-acc@example.test", OWNER_PASSWORD, organizationId)).cookie ?? "";
    const owner = client(fixture.app, ownerCookie);
    const member = client(fixture.app, (await loginCloud(fixture.app, "member-acc@example.test", MEMBER_PASSWORD, organizationId)).cookie ?? "");
    const stranger = client(
      fixture.app,
      (await loginCloud(fixture.app, "owner-other@example.test", OWNER_PASSWORD, other.organization.organizationId)).cookie ?? "",
    );
    const seller = await fixture.app.request("/api/seller", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: ownerCookie },
      body: JSON.stringify(sellerPatch()),
    });
    expect(seller.status).toBe(200);
    const { assemblyId, quoteSnapshotId } = await quotedAssembly(owner, "Client Membru");

    const memberView = await quoteEnvelope(member, quoteSnapshotId);
    expect((memberView.acceptance as Acceptance).canAccept).toBe(false);
    expect((memberView.acceptance as Acceptance).reason).toMatch(/Doar proprietarul/);
    expect((await member.get(`/api/assembly-quotes/${encodeURIComponent(quoteSnapshotId)}/document`)).status).toBe(200);
    expect((await member.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId })).status).toBe(403);
    expect((await stranger.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId })).status).toBe(404);
    expect(await assemblyOrders(owner)).toBe(0);

    expect((await quoteEnvelope(owner, quoteSnapshotId)).acceptance).toEqual<Acceptance>({ canAccept: true, reason: null });
    expect((await owner.post(`/api/assemblies/${assemblyId}/accept`, { quoteSnapshotId })).status).toBe(200);
    expect(await assemblyOrders(owner)).toBe(1);
    fixture.close();
  });
});
