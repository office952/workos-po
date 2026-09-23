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

type JsonObject = Record<string, unknown>;

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function createOrder(app: ReturnType<typeof createApp>, inscription: string) {
  const preview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: { ...readyValues, "root.inscription": inscription } }),
  });
  const reviewed = await readBody(preview);
  const customer = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: `Client ${inscription}` }),
  });
  const customerId = ((await readBody(customer)).customer as JsonObject).customerId;
  const createdQuote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      values: { ...readyValues, "root.inscription": inscription },
      reviewId: reviewed.reviewId,
      customerId,
    }),
  });
  const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject).quoteSnapshotId;
  await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`,
    { method: "POST" },
  );
  const createdOrder = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
    { method: "POST" },
  );
  return (await readBody(createdOrder)).orderSnapshot as JsonObject;
}

describe("operations control", () => {
  it("stores job priority and target date without inventing a date", async () => {
    const app = createApp();
    const order = await createOrder(app, "PLN2");
    const jobId = order.orderSnapshotId as string;
    const before = await readBody(await app.request(`/api/jobs/${encodeURIComponent(jobId)}`));
    const beforeJob = before.job as JsonObject;
    expect(beforeJob.kind).toBe("PRODUCT");
    expect(beforeJob.priority).toBe("STANDARD");
    expect(beforeJob.targetDate).toBeNull();

    const saved = await app.request(`/api/jobs/${encodeURIComponent(jobId)}/planning`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        priority: "URGENT",
        targetDate: "2026-10-02",
        organizationId: "other-org",
      }),
    });
    expect(saved.status).toBe(200);
    const again = await app.request(`/api/jobs/${encodeURIComponent(jobId)}/planning`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ priority: "URGENT", targetDate: "2026-10-02" }),
    });
    expect(again.status).toBe(200);
    expect((await readBody(again)).alreadyApplied).toBe(true);

    const after = await readBody(await app.request(`/api/jobs/${encodeURIComponent(jobId)}`));
    const job = after.job as JsonObject;
    expect(job.priority).toBe("URGENT");
    expect(job.targetDate).toBe("2026-10-02");
    expect(job.organizationId).not.toBe("other-org");
    expect((after.order as JsonObject).contentHash).toBe((before.order as JsonObject).contentHash);

    const invalid = await app.request(`/api/jobs/${encodeURIComponent(jobId)}/planning`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetDate: "2026-02-31" }),
    });
    expect(invalid.status).toBe(400);
    expect((await readBody(invalid)).error).toBe("invalid_target_date");

    const cleared = await app.request(`/api/jobs/${encodeURIComponent(jobId)}/planning`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ targetDate: null }),
    });
    expect(cleared.status).toBe(200);
    const clearedJob = (await readBody(await app.request(`/api/jobs/${encodeURIComponent(jobId)}`)))
      .job as JsonObject;
    expect(clearedJob.targetDate).toBeNull();
    expect(clearedJob.priority).toBe("URGENT");
  });

  it("lets an unassigned planned task keep effort, then moves that effort with the provider", async () => {
    const app = createApp();
    const order = await createOrder(app, "EFFORT");
    const released = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${order.orderSnapshotId}/production-release`,
      { method: "POST" },
    );
    const snapshotId = ((await readBody(released)).snapshot as JsonObject).snapshotId;
    const created = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
      { method: "POST" },
    );
    const plan = (await readBody(created)).executionPlan as {
      tasks: Array<JsonObject>;
    };
    const task = plan.tasks.find((item) => item.canAssign === true);
    expect(task).toBeTruthy();
    const effort = await app.request(`/api/execution-tasks/${task?.taskId}/planned-effort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: 45 }),
    });
    expect(effort.status).toBe(200);
    const providerId = ((task?.eligibleProviders as Array<JsonObject> | undefined) ?? [])[0]?.id;
    expect(providerId).toBeTruthy();
    const assigned = await app.request(`/api/execution-tasks/${task?.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    expect(assigned.status).toBe(200);
    const workload = (await readBody(await app.request("/api/planning/workload"))).workload as JsonObject;
    const providers = workload.providers as Array<JsonObject>;
    const group = providers.find((item) =>
      ((item.tasks as Array<JsonObject>) ?? []).some((row) => row.taskId === task?.taskId),
    );
    const moved = ((group?.tasks as Array<JsonObject>) ?? []).find((row) => row.taskId === task?.taskId);
    expect(moved?.plannedEffortMinutes).toBe(45);
    expect(moved?.customerDisplayName).toBeTruthy();
    expect(moved?.priorityLabel).toBe("Standard");
    const unassigned = (workload.unassigned as Array<JsonObject>).find(
      (row) => row.taskId === task?.taskId,
    );
    expect(unassigned).toBeUndefined();
  });

  it("rejects a non-owner planning write before it can change a job", async () => {
    const fixture = createCloudFixture();
    const organization = await addOrganization(fixture, "Org A");
    await addUser(fixture, {
      email: "ops-owner-a@example.test",
      password: OWNER_PASSWORD,
      organizationId: organization.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "ops-member-a@example.test",
      password: MEMBER_PASSWORD,
      organizationId: organization.organization.organizationId,
      role: "member",
    });
    const memberA = await loginCloud(fixture.app, "ops-member-a@example.test", MEMBER_PASSWORD);
    const memberWrite = await fixture.app.request("/api/jobs/ord:foreign/planning", {
      method: "PATCH",
      headers: { "content-type": "application/json", cookie: memberA.cookie ?? "" },
      body: JSON.stringify({ priority: "HIGH", organizationId: "spoofed" }),
    });
    expect(memberWrite.status).toBe(403);
    fixture.close();
  });
});
