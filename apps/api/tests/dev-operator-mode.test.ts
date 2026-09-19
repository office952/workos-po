import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import {
  assertDevOperatorConfigSafe,
  isDevOperatorModeEnabled,
} from "../src/operator/devMode.js";
import { OPERATOR_SESSION_COOKIE } from "../src/operator/store.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  completeTaskAs,
  startTaskAs,
  withCookie,
} from "./operator-test-helpers.js";

type JsonObject = Record<string, unknown>;

const readyValues = {
  "root.inscription": "DEV-OP",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function createIsolatedRuntime() {
  const dir = mkdtempSync(join(tmpdir(), "workos-dev-operator-"));
  const runtime = createProductSystemRuntime(join(dir, "product-system.sqlite"));
  runtime.materializeTrustedWorkforce();
  cleanups.push(() => {
    runtime.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return runtime;
}

function createIsolatedApp(env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "test" }) {
  const runtime = createIsolatedRuntime();
  return { app: createApp({ productSystem: runtime, env }), runtime, env };
}

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function cookieFrom(response: Response): string {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${OPERATOR_SESSION_COOKIE}=([^;]+)`));
  if (!match) {
    throw new Error("missing_session_cookie");
  }
  return `${OPERATOR_SESSION_COOKIE}=${match[1]}`;
}

async function createReadyBackCnc(app: ReturnType<typeof createApp>) {
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
    (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Spate",
  ) as JsonObject;
  const assigned = await app.request(
    `/api/execution-tasks/${encodeURIComponent(String(backCnc.taskId))}/provider`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
    },
  );
  expect(assigned.status).toBe(200);
  return backCnc;
}

describe("dev operator mode gates", () => {
  it("is disabled when bypass is OFF", () => {
    expect(
      isDevOperatorModeEnabled({
        NODE_ENV: "test",
        WORKOS_DEV_OPERATOR_BYPASS: "0",
        WORKOS_DEV_OPERATOR_PERSON_ID: "per:x",
      }),
    ).toBe(false);
  });

  it("fails fast when production runtime requests bypass", () => {
    expect(() =>
      assertDevOperatorConfigSafe({
        NODE_ENV: "production",
        WORKOS_DEV_OPERATOR_BYPASS: "1",
      }),
    ).toThrow(/forbidden when NODE_ENV=production/);
  });

  it("refuses createApp in production with bypass flag", () => {
    const runtime = createIsolatedRuntime();
    expect(() =>
      createApp({
        productSystem: runtime,
        env: {
          NODE_ENV: "production",
          WORKOS_DEV_OPERATOR_BYPASS: "1",
          WORKOS_DEV_OPERATOR_PERSON_ID: "per:x",
        },
      }),
    ).toThrow(/forbidden when NODE_ENV=production/);
  });
});

describe("POST /api/dev/operator-session", () => {
  it("returns 404 when bypass is OFF", async () => {
    const { app } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "0",
      WORKOS_DEV_OPERATOR_PERSON_ID: "per:legacy:florin-cnc",
    });
    const response = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(response.status).toBe(404);
    const body = await readBody(response);
    expect(body.error).toBe("not_found");
    expect(JSON.stringify(body)).not.toMatch(/pin|token|246810/i);
  });

  it("creates a real OperatorSession for a configured ACTIVE person", async () => {
    const { app, runtime } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "1",
      WORKOS_DEV_OPERATOR_PERSON_ID: "per:legacy:florin-cnc",
    });
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(florin?.personId).toBe("per:legacy:florin-cnc");

    const created = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(created.status).toBe(200);
    const body = await readBody(created);
    expect((body.operator as JsonObject).displayName).toBe("Florin CNC");
    expect((body.operator as JsonObject).personId).toBe("per:legacy:florin-cnc");
    expect(body).not.toHaveProperty("rawToken");
    expect(JSON.stringify(body)).not.toMatch(/pin_hash|token_hash|246810/i);

    const cookie = cookieFrom(created);
    const session = await readBody(
      await app.request("/api/operator-session", withCookie(undefined, cookie)),
    );
    expect((session.operator as JsonObject).displayName).toBe("Florin CNC");
  });

  it("rejects unknown personId", async () => {
    const { app } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "1",
      WORKOS_DEV_OPERATOR_PERSON_ID: "per:does-not-exist",
    });
    const response = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(response.status).toBe(404);
    expect((await readBody(response)).error).toBe("unknown_person");
  });

  it("rejects missing person configuration", async () => {
    const { app } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "1",
      WORKOS_DEV_OPERATOR_PERSON_ID: "",
    });
    const response = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(response.status).toBe(400);
    expect((await readBody(response)).error).toBe("dev_operator_person_missing");
  });

  it("rejects RETIRED person", async () => {
    const { app, runtime } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "1",
      WORKOS_DEV_OPERATOR_PERSON_ID: "per:legacy:florin-cnc",
    });
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const retired = runtime.retirePerson(florin.personId);
    expect(retired.ok).toBe(true);

    const response = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(response.status).toBe(409);
    expect((await readBody(response)).error).toBe("retired_person");
  });

  it("allows TEMPORARILY_UNAVAILABLE session but Claim-on-Start still blocks", async () => {
    const { app, runtime } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "1",
      WORKOS_DEV_OPERATOR_PERSON_ID: "per:legacy:florin-cnc",
    });
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }
    const away = await app.request(`/api/people/${encodeURIComponent(florin.personId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Dev leave",
      }),
    });
    expect(away.status).toBe(200);

    const created = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(created.status).toBe(200);
    expect(((await readBody(created)).operator as JsonObject).availability).toBe(
      "TEMPORARILY_UNAVAILABLE",
    );

    const backCnc = await createReadyBackCnc(app);
    const cookie = cookieFrom(created);
    const started = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(started.status).toBe(422);
    expect((await readBody(started)).error).toBe("unavailable_person");
  });

  it("uses the DEV session through normal Start and Complete", async () => {
    const { app } = createIsolatedApp({
      ...process.env,
      NODE_ENV: "test",
      WORKOS_DEV_OPERATOR_BYPASS: "1",
      WORKOS_DEV_OPERATOR_PERSON_ID: "per:legacy:florin-cnc",
    });
    const created = await app.request("/api/dev/operator-session", { method: "POST" });
    expect(created.status).toBe(200);
    const cookie = cookieFrom(created);
    const backCnc = await createReadyBackCnc(app);

    const started = await startTaskAs(app, String(backCnc.taskId), cookie);
    expect(started.status).toBe(200);
    const startedBody = await readBody(started);
    const plan = startedBody.executionPlan as {
      tasks: Array<JsonObject>;
    };
    const task = plan.tasks.find((item) => item.taskId === backCnc.taskId) as JsonObject;
    expect((task.assignedExecutor as JsonObject).label).toBe("Florin CNC");
    expect(task.status).toBe("IN_PROGRESS");

    const completed = await completeTaskAs(app, String(backCnc.taskId), cookie, {
      completedQuantity: 12.5,
    });
    expect(completed.status).toBe(200);
  });
});
