import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
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

async function compileReady(
  app: ReturnType<typeof createApp>,
  inscription: string,
) {
  const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      values: { ...lettersValues, "root.inscription": inscription },
    }),
  });
  const body = await readBody(response);
  return {
    definition: body.definition as JsonObject,
    reviewId: body.reviewId as string,
  };
}

async function createCustomer(
  app: ReturnType<typeof createApp>,
  displayName: string,
  profile: Record<string, string> = {},
) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName, ...profile }),
  });
  return (await readBody(created)).customer as JsonObject;
}

async function createRequest(
  app: ReturnType<typeof createApp>,
  customerId: string,
  title: string,
) {
  const created = await app.request("/api/requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerId,
      title,
      description: "Clientul a cerut o ofertă.",
    }),
  });
  return (await readBody(created)).request as JsonObject;
}

async function freezeQuote(
  app: ReturnType<typeof createApp>,
  inscription: string,
  customerId: string,
  requestId?: string,
) {
  const reviewed = await compileReady(app, inscription);
  const created = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
      customerId,
      ...(requestId ? { requestId } : {}),
    }),
  });
  return (await readBody(created)).quoteSnapshot as JsonObject;
}

describe("customer workspace API", () => {
  it("projects one customer's requests, quotes and jobs without leaking another customer", async () => {
    const app = createApp();
    const alpha = await createCustomer(app, "Client Alpha", { cui: "RO111" });
    const beta = await createCustomer(app, "Client Beta");
    const requestA = await createRequest(app, alpha.customerId as string, "Cerere A");
    await createRequest(app, alpha.customerId as string, "Cerere B");
    const quoteA = await freezeQuote(app, "ALPH", alpha.customerId as string, requestA.requestId as string);
    await freezeQuote(app, "ALPQ", alpha.customerId as string);
    await freezeQuote(app, "BETA", beta.customerId as string);
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteA.quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    const order = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteA.quoteSnapshotId}/order`,
        { method: "POST" },
      ),
    );
    expect((order.orderSnapshot as JsonObject).contentHash).toBeTruthy();

    const listed = await readBody(await app.request("/api/customers"));
    const registry = listed.registry as {
      customers: Array<JsonObject>;
    };
    const alphaRow = registry.customers.find((item) => item.customerId === alpha.customerId);
    expect(alphaRow).toMatchObject({
      displayName: "Client Alpha",
      cui: "RO111",
      quoteCount: 2,
      jobCount: 1,
    });
    expect(Number(alphaRow?.openRequestCount)).toBeGreaterThan(0);

    const workspace = (
      await readBody(await app.request(`/api/customers/${alpha.customerId}/workspace`))
    ).workspace as {
      customer: JsonObject;
      requests: Array<JsonObject>;
      quotes: Array<JsonObject>;
      jobs: Array<JsonObject>;
      summary: JsonObject;
    };
    expect(workspace.customer.displayName).toBe("Client Alpha");
    expect(workspace.requests).toHaveLength(2);
    expect(workspace.quotes).toHaveLength(2);
    expect(workspace.jobs).toHaveLength(1);
    expect(Number(workspace.summary.openRequestCount)).toBe(2);
    expect(Number(workspace.summary.requestNeedsAction)).toBe(
      workspace.requests.filter((request) => request.needsAttention === true).length,
    );
    expect(Number(workspace.summary.requestNeedsAction)).toBeLessThanOrEqual(
      Number(workspace.summary.openRequestCount),
    );
    expect(workspace.quotes.map((item) => item.inscription).sort()).toEqual(["ALPH", "ALPQ"]);
    expect(workspace.jobs[0]?.inscription).toBe("ALPH");
    expect(JSON.stringify(workspace)).not.toMatch(
      /contentHash|eic|CostEngine|TRUTH_COMPILER|selectedComponentIds/,
    );
    expect(workspace.customer).not.toHaveProperty("requestStatus");
    expect(workspace.customer).not.toHaveProperty("quoteStage");

    const betaWorkspace = (
      await readBody(await app.request(`/api/customers/${beta.customerId}/workspace`))
    ).workspace as { requests: Array<JsonObject>; quotes: Array<JsonObject>; jobs: Array<JsonObject> };
    expect(betaWorkspace.requests).toHaveLength(0);
    expect(betaWorkspace.quotes).toHaveLength(1);
    expect(betaWorkspace.quotes[0]?.inscription).toBe("BETA");
    expect(betaWorkspace.jobs).toHaveLength(0);
  });

  it("keeps history after rename and does not mutate frozen quote or order hashes", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Alpha");
    const request = await createRequest(app, customer.customerId as string, "Litere exterior");
    const quote = await freezeQuote(
      app,
      "RENM",
      customer.customerId as string,
      request.requestId as string,
    );
    const quoteHash = quote.contentHash;
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quote.quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    const order = (
      await readBody(
        await app.request(
          `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quote.quoteSnapshotId}/order`,
          { method: "POST" },
        ),
      )
    ).orderSnapshot as JsonObject;
    const orderHash = order.contentHash;

    const renamed = await app.request(`/api/customers/${customer.customerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: "Client Alpha SRL",
        cui: "RO999",
        contactName: "Ion",
      }),
    });
    expect(((await readBody(renamed)).customer as JsonObject).displayName).toBe("Client Alpha SRL");

    const workspace = (
      await readBody(await app.request(`/api/customers/${customer.customerId}/workspace`))
    ).workspace as {
      customer: JsonObject;
      requests: Array<JsonObject>;
      quotes: Array<JsonObject>;
      jobs: Array<JsonObject>;
    };
    expect(workspace.customer.displayName).toBe("Client Alpha SRL");
    expect(workspace.requests[0]?.customerDisplayName).toBe("Client Alpha SRL");
    expect(workspace.quotes[0]?.customerDisplayName).toBe("Client Alpha");
    expect(workspace.jobs[0]?.customerId).toBe(customer.customerId);

    const rereadQuote = (
      await readBody(
        await app.request(
          `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quote.quoteSnapshotId}`,
        ),
      )
    ).quoteSnapshot as JsonObject;
    expect(rereadQuote.contentHash).toBe(quoteHash);
    expect((rereadQuote.customer as JsonObject).displayName).toBe("Client Alpha");

    const rereadOrder = (
      await readBody(
        await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/orders/${order.orderSnapshotId}`),
      )
    ).orderSnapshot as JsonObject;
    expect(rereadOrder.contentHash).toBe(orderHash);
  });

  it("keeps a retired customer workspace readable and blocks new requests", async () => {
    const app = createApp();
    const customer = await createCustomer(app, "Client Retras");
    await createRequest(app, customer.customerId as string, "Istoric");
    await app.request(`/api/customers/${customer.customerId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    const workspace = (
      await readBody(await app.request(`/api/customers/${customer.customerId}/workspace`))
    ).workspace as { canCreateRequest: boolean; requests: Array<JsonObject> };
    expect(workspace.canCreateRequest).toBe(false);
    expect(workspace.requests).toHaveLength(1);
    const created = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: customer.customerId,
        title: "Nouă după retragere",
        description: "Nu trebuie să treacă.",
      }),
    });
    expect(created.status).toBe(400);
  });
});
