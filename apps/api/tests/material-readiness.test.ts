import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID, PLACE_LED_MODULES_ID } from "@workos-final/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
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
import { completeTaskAs, sessionCookieViaHttp, startTaskAs } from "./operator-test-helpers.js";

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

describe("material readiness authorization", () => {
  it("defaults to disabled, lets only the owner change mode, and keeps the mode in the active plane", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    const beta = await addOrganization(fixture, "Atelier Beta");
    await addUser(fixture, {
      email: "owner-a@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "owner-b@example.test",
      password: OWNER_PASSWORD,
      organizationId: beta.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-a@example.test",
      password: MEMBER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "member",
    });

    const ownerA = await loginCloud(fixture.app, "owner-a@example.test", OWNER_PASSWORD);
    const ownerB = await loginCloud(fixture.app, "owner-b@example.test", OWNER_PASSWORD);
    const memberA = await loginCloud(
      fixture.app,
      "member-a@example.test",
      MEMBER_PASSWORD,
      alpha.organization.organizationId,
    );
    expect(ownerA.response.status).toBe(200);
    expect(ownerB.response.status).toBe(200);
    expect(memberA.response.status).toBe(200);

    const initial = (await (
      await fixture.app.request("/api/admin/material-readiness", {
        headers: { cookie: ownerA.cookie ?? "" },
      })
    ).json()) as { mode: string; source: string; version: number };
    expect(initial).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT", version: 0 });

    const memberWrite = await fixture.app.request("/api/admin/material-readiness", {
      method: "POST",
      headers: {
        cookie: memberA.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "REQUIRED" }),
    });
    expect(memberWrite.status).toBe(403);

    const memberConfirm = await fixture.app.request("/api/execution-tasks/task:missing/material-readiness", {
      method: "POST",
      headers: {
        cookie: memberA.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ resourceId: "MAT-LED-MODULE", status: "AVAILABLE" }),
    });
    expect(memberConfirm.status).toBe(403);

    const ownerWrite = await fixture.app.request("/api/admin/material-readiness", {
      method: "POST",
      headers: {
        cookie: ownerA.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "REQUIRED" }),
    });
    expect(ownerWrite.status).toBe(200);
    expect(await ownerWrite.json()).toMatchObject({
      mode: "REQUIRED",
      source: "STORED",
      version: 1,
      alreadyApplied: false,
    });

    const otherPlane = (await (
      await fixture.app.request("/api/admin/material-readiness", {
        headers: { cookie: ownerB.cookie ?? "" },
      })
    ).json()) as { mode: string; source: string };
    expect(otherPlane).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT" });

    const ownerConfirm = await fixture.app.request("/api/execution-tasks/task:missing/material-readiness", {
      method: "POST",
      headers: {
        cookie: ownerA.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ resourceId: "MAT-LED-MODULE", status: "AVAILABLE" }),
    });
    expect(ownerConfirm.status).toBe(404);
  });
});

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function lightingReady(mode: "DISABLED" | "REQUIRED") {
  const app = createApp();
  const preview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values: readyValues }),
  });
  const reviewed = await readBody(preview);
  const accepted = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues, reviewId: reviewed.reviewId }),
    },
  );
  const snapshot = (await readBody(accepted)).snapshot as JsonObject;
  const created = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
    { method: "POST" },
  );
  const view = (await readBody(created)).executionPlan as { tasks: JsonObject[] };
  const backCnc = view.tasks.find(
    (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
  ) as JsonObject;
  const lighting = view.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID) as JsonObject;
  if (mode === "REQUIRED") {
    const saved = await app.request("/api/admin/material-readiness", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "REQUIRED" }),
    });
    expect(saved.status).toBe(200);
  }
  const personId = (await readBody(
    await app.request("/api/people", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Executor material" }),
    }),
  )).person as JsonObject;
  const cookie = await sessionCookieViaHttp(app, String(personId.personId));
  await app.request(`/api/execution-tasks/${backCnc.taskId}/provider`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
  });
  expect((await startTaskAs(app, String(backCnc.taskId), cookie)).status).toBe(200);
  expect(
    (
      await completeTaskAs(app, String(backCnc.taskId), cookie, {
        completedQuantity: 12.5,
      })
    ).status,
  ).toBe(200);
  return { app, lighting, cookie };
}

describe("material readiness start gate over HTTP", () => {
  it("lets a material task start while the organization mode is the code default", async () => {
    const { app, lighting, cookie } = await lightingReady("DISABLED");
    const mode = await readBody(await app.request("/api/admin/material-readiness"));
    expect(mode).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT" });
    const started = await startTaskAs(app, String(lighting.taskId), cookie);
    expect(started.status).toBe(200);
    const task = ((await readBody(started)).executionPlan as { tasks: JsonObject[] }).tasks.find(
      (item) => item.taskId === lighting.taskId,
    );
    expect(task?.materialParticipation).toBe("NOT_ADOPTED");
    expect(task?.materialBlockLabel).toBeNull();
  });

  it("blocks an unconfirmed material task, keeps it in the inbox, then starts after confirmation", async () => {
    const { app, lighting, cookie } = await lightingReady("REQUIRED");
    const blocked = await startTaskAs(app, String(lighting.taskId), cookie);
    expect(blocked.status).toBe(409);
    expect((await readBody(blocked)).error).toBe("material_not_ready");

    const plan = await readBody(await app.request(`/api/execution-plans/${lighting.executionPlanId}`));
    const task = (plan.executionPlan as { tasks: JsonObject[] }).tasks.find(
      (item) => item.taskId === lighting.taskId,
    );
    expect(plan.canConfirmMaterial).toBe(true);
    expect(task?.canClaimStart).toBe(false);
    expect(String(task?.materialBlockLabel)).toContain("Materialul nu este confirmat disponibil");
    const lines = task?.materialLines as JsonObject[];
    expect(lines.some((line) => line.resourceId === "MAT-LED-MODULE" && line.status === "UNKNOWN")).toBe(
      true,
    );

    const inbox = await readBody(
      await app.request("/api/operator-task-inbox", { headers: { cookie } }),
    );
    const blockedLane = (inbox.inbox as { blockedMaterial: JsonObject[] }).blockedMaterial;
    expect(blockedLane.some((item) => item.taskId === lighting.taskId)).toBe(true);
    expect(blockedLane.find((item) => item.taskId === lighting.taskId)?.canClaimStart).toBe(false);

    const confirmed = await app.request(
      `/api/execution-tasks/${lighting.taskId}/material-readiness`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resourceId: "MAT-LED-MODULE", status: "AVAILABLE" }),
      },
    );
    expect(confirmed.status).toBe(200);

    const started = await startTaskAs(app, String(lighting.taskId), cookie);
    expect(started.status).toBe(200);
    const completed = await completeTaskAs(app, String(lighting.taskId), cookie, {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: "MAT-LED-MODULE", actualQuantity: 127 }],
    });
    expect(completed.status).toBe(200);
    const inventory = await readBody(await app.request("/api/inventory"));
    expect(inventory.availabilityNote).toContain("nu este disponibilitate de producție");
    const led = (inventory.inventory as { items: JsonObject[] }).items.find(
      (item) => item.resourceId === "MAT-LED-MODULE",
    );
    expect(led?.balance).toBe(-127);
  });
});
