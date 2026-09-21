import { afterEach, describe, expect, it } from "vitest";
import {
  MCH_CNC_4020_ID,
  WC_ASSEMBLY_01_ID,
  WC_CNC_ROUTING_ID,
  providersForCapability,
  workcenterRegistry,
} from "@workos-final/domain";
import { ensureOperationalPlane } from "../src/cloud/provision.js";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import {
  hasOrganizationProviderOwnership,
  loadOrganizationProviderRegistry,
  readOrganizationProviderConfig,
} from "../src/workcenters/organizationProviderStore.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function machineIds(body: JsonObject): string[] {
  return ((body.machines as Array<{ id: string }> | undefined) ?? []).map((item) => item.id);
}

function coverageProviders(body: JsonObject, capabilityId: string): string[] {
  const capability = (
    (body.capabilities as Array<{
      id: string;
      coverage: string;
      providers: Array<{ id: string; label: string }>;
    }>) ?? []
  ).find((item) => item.id === capabilityId);
  return capability?.providers.map((item) => item.id) ?? [];
}

function historyFingerprint(
  db: ReturnType<typeof openSqliteDatabase>,
  planId: string,
  taskId: string,
) {
  return {
    plan: db
      .prepare(
        `
        SELECT plan_id, source_snapshot_id, source_snapshot_hash, product_code, status
        FROM execution_plans
        WHERE plan_id = ?
      `,
      )
      .get(planId),
    task: db
      .prepare(
        `
        SELECT task_id, plan_id, assigned_provider_id, status
        FROM execution_tasks
        WHERE task_id = ?
      `,
      )
      .get(taskId),
  };
}

