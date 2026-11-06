import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
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

type JsonObject = Record<string, unknown>;

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

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

async function compileReady(
  app: ReturnType<typeof createApp>,
  inscription: string,
  headers?: Record<string, string>,
) {
  const draft = { ...lettersValues, "root.inscription": inscription };
  const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ values: draft }),
  });
  const body = await readBody(response);
  return { values: draft, reviewId: body.reviewId as string };
}

async function createCustomer(
  app: ReturnType<typeof createApp>,
  displayName: string,
  headers?: Record<string, string>,
) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ displayName }),
  });
  return (await readBody(created)).customer as JsonObject;
}

async function createRequest(
  app: ReturnType<typeof createApp>,
  customerId: string,
  title: string,
  headers?: Record<string, string>,
) {
  const response = await app.request("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      customerId,
      title,
      description: "Clientul a cerut o ofertă.",
    }),
  });
  return { response, body: await readBody(response) };
}

async function freezeQuote(
  app: ReturnType<typeof createApp>,
  inscription: string,
  customerId: string,
  requestId?: string,
  headers?: Record<string, string>,
) {
  const reviewed = await compileReady(app, inscription, headers);
  return freezeAcknowledgingRates((acknowledgement) =>
    app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({
        manualProductNetPrice: 400,
        values: reviewed.values,
        reviewId: reviewed.reviewId,
        customerId,
        ...(requestId ? { requestId } : {}),
        ...acknowledgement,
      }),
    }),
  );
}

async function acceptQuote(
  app: ReturnType<typeof createApp>,
  quoteSnapshotId: string,
  headers?: Record<string, string>,
) {
  return app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/acceptance`,
    { method: "POST", headers },
  );
}

async function createOrder(
  app: ReturnType<typeof createApp>,
  quoteSnapshotId: string,
  headers?: Record<string, string>,
) {
  return app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/order`,
    { method: "POST", headers },
  );
}

function operationId(label: string): string {
  return `op:${label}:${crypto.randomUUID()}`;
}

