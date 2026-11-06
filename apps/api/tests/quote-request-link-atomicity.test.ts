import { afterEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { listCommercialRequestQuoteLinks } from "../src/requests/store.js";
import { freezeAcknowledgingRates } from "./fixtures/rateAcknowledgement.js";

type JsonObject = Record<string, unknown>;

afterEach(() => {
  vi.restoreAllMocks();
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

async function compileReady(app: ReturnType<typeof createApp>, inscription: string) {
  const values = { ...lettersValues, "root.inscription": inscription };
  const preview = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    }),
  );
  return { values, reviewId: preview.reviewId as string };
}

async function freezeQuote(
  app: ReturnType<typeof createApp>,
  inscription: string,
  customerId: string,
  requestId?: string,
) {
  const reviewed = await compileReady(app, inscription);
  return freezeAcknowledgingRates(
    (acknowledgement) =>
      app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
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

describe("request-linked quote freeze atomicity", () => {
  it("keeps a standalone freeze persisted without a request link", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const app = createApp({ productSystem: runtime });
      const customer = await readBody(
        await app.request("/api/customers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: "Client autonom" }),
        }),
      );
      const customerId = (customer.customer as JsonObject).customerId as string;
      const frozen = await freezeQuote(app, "AUTONOM", customerId);
      expect(frozen.status).toBe(200);
      const body = await readBody(frozen);
      expect(body.requestLink).toBeUndefined();
      expect(body.requestLinkError).toBeUndefined();
      const quoteSnapshotId = (body.quoteSnapshot as JsonObject).quoteSnapshotId as string;
      expect(runtime.readQuoteSnapshot(quoteSnapshotId)).not.toBeNull();
      expect(overviewOf(runtime, quoteSnapshotId)?.requestId).toBeNull();
    } finally {
      runtime.close();
    }
  });

  it("rolls back a new snapshot when request linkage returns failure", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const app = createApp({ productSystem: runtime });
      const customer = await readBody(
        await app.request("/api/customers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: "Client legare" }),
        }),
      );
      const customerId = (customer.customer as JsonObject).customerId as string;
      const created = await readBody(
        await app.request("/api/requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId,
            title: "Cerere legare",
            description: "Ofertă pe cerere.",
          }),
        }),
      );
      const requestId = (created.request as JsonObject).requestId as string;
      vi.spyOn(runtime, "linkRequestQuote").mockReturnValueOnce({
        ok: false,
        error: "quote_unavailable",
      });
      const failed = await freezeQuote(app, "LEGARE-FAIL", customerId, requestId);
      expect(failed.status).toBe(404);
      const body = await readBody(failed);
      expect(body.error).toBe("quote_unavailable");
      expect(body.requestLinkError).toBeUndefined();
      expect(runtime.listQuoteOverview().quotes).toHaveLength(0);
      expect(listCommercialRequestQuoteLinks(runtime.assemblyPlane().db, requestId)).toHaveLength(0);
    } finally {
      runtime.close();
    }
  });

  it("refuses a second request without leaving an unlinked copy of an already linked snapshot", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    try {
      const app = createApp({ productSystem: runtime });
      const customer = await readBody(
        await app.request("/api/customers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName: "Client dublu" }),
        }),
      );
      const customerId = (customer.customer as JsonObject).customerId as string;
      const firstRequest = await readBody(
        await app.request("/api/requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId,
            title: "Prima cerere",
            description: "Prima legare.",
          }),
        }),
      );
      const secondRequest = await readBody(
        await app.request("/api/requests", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            customerId,
            title: "A doua cerere",
            description: "Nu preia oferta existentă.",
          }),
        }),
      );
      const firstId = (firstRequest.request as JsonObject).requestId as string;
      const secondId = (secondRequest.request as JsonObject).requestId as string;
      const first = await freezeQuote(app, "DUBLU", customerId, firstId);
      expect(first.status).toBe(200);
      const quoteSnapshotId = ((await readBody(first)).quoteSnapshot as JsonObject)
        .quoteSnapshotId as string;
      const existing = runtime.readQuoteSnapshot(quoteSnapshotId);
      expect(existing).not.toBeNull();
      vi.spyOn(runtime, "persistQuoteSnapshot").mockReturnValue({
        created: false,
        snapshot: existing!,
      });
      const reuse = await freezeQuote(app, "DUBLU", customerId, secondId);
      expect(reuse.status).toBe(409);
      expect((await readBody(reuse)).error).toBe("quote_already_linked");
      expect(runtime.readQuoteSnapshot(quoteSnapshotId)).not.toBeNull();
      expect(overviewOf(runtime, quoteSnapshotId)?.requestId).toBe(firstId);
      expect(listCommercialRequestQuoteLinks(runtime.assemblyPlane().db, secondId)).toHaveLength(0);
      expect(runtime.listQuoteOverview().quotes).toHaveLength(1);
    } finally {
      runtime.close();
    }
  });
});

function overviewOf(
  runtime: ReturnType<typeof createProductSystemRuntime>,
  quoteSnapshotId: string,
) {
  return (
    runtime.listQuoteOverview().quotes.find((quote) => quote.quoteSnapshotId === quoteSnapshotId) ??
    null
  );
}
