import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "NORD",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

describe("execution plan job context", () => {
  it("exposes the source job on the plan read path", async () => {
    const app = createApp();
    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const customer = await readBody(
      await app.request("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Client Nord" }),
      }),
    );
    const frozen = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          definition: compiled.definition,
          reviewId: compiled.reviewId,
          customerId: (customer.customer as JsonObject).customerId,
        }),
      }),
    );
    const quoteSnapshotId = (frozen.quoteSnapshot as JsonObject).quoteSnapshotId as string;
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/acceptance`,
      { method: "POST" },
    );
    const order = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/order`,
        { method: "POST" },
      ),
    );
    const orderSnapshotId = (order.orderSnapshot as JsonObject).orderSnapshotId as string;
    const released = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderSnapshotId}/production-release`,
        { method: "POST" },
      ),
    );
    const snapshotId = (released.snapshot as JsonObject).snapshotId as string;
    const created = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
        { method: "POST" },
      ),
    );
    const planId = ((created.executionPlan as { plan: JsonObject }).plan.planId) as string;
    const read = await readBody(await app.request(`/api/execution-plans/${planId}`));
    expect(read.job).toMatchObject({
      jobId: orderSnapshotId,
      href: `/jobs/${encodeURIComponent(orderSnapshotId)}`,
    });
  });
});
