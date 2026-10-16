import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { sessionCookieViaHttp } from "./operator-test-helpers.js";

type Obj = Record<string, unknown>;
async function json(res: Response): Promise<Obj> { return (await res.json()) as Obj; }
const values = {
  "root.inscription": "N009",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};
async function buildJob(app: ReturnType<typeof createApp>) {
  const compiled = await json(await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/preview",
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values }) },
  ));
  const customer = await json(await app.request("/api/customers", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Client N009" }),
  }));
  const quoted = await json(await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots",
    { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        manualProductNetPrice: 400,
        values,
        reviewId: compiled.reviewId,
        customerId: (customer.customer as Obj).customerId,
      }),
    },
  ));
  const quoteId = (quoted.quoteSnapshot as Obj).quoteSnapshotId as string;
  expect((await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots/" + quoteId + "/acceptance",
    { method: "POST" },
  )).status).toBe(200);
  const order = await json(await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots/" + quoteId + "/order",
    { method: "POST" },
  ));
  const orderId = (order.orderSnapshot as Obj).orderSnapshotId as string;
  const released = await json(await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/production-release",
    { method: "POST" },
  ));
  expect(typeof released.releaseSnapshotId).toBe("string");
  const planned = await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/execution-plan",
    { method: "POST" },
  );
  expect(planned.status).toBe(200);
  return orderId;
}

describe("job material checks and procurement foundation", () => {
  it("uses plan estimates, records a named operator and creates one real pending request", async () => {
    const app = createApp();
    const jobId = await buildJob(app);
    const path = "/api/jobs/" + encodeURIComponent(jobId) + "/material-preparation";
    const initial = (await json(await app.request(path))).preparation as Obj;
    const lines = initial.lines as Obj[];
    const led = lines.find((line) => line.resourceId === "MAT-LED-MODULE");
    expect(led).toBeDefined();
    expect(led?.latestCheck).toBeNull();
    const estimated = led?.estimatedQuantity as number;
    expect(estimated).toBeGreaterThan(0);

    const decisionPath = path + "/MAT-LED-MODULE/decision";
    const post = (body: Obj, cookie = "") => app.request(decisionPath, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    });

    expect((await post({ status: "MISSING", actionKey: "n009-missing-no-session" })).status).toBe(401);
    const personResponse = await json(await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Operator N009" }),
    }));
    const cookie = await sessionCookieViaHttp(app, (personResponse.person as Obj).personId as string);

    const less = await post({
      status: "MISSING", actionKey: "n009-below-minimum", requestedQuantity: estimated - 1,
    }, cookie);
    expect(less.status).toBe(422);
    expect((await json(less)).error).toBe("below_estimated_requirement");

    const amount = Math.ceil(estimated) + 20;
    const created = await post({
      status: "MISSING", actionKey: "n009-request-first", requestedQuantity: amount,
    }, cookie);
    expect(created.status).toBe(200);
    const line = (((await json(created)).preparation as Obj).lines as Obj[])
      .find((item) => item.resourceId === "MAT-LED-MODULE") as Obj;
    expect((line.latestCheck as Obj).checkedByLabel).toBe("Operator N009");
    expect((line.latestCheck as Obj).status).toBe("MISSING");
    const request = line.openRequest as Obj;
    expect(request.requestedQuantity).toBe(amount);
    expect(request.estimatedQuantity).toBe(estimated);
    expect(request.status).toBe("REQUESTED");

    const repeated = await post({
      status: "MISSING", actionKey: "n009-request-first", requestedQuantity: amount,
    }, cookie);
    expect(repeated.status).toBe(200);
    expect((await json(repeated)).alreadyApplied).toBe(true);

    const duplicate = await post({
      status: "MISSING", actionKey: "n009-request-again", requestedQuantity: amount,
    }, cookie);
    expect(duplicate.status).toBe(409);
    expect((await json(duplicate)).error).toBe("already_requested");

    const list = (await json(await app.request("/api/material-requests"))).requests as Obj[];
    expect(list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jobId, resourceId: "MAT-LED-MODULE", requestedQuantity: amount,
        requestedByLabel: "Operator N009", status: "REQUESTED",
      }),
    ]));

    const checkedAvailable = await post({
      status: "AVAILABLE", actionKey: "n009-now-available",
    }, cookie);
    expect(checkedAvailable.status).toBe(200);
    const availableLine = (((await json(checkedAvailable)).preparation as Obj).lines as Obj[])
      .find((item) => item.resourceId === "MAT-LED-MODULE") as Obj;
    expect((availableLine.latestCheck as Obj).status).toBe("AVAILABLE");
    expect((availableLine.openRequest as Obj).requestId).toBe(request.requestId);

    const noPurchaseOrder = await json(await app.request("/api/material-requests"));
    expect((noPurchaseOrder.requests as Obj[]).length).toBe(1);
  });
});
