import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
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
async function buildJob(app: ReturnType<typeof createApp>, cookie = "") {
  const jsonHeaders = {
    "content-type": "application/json",
    ...(cookie ? { cookie } : {}),
  };
  const authHeaders = cookie ? { cookie } : undefined;
  const compiled = await json(await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/preview",
    { method: "POST", headers: jsonHeaders, body: JSON.stringify({ values }) },
  ));
  const customer = await json(await app.request("/api/customers", {
    method: "POST", headers: jsonHeaders,
    body: JSON.stringify({ displayName: "Client N009" }),
  }));
  const quoted = await json(await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots",
    { method: "POST", headers: jsonHeaders,
      body: JSON.stringify({
        manualProductNetPrice: 400,
        values,
        reviewId: compiled.reviewId,
        customerId: (customer.customer as Obj).customerId,
      }),
    },
  ));
  expect(quoted.quoteSnapshot, JSON.stringify(quoted)).toBeTruthy();
  const quoteId = (quoted.quoteSnapshot as Obj).quoteSnapshotId as string;
  expect((await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots/" + quoteId + "/acceptance",
    { method: "POST", headers: authHeaders },
  )).status).toBe(200);
  const order = await json(await app.request(
    "/api/products/" + CANONICAL_PRODUCT_CODE + "/quote-snapshots/" + quoteId + "/order",
    { method: "POST", headers: authHeaders },
  ));
  const orderId = (order.orderSnapshot as Obj).orderSnapshotId as string;
  const released = await json(await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/production-release",
    { method: "POST", headers: authHeaders },
  ));
  expect(typeof released.releaseSnapshotId).toBe("string");
  const planned = await app.request(
    "/api/jobs/" + encodeURIComponent(orderId) + "/execution-plan",
    { method: "POST", headers: authHeaders },
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
    expect(request.requiresReview).toBe(false);

    const repeated = await post({
      status: "MISSING", actionKey: "n009-request-first", requestedQuantity: amount,
    }, cookie);
    expect(repeated.status).toBe(200);
    expect((await json(repeated)).alreadyApplied).toBe(true);

    const conflictingReplay = await post({
      status: "MISSING", actionKey: "n009-request-first", requestedQuantity: amount + 1,
    }, cookie);
    expect(conflictingReplay.status).toBe(409);
    expect((await json(conflictingReplay)).error).toBe("idempotency_conflict");

    const duplicate = await post({
      status: "MISSING", actionKey: "n009-request-again", requestedQuantity: amount,
    }, cookie);
    expect(duplicate.status).toBe(409);
    expect((await json(duplicate)).error).toBe("already_requested");

    const list = (await json(await app.request("/api/material-requests"))).requests as Obj[];
    expect(list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        jobId, resourceId: "MAT-LED-MODULE", requestedQuantity: amount,
        requestedByLabel: "Operator N009", status: "REQUESTED", requiresReview: false,
      }),
    ]));

    const checkedAvailable = await post({
      status: "AVAILABLE", actionKey: "n009-now-available",
    }, cookie);
    expect(checkedAvailable.status).toBe(200);
    const availableLine = (((await json(checkedAvailable)).preparation as Obj).lines as Obj[])
      .find((item) => item.resourceId === "MAT-LED-MODULE") as Obj;
    expect((availableLine.latestCheck as Obj).status).toBe("AVAILABLE");
    const reviewed = availableLine.openRequest as Obj;
    expect(reviewed.requestId).toBe(request.requestId);
    expect(reviewed.status).toBe("REQUESTED");
    expect(reviewed.requiresReview).toBe(true);

    const noPurchaseOrder = await json(await app.request("/api/material-requests"));
    expect(noPurchaseOrder.requests).toEqual([
      expect.objectContaining({
        requestId: request.requestId,
        status: "REQUESTED",
        requiresReview: true,
      }),
    ]);

    const viewed = await json(await app.request(
      "/api/execution-plans/" + encodeURIComponent(String(initial.planId)),
    ));
    const tasks = ((viewed.executionPlan as Obj).tasks ?? []) as Obj[];
    const ledTask = tasks.find((task) =>
      Array.isArray(task.resourceDemands) &&
      (task.resourceDemands as Obj[]).some((demand) => demand.resourceId === "MAT-LED-MODULE") &&
      task.status === "PLANNED",
    );
    expect(ledTask?.materialParticipation).toBe("NOT_ADOPTED");
    expect(ledTask?.materialBlockLabel ?? null).toBeNull();
  });
});

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