describe("machine workcenter admin ADOPT_EXISTING authority", () => {
  it("materializes compatibility providers once and keeps admin, coverage, and execution on that registry", async () => {
    const fixture = createCloudFixture();
    try {
      const orgA = await addOrganization(fixture, "Org Adopt A", "ADOPT_EXISTING");
      const orgB = await addOrganization(fixture, "Org New B", "NEW_ORGANIZATION");
      ensureOperationalPlane(fixture.controlPlane, orgA.organization, orgA.plane);
      await addUser(fixture, {
        email: "owner-adopt@providers.test",
        password: OWNER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "owner-new@providers.test",
        password: OWNER_PASSWORD,
        organizationId: orgB.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app,
        "owner-adopt@providers.test",
        OWNER_PASSWORD,
        orgA.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app,
        "owner-new@providers.test",
        OWNER_PASSWORD,
        orgB.organization.organizationId,
      );
      const headersA = {
        "content-type": "application/json",
        cookie: ownerA.cookie ?? "",
      };
      const headersB = {
        "content-type": "application/json",
        cookie: ownerB.cookie ?? "",
      };

      const beforeOwnership = await readBody(
        await fixture.app.request("/api/workcenters", { headers: headersA }),
      );
      expect(machineIds(beforeOwnership)).toEqual(
        workcenterRegistry.machines.map((item) => item.id),
      );
      expect(machineIds(beforeOwnership)).toContain(MCH_CNC_4020_ID);
      expect(coverageProviders(beforeOwnership, "CNC_ROUTING")).toContain(MCH_CNC_4020_ID);

      fixture.registry.evict(orgA.organization.organizationId);
      const beforeDb = openSqliteDatabase(orgA.paths.sqlitePath);
      expect(hasOrganizationProviderOwnership(beforeDb)).toBe(false);
      expect(loadOrganizationProviderRegistry(beforeDb).machines).toEqual([]);
      beforeDb
        .prepare(
          `
          INSERT INTO execution_plans (
            plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
            inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          "plan-adopt-1",
          "snap-adopt-1",
          "hash-adopt-1",
          "PRD-TEST",
          "Test",
          "X",
          "2026-09-21T00:00:00.000Z",
          "PLANNED",
          1,
          1,
          0,
          "RON",
          "COMPLETE",
        );
      beforeDb
        .prepare(
          `
          INSERT INTO execution_tasks (
            task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
            seq, seq_label, required_capability_id, required_capability_label, status, created_at,
            quantities_json, resources_json, assigned_provider_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          "task-adopt-1",
          "plan-adopt-1",
          "op-1",
          "CUT_SHEET_CNC",
          "Debitare",
          "FACE",
          "Față",
          1,
          "1",
          "CNC_ROUTING",
          "Debitare CNC",
          "COMPLETED",
          "2026-09-21T00:00:00.000Z",
          "[]",
          "[]",
          MCH_CNC_4020_ID,
        );
      const beforeHistory = historyFingerprint(beforeDb, "plan-adopt-1", "task-adopt-1");
      expect(
        (beforeHistory.task as { assigned_provider_id: string }).assigned_provider_id,
      ).toBe(MCH_CNC_4020_ID);
      beforeDb.close();

      const edited = await fixture.app.request(`/api/machines/${MCH_CNC_4020_ID}`, {
        method: "PATCH",
        headers: headersA,
        body: JSON.stringify({ label: "CNC 4020 adoptat" }),
      });
      expect(edited.status).toBe(200);
      const editedBody = await readBody(edited);
      expect((editedBody.machine as JsonObject).id).toBe(MCH_CNC_4020_ID);
      expect((editedBody.machine as JsonObject).label).toBe("CNC 4020 adoptat");

      const afterEdit = await readBody(
        await fixture.app.request("/api/workcenters", { headers: headersA }),
      );
      const editedMachine = (afterEdit.machines as Array<JsonObject>).find(
        (item) => item.id === MCH_CNC_4020_ID,
      );
      expect(editedMachine?.label).toBe("CNC 4020 adoptat");
      expect(editedMachine?.workcenterId).toBe(WC_CNC_ROUTING_ID);
      expect(coverageProviders(afterEdit, "CNC_ROUTING")).toContain(MCH_CNC_4020_ID);

      fixture.registry.evict(orgA.organization.organizationId);
      const afterDb = openSqliteDatabase(orgA.paths.sqlitePath);
      expect(hasOrganizationProviderOwnership(afterDb)).toBe(true);
      expect(readOrganizationProviderConfig(afterDb)?.source).toBe("admin");
      const owned = loadOrganizationProviderRegistry(afterDb);
      expect([...owned.workcenters.map((item) => item.id)].sort()).toEqual(
        [...workcenterRegistry.workcenters.map((item) => item.id)].sort(),
      );
      expect([...owned.machines.map((item) => item.id)].sort()).toEqual(
        [...workcenterRegistry.machines.map((item) => item.id)].sort(),
      );
      expect(owned.getMachine(MCH_CNC_4020_ID)?.workcenterId).toBe(WC_CNC_ROUTING_ID);
      expect(owned.getMachine(MCH_CNC_4020_ID)?.capabilityIds).toEqual(["CNC_ROUTING"]);
      expect(owned.getMachine(MCH_CNC_4020_ID)?.lifecycle).toBe("ACTIVE");
      expect(owned.getMachine(MCH_CNC_4020_ID)?.label).toBe("CNC 4020 adoptat");
      expect(historyFingerprint(afterDb, "plan-adopt-1", "task-adopt-1")).toEqual(beforeHistory);
      expect(
        providersForCapability("CNC_ROUTING", owned)
          .filter((item) => item.lifecycle === "ACTIVE")
          .map((item) => item.id),
      ).toContain(MCH_CNC_4020_ID);
      afterDb.close();

      const liveRuntime = fixture.registry.getOrOpen(orgA.plane, fixture.cloudRoot);
      expect(liveRuntime.providerRegistry.getMachine(MCH_CNC_4020_ID)?.label).toBe(
        "CNC 4020 adoptat",
      );

      const created = await readBody(
        await fixture.app.request("/api/machines", {
          method: "POST",
          headers: headersA,
          body: JSON.stringify({
            label: "Router nou",
            workcenterId: WC_CNC_ROUTING_ID,
            capabilityIds: ["CNC_ROUTING"],
          }),
        }),
      );
      const createdMachine = created.machine as JsonObject;
      expect(String(createdMachine.id).startsWith("mch:")).toBe(true);
      const activated = await fixture.app.request(`/api/machines/${createdMachine.id}`, {
        method: "PATCH",
        headers: headersA,
        body: JSON.stringify({ lifecycle: "ACTIVE" }),
      });
      expect(activated.status).toBe(200);

      const afterCreate = await readBody(
        await fixture.app.request("/api/workcenters", { headers: headersA }),
      );
      expect(machineIds(afterCreate)).toContain(String(createdMachine.id));
      expect(coverageProviders(afterCreate, "CNC_ROUTING")).toEqual(
        expect.arrayContaining([MCH_CNC_4020_ID, String(createdMachine.id)]),
      );

      fixture.registry.evict(orgA.organization.organizationId);
      const eligibilityDb = openSqliteDatabase(orgA.paths.sqlitePath);
      expect(
        providersForCapability("CNC_ROUTING", loadOrganizationProviderRegistry(eligibilityDb))
          .filter((item) => item.lifecycle === "ACTIVE")
          .map((item) => item.id),
      ).toEqual(expect.arrayContaining([MCH_CNC_4020_ID, String(createdMachine.id)]));
      eligibilityDb.close();

      expect(
        (
          await fixture.app.request(`/api/machines/${MCH_CNC_4020_ID}`, {
            method: "PATCH",
            headers: headersA,
            body: JSON.stringify({ capabilityIds: ["LASER_CUTTING"] }),
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.app.request(`/api/machines/${MCH_CNC_4020_ID}`, {
            method: "PATCH",
            headers: headersA,
            body: JSON.stringify({ workcenterId: WC_ASSEMBLY_01_ID }),
          })
        ).status,
      ).toBe(409);

      fixture.registry.evict(orgA.organization.organizationId);
      const guardDb = openSqliteDatabase(orgA.paths.sqlitePath);
      guardDb
        .prepare(
          `
          INSERT INTO execution_plans (
            plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
            inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          "plan-adopt-2",
          "snap-adopt-2",
          "hash-adopt-2",
          "PRD-TEST",
          "Test",
          "X",
          "2026-09-21T00:00:00.000Z",
          "PLANNED",
          1,
          1,
          0,
          "RON",
          "COMPLETE",
        );
      guardDb
        .prepare(
          `
          INSERT INTO execution_tasks (
            task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
            seq, seq_label, required_capability_id, required_capability_label, status, created_at,
            quantities_json, resources_json, assigned_provider_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          "task-adopt-2",
          "plan-adopt-2",
          "op-2",
          "CUT_SHEET_CNC",
          "Debitare",
          "FACE",
          "Față",
          1,
          "1",
          "CNC_ROUTING",
          "Debitare CNC",
          "PLANNED",
          "2026-09-21T00:00:00.000Z",
          "[]",
          "[]",
          MCH_CNC_4020_ID,
        );
      guardDb.close();

      expect(
        (
          await fixture.app.request(`/api/machines/${MCH_CNC_4020_ID}`, {
            method: "PATCH",
            headers: headersA,
            body: JSON.stringify({ status: "RETIRED" }),
          })
        ).status,
      ).toBe(409);

      fixture.registry.evict(orgA.organization.organizationId);
      const progressDb = openSqliteDatabase(orgA.paths.sqlitePath);
      progressDb
        .prepare("UPDATE execution_tasks SET status = 'IN_PROGRESS' WHERE task_id = ?")
        .run("task-adopt-2");
      progressDb.close();
      expect(
        (
          await fixture.app.request(`/api/machines/${MCH_CNC_4020_ID}`, {
            method: "PATCH",
            headers: headersA,
            body: JSON.stringify({ status: "RETIRED" }),
          })
        ).status,
      ).toBe(409);

      fixture.registry.evict(orgA.organization.organizationId);
      const completeDb = openSqliteDatabase(orgA.paths.sqlitePath);
      completeDb
        .prepare("UPDATE execution_tasks SET status = 'COMPLETED' WHERE task_id = ?")
        .run("task-adopt-2");
      const afterGuards = historyFingerprint(completeDb, "plan-adopt-1", "task-adopt-1");
      completeDb.close();
      expect(afterGuards).toEqual(beforeHistory);

      const retired = await fixture.app.request(`/api/machines/${MCH_CNC_4020_ID}`, {
        method: "PATCH",
        headers: headersA,
        body: JSON.stringify({ status: "RETIRED" }),
      });
      expect(retired.status).toBe(200);

      const emptyB = await readBody(
        await fixture.app.request("/api/workcenters", { headers: headersB }),
      );
      expect(emptyB.workcenters).toEqual([]);
      expect(emptyB.machines).toEqual([]);

      const createdB = await readBody(
        await fixture.app.request("/api/workcenters", {
          method: "POST",
          headers: headersB,
          body: JSON.stringify({ label: "Zonă B" }),
        }),
      );
      const workcenterB = createdB.workcenter as JsonObject;
      expect(String(workcenterB.id).startsWith("wc:")).toBe(true);

      const afterB = await readBody(
        await fixture.app.request("/api/workcenters", { headers: headersA }),
      );
      expect(machineIds(afterB)).toContain(MCH_CNC_4020_ID);
      expect(machineIds(afterB)).not.toContain(String(workcenterB.id));
      expect(
        ((afterB.workcenters as Array<{ id: string }>) ?? []).map((item) => item.id),
      ).not.toContain(String(workcenterB.id));
    } finally {
      fixture.close();
    }
  });

  it("returns an internal error for unexpected persistence failures", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Org persist", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner-persist@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const owner = await loginCloud(
        fixture.app,
        "owner-persist@providers.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = {
        "content-type": "application/json",
        cookie: owner.cookie ?? "",
      };
      await fixture.app.request("/api/workcenters", { headers });
      fixture.registry.evict(org.organization.organizationId);
      const db = openSqliteDatabase(org.paths.sqlitePath);
      db.exec("DROP TABLE organization_provider_configuration");
      db.close();

      const response = await fixture.app.request("/api/workcenters", {
        method: "POST",
        headers,
        body: JSON.stringify({ label: "Zonă CNC" }),
      });
      expect(response.status).toBe(500);
      const body = await readBody(response);
      expect(body).toEqual({ error: "internal" });
      expect(JSON.stringify(body)).not.toMatch(/SQLITE|organization_provider|sql/i);
    } finally {
      fixture.close();
    }
  });
});
