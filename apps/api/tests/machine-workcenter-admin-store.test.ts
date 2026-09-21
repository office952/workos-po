import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { providersForCapability } from "@workos-final/domain";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  persistCreatedWorkcenter,
  persistUpdatedMachine,
  persistUpdatedWorkcenter,
  readOrganizationProviderConfig,
} from "../src/workcenters/organizationProviderStore.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-providers-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

function openEmptyRuntime() {
  return createProductSystemRuntime(tempSqlitePath(), {
    bootstrapPolicy: "NEW_ORGANIZATION",
  });
}

describe("machine workcenter admin store", () => {
  it("creates server ids, refreshes the admin configuration hash, and treats no-ops as idempotent", () => {
    const runtime = openEmptyRuntime();
    try {
      expect(runtime.providerRegistry.workcenters).toEqual([]);
      const created = runtime.createWorkcenter({ label: "Zonă CNC" });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      expect(created.value.id.startsWith("wc:")).toBe(true);
      expect(created.value.lifecycle).toBe("PLANNED");

      const machine = runtime.createMachine({
        label: "Router CNC",
        workcenterId: created.value.id,
        capabilityIds: ["CNC_ROUTING"],
      });
      expect(machine.ok).toBe(true);
      if (!machine.ok) {
        return;
      }
      expect(machine.value.id.startsWith("mch:")).toBe(true);

      const db = openSqliteDatabase(runtime.sqlitePath);
      const first = readOrganizationProviderConfig(db);
      expect(first?.source).toBe("admin");
      expect(first?.contentHash).toMatch(/^[a-f0-9]{64}$/);

      const again = persistCreatedWorkcenter(db, { label: "Zonă CNC 2" });
      expect(again.ok).toBe(true);
      const second = readOrganizationProviderConfig(db);
      expect(second?.contentHash).not.toBe(first?.contentHash);
      expect(second?.source).toBe("admin");

      const noop = persistUpdatedWorkcenter(db, created.value.id, {
        label: created.value.label,
        description: created.value.description,
        lifecycle: created.value.lifecycle,
        capabilityIds: [...created.value.capabilityIds],
      });
      expect(noop).toMatchObject({ ok: true, alreadyApplied: true });
      const afterNoop = readOrganizationProviderConfig(db);
      expect(afterNoop?.contentHash).toBe(second?.contentHash);
      expect(afterNoop?.appliedAt).toBe(second?.appliedAt);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("rejects an invalid capability and keeps planned machines out of live eligibility", () => {
    const runtime = openEmptyRuntime();
    try {
      const workcenter = runtime.createWorkcenter({
        label: "Zonă CNC",
        lifecycle: "ACTIVE",
      });
      expect(workcenter.ok).toBe(true);
      if (!workcenter.ok) {
        return;
      }
      expect(
        runtime.createMachine({
          label: "Router",
          workcenterId: workcenter.value.id,
          capabilityIds: ["NOT_A_CAPABILITY"],
        }),
      ).toEqual({ ok: false, error: "invalid_capability" });
      expect(
        runtime.createMachine({
          label: "Router",
          workcenterId: "wc:missing",
          capabilityIds: ["CNC_ROUTING"],
        }),
      ).toEqual({ ok: false, error: "invalid_workcenter" });

      const planned = runtime.createMachine({
        label: "Router CNC",
        workcenterId: workcenter.value.id,
        capabilityIds: ["CNC_ROUTING"],
      });
      expect(planned.ok).toBe(true);
      if (!planned.ok) {
        return;
      }
      expect(
        providersForCapability("CNC_ROUTING", runtime.providerRegistry).filter(
          (item) => item.lifecycle === "ACTIVE",
        ),
      ).toEqual([]);
      const activated = runtime.updateMachine(planned.value.id, { lifecycle: "ACTIVE" });
      expect(activated.ok).toBe(true);
      expect(
        providersForCapability("CNC_ROUTING", runtime.providerRegistry)
          .filter((item) => item.lifecycle === "ACTIVE")
          .map((item) => item.id),
      ).toEqual([planned.value.id]);
    } finally {
      runtime.close();
    }
  });

  it("blocks history-sensitive mutations and workcenter children, then allows completed-history retirement", () => {
    const runtime = openEmptyRuntime();
    try {
      const workcenter = runtime.createWorkcenter({
        label: "Zonă CNC",
        lifecycle: "ACTIVE",
      });
      const other = runtime.createWorkcenter({
        label: "Zonă print",
        lifecycle: "ACTIVE",
      });
      if (!workcenter.ok || !other.ok) {
        throw new Error("expected workcenters");
      }
      const machine = runtime.createMachine({
        label: "Router CNC",
        workcenterId: workcenter.value.id,
        lifecycle: "ACTIVE",
        capabilityIds: ["CNC_ROUTING"],
      });
      if (!machine.ok) {
        throw new Error("expected machine");
      }

      const db = openSqliteDatabase(runtime.sqlitePath);
      insertAssignedTask(db, machine.value.id, "PLANNED");
      expect(
        persistUpdatedMachine(db, machine.value.id, {
          capabilityIds: ["CNC_ROUTING", "LASER_CUTTING"],
        }),
      ).toEqual({ ok: false, error: "provider_referenced" });
      expect(
        persistUpdatedMachine(db, machine.value.id, { workcenterId: other.value.id }),
      ).toEqual({ ok: false, error: "provider_referenced" });
      expect(
        persistUpdatedMachine(db, machine.value.id, { lifecycle: "RETIRED" }),
      ).toEqual({ ok: false, error: "has_open_assignment" });
      expect(
        persistUpdatedWorkcenter(db, workcenter.value.id, { lifecycle: "RETIRED" }),
      ).toEqual({ ok: false, error: "has_active_machines" });

      db.prepare("UPDATE execution_tasks SET status = 'COMPLETED' WHERE assigned_provider_id = ?").run(
        machine.value.id,
      );
      const retiredMachine = persistUpdatedMachine(db, machine.value.id, { lifecycle: "RETIRED" });
      expect(retiredMachine.ok).toBe(true);
      const retiredWorkcenter = persistUpdatedWorkcenter(db, workcenter.value.id, {
        lifecycle: "RETIRED",
      });
      expect(retiredWorkcenter.ok).toBe(true);
      db.close();
    } finally {
      runtime.close();
    }
  });
});

function insertAssignedTask(
  db: ReturnType<typeof openSqliteDatabase>,
  providerId: string,
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED",
): void {
  db.prepare(
    `
    INSERT INTO execution_plans (
      plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
      inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    `plan-${providerId}`,
    `snap-${providerId}`,
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
    `task-${providerId}`,
    `plan-${providerId}`,
    "op-1",
    "CUT_SHEET_CNC",
    "Debitare",
    "FACE",
    "Față",
    1,
    "1",
    "CNC_ROUTING",
    "Debitare CNC",
    status,
    "2026-09-21T00:00:00.000Z",
    "[]",
    "[]",
    providerId,
  );
}