describe("job material requests across organizations", () => {
  it("keeps checks and requests inside the authenticated organization", async () => {
    const fixture = createCloudFixture();
    try {
      const alpha = await addOrganization(fixture, "Atelier N009 Alpha");
      const beta = await addOrganization(fixture, "Atelier N009 Beta");
      await addUser(fixture, {
        email: "owner-a-n009@example.test",
        password: OWNER_PASSWORD,
        organizationId: alpha.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "owner-b-n009@example.test",
        password: OWNER_PASSWORD,
        organizationId: beta.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app, "owner-a-n009@example.test", OWNER_PASSWORD, alpha.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app, "owner-b-n009@example.test", OWNER_PASSWORD, beta.organization.organizationId,
      );
      expect(ownerA.cookie).toBeTruthy();
      expect(ownerB.cookie).toBeTruthy();
      const cloudA = ownerA.cookie ?? "";
      const cloudB = ownerB.cookie ?? "";

      for (const [cookie, legalName] of [
        [cloudA, "Atelier N009 Alpha SRL"],
        [cloudB, "Atelier N009 Beta SRL"],
      ] as const) {
        const seller = await fixture.app.request("/api/seller", {
          method: "PATCH",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ legalName }),
        });
        expect(seller.status).toBe(200);
      }
      const jobA = await buildJob(fixture.app, cloudA);
      const jobB = await buildJob(fixture.app, cloudB);
      const personA = await json(await fixture.app.request("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cloudA },
        body: JSON.stringify({ displayName: "Operator Alpha" }),
      }));
      const personB = await json(await fixture.app.request("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: cloudB },
        body: JSON.stringify({ displayName: "Operator Beta" }),
      }));
      const operatorA = await sessionCookieViaHttp(
        fixture.app, (personA.person as Obj).personId as string, "246810", cloudA,
      );
      const operatorB = await sessionCookieViaHttp(
        fixture.app, (personB.person as Obj).personId as string, "135791", cloudB,
      );
      const sessionA = cloudA + "; " + operatorA;
      const sessionB = cloudB + "; " + operatorB;

      const preparationA = await fixture.app.request(
        "/api/jobs/" + encodeURIComponent(jobA) + "/material-preparation",
        { headers: { cookie: sessionA } },
      );
      expect(preparationA.status).toBe(200);
      const linesA = ((await json(preparationA)).preparation as Obj).lines as Obj[];
      const estimated = linesA.find((line) => line.resourceId === "MAT-LED-MODULE")?.estimatedQuantity;
      expect(typeof estimated).toBe("number");

      const foreignRead = await fixture.app.request(
        "/api/jobs/" + encodeURIComponent(jobA) + "/material-preparation",
        { headers: { cookie: sessionB } },
      );
      expect(foreignRead.status).toBe(404);

      const decide = (jobId: string, cookie: string, body: Obj) => fixture.app.request(
        "/api/jobs/" + encodeURIComponent(jobId) + "/material-preparation/MAT-LED-MODULE/decision",
        {
          method: "POST",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify(body),
        },
      );
      const created = await decide(jobA, sessionA, {
        status: "MISSING",
        actionKey: "n009-org-a-request",
        requestedQuantity: Math.ceil(estimated as number),
      });
      expect(created.status).toBe(200);

      const stolenOperator = await decide(jobA, cloudB + "; " + operatorA, {
        status: "AVAILABLE",
        actionKey: "n009-stolen-operator",
      });
      expect(stolenOperator.status).toBe(401);

      const foreignWrite = await decide(jobA, sessionB, {
        status: "MISSING",
        actionKey: "n009-org-b-on-a",
        requestedQuantity: Math.ceil(estimated as number),
      });
      expect(foreignWrite.status).toBe(404);
      expect((await json(foreignWrite)).error).toBe("job_not_found");

      const listA = (await json(await fixture.app.request("/api/material-requests", {
        headers: { cookie: sessionA },
      }))).requests as Obj[];
      const listB = (await json(await fixture.app.request("/api/material-requests", {
        headers: { cookie: sessionB },
      }))).requests as Obj[];
      expect(listA).toEqual([
        expect.objectContaining({ jobId: jobA, status: "REQUESTED", requiresReview: false }),
      ]);
      expect(listB).toEqual([]);

      const createdB = await decide(jobB, sessionB, {
        status: "MISSING",
        actionKey: "n009-org-b-request",
        requestedQuantity: Math.ceil(estimated as number),
      });
      expect(createdB.status).toBe(200);
      const listAAfter = (await json(await fixture.app.request("/api/material-requests", {
        headers: { cookie: sessionA },
      }))).requests as Obj[];
      const listBAfter = (await json(await fixture.app.request("/api/material-requests", {
        headers: { cookie: sessionB },
      }))).requests as Obj[];
      expect(listAAfter.map((item) => item.jobId)).toEqual([jobA]);
      expect(listBAfter.map((item) => item.jobId)).toEqual([jobB]);

      const readB = await fixture.app.request(
        "/api/jobs/" + encodeURIComponent(jobB) + "/material-preparation",
        { headers: { cookie: cloudA } },
      );
      expect(readB.status).toBe(404);
    } finally {
      fixture.close();
    }
  });
});
