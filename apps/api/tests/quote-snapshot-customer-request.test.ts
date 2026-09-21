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

describe("quote snapshot customer and request", () => {
  it("re-reads customer identity and the request link after freeze", async () => {
    const app = createApp();
    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...lettersValues, "root.inscription": "NORD" },
        }),
      }),
    );
    const customer = await readBody(
      await app.request("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Client Nord" }),
      }),
    );
    const customerId = (customer.customer as JsonObject).customerId as string;
    const request = await readBody(
      await app.request("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          customerId,
          title: "Cerere litere",
          description: "Litere frontlit fără montaj.",
        }),
      }),
    );
    const requestId = (request.request as JsonObject).requestId as string;
    const frozen = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...lettersValues, "root.inscription": "NORD" },
          reviewId: compiled.reviewId,
          customerId,
          requestId,
        }),
      }),
    );
    expect(frozen.requestLink).toMatchObject({ requestId });
    const quoteSnapshotId = (frozen.quoteSnapshot as JsonObject).quoteSnapshotId as string;
    const read = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}`,
      ),
    );
    expect((read.quoteSnapshot as JsonObject).customer).toMatchObject({
      customerId,
      displayName: "Client Nord",
    });
    expect(read.request).toMatchObject({ requestId });
    expect((read.quoteSnapshot as JsonObject).requestId).toBeUndefined();
  });
});
