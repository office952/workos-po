import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, collectFinancialKeys, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  cookieForPersonName,
  sessionCookieViaHttp,
  startTaskAs,
  withCookie,
} from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function createIsolatedApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-operator-inbox-"));
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

async function createPlanWithInscription(
  app: ReturnType<typeof createApp>,
  inscription: string,
) {
  const compiled = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          "root.inscription": inscription,
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
      }),
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
  const view = created.executionPlan as {
    plan: { planId: string; inscription: string };
    tasks: Array<JsonObject>;
  };
  const backCnc = view.tasks.find(
    (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Spate",
  ) as JsonObject;
  return { planId: view.plan.planId, inscription: view.plan.inscription, backCnc };
}

async function assignProvider(app: ReturnType<typeof createApp>, taskId: string) {
  const response = await app.request(`/api/execution-tasks/${taskId}/provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
  });
  expect(response.status).toBe(200);
}

describe("GET /api/operator-task-inbox", () => {
  it("returns null inbox without an operator session", async () => {
    const { app } = createIsolatedApp();
    const response = await app.request("/api/operator-task-inbox");
    expect(response.status).toBe(200);
    const body = await readBody(response);
    expect(body).toEqual({ operator: null, inbox: null });
  });

  it("projects CNC-ready work across two jobs for Florin and not for Calin", async () => {
    const { app, runtime } = createIsolatedApp();
    const jobA = await createPlanWithInscription(app, "INBOX-A");
    const jobB = await createPlanWithInscription(app, "INBOX-B");
    await assignProvider(app, String(jobA.backCnc.taskId));
    await assignProvider(app, String(jobB.backCnc.taskId));

    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    const calin = runtime.listPeople().find((person) => person.displayName === "Calin Cimpean");
    expect(florin && calin).toBeTruthy();
    if (!florin || !calin) {
      return;
    }

    const florinCookie = await sessionCookieViaHttp(app, florin.personId);
    const florinInbox = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, florinCookie)),
    );
    const florinReady = (
      (florinInbox.inbox as JsonObject).availableReady as Array<JsonObject>
    ).map((item) => item.inscription);
    expect(florinReady.sort()).toEqual(["INBOX-A", "INBOX-B"]);
    expect((florinInbox.operator as JsonObject).displayName).toBe("Florin CNC");
    const inboxKeys = collectFinancialKeys(florinInbox);
    expect(inboxKeys.has("eicTotal")).toBe(false);
    expect(inboxKeys.has("grossPrice")).toBe(false);
    expect(inboxKeys.has("actualInternalCost")).toBe(false);

    const calinCookie = await sessionCookieViaHttp(app, calin.personId, "135791");
    const calinInbox = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, calinCookie)),
    );
    expect((calinInbox.inbox as JsonObject).availableReady).toEqual([]);
    expect(
      ((calinInbox.inbox as JsonObject).availableNeedsProvider as unknown[]).length,
    ).toBe(0);
  });

  it("moves a claimed task into inProgressMine and hides it from Andrei", async () => {
    const { app, runtime } = createIsolatedApp();
    const job = await createPlanWithInscription(app, "CLAIM-INBOX");
    await assignProvider(app, String(job.backCnc.taskId));

    const florinCookie = await cookieForPersonName(runtime, "Florin CNC");
    const started = await startTaskAs(app, String(job.backCnc.taskId), florinCookie);
    expect(started.status).toBe(200);

    const florinInbox = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, florinCookie)),
    );
    const mine = (florinInbox.inbox as JsonObject).inProgressMine as Array<JsonObject>;
    expect(mine.map((item) => item.inscription)).toEqual(["CLAIM-INBOX"]);
    expect(
      ((florinInbox.inbox as JsonObject).availableReady as Array<JsonObject>).find(
        (item) => item.inscription === "CLAIM-INBOX",
      ),
    ).toBeUndefined();

    const andreiCookie = await cookieForPersonName(runtime, "Andrei Goghi", "975310");
    const andreiInbox = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, andreiCookie)),
    );
    expect((andreiInbox.inbox as JsonObject).inProgressMine).toEqual([]);
    expect(
      ((andreiInbox.inbox as JsonObject).availableReady as Array<JsonObject>).find(
        (item) => item.inscription === "CLAIM-INBOX",
      ),
    ).toBeUndefined();
  });

  it("shows provider-needed CNC work as non-startable for Florin", async () => {
    const { app, runtime } = createIsolatedApp();
    await createPlanWithInscription(app, "NEED-PROV");
    const florinCookie = await cookieForPersonName(runtime, "Florin CNC");
    const body = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, florinCookie)),
    );
    const needs = (body.inbox as JsonObject).availableNeedsProvider as Array<JsonObject>;
    expect(needs.some((item) => item.inscription === "NEED-PROV")).toBe(true);
    expect(needs.every((item) => item.canClaimStart === false)).toBe(true);
    expect((body.inbox as JsonObject).availableReady).toEqual([]);
  });

  it("clears claimable lanes when Florin is temporarily unavailable", async () => {
    const { app, runtime } = createIsolatedApp();
    const job = await createPlanWithInscription(app, "AWAY-INBOX");
    await assignProvider(app, String(job.backCnc.taskId));
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const away = await app.request(`/api/people/${florin.personId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }),
    });
    expect(away.status).toBe(200);
    const florinCookie = await sessionCookieViaHttp(app, florin.personId);
    const body = await readBody(
      await app.request("/api/operator-task-inbox", withCookie(undefined, florinCookie)),
    );
    expect((body.inbox as JsonObject).availableReady).toEqual([]);
    expect((body.inbox as JsonObject).availableNeedsProvider).toEqual([]);
    expect((body.operator as JsonObject).availability).toBe("TEMPORARILY_UNAVAILABLE");
  });
});
