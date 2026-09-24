import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { cleanupCloudTemps } from "./cloud-harness.js";
import { completeTaskAs, sessionCookieViaHttp, startTaskAs } from "./operator-test-helpers.js";

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

async function createExecutionPlan(app: ReturnType<typeof createApp>) {
  const preview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: readyValues }),
  });
  const reviewId = (await readBody(preview)).reviewId as string;
  const customer = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Client execuție" }),
  });
  const customerId = ((await readBody(customer)).customer as JsonObject).customerId as string;
  const quote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: readyValues, reviewId, customerId }),
  });
  const quoteId = ((await readBody(quote)).quoteSnapshot as JsonObject).quoteSnapshotId as string;
  await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/acceptance`,
    { method: "POST" },
  );
  const order = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteId}/order`,
    { method: "POST" },
  );
  const orderId = ((await readBody(order)).orderSnapshot as JsonObject).orderSnapshotId as string;
  const released = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderId}/production-release`,
    { method: "POST" },
  );
  const snapshotId = ((await readBody(released)).snapshot as JsonObject).snapshotId as string;
  const planned = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
    { method: "POST" },
  );
  return (await readBody(planned)).executionPlan as { plan: JsonObject; tasks: JsonObject[] };
}

function providersOf(task: JsonObject): JsonObject[] {
  return (task.eligibleProviders as JsonObject[] | undefined) ?? [];
}

describe("execution reality API", () => {
  it("starts and stops a machine run and stores actual duration separately", async () => {
    const app = createApp();
    const plan = await createExecutionPlan(app);
    const person = await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Operator CNC" }),
    });
    const personId = ((await readBody(person)).person as JsonObject).personId as string;
    const cookie = await sessionCookieViaHttp(app, personId);
    const machineTask = plan.tasks.find((task) =>
      providersOf(task).some((provider) => provider.kind === "MACHINE"),
    );
    const workcenterTask = plan.tasks.find((task) =>
      providersOf(task).every((provider) => provider.kind !== "MACHINE") &&
      providersOf(task).some((provider) => provider.kind === "WORKCENTER"),
    );
    if (!machineTask || !workcenterTask) {
      throw new Error("missing provider tasks");
    }
    const machineId = String(machineTask.taskId);
    const machineProvider = providersOf(machineTask).find((provider) => provider.kind === "MACHINE");
    await app.request(`/api/execution-tasks/${machineId}/planned-effort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: 90 }),
    });
    await app.request(`/api/execution-tasks/${machineId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: machineProvider?.id }),
    });
    await app.request(`/api/execution-tasks/${machineId}/executor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    expect((await startTaskAs(app, machineId, cookie)).status).toBe(200);

    const anonymous = await app.request(`/api/execution-tasks/${machineId}/machine-runs/start`, {
      method: "POST",
    });
    expect(anonymous.status).toBe(401);

    const started = await app.request(`/api/execution-tasks/${machineId}/machine-runs/start`, {
      method: "POST",
      headers: { cookie },
    });
    expect(started.status).toBe(200);
    const startedPlan = (await readBody(started)).executionPlan as { tasks: JsonObject[] };
    const active = (startedPlan.tasks.find((task) => task.taskId === machineId)?.machineRuns as JsonObject[])[0];
    expect(active?.machineProviderLabel).toBeTruthy();
    expect(active?.completedAt).toBeNull();

    const duplicate = await app.request(`/api/execution-tasks/${machineId}/machine-runs/start`, {
      method: "POST",
      headers: { cookie },
    });
    expect(duplicate.status).toBe(409);
    expect((await readBody(duplicate)).error).toBe("machine_run_active");

    const blocked = await completeTaskAs(app, machineId, cookie, {
      completedQuantity: 12.5,
      actualDurationMinutes: 85,
    });
    expect(blocked.status).toBe(409);
    expect((await readBody(blocked)).error).toBe("machine_run_active");

    const stopped = await app.request(
      `/api/execution-machine-runs/${active?.machineRunId}/stop`,
      { method: "POST", headers: { cookie } },
    );
    expect(stopped.status).toBe(200);
    const completed = await completeTaskAs(app, machineId, cookie, {
      completedQuantity: 12.5,
      actualDurationMinutes: 85,
    });
    expect(completed.status).toBe(200);
    const completedTask = (
      (await readBody(completed)).executionPlan as { tasks: JsonObject[] }
    ).tasks.find((task) => task.taskId === machineId);
    expect(completedTask?.actualDurationMinutes).toBe(85);
    expect(completedTask?.plannedEffortMinutes).toBe(90);
    expect(completedTask?.timeVarianceMinutes).toBe(-5);
    expect(completedTask?.machineRunTotalMinutes).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(completedTask)).not.toContain("eicTotal");

    const workcenterId = String(workcenterTask.taskId);
    const workcenterProvider = providersOf(workcenterTask)[0];
    await app.request(`/api/execution-tasks/${workcenterId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: workcenterProvider?.id }),
    });
    await app.request(`/api/execution-tasks/${workcenterId}/executor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    const workcenterStarted = await startTaskAs(app, workcenterId, cookie);
    if (workcenterStarted.status === 200) {
      const refused = await app.request(`/api/execution-tasks/${workcenterId}/machine-runs/start`, {
        method: "POST",
        headers: { cookie },
      });
      expect(refused.status).toBe(409);
      expect((await readBody(refused)).error).toBe("machine_run_not_allowed");
    }

    const other = createApp();
    const hidden = await other.request(`/api/execution-plans/${plan.plan.planId}`, { method: "GET" });
    expect(hidden.status).toBe(404);
  });

  it("lets the assigned operator stop an active run after becoming unavailable", async () => {
    const app = createApp();
    const plan = await createExecutionPlan(app);
    const person = await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Operator CNC" }),
    });
    const personId = ((await readBody(person)).person as JsonObject).personId as string;
    const cookie = await sessionCookieViaHttp(app, personId);
    const other = await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Alt operator" }),
    });
    const otherId = ((await readBody(other)).person as JsonObject).personId as string;
    const otherCookie = await sessionCookieViaHttp(app, otherId);
    const machineTask = plan.tasks.find((task) =>
      providersOf(task).some((provider) => provider.kind === "MACHINE"),
    );
    if (!machineTask) {
      throw new Error("missing machine task");
    }
    const machineId = String(machineTask.taskId);
    const machineProvider = providersOf(machineTask).find((provider) => provider.kind === "MACHINE");
    await app.request(`/api/execution-tasks/${machineId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: machineProvider?.id }),
    });
    await app.request(`/api/execution-tasks/${machineId}/executor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId }),
    });
    expect((await startTaskAs(app, machineId, cookie)).status).toBe(200);
    const started = await app.request(`/api/execution-tasks/${machineId}/machine-runs/start`, {
      method: "POST",
      headers: { cookie },
    });
    expect(started.status).toBe(200);
    const active = (
      ((await readBody(started)).executionPlan as { tasks: JsonObject[] }).tasks.find(
        (task) => task.taskId === machineId,
      )?.machineRuns as JsonObject[]
    )[0];
    const away = await app.request(`/api/people/${personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }),
    });
    expect(away.status).toBe(200);
    const refused = await app.request(
      `/api/execution-machine-runs/${active?.machineRunId}/stop`,
      { method: "POST", headers: { cookie: otherCookie } },
    );
    expect(refused.status).toBe(422);
    expect((await readBody(refused)).error).toBe("wrong_executor");
    const stopped = await app.request(
      `/api/execution-machine-runs/${active?.machineRunId}/stop`,
      { method: "POST", headers: { cookie } },
    );
    expect(stopped.status).toBe(200);
    const completed = await completeTaskAs(app, machineId, cookie, { completedQuantity: 12.5 });
    expect(completed.status).toBe(200);
  });
});
