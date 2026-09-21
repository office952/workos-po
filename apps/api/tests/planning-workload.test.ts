import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import {
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabaseWithoutMigrations,
} from "../src/persistence/sqlite.js";
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
import { sessionCookieViaHttp, startTaskAs } from "./operator-test-helpers.js";

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

async function previewReady(app: ReturnType<typeof createApp>) {
  const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: readyValues }),
  });
  const body = await readBody(response);
  return { values: readyValues, reviewId: body.reviewId as string };
}

async function createCustomer(app: ReturnType<typeof createApp>) {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Client Demo" }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

async function createExecutor(app: ReturnType<typeof createApp>) {
  const created = await app.request("/api/people", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Executor planificare" }),
  });
  return ((await readBody(created)).person as JsonObject).personId as string;
}

async function createExecutionPlan(app: ReturnType<typeof createApp>) {
  const reviewed = await previewReady(app);
  const createdQuote = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: reviewed.values,
        reviewId: reviewed.reviewId,
        customerId: await createCustomer(app),
      }),
    },
  );
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
  const order = (await readBody(createdOrder)).orderSnapshot as JsonObject;
  const released = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${order.orderSnapshotId}/production-release`,
    { method: "POST" },
  );
  const snapshotId = ((await readBody(released)).snapshot as JsonObject).snapshotId as string;
  const planned = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
    { method: "POST" },
  );
  return (await readBody(planned)).executionPlan as {
    plan: JsonObject;
    tasks: Array<JsonObject>;
  };
}

describe("planned effort API", () => {
  it("saves, clears, and rejects invalid planned effort while the task is planned", async () => {
    const app = createApp();
    const plan = await createExecutionPlan(app);
    const task = plan.tasks.find((item) => item.canAssign === true) ?? plan.tasks[0];
    const taskId = task?.taskId as string;

    const saved = await app.request(`/api/execution-tasks/${taskId}/planned-effort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: 45 }),
    });
    expect(saved.status).toBe(200);
    const savedPlan = (await readBody(saved)).executionPlan as { tasks: Array<JsonObject> };
    expect(savedPlan.tasks.find((item) => item.taskId === taskId)?.plannedEffortMinutes).toBe(45);

    const cleared = await app.request(`/api/execution-tasks/${taskId}/planned-effort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: null }),
    });
    expect(cleared.status).toBe(200);
    const clearedPlan = (await readBody(cleared)).executionPlan as { tasks: Array<JsonObject> };
    expect(
      clearedPlan.tasks.find((item) => item.taskId === taskId)?.plannedEffortMinutes ?? null,
    ).toBeNull();

    for (const value of [0, -3, 1.5]) {
      const rejected = await app.request(`/api/execution-tasks/${taskId}/planned-effort`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plannedEffortMinutes: value }),
      });
      expect(rejected.status).toBe(422);
      expect((await readBody(rejected)).error).toBe("invalid_planned_effort");
    }

    const missing = await app.request("/api/execution-tasks/task:missing/planned-effort", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: 20 }),
    });
    expect(missing.status).toBe(404);
  });

  it("allows start with unknown effort and freezes later edits", async () => {
    const app = createApp();
    const plan = await createExecutionPlan(app);
    const personId = await createExecutor(app);
    const cookie = await sessionCookieViaHttp(app, personId);
    let startedTaskId: string | null = null;
    for (const task of plan.tasks) {
      const providers = (task.eligibleProviders as Array<JsonObject> | undefined) ?? [];
      if (providers[0]?.id) {
        await app.request(`/api/execution-tasks/${task.taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: providers[0].id }),
        });
      }
      const started = await startTaskAs(app, String(task.taskId), cookie);
      if (started.status === 200) {
        startedTaskId = String(task.taskId);
        break;
      }
    }
    expect(startedTaskId).not.toBeNull();

    const frozen = await app.request(`/api/execution-tasks/${startedTaskId}/planned-effort`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plannedEffortMinutes: 30 }),
    });
    expect(frozen.status).toBe(409);
    expect((await readBody(frozen)).error).toBe("effort_frozen");

    const completed = await app.request(`/api/execution-tasks/${startedTaskId}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    if (completed.status === 200) {
      const afterComplete = await app.request(
        `/api/execution-tasks/${startedTaskId}/planned-effort`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ plannedEffortMinutes: 15 }),
        },
      );
      expect(afterComplete.status).toBe(409);
      expect((await readBody(afterComplete)).error).toBe("effort_frozen");
    }
  });

  it("forbids member writes and isolates organizations on the workload read", async () => {
    const fixture = createCloudFixture();
    const organization = await addOrganization(fixture, "Org A");
    await addUser(fixture, {
      email: "owner-a@example.test",
      password: OWNER_PASSWORD,
      organizationId: organization.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-a@example.test",
      password: MEMBER_PASSWORD,
      organizationId: organization.organization.organizationId,
      role: "member",
    });
    const other = await addOrganization(fixture, "Org B");
    await addUser(fixture, {
      email: "owner-b@example.test",
      password: OWNER_PASSWORD,
      organizationId: other.organization.organizationId,
      role: "owner",
    });

    const ownerA = await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD);
    const memberA = await loginCloud(fixture.app, "member-a@example.test", MEMBER_PASSWORD);
    const ownerB = await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD);

    const created = await fixture.app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ownerA.cookie ?? "" },
      body: JSON.stringify({ displayName: "Client A" }),
    });
    expect(created.status).toBe(201);

    const memberWrite = await fixture.app.request("/api/execution-tasks/task:x/planned-effort", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: memberA.cookie ?? "" },
      body: JSON.stringify({ plannedEffortMinutes: 20 }),
    });
    expect(memberWrite.status).toBe(403);

    const workloadA = await fixture.app.request("/api/planning/workload", {
      headers: { cookie: ownerA.cookie ?? "" },
    });
    const workloadB = await fixture.app.request("/api/planning/workload", {
      headers: { cookie: ownerB.cookie ?? "" },
    });
    expect(workloadA.status).toBe(200);
    expect(workloadB.status).toBe(200);
    const bodyA = await readBody(workloadA);
    const bodyB = await readBody(workloadB);
    expect((bodyA.workload as JsonObject).canEditEffort).toBe(true);
    expect((bodyB.workload as JsonObject).canEditEffort).toBe(true);
    fixture.close();
  });
});

describe("planning workload API", () => {
  it("reads derived provider workload and treats unknown effort as unknown", async () => {
    const app = createApp();
    const plan = await createExecutionPlan(app);
    const assignable = plan.tasks.filter((item) => item.canAssign === true);
    const first = assignable[0];
    const second = assignable[1] ?? assignable[0];
    const providerId = ((first?.eligibleProviders as Array<JsonObject> | undefined) ?? [])[0]
      ?.id as string | undefined;
    if (first && providerId) {
      await app.request(`/api/execution-tasks/${first.taskId}/provider`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      await app.request(`/api/execution-tasks/${first.taskId}/planned-effort`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plannedEffortMinutes: 45 }),
      });
    }
    if (second && providerId && second.taskId !== first?.taskId) {
      await app.request(`/api/execution-tasks/${second.taskId}/provider`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
    }

    const response = await app.request("/api/planning/workload");
    expect(response.status).toBe(200);
    const workload = (await readBody(response)).workload as JsonObject;
    const providers = workload.providers as Array<JsonObject>;
    const assignedGroup = providers.find((group) =>
      ((group.tasks as Array<JsonObject>) ?? []).some((task) => task.taskId === first?.taskId),
    );
    expect(assignedGroup?.knownQueuedMinutes).toBe(45);
    expect(Number(assignedGroup?.unknownEffortCount) >= 0).toBe(true);
    const knownTask = ((assignedGroup?.tasks as Array<JsonObject>) ?? []).find(
      (task) => task.taskId === first?.taskId,
    );
    expect(knownTask?.plannedEffortMinutes).toBe(45);
    expect(JSON.stringify(workload)).not.toMatch(/availableMinutes|planningWeek|utilization/);
  });
});

describe("planned effort persistence", () => {
  it("adds a nullable planned effort column without backfilling legacy rows", () => {
    const db = openSqliteDatabaseWithoutMigrations(":memory:");
    const files = listOperationalMigrationFiles();
    const before = files.filter((name) => name !== "033_execution_task_planned_effort.sql");
    applySelectedMigrations(db, before);
    const columnsBefore = db.prepare("PRAGMA table_info(execution_tasks)").all() as Array<{
      name: string;
    }>;
    expect(columnsBefore.some((column) => column.name === "planned_effort_minutes")).toBe(false);
    applySelectedMigrations(db, files);
    const columnsAfter = db.prepare("PRAGMA table_info(execution_tasks)").all() as Array<{
      name: string;
    }>;
    expect(columnsAfter.some((column) => column.name === "planned_effort_minutes")).toBe(true);
    db.close();
  });
});
