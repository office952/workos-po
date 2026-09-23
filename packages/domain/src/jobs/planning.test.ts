import { describe, expect, it } from "vitest";
import { setPlannedEffortOnTask } from "../execution/lifecycle.js";
import type { ExecutionPlanRecord } from "../execution/plan.js";
import {
  DEFAULT_OPERATIONAL_PRIORITY,
  compareOperationalTargetDates,
  isOperationallyOverdue,
  operationalPriorityRank,
  parseOperationalPriority,
  parseTargetDate,
  planningMetadataIsEditable,
} from "./planning.js";

function plannedTask(): ExecutionPlanRecord {
  return {
    plan: {
      planId: "exp:1",
      sourceSnapshotId: "snap:1",
      sourceSnapshotHash: "hash",
      productCode: "PRD",
      productLabel: "Litere",
      inscription: "ALPHA",
      createdAt: "2026-09-01T00:00:00.000Z",
      status: "PLANNED",
      taskCount: 1,
      schemaVersion: 1,
      eicTotal: 0,
      eicCurrency: "EUR",
      eicCompleteness: "COMPLETE",
    },
    tasks: [
      {
        taskId: "task:1",
        executionPlanId: "exp:1",
        sourceOperationId: "op:1",
        processId: "proc:1",
        processLabel: "Debitare",
        scope: "FACE",
        scopeLabel: "Față",
        seq: 3,
        seqLabel: "03",
        dependsOnTaskIds: ["task:0"],
        requiredCapabilityId: "CNC_CUTTING",
        requiredCapabilityLabel: "Debitare CNC",
        providerRequirement: "REQUIRED",
        status: "PLANNED",
        quantities: [],
        resourceDemands: [],
        assignedProvider: null,
        assignedExecutor: null,
        plannedEffortMinutes: null,
        startedAt: null,
        completedAt: null,
        completion: null,
        actualConsumption: [],
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
}

describe("job planning metadata", () => {
  it("accepts the V1 priority enum and defaults to STANDARD", () => {
    expect(DEFAULT_OPERATIONAL_PRIORITY).toBe("STANDARD");
    expect(parseOperationalPriority("STANDARD").ok).toBe(true);
    expect(parseOperationalPriority("HIGH").ok).toBe(true);
    expect(parseOperationalPriority("URGENT").ok).toBe(true);
    expect(parseOperationalPriority("LOW")).toEqual({ ok: false, error: "invalid_priority" });
    expect(operationalPriorityRank("URGENT")).toBeLessThan(operationalPriorityRank("HIGH"));
    expect(operationalPriorityRank("HIGH")).toBeLessThan(operationalPriorityRank("STANDARD"));
  });

  it("accepts a canonical date and an explicit empty target", () => {
    expect(parseTargetDate(null)).toEqual({ ok: true, targetDate: null });
    expect(parseTargetDate("2026-09-23")).toEqual({ ok: true, targetDate: "2026-09-23" });
    expect(parseTargetDate("2026-02-31")).toEqual({ ok: false, error: "invalid_target_date" });
    expect(parseTargetDate("23.09.2026")).toEqual({ ok: false, error: "invalid_target_date" });
    expect(parseTargetDate("")).toEqual({ ok: false, error: "invalid_target_date" });
  });

  it("keeps completed jobs read-only and leaves earlier stages editable", () => {
    expect(planningMetadataIsEditable("ORDER_CREATED")).toBe(true);
    expect(planningMetadataIsEditable("RELEASED")).toBe(true);
    expect(planningMetadataIsEditable("EXECUTION_PLANNED")).toBe(true);
    expect(planningMetadataIsEditable("EXECUTION_IN_PROGRESS")).toBe(true);
    expect(planningMetadataIsEditable("EXECUTION_COMPLETED")).toBe(false);
  });

  it("marks a passed target as overdue without blocking a completed job", () => {
    expect(
      isOperationallyOverdue({
        targetDate: "2026-09-01",
        stage: "EXECUTION_IN_PROGRESS",
        today: "2026-09-23",
      }),
    ).toBe(true);
    expect(
      isOperationallyOverdue({
        targetDate: "2026-09-23",
        stage: "EXECUTION_IN_PROGRESS",
        today: "2026-09-23",
      }),
    ).toBe(false);
    expect(
      isOperationallyOverdue({
        targetDate: null,
        stage: "EXECUTION_IN_PROGRESS",
        today: "2026-09-23",
      }),
    ).toBe(false);
    expect(
      isOperationallyOverdue({
        targetDate: "2026-09-01",
        stage: "EXECUTION_COMPLETED",
        today: "2026-09-23",
      }),
    ).toBe(false);
  });

  it("orders dated targets before an empty target", () => {
    expect(compareOperationalTargetDates("2026-09-01", "2026-09-20")).toBeLessThan(0);
    expect(compareOperationalTargetDates(null, "2026-09-01")).toBeGreaterThan(0);
    expect(compareOperationalTargetDates("2026-09-01", null)).toBeLessThan(0);
  });

  it("stores effort on an unassigned planned task without assigning a provider or changing dependencies", () => {
    const record = plannedTask();
    const next = setPlannedEffortOnTask(record, "task:1", 45);
    expect(next.ok).toBe(true);
    if (!next.ok) {
      return;
    }
    expect(next.record.tasks[0]?.plannedEffortMinutes).toBe(45);
    expect(next.record.tasks[0]?.assignedProvider).toBeNull();
    expect(next.record.tasks[0]?.dependsOnTaskIds).toEqual(["task:0"]);
    expect(next.record.tasks[0]?.seq).toBe(3);
    const cleared = setPlannedEffortOnTask(next.record, "task:1", null);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) {
      return;
    }
    expect(cleared.record.tasks[0]?.plannedEffortMinutes).toBeNull();
  });
});
