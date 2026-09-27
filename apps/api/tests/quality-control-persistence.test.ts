import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  INSPECT_FINISHED_LETTER_ID,
  PACK_PRODUCT_ID,
  type ExecutionPlanRecord,
  type ExecutionTask,
} from "@workos-final/domain";
import { insertExecutionPlanRecord } from "../src/execution/store.js";
import {
  persistQualityCorrectionClose,
  persistQualityFail,
  persistQualityPass,
  readQualityControlForPlan,
} from "../src/execution/qualityControlStore.js";
import { openSqliteDatabase, type SqliteDatabase } from "../src/persistence/sqlite.js";

const temps: string[] = [];
const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function openDb(): SqliteDatabase {
  const dir = mkdtempSync(join(tmpdir(), "workos-qc-"));
  temps.push(dir);
  const db = openSqliteDatabase(join(dir, "plane.sqlite"));
  databases.push(db);
  return db;
}

function task(
  overrides: Partial<ExecutionTask> & Pick<ExecutionTask, "taskId" | "processId" | "status" | "seq">,
): ExecutionTask {
  return {
    executionPlanId: "plan-1",
    sourceOperationId: overrides.taskId,
    processLabel: overrides.processId,
    scope: "PRODUCT",
    scopeLabel: "Produs",
    seqLabel: String(overrides.seq).padStart(2, "0"),
    dependsOnTaskIds: [],
    requiredCapabilityId: "QUALITY_CONTROL",
    requiredCapabilityLabel: "Control",
    providerRequirement: "NOT_REQUIRED",
    executionMode: "INTERNAL",
    quantities: [],
    resourceDemands: [],
    assignedProvider: null,
    assignedExecutor: { id: "per-qc", label: "Controlor" },
    plannedEffortMinutes: null,
    actualDurationMinutes: null,
    machineRuns: [],
    startedAt: overrides.status === "PLANNED" ? null : "2026-09-27T08:00:00.000Z",
    completedAt: null,
    completion: null,
    actualConsumption: [],
    createdAt: "2026-09-27T07:00:00.000Z",
    ...overrides,
  };
}

function record(tasks: ExecutionTask[]): ExecutionPlanRecord {
  return {
    plan: {
      planId: "plan-1",
      sourceSnapshotId: "snap-1",
      sourceSnapshotHash: "hash",
      productCode: "PRD",
      productLabel: "Produs",
      inscription: "QC",
      createdAt: "2026-09-27T07:00:00.000Z",
      status: "PLANNED",
      taskCount: tasks.length,
      schemaVersion: 1,
      eicTotal: 0,
      eicCurrency: "EUR",
      eicCompleteness: "PARTIAL",
    },
    tasks,
  };
}

describe("quality control persistence", () => {
  it("stores ordered attempts and a single open correction, then completes once", () => {
    const db = openDb();
    insertExecutionPlanRecord(
      db,
      record([
        task({
          taskId: "task-qc",
          processId: INSPECT_FINISHED_LETTER_ID,
          status: "IN_PROGRESS",
          seq: 1,
        }),
        task({
          taskId: "task-b",
          processId: PACK_PRODUCT_ID,
          status: "PLANNED",
          seq: 2,
          dependsOnTaskIds: ["task-qc"],
          requiredCapabilityId: "PACKAGING",
          assignedExecutor: null,
          startedAt: null,
        }),
      ]),
    );

    const failed = persistQualityFail(db, "task-qc", "per-qc", "Muchie vizibilă", "2026-09-27T10:00:00.000Z");
    expect(failed.ok).toBe(true);
    const again = persistQualityFail(db, "task-qc", "per-qc", "Alt defect", "2026-09-27T10:01:00.000Z");
    expect(again).toMatchObject({ ok: false, error: "quality_correction_open" });
    const openRows = db
      .prepare(
        "SELECT episode_seq, status FROM execution_rework_episodes WHERE task_id = ? ORDER BY episode_seq",
      )
      .all("task-qc") as Array<{ episode_seq: number; status: string }>;
    expect(openRows).toEqual([{ episode_seq: 1, status: "OPEN" }]);

    const closed = persistQualityCorrectionClose(
      db,
      "task-qc",
      "Corectat",
      "owner-1",
      "2026-09-27T10:02:00.000Z",
    );
    expect(closed.ok).toBe(true);
    if (closed.ok) {
      expect(closed.record.tasks.find((item) => item.taskId === "task-qc")?.status).toBe("IN_PROGRESS");
    }
    const passed = persistQualityPass(db, "task-qc", "per-qc", undefined, "2026-09-27T10:03:00.000Z");
    expect(passed.ok).toBe(true);
    if (!passed.ok) {
      return;
    }
    expect(passed.record.tasks.find((item) => item.taskId === "task-qc")?.status).toBe("COMPLETED");
    expect(passed.record.tasks.find((item) => item.taskId === "task-b")?.status).toBe("PLANNED");
    const duplicate = persistQualityPass(db, "task-qc", "per-qc", undefined, "2026-09-27T10:04:00.000Z");
    expect(duplicate).toMatchObject({ ok: true, alreadyApplied: true });
    const stored = readQualityControlForPlan(db, "plan-1");
    expect(stored.attempts.map((attempt) => attempt.attemptSeq)).toEqual([1, 2]);
    expect(stored.attempts.map((attempt) => attempt.result)).toEqual(["FAIL", "PASS"]);
    expect(stored.episodes.map((episode) => episode.status)).toEqual(["CLOSED"]);
    const movements = db.prepare("SELECT COUNT(*) AS count FROM inventory_movements").get() as {
      count: number;
    };
    expect(movements.count).toBe(0);
    expect(() => db.prepare("DELETE FROM execution_quality_attempts").run()).toThrow(/append_only/);
  });

  it("keeps quality history inside the operational plane that recorded it", () => {
    const alpha = openDb();
    const beta = openDb();
    const plan = record([
      task({
        taskId: "task-qc",
        processId: INSPECT_FINISHED_LETTER_ID,
        status: "IN_PROGRESS",
        seq: 1,
      }),
    ]);
    insertExecutionPlanRecord(alpha, plan);
    insertExecutionPlanRecord(beta, plan);
    expect(persistQualityFail(alpha, "task-qc", "per-qc", "Defect", "2026-09-27T10:00:00.000Z").ok).toBe(
      true,
    );
    expect(readQualityControlForPlan(beta, "plan-1").attempts).toEqual([]);
  });
});
