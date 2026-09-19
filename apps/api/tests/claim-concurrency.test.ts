import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { OPERATOR_SESSION_COOKIE } from "../src/operator/store.js";

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

function cookieHeader(rawToken: string): string {
  return `${OPERATOR_SESSION_COOKIE}=${rawToken}`;
}

describe("claim-on-start concurrency", () => {
  it("lets exactly one of two concurrent eligible operators win", async () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-claim-"));
    temps.push(dir);
    const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"));
    runtime.materializeTrustedWorkforce();
    const app = createApp({ productSystem: runtime });

    const florin = runtime.listPeople().find((item) => item.displayName === "Florin CNC");
    const andrei = runtime.listPeople().find((item) => item.displayName === "Andrei Goghi");
    expect(florin && andrei).toBeTruthy();
    if (!florin || !andrei) {
      return;
    }

    expect((await runtime.setOperatorPin(florin.personId, "246810", "246810")).ok).toBe(true);
    expect((await runtime.setOperatorPin(andrei.personId, "135791", "135791")).ok).toBe(true);
    const florinLogin = await runtime.identifyOperator(florin.personId, "246810");
    const andreiLogin = await runtime.identifyOperator(andrei.personId, "135791");
    expect(florinLogin.ok && andreiLogin.ok).toBe(true);
    if (!florinLogin.ok || !andreiLogin.ok) {
      return;
    }

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
    const view = created.executionPlan as { tasks: Array<JsonObject> };
    const backCnc = view.tasks.find(
      (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    ) as JsonObject;
    expect(
      (
        await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        })
      ).status,
    ).toBe(200);

    const [first, second] = await Promise.all([
      app.request(`/api/execution-tasks/${backCnc.taskId}/start`, {
        method: "POST",
        headers: { cookie: cookieHeader(florinLogin.rawToken) },
      }),
      app.request(`/api/execution-tasks/${backCnc.taskId}/start`, {
        method: "POST",
        headers: { cookie: cookieHeader(andreiLogin.rawToken) },
      }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    const bodies = [await readBody(first), await readBody(second)];
    const success = bodies.find((item) => !item.error);
    const conflict = bodies.find((item) => item.error === "already_started_by_other");
    expect(success).toBeTruthy();
    expect(conflict).toBeTruthy();
    const winnerLabel = ((success?.executionPlan as { tasks: Array<JsonObject> }).tasks.find(
      (item) => item.taskId === backCnc.taskId,
    )?.assignedExecutor as JsonObject).label;
    expect(["Florin CNC", "Andrei Goghi"]).toContain(winnerLabel);
    expect((conflict?.startedBy as JsonObject | undefined)?.displayName).toBe(winnerLabel);

    const stored = runtime.readExecutionPlanByTaskId(String(backCnc.taskId));
    const task = stored?.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(task?.status).toBe("IN_PROGRESS");
    expect(task?.assignedExecutor?.label).toBe(winnerLabel);
    expect(task?.startedAt).toBeTruthy();
    runtime.close();
  });
});
