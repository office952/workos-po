import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_PRODUCT_CODE, MCH_CNC_4020_ID } from "@workos-final/domain";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { insertExternalProductionProviderRow } from "../src/execution/externalProductionStore.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabaseWithoutMigrations,
} from "../src/persistence/sqlite.js";
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

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "HANDOFF",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

async function createPlan(app: ReturnType<typeof createApp>, inscription: string) {
  const values = { ...readyValues, "root.inscription": inscription };
  const preview = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values }),
    }),
  );
  const accepted = await readBody(
    await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, reviewId: preview.reviewId }),
    }),
  );
  const snapshot = accepted.snapshot as JsonObject;
  const created = await readBody(
    await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId}/execution-plan`,
      { method: "POST" },
    ),
  );
  const executionPlan = created.executionPlan as { plan: JsonObject; tasks: JsonObject[] };
  return executionPlan;
}

function dependencyLabel(task: JsonObject): string {
  return `${String(task.processLabel)} — ${String(task.scopeLabel)}`;
}

describe("external production authorization", () => {
  it("defaults to disabled, isolates organizations, and reserves writes for the owner", async () => {
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

    const initial = await readBody(
      await fixture.app.request("/api/admin/external-production", {
        headers: { cookie: ownerA.cookie ?? "" },
      }),
    );
    expect(initial).toMatchObject({
      mode: "DISABLED",
      source: "CODE_DEFAULT",
      version: 0,
      providers: [],
    });

    const memberMode = await fixture.app.request("/api/admin/external-production", {
      method: "POST",
      headers: { cookie: memberA.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ mode: "ENABLED" }),
    });
    expect(memberMode.status).toBe(403);
    const memberProvider = await fixture.app.request("/api/admin/external-production/providers", {
      method: "POST",
      headers: { cookie: memberA.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ name: "Membru" }),
    });
    expect(memberProvider.status).toBe(403);
    const memberExternalize = await fixture.app.request("/api/execution-tasks/task:missing/external", {
      method: "POST",
      headers: { cookie: memberA.cookie ?? "" },
    });
    expect(memberExternalize.status).toBe(403);

    const ownerMode = await fixture.app.request("/api/admin/external-production", {
      method: "POST",
      headers: { cookie: ownerA.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ mode: "ENABLED" }),
    });
    expect(ownerMode.status).toBe(200);
    const created = await fixture.app.request("/api/admin/external-production/providers", {
      method: "POST",
      headers: { cookie: ownerA.cookie ?? "", "content-type": "application/json" },
      body: JSON.stringify({ name: "Atelier Alpha Extern" }),
    });
    expect(created.status).toBe(201);

    const otherPlane = await readBody(
      await fixture.app.request("/api/admin/external-production", {
        headers: { cookie: ownerB.cookie ?? "" },
      }),
    );
    expect(otherPlane).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT", providers: [] });
  });
});

describe("external production lifecycle over HTTP", () => {
  it("hands a ready task outside and returns it without internal work or inventory movement", async () => {
    const app = createApp();
    const disabled = await readBody(await app.request("/api/admin/external-production"));
    expect(disabled).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT" });

    const internalPlan = await createPlan(app, "HANDOFF-INTERNAL");
    const internalTask = internalPlan.tasks.find(
      (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Spate",
    );
    if (!internalTask) {
      throw new Error("missing internal task");
    }
    const person = (await readBody(
      await app.request("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Executor intern" }),
      }),
    )).person as JsonObject;
    const cookie = await sessionCookieViaHttp(app, String(person.personId));
    expect(
      (
        await app.request(`/api/execution-tasks/${internalTask.taskId}/provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId: MCH_CNC_4020_ID }),
        })
      ).status,
    ).toBe(200);
    expect((await startTaskAs(app, String(internalTask.taskId), cookie)).status).toBe(200);

    const enabled = await app.request("/api/admin/external-production", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "ENABLED" }),
    });
    expect(enabled.status).toBe(200);
    const created = await readBody(
      await app.request("/api/admin/external-production/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Atelier Extern" }),
      }),
    );
    const providerId = String((created.provider as JsonObject).providerId);

    const externalPlan = await createPlan(app, "HANDOFF-EXTERNAL");
    const externalTask = externalPlan.tasks.find(
      (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Spate",
    );
    if (!externalTask) {
      throw new Error("missing external task");
    }
    const blockedByModeWouldBeLater = externalPlan.tasks.find((task) =>
      Array.isArray(task.waitingFor) && task.waitingFor.includes(dependencyLabel(externalTask)),
    );
    const inventoryBefore = JSON.stringify(await readBody(await app.request("/api/inventory")));

    const markedResponse = await app.request(`/api/execution-tasks/${externalTask.taskId}/external`, {
      method: "POST",
    });
    const marked = await readBody(markedResponse);
    expect(markedResponse.status, JSON.stringify(marked)).toBe(200);
    const markedTask = (marked.executionPlan as { tasks: JsonObject[] }).tasks.find(
      (task) => task.taskId === externalTask.taskId,
    );
    expect(markedTask).toMatchObject({
      executionMode: "EXTERNAL",
      status: "PLANNED",
      canHandOffExternal: false,
    });
    expect((await startTaskAs(app, String(externalTask.taskId), cookie)).status).toBe(409);

    const assigned = await app.request(`/api/execution-tasks/${externalTask.taskId}/external-provider`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId }),
    });
    expect(assigned.status).toBe(200);
    const handed = await readBody(
      await app.request(`/api/execution-tasks/${externalTask.taskId}/hand-off`, { method: "POST" }),
    );
    const outside = (handed.executionPlan as { tasks: JsonObject[] }).tasks.find(
      (task) => task.taskId === externalTask.taskId,
    );
    expect(outside).toMatchObject({
      status: "OUTSIDE",
      statusLabel: "La furnizor extern",
      externalProviderLabel: "Atelier Extern",
      canClaimStart: false,
      canComplete: false,
      canStartMachineRun: false,
    });
    expect(outside?.startedByLabel ?? null).toBeNull();
    expect(outside?.machineRuns).toEqual([]);
    expect(outside?.actualConsumption).toEqual([]);

    const inbox = await readBody(
      await app.request("/api/operator-task-inbox", { headers: { cookie } }),
    );
    expect(JSON.stringify(inbox)).not.toContain(String(externalTask.taskId));
    const workload = await readBody(await app.request("/api/planning/workload"));
    expect(JSON.stringify(workload)).not.toContain(String(externalTask.taskId));
    if (blockedByModeWouldBeLater) {
      const successor = (handed.executionPlan as { tasks: JsonObject[] }).tasks.find(
        (task) => task.taskId === blockedByModeWouldBeLater.taskId,
      );
      expect(successor?.waitingFor).toContain(dependencyLabel(externalTask));
      expect(successor?.canClaimStart).toBe(false);
    }

    const returned = await readBody(
      await app.request(`/api/execution-tasks/${externalTask.taskId}/external-return`, {
        method: "POST",
      }),
    );
    const completed = (returned.executionPlan as { tasks: JsonObject[] }).tasks.find(
      (task) => task.taskId === externalTask.taskId,
    );
    expect(completed).toMatchObject({
      status: "COMPLETED",
      executionMode: "EXTERNAL",
      externalProviderLabel: "Atelier Extern",
    });
    expect(completed?.actualDurationMinutes ?? null).toBeNull();
    expect(JSON.stringify(await readBody(await app.request("/api/inventory")))).toBe(inventoryBefore);
  });

  it("rejects a case-variant provider name and keeps the original spelling", async () => {
    const app = createApp();
    expect(
      (
        await app.request("/api/admin/external-production", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "ENABLED" }),
        })
      ).status,
    ).toBe(200);
    const created = await app.request("/api/admin/external-production/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Atelier Extern" }),
    });
    expect(created.status).toBe(201);
    const duplicate = await app.request("/api/admin/external-production/providers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "atelier extern" }),
    });
    expect(duplicate.status).toBe(409);
    expect(await readBody(duplicate)).toEqual({ error: "duplicate_name" });
    const listed = await readBody(await app.request("/api/admin/external-production"));
    expect(listed.providers).toEqual([
      expect.objectContaining({ name: "Atelier Extern", active: true }),
    ]);
  });

  it("rejects an invalid combined provider update without persisting the rename", async () => {
    const app = createApp();
    const created = await readBody(
      await app.request("/api/admin/external-production/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Atelier Extern" }),
      }),
    );
    const providerId = String((created.provider as JsonObject).providerId);
    const rejected = await app.request(`/api/admin/external-production/providers/${providerId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Atelier Extern Nou", active: "invalid" }),
    });
    expect(rejected.status).toBe(400);
    expect(await readBody(rejected)).toEqual({ error: "invalid_payload" });
    const listed = await readBody(await app.request("/api/admin/external-production"));
    expect(listed.providers).toEqual([
      expect.objectContaining({
        providerId,
        name: "Atelier Extern",
        active: true,
      }),
    ]);
  });

  it("returns an existing outside task after the mode is disabled and blocks a new externalization", async () => {
    const app = createApp();
    expect(
      (
        await app.request("/api/admin/external-production", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "ENABLED" }),
        })
      ).status,
    ).toBe(200);
    const created = await readBody(
      await app.request("/api/admin/external-production/providers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Atelier Extern" }),
      }),
    );
    const providerId = String((created.provider as JsonObject).providerId);
    const externalPlan = await createPlan(app, "HANDOFF-DISABLE");
    const externalTask = externalPlan.tasks.find(
      (task) => task.processLabel === "Debitare foaie CNC" && task.scopeLabel === "Spate",
    );
    if (!externalTask) {
      throw new Error("missing external task");
    }
    expect(
      (await app.request(`/api/execution-tasks/${externalTask.taskId}/external`, { method: "POST" }))
        .status,
    ).toBe(200);
    expect(
      (
        await app.request(`/api/execution-tasks/${externalTask.taskId}/external-provider`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providerId }),
        })
      ).status,
    ).toBe(200);
    const handedResponse = await app.request(`/api/execution-tasks/${externalTask.taskId}/hand-off`, {
      method: "POST",
    });
    const handed = await readBody(handedResponse);
    expect(handedResponse.status).toBe(200);
    const handedPlan = handed.executionPlan as { progress: JsonObject; tasks: JsonObject[] };
    const outside = handedPlan.tasks.find((task) => task.taskId === externalTask.taskId);
    expect(outside).toMatchObject({ status: "OUTSIDE" });
    expect(handedPlan.progress.outside).toBeGreaterThan(0);
    expect(
      Number(handedPlan.progress.planned) +
        Number(handedPlan.progress.inProgress) +
        Number(handedPlan.progress.outside) +
        Number(handedPlan.progress.completed),
    ).toBe(Number(handedPlan.progress.total));

    const disabled = await app.request("/api/admin/external-production", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "DISABLED" }),
    });
    expect(disabled.status).toBe(200);

    const freshPlan = await createPlan(app, "HANDOFF-STILL-INTERNAL");
    const freshTask = freshPlan.tasks.find((task) => task.status === "PLANNED");
    if (!freshTask) {
      throw new Error("missing fresh task");
    }
    const blocked = await app.request(`/api/execution-tasks/${freshTask.taskId}/external`, {
      method: "POST",
    });
    expect(blocked.status).toBe(409);
    expect(await readBody(blocked)).toMatchObject({ error: "external_production_disabled" });

    const returnedResponse = await app.request(
      `/api/execution-tasks/${externalTask.taskId}/external-return`,
      { method: "POST" },
    );
    const returned = await readBody(returnedResponse);
    expect(returnedResponse.status).toBe(200);
    const completed = (returned.executionPlan as { tasks: JsonObject[] }).tasks.find(
      (task) => task.taskId === externalTask.taskId,
    );
    expect(completed).toMatchObject({ status: "COMPLETED", executionMode: "EXTERNAL" });
  });
});

describe("external production migration", () => {
  it("keeps existing task statuses internal when the new columns are added", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-external-migration-"));
    const db = openSqliteDatabaseWithoutMigrations(join(dir, "plane.sqlite"));
    try {
      const prior = listOperationalMigrationFiles().filter(
        (file) => file !== "039_external_production_handoff.sql",
      );
      applySelectedMigrations(db, prior);
      db.prepare(
        `INSERT INTO execution_plans (
          plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
          inscription, created_at, status, schema_version, task_count, eic_total,
          eic_currency, eic_completeness
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "exp:old",
        "aps:old",
        "hash",
        "PRD",
        "Produs",
        "VECHI",
        "2026-09-01T00:00:00.000Z",
        "ACTIVE",
        1,
        3,
        0,
        "EUR",
        "COMPLETE",
      );
      const insert = db.prepare(
        `INSERT INTO execution_tasks (
          task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
          seq, seq_label, required_capability_id, required_capability_label, status, created_at,
          quantities_json, resources_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const [taskId, seq, status] of [
        ["task:planned", 1, "PLANNED"],
        ["task:progress", 2, "IN_PROGRESS"],
        ["task:done", 3, "COMPLETED"],
      ] as const) {
        insert.run(
          taskId,
          "exp:old",
          taskId,
          "proc",
          "Proces",
          "BACK",
          "Spate",
          seq,
          "0" + seq,
          "cap",
          "Capacitate",
          status,
          "2026-09-01T00:00:00.000Z",
          "[]",
          "[]",
        );
      }
      applySelectedMigrations(db, ["039_external_production_handoff.sql"]);
      const rows = db
        .prepare(
          "SELECT status, execution_mode FROM execution_tasks ORDER BY seq",
        )
        .all() as Array<{ status: string; execution_mode: string }>;
      expect(rows).toEqual([
        { status: "PLANNED", execution_mode: "INTERNAL" },
        { status: "IN_PROGRESS", execution_mode: "INTERNAL" },
        { status: "COMPLETED", execution_mode: "INTERNAL" },
      ]);
      const modes = db.prepare("SELECT COUNT(*) AS count FROM external_production_handoff_modes").get() as {
        count: number;
      };
      const providers = db.prepare("SELECT COUNT(*) AS count FROM external_production_providers").get() as {
        count: number;
      };
      expect(modes.count).toBe(0);
      expect(providers.count).toBe(0);
      const first = insertExternalProductionProviderRow(db, {
        providerId: "xprov:1",
        name: "Atelier Extern",
        active: true,
        createdAt: "2026-09-26T10:00:00.000Z",
        createdBy: "owner",
      });
      const collided = insertExternalProductionProviderRow(db, {
        providerId: "xprov:2",
        name: "ATELIER EXTERN",
        active: true,
        createdAt: "2026-09-26T10:00:00.000Z",
        createdBy: "owner",
      });
      expect(first).toEqual({ ok: true });
      expect(collided).toEqual({ ok: false, error: "duplicate_name" });
      expect(
        db.prepare("SELECT name, name_key FROM external_production_providers").all(),
      ).toEqual([{ name: "Atelier Extern", name_key: "atelier extern" }]);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
