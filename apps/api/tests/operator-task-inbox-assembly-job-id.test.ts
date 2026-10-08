import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  MCH_CNC_4020_ID,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { cookieForPersonName, withCookie } from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function createIsolatedApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-operator-inbox-assembly-"));
  const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"));
  runtime.materializeTrustedWorkforce();
  cleanups.push(() => {
    runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { app: createApp({ productSystem: runtime }), runtime };
}

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function reviewId(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, unknown>,
): Promise<string> {
  const body = await readBody(
    await app.request(`/api/products/${productCode}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    }),
  );
  return body.reviewId as string;
}

async function createAssemblyExecutionJob(app: ReturnType<typeof createApp>): Promise<{
  assemblyJobId: string;
  backCncTaskId: string;
}> {
  const customer = await readBody(
    await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Inbox Assembly Job" }),
    }),
  );
  const customerId = (customer.customer as { customerId: string }).customerId;
  const request = await readBody(
    await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId,
        title: "Panou ACM + litere volumetrice",
        description: "Inbox jobId regression",
      }),
    }),
  );
  const requestId = (request.request as { requestId: string }).requestId;
  const created = await readBody(
    await app.request("/api/assemblies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestId }),
    }),
  );
  const assemblyId = (created.assembly as { assemblyId: string }).assemblyId;
  const acmReview = await reviewId(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
  const lettersReview = await reviewId(app, CANONICAL_PRODUCT_CODE, lettersValues);
  expect(
    (
      await app.request(`/api/assemblies/${assemblyId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "SUPPORT_PANEL", values: acmValues, reviewId: acmReview }),
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(`/api/assemblies/${assemblyId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "SIGNAGE_LETTERS",
          values: lettersValues,
          reviewId: lettersReview,
        }),
      })
    ).status,
  ).toBe(200);
  expect((await app.request(`/api/assemblies/${assemblyId}/confirm`, { method: "POST" })).status).toBe(
    200,
  );
  expect((await app.request(`/api/assemblies/${assemblyId}/quote`, { method: "POST" })).status).toBe(200);
  expect((await app.request(`/api/assemblies/${assemblyId}/accept`, { method: "POST" })).status).toBe(200);
  expect((await app.request(`/api/assemblies/${assemblyId}/production`, { method: "POST" })).status).toBe(
    200,
  );
  expect((await app.request(`/api/assemblies/${assemblyId}/execution-plan`, { method: "POST" })).status).toBe(
    200,
  );

  const jobs = await readBody(await app.request("/api/jobs"));
  const assemblyJob = (jobs.overview as { jobs: Array<{ jobId: string; kind: string }> }).jobs.find(
    (job) => job.kind === "ASSEMBLY",
  );
  expect(assemblyJob?.jobId).toMatch(/^asmo:/);

  const assembly = await readBody(await app.request(`/api/assemblies/${assemblyId}`));
  const planId = (assembly.assembly as { executionPlanId: string }).executionPlanId;
  const plan = await readBody(await app.request(`/api/execution-plans/${planId}`));
  const backCnc = (
    plan.executionPlan as {
      tasks: Array<{ taskId: string; processLabel: string; scopeLabel: string }>;
    }
  ).tasks.find(
    (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Litere",
  );
  expect(backCnc?.taskId).toBeTruthy();

  return { assemblyJobId: String(assemblyJob?.jobId), backCncTaskId: String(backCnc?.taskId) };
}

function inboxTasks(inbox: JsonObject): Array<JsonObject> {
  const lanes = [
    inbox.inProgressMine,
    inbox.availableReady,
    inbox.availableNeedsProvider,
    inbox.waitingDependencies,
    inbox.blockedMaterial,
  ];
  return lanes.flatMap((lane) => (Array.isArray(lane) ? (lane as Array<JsonObject>) : []));
}

describe("GET /api/operator-task-inbox assembly jobId", () => {
  it("projects assembly-derived jobId on inbox tasks (not null)", async () => {
    const { app, runtime } = createIsolatedApp();
    const { assemblyJobId, backCncTaskId } = await createAssemblyExecutionJob(app);

    const provider = await app.request(`/api/execution-tasks/${backCncTaskId}/provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    });
    expect(provider.status).toBe(200);

    const florinCookie = await cookieForPersonName(runtime, "Florin CNC");
    const body = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, florinCookie)),
    );
    const tasks = inboxTasks(body.inbox as JsonObject);
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((task) => task.jobId === assemblyJobId)).toBe(true);
    expect(tasks.some((task) => task.taskId === backCncTaskId)).toBe(true);
  });
});
