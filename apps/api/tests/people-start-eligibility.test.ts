import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  completeTaskAs,
  sessionCookieViaHttp,
  startTaskAs,
  withCookie,
} from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function createIsolatedApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-start-"));
  temps.push(dir);
  const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"));
  runtime.materializeTrustedWorkforce();
  return { app: createApp({ productSystem: runtime }), runtime };
}

async function createBackCncPlan(app: ReturnType<typeof createApp>) {
  const compiled = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues }),
    }),
  );
  const accepted = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
      }),
    }),
  );
  const snapshot = accepted.snapshot as JsonObject;
  const created = await readBody(
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    ),
  );
  const view = created.executionPlan as { plan: JsonObject; tasks: Array<JsonObject> };
  const backCnc = view.tasks.find(
    (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
  ) as JsonObject;
  return { planId: view.plan.planId as string, backCnc };
}

async function readTask(
  app: ReturnType<typeof createApp>,
  planId: string,
  taskId: unknown,
  cookie?: string,
) {
  const body = await readBody(
    await app.request(`/api/execution-plans/${planId}`, withCookie(undefined, cookie ?? "")),
  );
  const view = body.executionPlan as { tasks: Array<JsonObject> };
  return view.tasks.find((item) => item.taskId === taskId) as JsonObject;
}

describe("planned start current eligibility API", () => {
  it("blocks claim-and-start when the operator becomes unavailable, then restores", async () => {
    const { app, runtime } = createIsolatedApp();
    const { planId, backCnc } = await createBackCncPlan(app);
    const florin = runtime.listPeople().find((item) => item.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const cookie = await sessionCookieViaHttp(app, florin.personId);

    expect(
      (
        await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        })
      ).status,
    ).toBe(200);
    const claimable = await readTask(app, planId, backCnc.taskId, cookie);
    expect(claimable.assignedExecutor).toBeNull();
    expect(claimable.canClaimStart).toBe(true);

    await app.request(`/api/people/${florin.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }),
    });
    const blocked = await readTask(app, planId, backCnc.taskId, cookie);
    expect(blocked.assignedExecutor).toBeNull();
    expect(blocked.status).toBe("PLANNED");
    expect(blocked.canStart).toBe(false);
    expect(blocked.operatorRelation).toBe("unavailable");
    const startBlocked = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(startBlocked.status).toBe(422);
    expect((await readBody(startBlocked)).error).toBe("unavailable_person");

    await app.request(`/api/people/${florin.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ availability: "AVAILABLE" }),
    });
    const restored = await readTask(app, planId, backCnc.taskId, cookie);
    expect(restored.canClaimStart).toBe(true);
    expect(restored.startBlockReason).toBeNull();
    expect((await startTaskAs(app, String(backCnc.taskId), cookie)).status).toBe(200);
    runtime.close();
  });

  it("blocks claim-and-start when the operator loses the required skill", async () => {
    const { app, runtime } = createIsolatedApp();
    const { planId, backCnc } = await createBackCncPlan(app);
    const andrei = runtime.listPeople().find((item) => item.displayName === "Andrei Goghi");
    const cnc = runtime.listSkills().find((item) => item.code === "SK_CNC_OPERATOR");
    expect(andrei && cnc).toBeTruthy();
    if (!andrei || !cnc) {
      return;
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
    expect(runtime.retirePersonSkill(andrei.personId, cnc.skillId).ok).toBe(true);
    const blocked = await readTask(app, planId, backCnc.taskId, cookie);
    expect(blocked.assignedExecutor).toBeNull();
    expect(blocked.canStart).toBe(false);
    expect(blocked.operatorRelation).toBe("not_eligible");
    const startBlocked = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(startBlocked.status).toBe(422);
    expect((await readBody(startBlocked)).error).toBe("ineligible_executor");
    runtime.close();
  });

  it("keeps IN_PROGRESS history after later unavailability and still allows complete", async () => {
    const { app, runtime } = createIsolatedApp();
    const { planId, backCnc } = await createBackCncPlan(app);
    const florin = runtime.listPeople().find((item) => item.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const cookie = await sessionCookieViaHttp(app, florin.personId);
    await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    const started = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(started.status).toBe(200);
    const startedTask = await readTask(app, planId, backCnc.taskId);
    const startedAt = startedTask.startedAt;

    await app.request(`/api/people/${florin.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }),
    });
    const after = await readTask(app, planId, backCnc.taskId, cookie);
    expect(after.status).toBe("IN_PROGRESS");
    expect((after.assignedExecutor as JsonObject).id).toBe(florin.personId);
    expect(after.startedAt).toBe(startedAt);
    expect(after.canComplete).toBe(true);

    const completed = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: after.measurableQuantity
        ? (after.measurableQuantity as JsonObject).value
        : undefined,
    });
    expect(completed.status).toBe(200);
    runtime.close();
  });

  it("still requires a provider when the person is skill-eligible", async () => {
    const { app, runtime } = createIsolatedApp();
    const { planId, backCnc } = await createBackCncPlan(app);
    const florin = runtime.listPeople().find((item) => item.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const cookie = await sessionCookieViaHttp(app, florin.personId);
    const task = await readTask(app, planId, backCnc.taskId, cookie);
    expect(task.requiresProvider).toBe(true);
    expect(task.canClaimStart).toBe(false);
    const started = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(started.status).toBe(422);
    expect((await readBody(started)).error).toBe("missing_assignment");
    expect((await readTask(app, planId, backCnc.taskId, cookie)).assignedExecutor).toBeNull();
    runtime.close();
  });
});
