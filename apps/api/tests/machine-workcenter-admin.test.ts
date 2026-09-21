import { afterEach, describe, expect, it } from "vitest";
import { providersForCapability } from "@workos-final/domain";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import { loadOrganizationProviderRegistry } from "../src/workcenters/organizationProviderStore.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("machine workcenter admin api", () => {
  it("lets an owner create, activate, and retire isolated providers with server ids", async () => {
    const fixture = createCloudFixture();
    try {
      const orgA = await addOrganization(fixture, "Org A", "NEW_ORGANIZATION");
      const orgB = await addOrganization(fixture, "Org B", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner-a@providers.test",
        password: OWNER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "member-a@providers.test",
        password: MEMBER_PASSWORD,
        organizationId: orgA.organization.organizationId,
        role: "member",
      });
      await addUser(fixture, {
        email: "owner-b@providers.test",
        password: OWNER_PASSWORD,
        organizationId: orgB.organization.organizationId,
        role: "owner",
      });
      const ownerA = await loginCloud(
        fixture.app,
        "owner-a@providers.test",
        OWNER_PASSWORD,
        orgA.organization.organizationId,
      );
      const memberA = await loginCloud(
        fixture.app,
        "member-a@providers.test",
        MEMBER_PASSWORD,
        orgA.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app,
        "owner-b@providers.test",
        OWNER_PASSWORD,
        orgB.organization.organizationId,
      );
      const ownerHeaders = { cookie: ownerA.cookie ?? "" };
      const memberHeaders = { cookie: memberA.cookie ?? "" };
      const ownerBHeaders = { cookie: ownerB.cookie ?? "" };

      const empty = await readBody(
        await fixture.app.request("/api/workcenters", { headers: ownerHeaders }),
      );
      expect(empty.canEdit).toBe(true);
      expect(empty.workcenters).toEqual([]);
      expect(empty.machines).toEqual([]);

      const memberEmpty = await readBody(
        await fixture.app.request("/api/workcenters", { headers: memberHeaders }),
      );
      expect(memberEmpty.canEdit).toBe(false);
      expect(memberEmpty.workcenters).toEqual([]);

      const createdWorkcenter = await fixture.app.request("/api/workcenters", {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ label: "Zonă CNC", description: "Zonă de debitare" }),
      });
      expect(createdWorkcenter.status).toBe(201);
      const workcenterBody = await readBody(createdWorkcenter);
      const workcenter = workcenterBody.workcenter as JsonObject;
      expect(String(workcenter.id).startsWith("wc:")).toBe(true);
      expect(workcenter.lifecycle).toBe("PLANNED");

      const createdMachine = await fixture.app.request("/api/machines", {
        method: "POST",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({
          label: "Router CNC",
          workcenterId: workcenter.id,
          capabilityIds: ["CNC_ROUTING"],
        }),
      });
      expect(createdMachine.status).toBe(201);
      const machine = (await readBody(createdMachine)).machine as JsonObject;
      expect(String(machine.id).startsWith("mch:")).toBe(true);

      const memberCreate = await fixture.app.request("/api/workcenters", {
        method: "POST",
        headers: { "content-type": "application/json", ...memberHeaders },
        body: JSON.stringify({ label: "Secret" }),
      });
      expect(memberCreate.status).toBe(403);

      const memberPatch = await fixture.app.request(`/api/machines/${machine.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...memberHeaders },
        body: JSON.stringify({ label: "Secret" }),
      });
      expect(memberPatch.status).toBe(403);

      const isolated = await readBody(
        await fixture.app.request("/api/workcenters", { headers: ownerBHeaders }),
      );
      expect(isolated.workcenters).toEqual([]);
      expect(isolated.machines).toEqual([]);

      expect(
        (
          await fixture.app.request("/api/workcenters", {
            method: "POST",
            headers: { "content-type": "application/json", ...ownerHeaders },
            body: JSON.stringify({ label: "Zonă", capabilityIds: ["NOT_A_CAPABILITY"] }),
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await fixture.app.request("/api/workcenters/wc:missing", {
            method: "PATCH",
            headers: { "content-type": "application/json", ...ownerHeaders },
            body: JSON.stringify({ label: "Zonă" }),
          })
        ).status,
      ).toBe(404);

      await fixture.app.request(`/api/workcenters/${workcenter.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ lifecycle: "ACTIVE" }),
      });
      await fixture.app.request(`/api/machines/${machine.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ lifecycle: "ACTIVE" }),
      });

      fixture.registry.evict(orgA.organization.organizationId);
      const db = openSqliteDatabase(orgA.paths.sqlitePath);
      const live = providersForCapability(
        "CNC_ROUTING",
        loadOrganizationProviderRegistry(db),
      )
        .filter((item) => item.lifecycle === "ACTIVE")
        .map((item) => item.id);
      expect(live).toEqual([machine.id]);
      db.close();

      const covered = await readBody(
        await fixture.app.request("/api/workcenters", { headers: ownerHeaders }),
      );
      const cnc = (
        covered.capabilities as Array<{
          id: string;
          coverage: string;
          providers: Array<{ id: string; label: string }>;
        }>
      ).find((item) => item.id === "CNC_ROUTING");
      expect(cnc?.coverage).toBe("COVERED");
      expect(cnc?.providers.map((item) => item.id)).toContain(machine.id);

      const unused = await readBody(
        await fixture.app.request("/api/machines", {
          method: "POST",
          headers: { "content-type": "application/json", ...ownerHeaders },
          body: JSON.stringify({
            label: "Router de rezervă",
            workcenterId: workcenter.id,
            capabilityIds: ["LASER_CUTTING"],
          }),
        }),
      );
      const unusedMachine = unused.machine as JsonObject;
      const retired = await fixture.app.request(`/api/machines/${unusedMachine.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", ...ownerHeaders },
        body: JSON.stringify({ status: "RETIRED" }),
      });
      expect(retired.status).toBe(200);
      const afterRetire = await readBody(
        await fixture.app.request("/api/workcenters", { headers: ownerHeaders }),
      );
      const retiredRow = (afterRetire.machines as Array<JsonObject>).find(
        (item) => item.id === unusedMachine.id,
      );
      expect(retiredRow?.lifecycle).toBe("RETIRED");
      const laser = (
        afterRetire.capabilities as Array<{ id: string; coverage: string }>
      ).find((item) => item.id === "LASER_CUTTING");
      expect(laser?.coverage).toBe("NO_PROVIDER");
    } finally {
      fixture.close();
    }
  });

  it("returns 409 for history and child-machine conflicts", async () => {
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Org history", "NEW_ORGANIZATION");
      await addUser(fixture, {
        email: "owner-history@providers.test",
        password: OWNER_PASSWORD,
        organizationId: org.organization.organizationId,
        role: "owner",
      });
      const owner = await loginCloud(
        fixture.app,
        "owner-history@providers.test",
        OWNER_PASSWORD,
        org.organization.organizationId,
      );
      const headers = {
        "content-type": "application/json",
        cookie: owner.cookie ?? "",
      };
      const workcenter = (
        await readBody(
          await fixture.app.request("/api/workcenters", {
            method: "POST",
            headers,
            body: JSON.stringify({ label: "Zonă CNC", lifecycle: "ACTIVE" }),
          }),
        )
      ).workcenter as JsonObject;
      const other = (
        await readBody(
          await fixture.app.request("/api/workcenters", {
            method: "POST",
            headers,
            body: JSON.stringify({ label: "Zonă print", lifecycle: "ACTIVE" }),
          }),
        )
      ).workcenter as JsonObject;
      const machine = (
        await readBody(
          await fixture.app.request("/api/machines", {
            method: "POST",
            headers,
            body: JSON.stringify({
              label: "Router CNC",
              workcenterId: workcenter.id,
              lifecycle: "ACTIVE",
              capabilityIds: ["CNC_ROUTING"],
            }),
          }),
        )
      ).machine as JsonObject;

      fixture.registry.evict(org.organization.organizationId);
      const db = openSqliteDatabase(org.paths.sqlitePath);
      db.prepare(
        `
        INSERT INTO execution_plans (
          plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
          inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        "plan-1",
        "snap-1",
        "hash",
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
      db.prepare(
        `
        INSERT INTO execution_tasks (
          task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
          seq, seq_label, required_capability_id, required_capability_label, status, created_at,
          quantities_json, resources_json, assigned_provider_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        "task-1",
        "plan-1",
        "op-1",
        "CUT_SHEET_CNC",
        "Debitare",
        "FACE",
        "Față",
        1,
        "1",
        "CNC_ROUTING",
        "Debitare CNC",
        "IN_PROGRESS",
        "2026-09-21T00:00:00.000Z",
        "[]",
        "[]",
        machine.id,
      );
      db.close();

      expect(
        (
          await fixture.app.request(`/api/machines/${machine.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ capabilityIds: ["LASER_CUTTING"] }),
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.app.request(`/api/machines/${machine.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ workcenterId: other.id }),
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.app.request(`/api/machines/${machine.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "RETIRED" }),
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.app.request(`/api/workcenters/${workcenter.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "RETIRED" }),
          })
        ).status,
      ).toBe(409);
    } finally {
      fixture.close();
    }
  });
});
