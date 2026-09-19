import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  SITE_INSTALLATION_FREEZE_REASON,
  SITE_INSTALLATION_PRICE_FREEZE_REASON,
  SITE_INSTALLATION_SCOPE_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.mountingSystem": "steel_angle",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": "40",
  "face.foldCount": "2",
};

async function compileReady(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
  inscription: string,
) {
  const response = await app.request(`/api/products/${productCode}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      values: { ...values, "root.inscription": inscription },
    }),
  });
  const body = await readBody(response);
  return {
    definition: body.definition as JsonObject,
    reviewId: body.reviewId as string,
  };
}

async function enableSiteInstallation(
  app: ReturnType<typeof createApp>,
  offerMode = "INTERNAL",
) {
  const response = await app.request("/api/operational-services/SITE_INSTALLATION", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ offerMode }),
  });
  expect(response.status).toBe(200);
}

async function createCustomer(app: ReturnType<typeof createApp>, displayName: string) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return (await readBody(created)).customer as JsonObject;
}

async function createRequest(
  app: ReturnType<typeof createApp>,
  customerId: string,
  title: string,
  description = "Clientul a cerut o ofertă.",
) {
  return app.request("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerId, title, description }),
  });
}

async function freezeQuote(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
  inscription: string,
  customerId: string,
  requestId?: string,
) {
  const reviewed = await compileReady(app, productCode, values, inscription);
  return app.request(`/api/products/${productCode}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
      customerId,
      ...(requestId ? { requestId } : {}),
    }),
  });
}

