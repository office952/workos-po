import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { OPERATOR_SESSION_COOKIE } from "../src/operator/store.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  sessionCookieViaHttp,
  setPinViaHttp,
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

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function createIsolatedApp() {
  const dir = mkdtempSync(join(tmpdir(), "workos-operator-session-"));
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

async function createBackCncTask(app: ReturnType<typeof createApp>) {
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
  return view.tasks.find(
    (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Spate",
  ) as JsonObject;
}

describe("operator identity HTTP session", () => {
  it("sets a PIN, identifies, resolves the session, and revokes it on PIN reset", async () => {
    const { app, runtime } = createIsolatedApp();
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    expect(florin).toBeTruthy();
    if (!florin) {
      return;
    }

    const firstPin = "246810";
    const configured = await app.request(
      `/api/people/${encodeURIComponent(florin.personId)}/operator-pin`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: firstPin, confirmPin: firstPin }),
      },
    );
    const configuredBody = await readBody(configured);
    expect(configured.status).toBe(200);
    expect(configuredBody).toEqual({ configured: true, personId: florin.personId });
    expect(JSON.stringify(configuredBody)).not.toContain(firstPin);

    const identified = await app.request("/api/operator-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: florin.personId, pin: firstPin }),
    });
    const identifiedBody = await readBody(identified);
    const setCookie = identified.headers.get("set-cookie") ?? "";
    const rawCookie = setCookie.split(";")[0] ?? "";
    expect(identified.status).toBe(200);
    expect(setCookie).toContain(`${OPERATOR_SESSION_COOKIE}=`);
    expect(setCookie.toLowerCase()).toContain("httponly");
    expect(JSON.stringify(identifiedBody)).not.toContain(firstPin);
    expect(JSON.stringify(identifiedBody)).not.toContain(OPERATOR_SESSION_COOKIE);

    const current = await app.request(
      "/api/operator-session",
      withCookie(undefined, rawCookie),
    );
    expect(current.status).toBe(200);
    expect(await readBody(current)).toMatchObject({
      operator: { personId: florin.personId, displayName: "Florin CNC" },
    });

    const secondPin = "135791";
    await setPinViaHttp(app, florin.personId, secondPin);
    const revoked = await app.request(
      "/api/operator-session",
      withCookie(undefined, rawCookie),
    );
    expect(revoked.status).toBe(200);
    expect(await readBody(revoked)).toEqual({ operator: null, session: null });

    const oldPin = await app.request("/api/operator-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: florin.personId, pin: firstPin }),
    });
    expect(oldPin.status).toBe(400);
    expect((await readBody(oldPin)).error).toBe("invalid_pin");

    const newCookie = await sessionCookieViaHttp(app, florin.personId, secondPin);
    expect(newCookie).toContain(`${OPERATOR_SESSION_COOKIE}=`);
    await app.request(`/api/people/${encodeURIComponent(florin.personId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "RETIRED" }),
    });
    const retiredIdentify = await app.request("/api/operator-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: florin.personId, pin: secondPin }),
    });
    expect(retiredIdentify.status).toBe(409);
    expect((await readBody(retiredIdentify)).error).toBe("retired_person");
  });

  it("leaves the executor empty for failed claim-and-start attempts", async () => {
    const { app, runtime } = createIsolatedApp();
    const florin = runtime.listPeople().find((person) => person.displayName === "Florin CNC");
    const andrei = runtime.listPeople().find((person) => person.displayName === "Andrei Goghi");
    const cncSkill = runtime.listSkills().find((skill) => skill.code === "SK_CNC_OPERATOR");
    expect(florin && andrei && cncSkill).toBeTruthy();
    if (!florin || !andrei || !cncSkill) {
      return;
    }
    const task = await createBackCncTask(app);
    const taskId = String(task.taskId);
    const florinCookie = await sessionCookieViaHttp(app, florin.personId);
    const andreiCookie = await sessionCookieViaHttp(app, andrei.personId, "135791");

    const assertExecutorEmpty = () => {
      const record = runtime.readExecutionPlanByTaskId(taskId);
      expect(record?.tasks.find((item) => item.taskId === taskId)?.assignedExecutor).toBeNull();
    };

    const invalidSession = await app.request(`/api/execution-tasks/${taskId}/start`, {
      method: "POST",
    });
    expect(invalidSession.status).toBe(401);
    expect((await readBody(invalidSession)).error).toBe("invalid_session");
    assertExecutorEmpty();

    const missingProvider = await startTaskAs(app, taskId, florinCookie);
    expect(missingProvider.status).toBe(422);
    expect((await readBody(missingProvider)).error).toBe("missing_assignment");
    assertExecutorEmpty();

    expect(
      (
        await app.request(`/api/execution-tasks/${taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        })
      ).status,
    ).toBe(200);
    await app.request(`/api/people/${encodeURIComponent(florin.personId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        availability: "TEMPORARILY_UNAVAILABLE",
        unavailableReason: "Concediu",
      }),
    });
    const unavailable = await startTaskAs(app, taskId, florinCookie);
    expect(unavailable.status).toBe(422);
    expect((await readBody(unavailable)).error).toBe("unavailable_person");
    assertExecutorEmpty();

    expect(runtime.retirePersonSkill(andrei.personId, cncSkill.skillId).ok).toBe(true);
    const ineligible = await startTaskAs(app, taskId, andreiCookie);
    expect(ineligible.status).toBe(422);
    expect((await readBody(ineligible)).error).toBe("ineligible_executor");
    assertExecutorEmpty();
  });
});
