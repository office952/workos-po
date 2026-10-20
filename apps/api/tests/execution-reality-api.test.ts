import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
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

const isolatedRoots: string[] = [];

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
  for (const dir of isolatedRoots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
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
    body: JSON.stringify({ manualProductNetPrice: 400, values: readyValues, reviewId, customerId }),
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
  it("serializes machine occupancy across tasks and jobs, then frees it on stop", async () => {
    const root = mkdtempSync(join(tmpdir(), "workos-machine-occupancy-"));
    isolatedRoots.push(root);
    const runtime = createProductSystemRuntime(join(root, "organization.sqlite"));
    const app = createApp({ productSystem: runtime });
    try {
      const first = await createExecutionPlan(app);
      const second = await createExecutionPlan(app);
      const personResponse = await app.request("/api/people", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Operator test ocupare" }),
      });
      const personId = ((await readBody(personResponse)).person as JsonObject).personId as string;
      const cookie = await sessionCookieViaHttp(app, personId);
      const cncTasks = first.tasks.filter(task => providersOf(task).some(provider => provider.id === MCH_CNC_4020_ID));
      expect(cncTasks.length).toBeGreaterThanOrEqual(2);
      const otherJobTask = second.tasks.find(task => providersOf(task).some(provider => provider.id === MCH_CNC_4020_ID))!;
      expect(second.plan.planId).not.toBe(first.plan.planId);
      const tasks = [cncTasks[0]!, cncTasks[1]!, otherJobTask];
      const taskCookies = new Map<string, string>();
      for (const [index, task] of tasks.entries()) {
        const worker = index === 0 ? personId : runtime.createPerson("Operator CNC paralel " + index);
        const id = typeof worker === "string" ? worker : worker.ok ? worker.person.personId : "";
        const ownCookie = index === 0 ? cookie : await sessionCookieViaHttp(app, id);
        taskCookies.set(String(task.taskId), ownCookie);
        expect((await app.request(`/api/execution-tasks/${task.taskId}/provider`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        })).status).toBe(200);
        expect((await startTaskAs(app, String(task.taskId), ownCookie)).status).toBe(200);
      }
      const runStart = (task: JsonObject) => app.request(`/api/execution-tasks/${task.taskId}/machine-runs/start`, {
        method: "POST", headers: { cookie: taskCookies.get(String(task.taskId))! },
      });
      const started = await runStart(tasks[0]!);
      expect(started.status).toBe(200);
      const active = (((await readBody(started)).executionPlan as { tasks: JsonObject[] }).tasks
        .find(task => task.taskId === tasks[0]!.taskId)?.machineRuns as JsonObject[])[0]!;
      // Identical provider IDs in a different operational plane are independent.
      const independentRuntime = createProductSystemRuntime(":memory:");
      try {
        const independentApp = createApp({ productSystem: independentRuntime });
        const independentPlan = await createExecutionPlan(independentApp);
        const independentTask = independentPlan.tasks.find(task => providersOf(task).some(provider => provider.id === MCH_CNC_4020_ID))!;
        const independentPerson = independentRuntime.createPerson("Operator altă organizație");
        if (!independentPerson.ok) throw new Error(independentPerson.error);
        const independentId = independentPerson.person.personId;
        expect(independentRuntime.assignExecutionTaskProvider(String(independentTask.taskId), MCH_CNC_4020_ID).ok).toBe(true);
        expect(independentRuntime.claimAndStartExecutionTask(String(independentTask.taskId), independentId).ok).toBe(true);
        expect(independentRuntime.startMachineRun(String(independentTask.taskId), independentId).ok).toBe(true);
      } finally {
        independentRuntime.close();
      }
      // A second server connection sees the same persisted occupancy.
      const secondConnection = createProductSystemRuntime(runtime.sqlitePath);
      try {
        expect(secondConnection.startMachineRun(String(otherJobTask.taskId), runtime.readExecutionPlanByTaskId(String(otherJobTask.taskId))!.tasks.find(t => t.taskId === otherJobTask.taskId)!.assignedExecutor!.id))
          .toEqual({ ok: false, error: "machine_busy" });
      } finally {
        secondConnection.close();
      }
      for (const task of tasks.slice(1)) {
        const refused = await runStart(task);
        expect(refused.status).toBe(409);
        expect((await readBody(refused)).error).toBe("machine_busy");
        const unchanged = await app.request(`/api/execution-plans/${task === otherJobTask ? second.plan.planId : first.plan.planId}`);
        const view = (await readBody(unchanged)).executionPlan as { tasks: JsonObject[] };
        expect(view.tasks.find(item => item.taskId === task.taskId)?.machineRuns).toEqual([]);
      }
      expect((await app.request(`/api/execution-machine-runs/${active.machineRunId}/stop`, {
        method: "POST", headers: { cookie },
      })).status).toBe(200);
      // Two requests for different jobs cannot acquire the just-freed CNC together.
      const attempts = await Promise.all(tasks.slice(1).map(runStart));
      expect(attempts.map(response => response.status).sort()).toEqual([200, 409]);
      expect((await readBody(attempts.find(response => response.status === 409)!)).error).toBe("machine_busy");
    } finally {
      runtime.close();
    }
  });

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

  it("rejects a new machine run after the assigned operator loses the required skill", async () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-machine-run-skill-"));
    isolatedRoots.push(dir);
    const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"));
    runtime.materializeTrustedWorkforce();
    const app = createApp({ productSystem: runtime });
    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const accepted = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ manualProductNetPrice: 400, values: readyValues, reviewId: compiled.reviewId }),
      }),
    );
    const snapshotId = (accepted.snapshot as JsonObject).snapshotId as string;
    const created = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshotId}/execution-plan`,
        { method: "POST" },
      ),
    );
    const tasks = (created.executionPlan as { tasks: JsonObject[] }).tasks;
    const backCnc = tasks.find(
      (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    );
    const andrei = runtime.listPeople().find((item) => item.displayName === "Andrei Goghi");
    const cnc = runtime.listSkills().find((item) => item.code === "SK_CNC_OPERATOR");
    if (!backCnc || !andrei || !cnc) {
      throw new Error("missing CNC task or operator");
    }
    const cookie = await sessionCookieViaHttp(app, andrei.personId);
    expect(
      (
        await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        })
      ).status,
    ).toBe(200);
    expect((await startTaskAs(app, String(backCnc.taskId), cookie)).status).toBe(200);
    const qualified = await app.request(
      `/api/execution-tasks/${backCnc.taskId}/machine-runs/start`,
      { method: "POST", headers: { cookie } },
    );
    expect(qualified.status).toBe(200);
    const active = (
      ((await readBody(qualified)).executionPlan as { tasks: JsonObject[] }).tasks.find(
        (task) => task.taskId === backCnc.taskId,
      )?.machineRuns as JsonObject[]
    )[0];
    expect(
      (
        await app.request(`/api/execution-machine-runs/${active?.machineRunId}/stop`, {
          method: "POST",
          headers: { cookie },
        })
      ).status,
    ).toBe(200);
    expect(runtime.retirePersonSkill(andrei.personId, cnc.skillId).ok).toBe(true);
    const person = runtime.getPerson(andrei.personId);
    expect(person?.status).toBe("ACTIVE");
    expect(person?.availability).toBe("AVAILABLE");
    const blocked = await app.request(
      `/api/execution-tasks/${backCnc.taskId}/machine-runs/start`,
      { method: "POST", headers: { cookie } },
    );
    expect(blocked.status).toBe(422);
    expect((await readBody(blocked)).error).toBe("ineligible_executor");
    runtime.close();
  });
});