describe("commercial request API", () => {
  it("creates, lists and updates a request without becoming a quote engine", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Cerere");
    const created = await createRequest(app, customer.customerId as string, "Litere exterior");
    expect(created.status).toBe(201);
    const createdBody = await readBody(created);
    const request = createdBody.request as JsonObject;
    expect(request).toMatchObject({
      customerId: customer.customerId,
      title: "Litere exterior",
      status: "NEW",
    });
    expect(String(request.reference)).toMatch(/^CER-[0-9A-F]{8}$/);
    expect(JSON.stringify(createdBody)).not.toMatch(/contentHash|eic|CostEngine|Intake|SENT/);

    const listed = await readBody(await app.request("/api/requests"));
    const overview = listed.overview as { requests: Array<JsonObject>; summary: JsonObject };
    expect(overview.requests).toHaveLength(1);
    expect(overview.requests[0]).toMatchObject({
      statusLabel: "Nouă",
      nextActionLabel: "Deschide",
      customerDisplayName: "Client Cerere",
    });

    const patched = await app.request(`/api/requests/${request.requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "READY_FOR_QUOTE" }),
    });
    expect(patched.status).toBe(200);
    expect(((await readBody(patched)).request as JsonObject).status).toBe("READY_FOR_QUOTE");

    const invalidStatus = await app.request(`/api/requests/${request.requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "QUOTE_CREATED" }),
    });
    expect(invalidStatus.status).toBe(400);
  });

  it("rejects a retired customer for a new request", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Retras");
    await app.request(`/api/customers/${customer.customerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    const created = await createRequest(app, customer.customerId as string, "Cerere retras");
    expect(created.status).toBe(400);
    expect((await readBody(created)).error).toBe("customer_unavailable");
  });

  it("links LETTERS and ACM quotes without mutating Quote Snapshot", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Mix");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Mix litere și ACM"),
    );
    const requestId = (created.request as JsonObject).requestId as string;

    const letters = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "REQA",
      customer.customerId as string,
      requestId,
    );
    expect(letters.status).toBe(200);
    const lettersQuote = (await readBody(letters)).quoteSnapshot as JsonObject;
    const lettersHash = lettersQuote.contentHash;

    const otherCustomer = await createCustomer(app, "Alt client");
    const mismatch = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "REQB",
      otherCustomer.customerId as string,
      requestId,
    );
    expect(mismatch.status).toBe(422);
    expect((await readBody(mismatch)).error).toBe("request_customer_mismatch");

    const acm = await freezeQuote(
      app,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      acmValues,
      "REQC",
      customer.customerId as string,
      requestId,
    );
    expect(acm.status).toBe(200);

    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${lettersQuote.quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${lettersQuote.quoteSnapshotId}/order`,
      { method: "POST" },
    );

    const renamed = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Titlu corectat", description: "Descriere corectată" }),
    });
    expect(renamed.status).toBe(200);

    const locked = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerId: otherCustomer.customerId }),
    });
    expect(locked.status).toBe(409);

    const detail = (await readBody(await app.request(`/api/requests/${requestId}`))).detail as {
      request: JsonObject;
      commercialProgress: string;
      commercialProgressLabel: string;
      linkedOffers: Array<JsonObject>;
    };
    expect(detail.request.title).toBe("Titlu corectat");
    expect(detail.request.status).toBe("NEW");
    expect(detail.commercialProgress).toBe("ORDER_CREATED");
    expect(detail.commercialProgressLabel).toBe("Comandă creată");
    expect(detail.linkedOffers).toHaveLength(2);
    expect(detail.linkedOffers.map((offer) => offer.productCode).sort()).toEqual([
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      CANONICAL_PRODUCT_CODE,
    ].sort());

    const reread = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${lettersQuote.quoteSnapshotId}`,
      ),
    );
    expect((reread.quoteSnapshot as JsonObject).contentHash).toBe(lettersHash);

    const orphan = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "REQD",
      (await createCustomer(app, "Fără cerere")).customerId as string,
    );
    expect(orphan.status).toBe(200);
    const quotes = (await readBody(await app.request("/api/quotes"))).overview as {
      quotes: Array<JsonObject>;
    };
    expect(quotes.quotes.some((item) => item.inscription === "REQD")).toBe(true);
    expect(quotes.quotes.some((item) => item.inscription === "REQA")).toBe(true);

    const again = await app.request(`/api/requests/${requestId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteSnapshotId: lettersQuote.quoteSnapshotId }),
    });
    expect(again.status).toBe(200);
    expect((await readBody(again)).alreadyApplied).toBe(true);
  });

  it("persists optional site installation without creating a quote", async () => {
    const app = createApp();
    await enableSiteInstallation(app);
    const customer = await createCustomer(app, "Client Montaj");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere cu montaj"),
    );
    const request = created.request as JsonObject;
    const requestId = request.requestId as string;
    expect(request.optionalScopeIds).toEqual([]);
    expect((created.detail as JsonObject).installationScope).toBeNull();

    const selected = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);
    const selectedBody = await readBody(selected);
    expect((selectedBody.request as JsonObject).optionalScopeIds).toEqual([
      SITE_INSTALLATION_SCOPE_ID,
    ]);
    expect((selectedBody.request as JsonObject).siteInstallationMode).toBe("INTERNAL");
    expect((selectedBody.detail as JsonObject).installationScope).toMatchObject({
      scopeId: SITE_INSTALLATION_SCOPE_ID,
      eicCompleteness: "PARTIAL",
      commercialCompleteness: "PARTIAL",
    });
    expect(JSON.stringify(selectedBody.detail)).not.toMatch(/0(?:[.,]0+)? EUR|"total"/);

    const again = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(again.status).toBe(200);
    expect((await readBody(again)).alreadyApplied).toBe(true);

    const unknown = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: ["NOT_A_SCOPE"] }),
    });
    expect(unknown.status).toBe(400);
    expect((await readBody(unknown)).error).toBe("unknown_optional_scope");

    const quotesBefore = (
      (await readBody(await app.request("/api/quotes"))).overview as {
        quotes: Array<JsonObject>;
      }
    ).quotes.length;
    const detailBefore = (await readBody(await app.request(`/api/requests/${requestId}`)))
      .detail as { linkedOffers: Array<JsonObject> };
    const freeze = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "INST1",
      customer.customerId as string,
      requestId,
    );
    expect(freeze.status).toBe(422);
    const freezeBody = await readBody(freeze);
    expect(freezeBody.error).toBe("incomplete_offer");
    expect(freezeBody.reasons).toEqual([
      SITE_INSTALLATION_FREEZE_REASON,
      SITE_INSTALLATION_PRICE_FREEZE_REASON,
    ]);
    expect(freezeBody.quoteSnapshot).toBeUndefined();
    const quotesAfter = (
      (await readBody(await app.request("/api/quotes"))).overview as {
        quotes: Array<JsonObject>;
      }
    ).quotes.length;
    expect(quotesAfter).toBe(quotesBefore);
    const detailAfter = (await readBody(await app.request(`/api/requests/${requestId}`)))
      .detail as { linkedOffers: Array<JsonObject> };
    expect(detailAfter.linkedOffers).toHaveLength(detailBefore.linkedOffers.length);

    const cleared = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [] }),
    });
    expect(cleared.status).toBe(200);
    expect(((await readBody(cleared)).request as JsonObject).optionalScopeIds).toEqual([]);
  });

  it("refuses linking an orphan product quote to a request with incomplete installation", async () => {
    const app = createApp();
    await enableSiteInstallation(app);
    const customer = await createCustomer(app, "Client Orphan Link");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere cu montaj"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });

    const quotesBeforeCreate = (
      (await readBody(await app.request("/api/quotes"))).overview as {
        quotes: Array<JsonObject>;
      }
    ).quotes.length;
    const detailBefore = (await readBody(await app.request(`/api/requests/${requestId}`)))
      .detail as { linkedOffers: Array<JsonObject> };
    expect(detailBefore.linkedOffers).toHaveLength(0);

    const orphan = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "ORPH1",
      customer.customerId as string,
    );
    expect(orphan.status).toBe(200);
    const orphanBody = await readBody(orphan);
    const quoteSnapshot = orphanBody.quoteSnapshot as JsonObject;
    const quoteSnapshotId = quoteSnapshot.quoteSnapshotId as string;
    const contentHash = quoteSnapshot.contentHash;
    expect(orphanBody.requestLink).toBeUndefined();

    const quotesAfterCreate = (
      (await readBody(await app.request("/api/quotes"))).overview as {
        quotes: Array<JsonObject>;
      }
    ).quotes;
    expect(quotesAfterCreate).toHaveLength(quotesBeforeCreate + 1);

    const linked = await app.request(`/api/requests/${requestId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteSnapshotId }),
    });
    expect(linked.status).toBe(422);
    const linkedBody = await readBody(linked);
    expect(linkedBody.error).toBe("incomplete_offer");
    expect(linkedBody.reasons).toEqual([
      SITE_INSTALLATION_FREEZE_REASON,
      SITE_INSTALLATION_PRICE_FREEZE_REASON,
    ]);
    expect(linkedBody.link).toBeUndefined();

    const detailAfter = (await readBody(await app.request(`/api/requests/${requestId}`)))
      .detail as { linkedOffers: Array<JsonObject> };
    expect(detailAfter.linkedOffers).toHaveLength(0);
    const quotesAfterLink = (
      (await readBody(await app.request("/api/quotes"))).overview as {
        quotes: Array<JsonObject>;
      }
    ).quotes;
    expect(quotesAfterLink).toHaveLength(quotesAfterCreate.length);
    const reread = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}`,
      ),
    );
    expect((reread.quoteSnapshot as JsonObject).contentHash).toBe(contentHash);
  });

  it("links a product-only quote to a request without optional scopes", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Product Only");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere fără montaj"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    expect((created.request as JsonObject).optionalScopeIds).toEqual([]);

    const orphan = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "ORPH2",
      customer.customerId as string,
    );
    expect(orphan.status).toBe(200);
    const quoteSnapshot = (await readBody(orphan)).quoteSnapshot as JsonObject;
    const quoteSnapshotId = quoteSnapshot.quoteSnapshotId as string;
    const contentHash = quoteSnapshot.contentHash;

    const linked = await app.request(`/api/requests/${requestId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteSnapshotId }),
    });
    expect(linked.status).toBe(200);
    const linkedBody = await readBody(linked);
    expect(linkedBody.alreadyApplied).toBe(false);
    expect((linkedBody.link as JsonObject).quoteSnapshotId).toBe(quoteSnapshotId);

    const unknown = await app.request(`/api/requests/${requestId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteSnapshotId: "qts:missing" }),
    });
    expect(unknown.status).toBe(404);
    expect((await readBody(unknown)).error).toBe("quote_unavailable");

    const again = await app.request(`/api/requests/${requestId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteSnapshotId }),
    });
    expect(again.status).toBe(200);
    expect((await readBody(again)).alreadyApplied).toBe(true);

    const reread = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}`,
      ),
    );
    expect((reread.quoteSnapshot as JsonObject).contentHash).toBe(contentHash);
  });

  it("refuses a new installation selection until the organization offers the service", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Fără Ofertă");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere fără ofertă org"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    const detail = created.detail as JsonObject;
    expect((detail.installationOffer as JsonObject).canSelectNew).toBe(false);
    expect((detail.installationOffer as JsonObject).selected).toBe(false);

    const refused = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(refused.status).toBe(400);
    expect((await readBody(refused)).error).toBe("service_not_offered");
  });

  it("locks selection after the first linked quote and keeps disable prospective", async () => {
    const app = createApp();
    await enableSiteInstallation(app);
    const customer = await createCustomer(app, "Client Lock Montaj");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere lock montaj"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    const orphan = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "LOCK1",
      customer.customerId as string,
    );
    expect(orphan.status).toBe(200);
    const quoteSnapshotId = ((await readBody(orphan)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    const linked = await app.request(`/api/requests/${requestId}/quotes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quoteSnapshotId }),
    });
    expect(linked.status).toBe(200);

    const locked = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(locked.status).toBe(409);
    expect((await readBody(locked)).error).toBe("service_selection_locked");

    const selected = await readBody(
      await createRequest(app, customer.customerId as string, "Litere cu montaj existent"),
    );
    const selectedId = (selected.request as JsonObject).requestId as string;
    const select = await app.request(`/api/requests/${selectedId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(select.status).toBe(200);
    const disabled = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "SERVICE_DISABLED" }),
    });
    expect(disabled.status).toBe(200);
    const preserved = await readBody(await app.request(`/api/requests/${selectedId}`));
    const preservedDetail = preserved.detail as JsonObject;
    expect((preservedDetail.installationScope as JsonObject).scopeId).toBe(
      SITE_INSTALLATION_SCOPE_ID,
    );
    expect((preservedDetail.installationOffer as JsonObject).persistedSelectionPreserved).toBe(
      true,
    );
    expect((preservedDetail.installationOffer as JsonObject).mode).toBe("INTERNAL");
    const freeze = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "LOCK2",
      customer.customerId as string,
      selectedId,
    );
    expect(freeze.status).toBe(422);
    expect((await readBody(freeze)).error).toBe("incomplete_offer");
    const newRequest = await readBody(
      await createRequest(app, customer.customerId as string, "Litere după disable"),
    );
    const newRefused = await app.request(
      `/api/requests/${(newRequest.request as JsonObject).requestId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
      },
    );
    expect(newRefused.status).toBe(400);
    expect((await readBody(newRefused)).error).toBe("service_not_offered");
  });

  it("applies subcontracted and both modes and refuses an invalid mode", async () => {
    const app = createApp();
    await enableSiteInstallation(app, "SUBCONTRACTED");
    const customer = await createCustomer(app, "Client Subcontractat");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere subcontractate"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    const selected = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);
    expect(((await readBody(selected)).request as JsonObject).siteInstallationMode).toBe(
      "SUBCONTRACTED",
    );
    const wrongPath = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteInstallationMode: "INTERNAL" }),
    });
    expect(wrongPath.status).toBe(400);
    expect((await readBody(wrongPath)).error).toBe("invalid_service_mode");
    expect(
      (
        (await readBody(await app.request(`/api/requests/${requestId}`))).detail as {
          request: JsonObject;
        }
      ).request.siteInstallationMode,
    ).toBe("SUBCONTRACTED");

    await enableSiteInstallation(app, "BOTH");
    const bothCreated = await readBody(
      await createRequest(app, customer.customerId as string, "Litere ambele căi"),
    );
    const bothId = (bothCreated.request as JsonObject).requestId as string;
    const missingMode = await app.request(`/api/requests/${bothId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(missingMode.status).toBe(400);
    expect((await readBody(missingMode)).error).toBe("service_mode_required");
    const bothSelected = await app.request(`/api/requests/${bothId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        siteInstallationMode: "INTERNAL",
      }),
    });
    expect(bothSelected.status).toBe(200);
    expect(((await readBody(bothSelected)).request as JsonObject).siteInstallationMode).toBe(
      "INTERNAL",
    );
    const invalid = await app.request(`/api/requests/${bothId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteInstallationMode: "SERVICE_DISABLED" }),
    });
    expect(invalid.status).toBe(400);
    expect((await readBody(invalid)).error).toBe("invalid_payload");
  });

  it("does not rewrite a persisted mode when the organization offer changes", async () => {
    const app = createApp();
    await enableSiteInstallation(app, "INTERNAL");
    const customer = await createCustomer(app, "Client Mod Org");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere mod org"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    const selected = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);
    expect(((await readBody(selected)).request as JsonObject).siteInstallationMode).toBe(
      "INTERNAL",
    );
    await enableSiteInstallation(app, "SUBCONTRACTED");
    const titleOnly = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Litere mod org păstrat" }),
    });
    expect(titleOnly.status).toBe(200);
    const afterTitle = await readBody(titleOnly);
    expect((afterTitle.request as JsonObject).siteInstallationMode).toBe("INTERNAL");
    expect((afterTitle.request as JsonObject).optionalScopeIds).toEqual([
      SITE_INSTALLATION_SCOPE_ID,
    ]);
    const sameSelection = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(sameSelection.status).toBe(200);
    const afterSame = await readBody(sameSelection);
    expect((afterSame.request as JsonObject).siteInstallationMode).toBe("INTERNAL");
    expect((afterSame.detail as JsonObject).installationOffer).toMatchObject({
      selected: true,
      mode: "INTERNAL",
      persistedModeIncompatible: true,
    });
    const freeze = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "MODE1",
      customer.customerId as string,
      requestId,
    );
    expect(freeze.status).toBe(422);
    expect((await readBody(freeze)).error).toBe("incomplete_offer");
  });

  it("locks mode after the first linked quote and leaves zero rows changed", async () => {
    const app = createApp();
    await enableSiteInstallation(app, "BOTH");
    const customer = await createCustomer(app, "Client Lock Mod");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere lock mod"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    const orphan = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "LOCKM",
      customer.customerId as string,
    );
    expect(orphan.status).toBe(200);
    const quoteSnapshotId = ((await readBody(orphan)).quoteSnapshot as JsonObject)
      .quoteSnapshotId as string;
    expect(
      (
        await app.request(`/api/requests/${requestId}/quotes`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ quoteSnapshotId }),
        })
      ).status,
    ).toBe(200);
    const before = (
      (await readBody(await app.request(`/api/requests/${requestId}`))).detail as {
        request: JsonObject;
      }
    ).request;
    const lockedMode = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteInstallationMode: "INTERNAL" }),
    });
    expect(lockedMode.status).toBe(409);
    expect((await readBody(lockedMode)).error).toBe("service_selection_locked");
    const after = (
      (await readBody(await app.request(`/api/requests/${requestId}`))).detail as {
        request: JsonObject;
      }
    ).request;
    expect(after.optionalScopeIds).toEqual(before.optionalScopeIds);
    expect(after.siteInstallationMode).toBe(before.siteInstallationMode);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  it("refuses transport selection and keeps LETTERS product-only commercial truth", async () => {
    const app = createApp();
    await enableSiteInstallation(app);
    const customer = await createCustomer(app, "Client Transport");
    const created = await readBody(
      await createRequest(app, customer.customerId as string, "Litere fără transport"),
    );
    const requestId = (created.request as JsonObject).requestId as string;
    const transport = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: ["TRANSPORT"] }),
    });
    expect(transport.status).toBe(400);
    expect((await readBody(transport)).error).toBe("unknown_optional_scope");
    const productOnly = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "LETT1",
      customer.customerId as string,
      requestId,
    );
    expect(productOnly.status).toBe(200);
    const quote = (await readBody(productOnly)).quoteSnapshot as JsonObject;
    expect((quote.eic as JsonObject).total).toBe(382.5);
    expect((quote.commercial as JsonObject).grossPrice).toBe(624.82);
    expect(JSON.stringify(quote)).not.toMatch(/SITE_INSTALLATION|TRANSPORT/);
  });
});
