import { describe, expect, it } from "vitest";
import { CUT_SHEET_CNC_ID, INSPECT_FINISHED_LETTER_ID, PACK_PRODUCT_ID } from "../processes/catalog.js";
import {
  closeQualityReworkEpisode,
  completeExecutionTask,
  recordQualityFail,
  recordQualityPass,
} from "./lifecycle.js";
import { markTaskExternal } from "./externalProduction.js";
import {
  isQualityControlExecutionProcess,
  QUALITY_CONTROL_EXECUTION_PROCESS_IDS,
} from "./qualityControl.js";
import {
  projectExecutionPlanView,
  type ExecutionPlanRecord,
  type ExecutionTask,
} from "./plan.js";
import { projectPlanningWorkload } from "./workload.js";

function task(overrides: Partial<ExecutionTask> & Pick<ExecutionTask, "taskId" | "processId" | "status" | "seq">): ExecutionTask {
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
    plannedEffortMinutes: 15,
    actualDurationMinutes: null,
    machineRuns: [],
    startedAt: overrides.status === "PLANNED" ? null : "2026-09-27T08:00:00.000Z",
    completedAt: overrides.status === "COMPLETED" ? "2026-09-27T09:00:00.000Z" : null,
    completion:
      overrides.status === "COMPLETED"
        ? {
            outcome: "COMPLETED_AS_PLANNED",
            completedQuantity: null,
            completedQuantityUnit: null,
            note: null,
          }
        : null,
    actualConsumption: [],
    createdAt: "2026-09-27T07:00:00.000Z",
    ...overrides,
  };
}

