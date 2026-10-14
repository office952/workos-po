import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  REQUEST_COMMERCIAL_ALTERNATIVE_INTENT,
  REQUEST_SEPARATE_QUOTE_INTENT,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { acceptCurrentAssemblyQuote } from "./fixtures/assemblyAcceptance.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

type App = ReturnType<typeof createApp>;
type AssemblyWork = {
  assemblyId: string;
  stage: string;
  quoteSnapshotId: string | null;
  orderSnapshotId: string | null;
  productionSnapshotId: string | null;
  revisionPending: boolean;
  membersEditable: boolean;
};
type Detail = {
  nextAction: string;
  commercialProgress: string | null;
  linkedAssemblyId: string | null;
  canStartAdditionalWork: boolean;
  assemblies: AssemblyWork[];
  request: { status: string };
};

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function post(app: App, path: string, body?: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function reviewId(app: App, productCode: string, values: Record<string, unknown>) {
  const response = await post(app, `/api/products/${productCode}/preview`, { values });
  expect(response.status).toBe(200);
  return (await json(response)).reviewId as string;
}

async function setupRequest(app: App, displayName: string) {
  const customer = await json(await post(app, "/api/customers", { displayName }));
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await json(
    await post(app, "/api/requests", { customerId, title: "Panou ACM + litere", description: "Continuitate" }),
  );
  return { customerId, requestId: (request.request as { requestId: string }).requestId };
}

async function detail(app: App, requestId: string): Promise<Detail> {
  return (await json(await app.request(`/api/requests/${requestId}`))).detail as Detail;
}

async function readAssembly(app: App, assemblyId: string) {
  return json(await app.request(`/api/assemblies/${assemblyId}`));
}

async function quotedAssembly(app: App, requestId: string) {
  const created = await post(app, "/api/assemblies", { requestId });
  expect(created.status).toBe(201);
  const assemblyId = ((await json(created)).assembly as { assemblyId: string }).assemblyId;
  const acmReview = await reviewId(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
  const lettersReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { role: "SUPPORT_PANEL", values: acmValues, reviewId: acmReview })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/members`, { role: "SIGNAGE_LETTERS", values: lettersValues, reviewId: lettersReview })).status).toBe(200);
  expect((await post(app, `/api/assemblies/${assemblyId}/confirm`)).status).toBe(200);
  expect(
    (
      await freezeAcknowledgingRates((body) =>
        post(app, `/api/assemblies/${assemblyId}/quote`, body),
      )
    ).status,
  ).toBe(200);
  return { assemblyId, lettersReview };
}

describe("request commercial continuity for assemblies", () => {
  it("projects quote, order and production on the request without rewriting its stored status", async () => {
    const app = createApp();
    const { requestId } = await setupRequest(app, "Continuitate");
    const initial = await detail(app, requestId);
    expect(initial.nextAction).toBe("CHOOSE_PRODUCT");
    expect(initial.assemblies).toEqual([]);

    const { assemblyId } = await quotedAssembly(app, requestId);
    const afterQuote = await detail(app, requestId);
    expect(afterQuote).toMatchObject({
      nextAction: "OPEN_ASSEMBLY",
      commercialProgress: "QUOTE_CREATED",
      linkedAssemblyId: assemblyId,
      canStartAdditionalWork: true,
      request: { status: initial.request.status },
    });
    expect(afterQuote.assemblies).toEqual([
      expect.objectContaining({ assemblyId, stage: "QUOTE_CREATED", membersEditable: true, revisionPending: false }),
    ]);

    const overview = (await json(await app.request("/api/requests"))).overview as {
      requests: Array<{ requestId: string; nextAction: string; nextActionHref: string; linkedAssemblyId: string | null }>;
    };
    expect(overview.requests.find((item) => item.requestId === requestId)).toMatchObject({
      nextAction: "OPEN_ASSEMBLY",
      linkedAssemblyId: assemblyId,
      nextActionHref: `/assemblies/${encodeURIComponent(assemblyId)}`,
    });

    expect((await acceptCurrentAssemblyQuote(app, assemblyId)).status).toBe(200);
    const afterOrder = await detail(app, requestId);
    expect(afterOrder.commercialProgress).toBe("ORDER_CREATED");
    expect(afterOrder.assemblies[0]).toMatchObject({ stage: "ORDER_CREATED", membersEditable: false });
    expect(afterOrder.assemblies[0]?.orderSnapshotId).toBeTruthy();

    expect((await post(app, `/api/assemblies/${assemblyId}/production`)).status).toBe(200);
    const afterProduction = await detail(app, requestId);
    expect(afterProduction.nextAction).toBe("OPEN_ASSEMBLY");
    expect(afterProduction.assemblies[0]?.stage).toBe("PRODUCTION_RELEASED");
    expect(afterProduction.request.status).toBe(initial.request.status);

    const released = (await readAssembly(app, assemblyId)).assembly as {
      productionCost: { total: number; completeness: string; completenessLabel: string; unpricedOperations: string[] } | null;
    };
    expect(released.productionCost).not.toBeNull();
    expect(released.productionCost?.total).toBeGreaterThan(0);
    expect(["COMPLETE", "PARTIAL"]).toContain(released.productionCost?.completeness);
    if (released.productionCost?.completeness === "PARTIAL") {
      expect(released.productionCost.unpricedOperations.length).toBeGreaterThan(0);
    }
  });

  it("refuses an accidental duplicate assembly but accepts an explicit commercial alternative", async () => {
    const app = createApp();
    const { requestId } = await setupRequest(app, "Alternativă");
    const { assemblyId } = await quotedAssembly(app, requestId);

    const duplicate = await post(app, "/api/assemblies", { requestId });
    expect(duplicate.status).toBe(409);
    expect(await json(duplicate)).toMatchObject({ error: "assembly_exists", assemblyId });
    expect((await detail(app, requestId)).assemblies).toHaveLength(1);

    const alternative = await post(app, "/api/assemblies", { requestId, commercialIntent: REQUEST_COMMERCIAL_ALTERNATIVE_INTENT });
    expect(alternative.status).toBe(201);
    const after = await detail(app, requestId);
    expect(after.assemblies).toHaveLength(2);
    expect(after.linkedAssemblyId).toBe(assemblyId);
  });

  it("keeps standalone quotes working and asks for explicit intent only when the product overlaps the request assembly", async () => {
    const app = createApp();
    await app.request("/api/seller", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ legalName: "Continuitate SRL" }),
    });
    const plain = await setupRequest(app, "Simplu");
    const plainReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
    const standalone = await post(app, `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      values: lettersValues,
      reviewId: plainReview,
      customerId: plain.customerId,
      requestId: plain.requestId,
    });
    expect(standalone.status, JSON.stringify(await standalone.clone().json())).toBe(200);
    expect((await detail(app, plain.requestId)).nextAction).toBe("OPEN_QUOTE");

    const withAssembly = await setupRequest(app, "Suprapunere");
    const { assemblyId } = await quotedAssembly(app, withAssembly.requestId);
    const overlapReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
    const overlap = await post(app, `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      values: lettersValues,
      reviewId: overlapReview,
      customerId: withAssembly.customerId,
      requestId: withAssembly.requestId,
    });
    expect(overlap.status).toBe(409);
    expect(await json(overlap)).toMatchObject({ error: "request_assembly_overlap", assemblyId });
    const separate = await post(app, `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      values: lettersValues,
      reviewId: overlapReview,
      customerId: withAssembly.customerId,
      requestId: withAssembly.requestId,
      commercialIntent: REQUEST_SEPARATE_QUOTE_INTENT,
    });
    expect(separate.status, JSON.stringify(await separate.clone().json())).toBe(200);
  });

  it("reads a confirmed member without mutating the assembly and invalidates only on a genuine edit", async () => {
    const app = createApp();
    const { requestId } = await setupRequest(app, "Reîncărcare");
    const { assemblyId } = await quotedAssembly(app, requestId);
    const before = await readAssembly(app, assemblyId);

    const member = await json(await app.request(`/api/assemblies/${assemblyId}/members/SIGNAGE_LETTERS`));
    expect(member).toMatchObject({ values: lettersValues, membersEditable: true });
    const confirmed = member.confirmed as {
      confirmedAt: string;
      customerPrice: { grossPrice: number; currency: string } | null;
      internalCost: { total: number; completenessLabel: string } | null;
    };
    expect(confirmed.confirmedAt).toEqual(expect.any(String));
    expect(confirmed.customerPrice?.grossPrice).toBeGreaterThan(0);
    expect(confirmed.internalCost?.total).toBeGreaterThan(0);
    await app.request(`/api/assemblies/${assemblyId}/members/SUPPORT_PANEL`);
    expect(await readAssembly(app, assemblyId)).toEqual(before);
    expect((await detail(app, requestId)).assemblies[0]?.stage).toBe("QUOTE_CREATED");

    const changedValues = { ...lettersValues, "root.inscription": "NOU" };
    const changedReview = await reviewId(app, CANONICAL_PRODUCT_CODE, changedValues);
    const edited = await post(app, `/api/assemblies/${assemblyId}/members`, {
      role: "SIGNAGE_LETTERS",
      values: changedValues,
      reviewId: changedReview,
    });
    expect(edited.status).toBe(200);
    expect(((await readAssembly(app, assemblyId)).assembly as { stale: boolean }).stale).toBe(true);
    expect((await detail(app, requestId)).assemblies[0]).toMatchObject({ stage: "NEEDS_REVIEW", revisionPending: true });
    const frozenQuote = (before.assembly as { quote: unknown }).quote;
    expect(((await readAssembly(app, assemblyId)).assembly as { quote: unknown }).quote).toEqual(frozenQuote);
  });
});
