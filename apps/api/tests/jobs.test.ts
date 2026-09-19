import { describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  MCH_CNC_4020_ID,
  MCH_CNC_CANT_LITERE_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import {
  completeTaskAs,
  sessionCookieViaHttp,
  startTaskAs,
} from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

async function compileReady(app: ReturnType<typeof createApp>, inscription: string) {
  const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      values: { ...readyValues, "root.inscription": inscription },
    }),
  });
  const body = await readBody(response);
  return {
    definition: body.definition as JsonObject,
    reviewId: body.reviewId as string,
  };
}

async function createCustomer(app: ReturnType<typeof createApp>, displayName: string) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

async function createOrder(
  app: ReturnType<typeof createApp>,
  inscription: string,
  customerName = `Client ${inscription}`,
) {
  const reviewed = await compileReady(app, inscription);
  const createdQuote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      definition: reviewed.definition,
      reviewId: reviewed.reviewId,
      customerId: await createCustomer(app, customerName),
    }),
  });
  const quoteId = ((await readBody(createdQuote)).quoteSnapshot as JsonObject)
    .quoteSnapshotId as string;
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

async function releaseOrder(app: ReturnType<typeof createApp>, orderId: string) {
  const released = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderId}/production-release`,
    { method: "POST" },
  );
  return (await readBody(released)).snapshot as JsonObject;
}

async function createPlan(app: ReturnType<typeof createApp>, snapshotId: string) {
  const created = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
    { method: "POST" },
  );
  return (await readBody(created)).executionPlan as {
    plan: JsonObject;
    progress: JsonObject;
    tasks: Array<JsonObject>;
  };
}

async function createExecutor(app: ReturnType<typeof createApp>) {
  const created = await app.request("/api/people", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Executor overview" }),
  });
  return ((await readBody(created)).person as JsonObject).personId as string;
}

async function executeTask(
  app: ReturnType<typeof createApp>,
  task: JsonObject,
  cookie: string,
  providerId?: string,
) {
  if (providerId) {
    const assigned = await app.request(`/api/execution-tasks/${task.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    expect(assigned.status).toBe(200);
  }
  const started = await startTaskAs(app, String(task.taskId), cookie);
  expect(started.status).toBe(200);
  const startedView = (await readBody(started)).executionPlan as { tasks: Array<JsonObject> };
  const current = startedView.tasks.find((item) => item.taskId === task.taskId) as JsonObject;
  const measurable = current.measurableQuantity as JsonObject | undefined;
  const completed = await completeTaskAs(
    app,
    String(task.taskId),
    cookie,
    measurable ? { completedQuantity: measurable.value } : {},
  );
  expect(completed.status).toBe(200);
  return (await readBody(completed)).executionPlan as {
    progress: JsonObject;
    tasks: Array<JsonObject>;
  };
}

function taskOf(tasks: Array<JsonObject>, label: string, scope: string) {
  return tasks.find((item) => item.processLabel === label && item.scopeLabel === scope) as JsonObject;
}

