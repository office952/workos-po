import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MCH_CNC_4020_ID,
  WC_ASSEMBLY_01_ID,
  WC_CNC_ROUTING_ID,
  createWorkcenterRegistry,
  providersForCapability,
  workcenterRegistry,
} from "@workos-final/domain";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  ORGANIZATION_PROVIDER_COMPATIBILITY_SOURCE,
  OrganizationProviderPersistError,
  ensureOrganizationProviderFoundation,
  hasOrganizationProviderOwnership,
  loadOrganizationProviderRegistry,
  persistCreatedWorkcenter,
  persistUpdatedMachine,
  persistUpdatedWorkcenter,
  readOrganizationProviderConfig,
} from "../src/workcenters/organizationProviderStore.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may briefly keep a handle on a closed SQLite file.
    }
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

  it("materializes the compatibility registry once and then keeps organization ownership", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "ADOPT_EXISTING",
    });
    try {
      expect(runtime.providerRegistry.getMachine(MCH_CNC_4020_ID)?.id).toBe(MCH_CNC_4020_ID);
      const db = openSqliteDatabase(runtime.sqlitePath);
      expect(hasOrganizationProviderOwnership(db)).toBe(false);
      expect(loadOrganizationProviderRegistry(db).machines).toEqual([]);

      const first = ensureOrganizationProviderFoundation(db, workcenterRegistry);
      expect(first.materialized).toBe(true);
      expect(first.alreadyOwned).toBe(true);
      expect(readOrganizationProviderConfig(db)?.source).toBe(
        ORGANIZATION_PROVIDER_COMPATIBILITY_SOURCE,
      );
      expect(snapshotRegistry(first.registry)).toEqual(snapshotRegistry(workcenterRegistry));

      const renamed = persistUpdatedMachine(db, MCH_CNC_4020_ID, {
        label: "CNC 4020 edit",
      });
      expect(renamed.ok).toBe(true);
      const afterEdit = readOrganizationProviderConfig(db);

      const second = ensureOrganizationProviderFoundation(db, workcenterRegistry);
      expect(second.materialized).toBe(false);
      expect(second.alreadyOwned).toBe(true);
      expect(second.registry.getMachine(MCH_CNC_4020_ID)?.label).toBe("CNC 4020 edit");
      expect(second.registry.getMachine(MCH_CNC_4020_ID)?.workcenterId).toBe(WC_CNC_ROUTING_ID);
      const afterSecond = readOrganizationProviderConfig(db);
      expect(afterSecond?.contentHash).toBe(afterEdit?.contentHash);
      expect(afterSecond?.appliedAt).toBe(afterEdit?.appliedAt);
      expect(afterSecond?.source).toBe("admin");
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("keeps organization-owned rows when compatibility is offered again without a config row", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "ADOPT_EXISTING",
    });
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      ensureOrganizationProviderFoundation(db, workcenterRegistry);
      const renamed = persistUpdatedMachine(db, MCH_CNC_4020_ID, {
        label: "CNC 4020 org",
      });
      expect(renamed.ok).toBe(true);
      db.prepare("DELETE FROM organization_provider_configuration").run();
      expect(hasOrganizationProviderOwnership(db)).toBe(true);

      const again = ensureOrganizationProviderFoundation(db, workcenterRegistry);
      expect(again.materialized).toBe(false);
      expect(again.alreadyOwned).toBe(true);
      expect(again.registry.getMachine(MCH_CNC_4020_ID)?.label).toBe("CNC 4020 org");
      expect(readOrganizationProviderConfig(db)?.source).toBe("organization");
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("leaves an empty NEW_ORGANIZATION foundation untouched", () => {
    const runtime = openEmptyRuntime();
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      const result = ensureOrganizationProviderFoundation(
        db,
        createWorkcenterRegistry([], []),
      );
      expect(result.materialized).toBe(false);
      expect(result.alreadyOwned).toBe(false);
      expect(result.registry.workcenters).toEqual([]);
      expect(result.registry.machines).toEqual([]);
      expect(readOrganizationProviderConfig(db)).toBeNull();
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("makes a legacy single-plane mutation visible on the same live registry", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    try {
      expect(runtime.providerRegistry.getMachine(MCH_CNC_4020_ID)?.label).toBe("CNC 4020");
      const db = openSqliteDatabase(runtime.sqlitePath);
      expect(hasOrganizationProviderOwnership(db)).toBe(false);
      db.close();

      const updated = runtime.updateMachine(MCH_CNC_4020_ID, {
        label: "CNC 4020 legacy",
      });
      expect(updated.ok).toBe(true);
      expect(runtime.providerRegistry.getMachine(MCH_CNC_4020_ID)?.label).toBe(
        "CNC 4020 legacy",
      );
      expect(
        providersForCapability("CNC_ROUTING", runtime.providerRegistry).map((item) => item.id),
      ).toContain(MCH_CNC_4020_ID);
    } finally {
      runtime.close();
    }
  });

  it("preserves historical execution rows across compatibility materialization", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath(), {
      bootstrapPolicy: "ADOPT_EXISTING",
    });
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      insertAssignedTask(db, MCH_CNC_4020_ID, "COMPLETED", "hist-1");
      const before = readHistoryFingerprint(db, "hist-1");
      expect(before.assignedProviderId).toBe(MCH_CNC_4020_ID);

      const materialized = ensureOrganizationProviderFoundation(db, workcenterRegistry);
      expect(materialized.registry.getMachine(MCH_CNC_4020_ID)?.id).toBe(MCH_CNC_4020_ID);
      expect(readHistoryFingerprint(db, "hist-1")).toEqual(before);

      expect(
        persistUpdatedMachine(db, MCH_CNC_4020_ID, {
          capabilityIds: ["LASER_CUTTING"],
        }),
      ).toEqual({ ok: false, error: "provider_referenced" });
      expect(
        persistUpdatedMachine(db, MCH_CNC_4020_ID, {
          workcenterId: WC_ASSEMBLY_01_ID,
        }),
      ).toEqual({ ok: false, error: "provider_referenced" });

      insertAssignedTask(db, MCH_CNC_4020_ID, "PLANNED", "hist-2");
      expect(
        persistUpdatedMachine(db, MCH_CNC_4020_ID, { lifecycle: "RETIRED" }),
      ).toEqual({ ok: false, error: "has_open_assignment" });
      db.prepare("UPDATE execution_tasks SET status = 'IN_PROGRESS' WHERE task_id = ?").run(
        "task-hist-2",
      );
      expect(
        persistUpdatedMachine(db, MCH_CNC_4020_ID, { lifecycle: "RETIRED" }),
      ).toEqual({ ok: false, error: "has_open_assignment" });
      db.prepare("UPDATE execution_tasks SET status = 'COMPLETED' WHERE task_id = ?").run(
        "task-hist-2",
      );
      expect(persistUpdatedMachine(db, MCH_CNC_4020_ID, { lifecycle: "RETIRED" }).ok).toBe(
        true,
      );
      expect(readHistoryFingerprint(db, "hist-1")).toEqual(before);
      db.close();
    } finally {
      runtime.close();
    }
  });

  it("does not disguise unexpected persistence failures as validation errors", () => {
    const runtime = openEmptyRuntime();
    try {
      const db = openSqliteDatabase(runtime.sqlitePath);
      db.exec("DROP TABLE organization_provider_configuration");
      expect(() => persistCreatedWorkcenter(db, { label: "Zonă CNC" })).toThrow(
        OrganizationProviderPersistError,
      );
      expect(loadOrganizationProviderRegistry(db).workcenters).toEqual([]);

      expect(() => ensureOrganizationProviderFoundation(db, workcenterRegistry)).toThrow(
        OrganizationProviderPersistError,
      );
      expect(loadOrganizationProviderRegistry(db).machines).toEqual([]);
      db.close();
    } finally {
      runtime.close();
    }
  });
});

