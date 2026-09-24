import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  compileAggregate,
  compileDefinition,
  compileEic,
  composeProductProcessesFromTruth,
  confirmReviewedDefinition,
  freezeAcceptedProductionSnapshot,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
  materializeExecutionPlanFromSnapshot,
  MCH_CNC_4020_ID,
  starterFormulaVersionsForType,
} from "@workos-final/domain";
import {
  applyMigrations,
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabase,
  openSqliteDatabaseWithoutMigrations,
} from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-execution-reality-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

describe("execution reality persistence", () => {
  it("adds actual duration and machine runs on an empty database and on upgrade", () => {
    const fresh = openSqliteDatabase(tempSqlitePath());
    const freshColumns = fresh.prepare("PRAGMA table_info(execution_tasks)").all() as Array<{
      name: string;
    }>;
    expect(freshColumns.map((column) => column.name)).toContain("actual_duration_minutes");
    expect(
      fresh.prepare("SELECT name FROM sqlite_master WHERE name = 'execution_machine_runs'").get(),
    ).toBeTruthy();
    fresh.close();

    const upgradePath = tempSqlitePath();
    const prior = openSqliteDatabaseWithoutMigrations(upgradePath);
    const files = listOperationalMigrationFiles();
    const reality = "037_execution_reality.sql";
    applySelectedMigrations(
      prior,
      files.filter((file) => file !== reality),
    );
    const before = prior.prepare("PRAGMA table_info(execution_tasks)").all() as Array<{
      name: string;
    }>;
    expect(before.map((column) => column.name)).not.toContain("actual_duration_minutes");
    prior
      .prepare(
        `
        INSERT INTO execution_plans (
          plan_id, source_snapshot_id, source_snapshot_hash, product_code, product_label,
          inscription, created_at, status, schema_version, task_count, eic_total, eic_currency, eic_completeness
        ) VALUES ('exp:old', 'aps:old', 'hash', 'PRD', 'Litere', 'VECHI', '2026-08-01T00:00:00.000Z', 'PLANNED', 1, 1, 0, 'EUR', 'COMPLETE')
      `,
      )
      .run();
    prior
      .prepare(
        `
        INSERT INTO execution_tasks (
          task_id, plan_id, source_operation_id, process_id, process_label, scope, scope_label,
          seq, seq_label, required_capability_id, required_capability_label, status, created_at,
          quantities_json, resources_json
        ) VALUES (
          'task:old', 'exp:old', 'op:old', 'proc:old', 'Debitare', 'BACK', 'Spate',
          1, '01', 'CNC_CUTTING', 'Debitare CNC', 'COMPLETED', '2026-08-01T00:00:00.000Z',
          '[]', '[]'
        )
      `,
      )
      .run();
    prior.close();

    const upgraded = openSqliteDatabase(upgradePath);
    const historical = upgraded
      .prepare("SELECT actual_duration_minutes FROM execution_tasks WHERE task_id = 'task:old'")
      .get() as { actual_duration_minutes: number | null };
    expect(historical.actual_duration_minutes).toBeNull();
    expect(
      (
        upgraded.prepare("SELECT COUNT(*) AS count FROM execution_machine_runs").get() as {
          count: number;
        }
      ).count,
    ).toBe(0);
    expect(applyMigrations).toBeTypeOf("function");
    upgraded.close();
  });

  it("round-trips actual duration and a frozen machine run without backfill", () => {
    const runtime = createProductSystemRuntime(tempSqlitePath());
    const definition = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: {
        "root.inscription": "WORKOS",
        "face.finish": "none",
        "face.confirmedAreaMm2": 250000,
        "volume.depthMm": "60",
        "volume.finish": "none",
        "volume.confirmedPerimeterMm": 12500,
      },
    });
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    if ("ok" in truth) {
      throw new Error("expected truth");
    }
    const aggregate = compileAggregate(
      truth,
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      runtime.labels(),
      { formulaVersionsForType: starterFormulaVersionsForType },
    );
    const composition = composeProductProcessesFromTruth(
      truth,
      frontlitPlexiAl06Template,
      undefined,
      { formulaVersionsForType: starterFormulaVersionsForType },
    );
    const snapshot = freezeAcceptedProductionSnapshot(
      truth,
      aggregate,
      composition,
      compileEic(aggregate, composition),
      { createdAt: "2026-08-15T14:00:00.000Z" },
    );
    runtime.acceptProductionSnapshot(snapshot);
    const created = runtime.persistExecutionPlan(
      materializeExecutionPlanFromSnapshot(snapshot, {
        createdAt: "2026-08-15T15:00:00.000Z",
      }),
    );
    const task = created.record.tasks.find(
      (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    );
    if (!task) {
      throw new Error("missing task");
    }
    expect(task.actualDurationMinutes).toBeNull();
    expect(task.machineRuns).toEqual([]);
    const person = runtime.createPerson("Operator CNC");
    if (!person.ok) {
      throw new Error(person.error);
    }
    expect(runtime.assignExecutionTaskProvider(task.taskId, MCH_CNC_4020_ID).ok).toBe(true);
    expect(runtime.assignExecutionTaskExecutor(task.taskId, person.person.personId).ok).toBe(true);
    expect(runtime.claimAndStartExecutionTask(task.taskId, person.person.personId).ok).toBe(true);
    const started = runtime.startMachineRun(task.taskId, person.person.personId);
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const run = started.record.tasks.find((item) => item.taskId === task.taskId)?.machineRuns[0];
    expect(run?.machineProviderLabel).toBe("CNC 4020");
    const stopped = runtime.stopMachineRun(run!.machineRunId, person.person.personId);
    expect(stopped.ok).toBe(true);
    const completed = runtime.completeExecutionTask(
      task.taskId,
      { completedQuantity: 12.5, actualDurationMinutes: 85 },
      person.person.personId,
    );
    expect(completed.ok).toBe(true);
    runtime.close();

    const reopened = createProductSystemRuntime(runtime.sqlitePath);
    const stored = reopened.readExecutionPlan(created.record.plan.planId);
    const storedTask = stored?.tasks.find((item) => item.taskId === task.taskId);
    expect(storedTask?.actualDurationMinutes).toBe(85);
    expect(storedTask?.machineRuns[0]?.machineProviderId).toBe(MCH_CNC_4020_ID);
    expect(storedTask?.machineRuns[0]?.startedByOperatorId).toBe(person.person.personId);
    expect(storedTask?.machineRuns[0]?.durationMinutes).toBeGreaterThanOrEqual(0);
    expect(storedTask?.startedAt).not.toBe(String(storedTask?.actualDurationMinutes));
    reopened.close();
  });
});