async function postDecisions(
  app: ReturnType<typeof createApp>,
  requestId: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  return app.request(`/api/requests/${requestId}/commercial/decisions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function commercialOf(
  app: ReturnType<typeof createApp>,
  requestId: string,
  headers?: Record<string, string>,
) {
  const detail = (await readBody(await app.request(`/api/requests/${requestId}`, { headers })))
    .detail as JsonObject;
  return detail.commercial as JsonObject;
}

describe("commercial closure API", () => {
  it("01 closes an offerless request with a mandatory reason", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Fără oferte");
    const created = await createRequest(app, customer.customerId as string, "Fără oferte");
    const requestId = (created.body.request as JsonObject).requestId as string;
    const missing = await postDecisions(app, requestId, {
      groups: [],
      close: true,
      expectedRevision: 0,
      operationId: operationId("offerless-missing"),
    });
    expect(missing.status).toBe(400);
    expect((await readBody(missing)).error).toBe("close_reason_required");

    const closed = await postDecisions(app, requestId, {
      groups: [],
      close: true,
      closeReason: "Clientul a amânat lucrarea.",
      expectedRevision: 0,
      operationId: operationId("offerless"),
    });
    expect(closed.status).toBe(200);
    const commercial = await commercialOf(app, requestId);
    expect(commercial).toMatchObject({
      state: "CLOSED",
      revision: 1,
      closeReason: "Clientul a amânat lucrarea.",
      canCreateQuote: false,
    });
    expect(commercial.availableActions).toEqual(expect.arrayContaining(["REOPEN"]));
    expect(commercial.availableActions).not.toEqual(expect.arrayContaining(["CREATE_QUOTE"]));
  });

  it("02-08 covers mixed offers, save-only, refused close, atomic close and post-close order", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Mix 8");
    const created = await createRequest(app, customer.customerId as string, "Opt oferte");
    const requestId = (created.body.request as JsonObject).requestId as string;
    const quoteIds: string[] = [];
    for (let index = 1; index <= 8; index += 1) {
      const frozen = await freezeQuote(
        app,
        `MIX-${String(index).padStart(2, "0")}`,
        customer.customerId as string,
        requestId,
      );
      expect(frozen.status).toBe(200);
      quoteIds.push(((await readBody(frozen)).quoteSnapshot as JsonObject).quoteSnapshotId as string);
    }
    await acceptQuote(app, quoteIds[0] as string);
    await createOrder(app, quoteIds[0] as string);
    await acceptQuote(app, quoteIds[1] as string);
    await acceptQuote(app, quoteIds[2] as string);
    await createOrder(app, quoteIds[2] as string);

    const commercial = await commercialOf(app, requestId);
    expect(commercial.unresolvedQuoteSnapshotIds).toHaveLength(5);
    expect(commercial.outstandingAcceptedWithoutOrder).toHaveLength(1);

    const saveThree = await postDecisions(app, requestId, {
      groups: [
        {
          disposition: "NOT_PURSUED",
          reason: "Nu se mai urmărește seria internă.",
          quoteSnapshotIds: [quoteIds[3], quoteIds[4], quoteIds[5]],
        },
      ],
      close: false,
      expectedRevision: 0,
      operationId: operationId("save-three"),
    });
    expect(saveThree.status).toBe(200);
    const afterSave = await commercialOf(app, requestId);
    expect(afterSave.state).toBe("OPEN");
    expect(afterSave.unresolvedQuoteSnapshotIds).toHaveLength(2);
    expect(afterSave.revision).toBe(1);

    const refused = await postDecisions(app, requestId, {
      groups: [],
      close: true,
      closeReason: "Închidere prematură.",
      expectedRevision: 1,
      operationId: operationId("refuse-close"),
    });
    expect(refused.status).toBe(422);
    expect((await readBody(refused)).error).toBe("unresolved_offers");
    expect((await commercialOf(app, requestId)).state).toBe("OPEN");

    const mixed = await postDecisions(app, requestId, {
      groups: [
        {
          disposition: "DECLINED_BY_CUSTOMER",
          reason: "Clientul a refuzat această variantă.",
          quoteSnapshotIds: [quoteIds[6]],
        },
        {
          disposition: "NOT_PURSUED",
          reason: "Varianta rămâne internă.",
          quoteSnapshotIds: [quoteIds[7]],
        },
      ],
      close: true,
      closeReason: "Urmărirea comercială s-a încheiat.",
      expectedRevision: 1,
      operationId: operationId("save-and-close"),
    });
    expect(mixed.status).toBe(200);
    const closed = await commercialOf(app, requestId);
    expect(closed.state).toBe("CLOSED");
    expect(closed.unresolvedQuoteSnapshotIds).toEqual([]);
    expect(closed.outstandingAcceptedWithoutOrder).toHaveLength(1);

    const afterCloseFreeze = await freezeQuote(
      app,
      "DUPA-INCHIDERE",
      customer.customerId as string,
      requestId,
    );
    expect(afterCloseFreeze.status).toBe(409);
    expect((await readBody(afterCloseFreeze)).error).toBe("commercial_request_closed");

    const orderAfterClose = await createOrder(app, quoteIds[1] as string);
    expect(orderAfterClose.status).toBe(200);

    const firstSnapshot = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteIds[0]}`),
    );
    expect((firstSnapshot.quoteSnapshot as JsonObject).quoteSnapshotId).toBe(quoteIds[0]);
  });

  it("09 refuses administrative cancellation when orders exist", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Anulare");
    const created = await createRequest(app, customer.customerId as string, "Cu comandă");
    const requestId = (created.body.request as JsonObject).requestId as string;
    const frozen = await freezeQuote(app, "ANUL-01", customer.customerId as string, requestId);
    const quoteId = ((await readBody(frozen)).quoteSnapshot as JsonObject).quoteSnapshotId as string;
    await acceptQuote(app, quoteId);
    await createOrder(app, quoteId);
    const cancelled = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    expect(cancelled.status).toBe(409);
    expect((await readBody(cancelled)).error).toBe("order_obligation_blocks_cancellation");
  });

  it("10-13 reopens, resumes, and refuses resume while closed or superseded-ineligible", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Reluare");
    const created = await createRequest(app, customer.customerId as string, "Reluare");
    const requestId = (created.body.request as JsonObject).requestId as string;
    const frozen = await freezeQuote(app, "REL-01", customer.customerId as string, requestId);
    const quoteId = ((await readBody(frozen)).quoteSnapshot as JsonObject).quoteSnapshotId as string;
    await postDecisions(app, requestId, {
      groups: [
        {
          disposition: "NOT_PURSUED",
          reason: "Amânată de client.",
          quoteSnapshotIds: [quoteId],
        },
      ],
      close: true,
      closeReason: "Se închide până la un nou contact.",
      expectedRevision: 0,
      operationId: operationId("close-for-resume"),
    });
    const resumeWhileClosed = await app.request(
      `/api/requests/${requestId}/quotes/${quoteId}/resume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Clientul a revenit.",
          expectedRevision: 1,
          operationId: operationId("resume-closed"),
        }),
      },
    );
    expect(resumeWhileClosed.status).toBe(422);
    expect((await readBody(resumeWhileClosed)).error).toBe("commercial_request_closed");

    const reopened = await app.request(`/api/requests/${requestId}/commercial/reopen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Clientul a cerut reluarea discuției.",
        expectedRevision: 1,
        operationId: operationId("reopen"),
      }),
    });
    expect(reopened.status).toBe(200);
    const afterReopen = await commercialOf(app, requestId);
    expect(afterReopen.state).toBe("OPEN");
    expect(afterReopen.reopenReason).toBe("Clientul a cerut reluarea discuției.");
    const dispositioned = (afterReopen.offers as JsonObject[]).find(
      (offer) => offer.quoteSnapshotId === quoteId,
    );
    expect(dispositioned?.disposition).toBe("NOT_PURSUED");

    const resumed = await app.request(`/api/requests/${requestId}/quotes/${quoteId}/resume`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reason: "Reluăm explicit această ofertă.",
        expectedRevision: 2,
        operationId: operationId("resume"),
      }),
    });
    expect(resumed.status).toBe(200);
    const afterResume = await commercialOf(app, requestId);
    const resumedOffer = (afterResume.offers as JsonObject[]).find(
      (offer) => offer.quoteSnapshotId === quoteId,
    );
    expect(resumedOffer?.disposition).toBeNull();
    expect(resumedOffer?.decisionRequired).toBe(true);
    expect((afterResume.timeline as JsonObject[]).some((event) => event.eventKind === "OFFER_DISPOSITION")).toBe(
      true,
    );
    expect((afterResume.timeline as JsonObject[]).some((event) => event.eventKind === "OFFER_RESUMED")).toBe(
      true,
    );

    const missingResume = await app.request(
      `/api/requests/${requestId}/quotes/qts:missing/resume`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Ofertă inexistentă.",
          expectedRevision: 3,
          operationId: operationId("resume-missing"),
        }),
      },
    );
    expect(missingResume.status).toBe(422);
    expect((await readBody(missingResume)).error).toBe("offer_not_eligible");
  });

  it("15-17 revision mismatch and idempotency", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Idempotență");
    const created = await createRequest(app, customer.customerId as string, "Idempotență");
    const requestId = (created.body.request as JsonObject).requestId as string;
    const stale = await postDecisions(app, requestId, {
      groups: [],
      close: true,
      closeReason: "Revizie veche.",
      expectedRevision: 4,
      operationId: operationId("stale"),
    });
    expect(stale.status).toBe(409);
    expect((await readBody(stale)).error).toBe("commercial_revision_mismatch");

    const key = operationId("same");
    const payload = {
      groups: [],
      close: true,
      closeReason: "Se închide o dată.",
      expectedRevision: 0,
      operationId: key,
    };
    const first = await postDecisions(app, requestId, payload);
    expect(first.status).toBe(200);
    const replay = await postDecisions(app, requestId, payload);
    expect(replay.status).toBe(200);
    expect((await readBody(replay)).alreadyApplied).toBe(true);
    expect((await commercialOf(app, requestId)).revision).toBe(1);

    const conflict = await postDecisions(app, requestId, {
      ...payload,
      closeReason: "Alt motiv pe aceeași cheie.",
    });
    expect(conflict.status).toBe(409);
    expect((await readBody(conflict)).error).toBe("commercial_operation_conflict");
  });

  it("19 keeps historical CANCELLED requests compatible", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Anulat");
    const created = await createRequest(app, customer.customerId as string, "Istoric anulat");
    const requestId = (created.body.request as JsonObject).requestId as string;
    const cancelled = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    expect(cancelled.status).toBe(200);
    const commercial = await commercialOf(app, requestId);
    expect(commercial.state).toBe("OPEN");
    const listed = await readBody(await app.request("/api/requests"));
    const row = ((listed.overview as { requests: JsonObject[] }).requests).find(
      (item) => item.requestId === requestId,
    );
    expect(row).toMatchObject({ status: "CANCELLED", commercialState: "OPEN" });
  });

  it("21 blocks new assembly work on a commercially closed request", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Ansamblu");
    const created = await createRequest(app, customer.customerId as string, "Ansamblu închis");
    const requestId = (created.body.request as JsonObject).requestId as string;
    await postDecisions(app, requestId, {
      groups: [],
      close: true,
      closeReason: "Fără oferte, se închide.",
      expectedRevision: 0,
      operationId: operationId("close-assembly"),
    });
    const assembly = await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    });
    expect(assembly.status).toBe(409);
    expect((await readBody(assembly)).error).toBe("commercial_request_closed");
  });

  it("14 and 18 block member mutations and cross-tenant access", async () => {
    const fixture = createCloudFixture();
    try {
      const alpha = await addOrganization(fixture, "Alpha Closure");
      const beta = await addOrganization(fixture, "Beta Closure");
      await addUser(fixture, {
        email: "owner-a@closure.test",
        password: OWNER_PASSWORD,
        organizationId: alpha.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "member-a@closure.test",
        password: MEMBER_PASSWORD,
        organizationId: alpha.organization.organizationId,
        role: "member",
      });
      await addUser(fixture, {
        email: "owner-b@closure.test",
        password: OWNER_PASSWORD,
        organizationId: beta.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app,
        "owner-a@closure.test",
        OWNER_PASSWORD,
        alpha.organization.organizationId,
      );
      const memberA = await loginCloud(
        fixture.app,
        "member-a@closure.test",
        MEMBER_PASSWORD,
        alpha.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app,
        "owner-b@closure.test",
        OWNER_PASSWORD,
        beta.organization.organizationId,
      );
      const ownerHeaders = {
        cookie: ownerA.cookie ?? "",
        "content-type": "application/json",
      };
      const memberHeaders = {
        cookie: memberA.cookie ?? "",
        "content-type": "application/json",
      };
      const betaHeaders = {
        cookie: ownerB.cookie ?? "",
        "content-type": "application/json",
      };
      const customer = await createCustomer(fixture.app, "Alpha Client", ownerHeaders);
      const created = await createRequest(
        fixture.app,
        customer.customerId as string,
        "Alpha cerere",
        ownerHeaders,
      );
      const requestId = (created.body.request as JsonObject).requestId as string;
      const memberPost = await postDecisions(
        fixture.app,
        requestId,
        {
          groups: [],
          close: true,
          closeReason: "Membrul nu poate închide.",
          expectedRevision: 0,
          operationId: operationId("member"),
        },
        memberHeaders,
      );
      expect(memberPost.status).toBe(403);
      const memberRead = await commercialOf(fixture.app, requestId, {
        cookie: memberA.cookie ?? "",
      });
      expect(memberRead.state).toBe("OPEN");
      expect(memberRead.canClose).toBe(false);
      expect(memberRead.availableActions).not.toEqual(
        expect.arrayContaining(["CLOSE_OFFERLESS", "SAVE_DECISIONS"]),
      );

      const foreign = await postDecisions(
        fixture.app,
        requestId,
        {
          groups: [],
          close: true,
          closeReason: "Altă organizație.",
          expectedRevision: 0,
          operationId: operationId("foreign"),
        },
        betaHeaders,
      );
      expect([403, 404]).toContain(foreign.status);
    } finally {
      fixture.close();
    }
  });
});