describe("job overview API", () => {
  it("projects commercial orders as jobs and excludes the pilot path", async () => {
    const app = createApp();
    const orderOnly = await createOrder(app, "JOBA");
    const releasedOrder = await createOrder(app, "JOBB");
    const released = await releaseOrder(app, releasedOrder.orderSnapshotId as string);
    const plannedOrder = await createOrder(app, "JOBC");
    const plannedRelease = await releaseOrder(app, plannedOrder.orderSnapshotId as string);
    await createPlan(app, plannedRelease.snapshotId as string);

    const activeOrder = await createOrder(app, "JOBD");
    const activeRelease = await releaseOrder(app, activeOrder.orderSnapshotId as string);
    const activePlan = await createPlan(app, activeRelease.snapshotId as string);
    const personId = await createExecutor(app);
    const cookie = await sessionCookieViaHttp(app, personId);
    await executeTask(
      app,
      taskOf(activePlan.tasks, "Debitare foaie CNC", "Față"),
      cookie,
      MCH_CNC_4020_ID,
    );

    const doneOrder = await createOrder(app, "JOBE");
    const doneRelease = await releaseOrder(app, doneOrder.orderSnapshotId as string);
    const donePlan = await createPlan(app, doneRelease.snapshotId as string);
    let tasks = donePlan.tasks;
    const machineSteps: Array<[string, string, string]> = [
      ["Debitare foaie CNC", "Față", MCH_CNC_4020_ID],
      ["Debitare foaie CNC", "Spate", MCH_CNC_4020_ID],
      ["Formare profil aluminiu", "Volum", MCH_CNC_CANT_LITERE_ID],
    ];
    for (const [label, scope, providerId] of machineSteps) {
      const next = await executeTask(app, taskOf(tasks, label, scope), cookie, providerId);
      tasks = next.tasks;
    }
    for (const [label, scope] of [
      ["Montare module LED", "Iluminare"],
      ["Cablare electrică", "Iluminare"],
      ["Pregătire sursă de alimentare", "Iluminare"],
      ["Probă aprindere", "Iluminare"],
      ["Lipire față-volum", "Corp"],
      ["Închidere corp", "Corp"],
      ["Probă uniformitate", "Iluminare"],
      ["Control calitate final", "Produs"],
      ["Ambalare", "Produs"],
    ] as const) {
      const next = await executeTask(app, taskOf(tasks, label, scope), cookie);
      tasks = next.tasks;
    }

    const reviewed = await compileReady(app, "PILOT");
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: reviewed.definition,
        reviewId: reviewed.reviewId,
      }),
    });

    const response = await app.request("/api/jobs");
    expect(response.status).toBe(200);
    const overview = (await readBody(response)).overview as {
      summary: JsonObject;
      jobs: Array<JsonObject>;
    };
    expect(overview.jobs).toHaveLength(5);
    expect(overview.jobs.some((job) => job.inscription === "PILOT")).toBe(false);
    expect(JSON.stringify(overview)).not.toMatch(/contentHash|schemaVersion|ProviderRequirement|PILOT/);

    const byInscription = Object.fromEntries(
      overview.jobs.map((job) => [job.inscription, job]),
    );
    expect(byInscription.JOBA).toMatchObject({
      stage: "ORDER_CREATED",
      stageLabel: "Comandă creată",
      nextActionLabel: "Eliberează pentru producție",
      needsAttention: true,
      customerDisplayName: "Client JOBA",
    });
    expect(String(byInscription.JOBA.href)).toBe(
      `/jobs/${encodeURIComponent(String(byInscription.JOBA.jobId))}`,
    );
    expect(byInscription.JOBB).toMatchObject({
      stage: "RELEASED",
      nextActionLabel: "Creează planul de execuție",
    });
    expect(byInscription.JOBC).toMatchObject({
      stage: "EXECUTION_PLANNED",
      nextActionLabel: "Deschide execuția",
      progressLabel: "0 / 12 finalizate",
    });
    expect(byInscription.JOBD).toMatchObject({
      stage: "EXECUTION_IN_PROGRESS",
      nextActionLabel: "Continuă execuția",
    });
    expect(byInscription.JOBE).toMatchObject({
      stage: "EXECUTION_COMPLETED",
      nextActionLabel: "Lucrare finalizată",
      progressLabel: "12 / 12 finalizate",
      needsAttention: false,
    });
    expect(overview.summary).toMatchObject({
      total: 5,
      active: 4,
      inExecution: 1,
      completed: 1,
    });
    expect(orderOnly.orderSnapshotId).toBe(byInscription.JOBA.jobId);
    expect(released.snapshotId).toBe(byInscription.JOBB.releaseSnapshotId);

    const missing = await app.request("/api/jobs/ord:missing");
    expect(missing.status).toBe(404);

    const detail = await app.request(`/api/jobs/${encodeURIComponent(String(orderOnly.orderSnapshotId))}`);
    expect(detail.status).toBe(200);
    const detailBody = await readBody(detail);
    expect(detailBody.job).toMatchObject({
      jobId: orderOnly.orderSnapshotId,
      stage: "ORDER_CREATED",
    });
    expect(detailBody.execution).toBeNull();
    expect((detailBody.order as JsonObject).orderSnapshotId).toBe(orderOnly.orderSnapshotId);

    const plannedDetail = await app.request(
      `/api/jobs/${encodeURIComponent(String(plannedOrder.orderSnapshotId))}`,
    );
    const plannedBody = await readBody(plannedDetail);
    expect((plannedBody.execution as JsonObject).planId).toBe(byInscription.JOBC.planId);
    expect((plannedBody.execution as JsonObject).href).toBe(
      `/execution/${String(byInscription.JOBC.planId)}`,
    );
  });
});