function snapshotRegistry(registry: {
  workcenters: readonly {
    id: string;
    label: string;
    description: string;
    lifecycle: string;
    capabilityIds: readonly string[];
  }[];
  machines: readonly {
    id: string;
    label: string;
    description: string;
    workcenterId: string | null;
    lifecycle: string;
    capabilityIds: readonly string[];
  }[];
}) {
  return {
    workcenters: registry.workcenters
      .map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        lifecycle: item.lifecycle,
        capabilityIds: [...item.capabilityIds],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    machines: registry.machines
      .map((item) => ({
        id: item.id,
        label: item.label,
        description: item.description,
        workcenterId: item.workcenterId,
        lifecycle: item.lifecycle,
        capabilityIds: [...item.capabilityIds],
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function insertAssignedTask(
  db: ReturnType<typeof openSqliteDatabase>,
  providerId: string,
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED",
  suffix = providerId,
): void {
  db.prepare(
    `
    INSERT INTO execution_plans (
      plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
      inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    `plan-${suffix}`,
    `snap-${suffix}`,
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
    `task-${suffix}`,
    `plan-${suffix}`,
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

function readHistoryFingerprint(
  db: ReturnType<typeof openSqliteDatabase>,
  suffix: string,
) {
  const plan = db
    .prepare(
      `
      SELECT plan_id, source_snapshot_id, source_snapshot_hash, product_code, status
      FROM execution_plans
      WHERE plan_id = ?
    `,
    )
    .get(`plan-${suffix}`) as {
    plan_id: string;
    source_snapshot_id: string;
    source_snapshot_hash: string;
    product_code: string;
    status: string;
  };
  const task = db
    .prepare(
      `
      SELECT task_id, plan_id, assigned_provider_id, status
      FROM execution_tasks
      WHERE task_id = ?
    `,
    )
    .get(`task-${suffix}`) as {
    task_id: string;
    plan_id: string;
    assigned_provider_id: string;
    status: string;
  };
  return {
    plan,
    task,
    assignedProviderId: task.assigned_provider_id,
  };
}