function plan(tasks: ExecutionTask[]): ExecutionPlanRecord {
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

const emptyQuality = { attempts: [], episodes: [] };

describe("quality control execution", () => {
  it("classifies only the four accepted quality operations", () => {
    expect(QUALITY_CONTROL_EXECUTION_PROCESS_IDS).toEqual([
      "TEST_ILLUMINATION_UNIFORMITY",
      "INSPECT_FINISHED_LETTER",
      "INSPECT_FINISHED_LOGO",
      "INSPECT_FINISHED_ASSEMBLY",
    ]);
    expect(isQualityControlExecutionProcess(INSPECT_FINISHED_LETTER_ID)).toBe(true);
    expect(isQualityControlExecutionProcess(CUT_SHEET_CNC_ID)).toBe(false);
    expect(isQualityControlExecutionProcess(PACK_PRODUCT_ID)).toBe(false);
  });

  it("keeps non-QC completion unchanged and rejects a bare QC complete", () => {
    const cutting = task({
      taskId: "task-cut",
      processId: CUT_SHEET_CNC_ID,
      status: "IN_PROGRESS",
      seq: 1,
      requiredCapabilityId: "CNC_ROUTING",
    });
    const completed = completeExecutionTask(plan([cutting]), cutting.taskId, "2026-09-27T10:00:00.000Z");
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    expect(completed.record.tasks[0]?.status).toBe("COMPLETED");

    const qc = task({
      taskId: "task-qc",
      processId: INSPECT_FINISHED_LETTER_ID,
      status: "IN_PROGRESS",
      seq: 1,
    });
    const rejected = completeExecutionTask(plan([qc]), qc.taskId, "2026-09-27T10:00:00.000Z", {}, "per-qc");
    expect(rejected).toEqual({ ok: false, error: "quality_result_required" });
  });

  it("keeps a historical completed QC task completed without a synthetic pass", () => {
    const qc = task({
      taskId: "task-qc",
      processId: INSPECT_FINISHED_LETTER_ID,
      status: "COMPLETED",
      seq: 1,
    });
    const record = plan([qc]);
    const completed = completeExecutionTask(record, qc.taskId, "2026-09-27T11:00:00.000Z", {}, "per-qc");
    expect(completed).toMatchObject({ ok: true, alreadyApplied: true });
    const pass = recordQualityPass(record, emptyQuality, qc.taskId, "per-qc", undefined, "2026-09-27T11:00:00.000Z");
    expect(pass).toMatchObject({ ok: true, alreadyApplied: true });
    if (pass.ok) {
      expect(pass.quality.attempts).toEqual([]);
      expect(pass.record.tasks[0]?.status).toBe("COMPLETED");
    }
  });

  it("runs fail, correction, reinspect, and pass without a second task", () => {
    const upstream = task({
      taskId: "task-a",
      processId: CUT_SHEET_CNC_ID,
      status: "COMPLETED",
      seq: 1,
      requiredCapabilityId: "CNC_ROUTING",
      assignedExecutor: { id: "per-cnc", label: "CNC" },
    });
    const qc = task({
      taskId: "task-qc",
      processId: INSPECT_FINISHED_LETTER_ID,
      status: "IN_PROGRESS",
      seq: 2,
      dependsOnTaskIds: [],
    });
    const downstream = task({
      taskId: "task-b",
      processId: PACK_PRODUCT_ID,
      status: "PLANNED",
      seq: 3,
      dependsOnTaskIds: ["task-qc"],
      requiredCapabilityId: "PACKAGING",
      assignedExecutor: null,
      startedAt: null,
    });
    let record = plan([upstream, qc, downstream]);
    const missingNote = recordQualityFail(record, emptyQuality, qc.taskId, "per-qc", "  ", "2026-09-27T10:00:00.000Z");
    expect(missingNote).toEqual({ ok: false, error: "invalid_note" });

    const failed = recordQualityFail(
      record,
      emptyQuality,
      qc.taskId,
      "per-qc",
      "Iluminare neuniformă",
      "2026-09-27T10:00:00.000Z",
    );
    expect(failed.ok).toBe(true);
    if (!failed.ok) {
      return;
    }
    record = failed.record;
    expect(record.tasks.find((item) => item.taskId === qc.taskId)?.status).toBe("IN_PROGRESS");
    expect(record.tasks).toHaveLength(3);
    expect(failed.quality.attempts).toHaveLength(1);
    expect(failed.quality.episodes).toEqual([
      expect.objectContaining({ status: "OPEN", openedByAttemptSeq: 1 }),
    ]);
    const blocked = projectExecutionPlanView(record, [], null, null, "per-pack");
    expect(blocked.progress.completed).toBe(1);
    expect(blocked.tasks.find((item) => item.taskId === "task-b")?.waitingFor.length).toBeGreaterThan(0);

    const passWhileOpen = recordQualityPass(
      record,
      failed.quality,
      qc.taskId,
      "per-qc",
      undefined,
      "2026-09-27T10:05:00.000Z",
    );
    expect(passWhileOpen).toEqual({ ok: false, error: "quality_correction_open" });
    const secondFail = recordQualityFail(
      record,
      failed.quality,
      qc.taskId,
      "per-qc",
      "Alt defect",
      "2026-09-27T10:06:00.000Z",
    );
    expect(secondFail).toEqual({ ok: false, error: "quality_correction_open" });
    const memberClose = closeQualityReworkEpisode(
      record,
      failed.quality,
      qc.taskId,
      "",
      "member",
      "2026-09-27T10:07:00.000Z",
    );
    expect(memberClose).toEqual({ ok: false, error: "invalid_note" });

    const closed = closeQualityReworkEpisode(
      record,
      failed.quality,
      qc.taskId,
      "Corectat în atelier",
      "owner-1",
      "2026-09-27T10:08:00.000Z",
    );
    expect(closed.ok).toBe(true);
    if (!closed.ok) {
      return;
    }
    expect(closed.record.tasks.find((item) => item.taskId === qc.taskId)?.status).toBe("IN_PROGRESS");
    const reinspect = projectExecutionPlanView(
      closed.record,
      [],
      null,
      null,
      "per-qc",
      undefined,
      undefined,
      undefined,
      { ...closed.quality, viewerIsOwner: false },
    );
    const qcView = reinspect.tasks.find((item) => item.taskId === qc.taskId);
    expect(qcView?.qualityBlockLabel).toBe("Poate fi verificată din nou");
    expect(qcView?.canComplete).toBe(false);
    expect(qcView?.canRecordQualityPass).toBe(true);

    const failedAgain = recordQualityFail(
      closed.record,
      closed.quality,
      qc.taskId,
      "per-qc",
      "Încă vizibil",
      "2026-09-27T10:09:00.000Z",
    );
    expect(failedAgain.ok).toBe(true);
    if (!failedAgain.ok) {
      return;
    }
    const closedAgain = closeQualityReworkEpisode(
      failedAgain.record,
      failedAgain.quality,
      qc.taskId,
      "Corectat din nou",
      "owner-1",
      "2026-09-27T10:10:00.000Z",
    );
    expect(closedAgain.ok).toBe(true);
    if (!closedAgain.ok) {
      return;
    }
    const passed = recordQualityPass(
      closedAgain.record,
      closedAgain.quality,
      qc.taskId,
      "per-qc",
      "Acceptat vizual",
      "2026-09-27T10:11:00.000Z",
    );
    expect(passed.ok).toBe(true);
    if (!passed.ok) {
      return;
    }
    expect(passed.record.tasks.find((item) => item.taskId === qc.taskId)?.status).toBe("COMPLETED");
    expect(passed.quality.attempts.map((attempt) => attempt.result)).toEqual(["FAIL", "FAIL", "PASS"]);
    expect(passed.quality.episodes.map((episode) => episode.status)).toEqual(["CLOSED", "CLOSED"]);
    expect(passed.record.tasks).toHaveLength(3);
    const released = projectExecutionPlanView(passed.record);
    expect(released.progress.completed).toBe(2);
    expect(released.tasks.find((item) => item.taskId === "task-b")?.waitingFor).toEqual([]);
    const duplicate = recordQualityPass(
      passed.record,
      passed.quality,
      qc.taskId,
      "per-qc",
      undefined,
      "2026-09-27T10:12:00.000Z",
    );
    expect(duplicate).toMatchObject({ ok: true, alreadyApplied: true });
    if (duplicate.ok) {
      expect(duplicate.quality.attempts).toHaveLength(3);
    }
    const openIds = (projection: ReturnType<typeof projectPlanningWorkload>) => [
      ...projection.unassigned.map((item) => item.taskId),
      ...projection.providers.flatMap((group) => group.tasks.map((item) => item.taskId)),
    ];
    const whileFailed = openIds(projectPlanningWorkload([{ record: failed.record }]));
    const afterPass = openIds(projectPlanningWorkload([{ record: passed.record }]));
    expect(whileFailed.filter((id) => id === qc.taskId).length).toBeLessThanOrEqual(1);
    expect(afterPass.filter((id) => id === qc.taskId)).toEqual([]);
  });

  it("rejects the wrong executor and externalization of quality control", () => {
    const qc = task({
      taskId: "task-qc",
      processId: INSPECT_FINISHED_LETTER_ID,
      status: "IN_PROGRESS",
      seq: 1,
    });
    const record = plan([qc]);
    expect(
      recordQualityFail(record, emptyQuality, qc.taskId, "per-other", "Defect", "2026-09-27T10:00:00.000Z"),
    ).toEqual({ ok: false, error: "wrong_executor" });
    expect(markTaskExternal(record, qc.taskId, "ENABLED", "owner", "2026-09-27T10:00:00.000Z")).toEqual({
      ok: false,
      error: "quality_control_not_externalizable",
    });
    const cutting = task({
      taskId: "task-cut",
      processId: CUT_SHEET_CNC_ID,
      status: "PLANNED",
      seq: 1,
      assignedExecutor: null,
      startedAt: null,
      requiredCapabilityId: "CNC_ROUTING",
    });
    const externalized = markTaskExternal(
      plan([cutting]),
      cutting.taskId,
      "ENABLED",
      "owner",
      "2026-09-27T10:00:00.000Z",
    );
    expect(externalized.ok).toBe(true);
    if (externalized.ok) {
      expect(externalized.record.tasks[0]?.executionMode).toBe("EXTERNAL");
    }
    const view = projectExecutionPlanView(record, [], null, null, "per-qc", undefined, undefined, {
      mode: "ENABLED",
      providers: [],
    });
    expect(view.tasks[0]?.canExternalize).toBe(false);
    expect(view.tasks[0]?.canComplete).toBe(false);
    expect(view.tasks[0]?.canRecordQualityFail).toBe(true);
  });
});
