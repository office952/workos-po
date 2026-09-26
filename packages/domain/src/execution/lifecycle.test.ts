import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import { describe, expect, it } from "vitest";
import {
  BOND_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  INSPECT_FINISHED_LETTER_ID,
  PACK_PRODUCT_ID,
  PLACE_LED_MODULES_ID,
} from "../processes/catalog.js";
import { composeProductProcessesFromTruth, compositionNodeId } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { freezeAcceptedProductionSnapshot } from "../production/snapshot.js";
import {
  MCH_CNC_4020_ID,
  MCH_CNC_CANT_LITERE_ID,
  WC_ASSEMBLY_01_ID,
  createWorkcenterRegistry,
  workcenterRegistry,
} from "../workcenters/catalog.js";
import { createPerson, type Person } from "../people/identity.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  plannedCompletionInput,
  setPlannedEffortOnTask,
  startExecutionTask,
} from "./lifecycle.js";
import {
  materialDemandLines,
  materialParticipation,
  type MaterialReadinessConfirmation,
  type MaterialReadinessContext,
} from "./materialReadiness.js";
import {
  materializeExecutionPlanFromSnapshot,
  projectExecutionPlanView,
} from "./plan.js";
import { projectOperatorTaskInbox } from "./inbox.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function freeze() {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values: readyValues },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(truth, frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, seededDisplayLabelCatalog(), { formulaVersionsForType: starterFormulaVersionsForType });
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template, undefined, { formulaVersionsForType: starterFormulaVersionsForType });
  return freezeAcceptedProductionSnapshot(
    truth,
    aggregate,
    composition,
    compileEic(aggregate, composition),
    { createdAt: "2026-08-15T14:00:00.000Z" },
  );
}

function planned() {
  return materializeExecutionPlanFromSnapshot(freeze(), {
    createdAt: "2026-08-15T15:00:00.000Z",
  });
}

function testPeople(): Person[] {
  const created = createPerson("Executor test", { personId: "per:test-executor" });
  if (!created.ok) {
    throw new Error("expected test person");
  }
  return [created.person];
}

function withExecutor(
  record: ReturnType<typeof planned>,
  taskId: string,
  people = testPeople(),
) {
  const assigned = assignExecutorToTask(record, taskId, people[0]!.personId, people);
  if (!assigned.ok) {
    throw new Error(assigned.error);
  }
  return { record: assigned.record, people };
}

function taskBySource(record: ReturnType<typeof planned>, scope: "FACE" | "BACK", processId: string) {
  const sourceId = compositionNodeId(scope, processId);
  const task = record.tasks.find((item) => item.sourceOperationId === sourceId);
  if (!task) {
    throw new Error(`missing ${scope} ${processId}`);
  }
  return task;
}

function taskByProcess(record: ReturnType<typeof planned>, processId: string) {
  const task = record.tasks.find((item) => item.processId === processId);
  if (!task) {
    throw new Error(`missing ${processId}`);
  }
  return task;
}

describe("minimal execution task lifecycle", () => {
  it("assigns an eligible provider and rejects an ineligible one", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    const task = assigned.record.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(task?.assignedProvider).toEqual({
      id: MCH_CNC_4020_ID,
      kind: "MACHINE",
      label: "CNC 4020",
    });
    expect(assignProviderToTask(record, backCnc.taskId, WC_ASSEMBLY_01_ID)).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
    expect(assignProviderToTask(record, backCnc.taskId, MCH_CNC_CANT_LITERE_ID)).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
    expect(
      assignProviderToTask(
        record,
        backCnc.taskId,
        MCH_CNC_4020_ID,
        createWorkcenterRegistry([], []),
      ),
    ).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
  });

  it("allows reassignment before start and rejects it after start", () => {
    const record = planned();
    const bond = taskByProcess(record, BOND_LETTER_BODY_ID);
    expect(assignProviderToTask(record, bond.taskId, WC_ASSEMBLY_01_ID)).toEqual({
      ok: false,
      error: "ineligible_provider",
    });

    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    const ready = withExecutor(assigned.record, backCnc.taskId);
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    expect(
      assignProviderToTask(started.record, backCnc.taskId, MCH_CNC_4020_ID),
    ).toEqual({ ok: false, error: "reassignment_locked" });
  });

  it("starts a root task only after assignment and stores the server timestamp", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    expect(startExecutionTask(record, backCnc.taskId, "2026-08-15T16:00:00.000Z")).toEqual({
      ok: false,
      error: "missing_assignment",
    });
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    expect(
      startExecutionTask(assigned.record, backCnc.taskId, "2026-08-15T16:00:00.000Z"),
    ).toEqual({ ok: false, error: "missing_executor" });
    const ready = withExecutor(assigned.record, backCnc.taskId);
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const task = started.record.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(task?.status).toBe("IN_PROGRESS");
    expect(task?.startedAt).toBe("2026-08-15T16:00:00.000Z");
    expect(task?.quantities).toEqual(backCnc.quantities);
    expect(task?.requiredCapabilityId).toBe(backCnc.requiredCapabilityId);
    expect(startExecutionTask(started.record, backCnc.taskId, "2026-08-15T17:00:00.000Z")).toEqual({
      ok: true,
      record: started.record,
      alreadyApplied: true,
    });
  });

  it("blocks a dependent task until dependencies complete, then allows start", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const lighting = taskByProcess(record, PLACE_LED_MODULES_ID);
    expect(assignProviderToTask(record, lighting.taskId, "WC_LED_ASSEMBLY")).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
    const people = testPeople();
    const lightingReady = withExecutor(record, lighting.taskId, people);
    expect(
      startExecutionTask(
        lightingReady.record,
        lighting.taskId,
        "2026-08-15T16:10:00.000Z",
        people,
      ),
    ).toEqual({ ok: false, error: "dependencies_incomplete" });

    const assignedCnc = assignProviderToTask(
      lightingReady.record,
      backCnc.taskId,
      MCH_CNC_4020_ID,
    );
    if (!assignedCnc.ok) {
      throw new Error("expected cnc assignment");
    }
    const cncReady = withExecutor(assignedCnc.record, backCnc.taskId, people);
    const startedCnc = startExecutionTask(
      cncReady.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      people,
    );
    if (!startedCnc.ok) {
      throw new Error("expected cnc start");
    }
    expect(
      startExecutionTask(startedCnc.record, lighting.taskId, "2026-08-15T16:10:00.000Z", people),
    ).toEqual({ ok: false, error: "dependencies_incomplete" });
    const completedCnc = completeExecutionTask(
      startedCnc.record,
      backCnc.taskId,
      "2026-08-15T16:05:00.000Z",
      plannedCompletionInput(backCnc),
    );
    if (!completedCnc.ok) {
      throw new Error("expected cnc complete");
    }
    const startedLighting = startExecutionTask(
      completedCnc.record,
      lighting.taskId,
      "2026-08-15T16:10:00.000Z",
      people,
    );
    expect(startedLighting.ok).toBe(true);
    if (!startedLighting.ok) {
      return;
    }
    expect(
      startedLighting.record.tasks.find((item) => item.taskId === lighting.taskId)?.status,
    ).toBe("IN_PROGRESS");
  });

  it("rejects complete before start and restart after complete", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    expect(
      completeExecutionTask(record, backCnc.taskId, "2026-08-15T16:05:00.000Z"),
    ).toEqual({ ok: false, error: "invalid_transition" });
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    const ready = withExecutor(assigned.record, backCnc.taskId);
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
    );
    if (!started.ok) {
      throw new Error("expected start");
    }
    const completed = completeExecutionTask(
      started.record,
      backCnc.taskId,
      "2026-08-15T16:05:00.000Z",
      plannedCompletionInput(backCnc),
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const task = completed.record.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(task?.status).toBe("COMPLETED");
    expect(task?.completedAt).toBe("2026-08-15T16:05:00.000Z");
    expect(
      startExecutionTask(completed.record, backCnc.taskId, "2026-08-15T16:20:00.000Z"),
    ).toEqual({ ok: false, error: "invalid_transition" });
    expect(
      completeExecutionTask(completed.record, backCnc.taskId, "2026-08-15T16:30:00.000Z"),
    ).toEqual({
      ok: true,
      record: completed.record,
      alreadyApplied: true,
    });
  });

  it("allows two independent assigned tasks to be in progress at the same time", () => {
    const record = planned();
    const faceCnc = taskBySource(record, "FACE", CUT_SHEET_CNC_ID);
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const assignedFace = assignProviderToTask(record, faceCnc.taskId, MCH_CNC_4020_ID);
    if (!assignedFace.ok) {
      throw new Error("expected face assignment");
    }
    const assignedBoth = assignProviderToTask(
      assignedFace.record,
      backCnc.taskId,
      MCH_CNC_4020_ID,
    );
    if (!assignedBoth.ok) {
      throw new Error("expected back assignment");
    }
    const people = testPeople();
    const faceReady = withExecutor(assignedBoth.record, faceCnc.taskId, people);
    const bothReady = withExecutor(faceReady.record, backCnc.taskId, people);
    const startedFace = startExecutionTask(
      bothReady.record,
      faceCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      people,
    );
    if (!startedFace.ok) {
      throw new Error("expected face start");
    }
    const startedBack = startExecutionTask(
      startedFace.record,
      backCnc.taskId,
      "2026-08-15T16:01:00.000Z",
      people,
    );
    expect(startedBack.ok).toBe(true);
    if (!startedBack.ok) {
      return;
    }
    const statuses = startedBack.record.tasks
      .filter((item) => item.taskId === faceCnc.taskId || item.taskId === backCnc.taskId)
      .map((item) => item.status);
    expect(statuses).toEqual(["IN_PROGRESS", "IN_PROGRESS"]);
  });

  it("rejects fake providers on manual tasks and still requires an executor", () => {
    const record = planned();
    const inspect = taskByProcess(record, INSPECT_FINISHED_LETTER_ID);
    const pack = taskByProcess(record, PACK_PRODUCT_ID);
    expect(assignProviderToTask(record, inspect.taskId, MCH_CNC_4020_ID)).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
    expect(startExecutionTask(record, pack.taskId, "2026-08-15T16:00:00.000Z")).toEqual({
      ok: false,
      error: "missing_executor",
    });
    const view = projectExecutionPlanView(record);
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.canAssign).toBe(false);
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.requiresProvider).toBe(
      false,
    );
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.canStart).toBe(false);
    expect(view.tasks.find((item) => item.taskId === pack.taskId)?.eligibleProviders).toEqual([]);
  });

  it("projects actions from task state and does not mutate snapshot or cost", () => {
    const snapshot = freeze();
    const record = materializeExecutionPlanFromSnapshot(snapshot, {
      createdAt: "2026-08-15T15:00:00.000Z",
    });
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    const ready = withExecutor(assigned.record, backCnc.taskId);
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
    );
    if (!started.ok) {
      throw new Error("expected start");
    }
    const completed = completeExecutionTask(
      started.record,
      backCnc.taskId,
      "2026-08-15T16:05:00.000Z",
      plannedCompletionInput(backCnc),
    );
    if (!completed.ok) {
      throw new Error("expected complete");
    }
    const view = projectExecutionPlanView(completed.record);
    const lighting = view.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const done = view.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(done?.canStart).toBe(false);
    expect(done?.canComplete).toBe(false);
    expect(done?.canAssign).toBe(false);
    expect(lighting?.waitingFor).toEqual([]);
    expect(lighting?.canStart).toBe(false);
    expect(completed.record.plan.eicTotal).toBe(382.5);
    expect(completed.record.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(JSON.stringify(completed.record)).not.toMatch(
      /employeeId|workerId|operatorId|plannedStart|capacity|pontaj|"actualCost"|scrap/,
    );
    expect(JSON.stringify(view)).not.toMatch(/employeeId|schedule|gantt|timesheet/);
  });
});

describe("planned effort mutation", () => {
  it("saves and clears planned effort only while PLANNED", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const saved = setPlannedEffortOnTask(record, backCnc.taskId, 45);
    expect(saved.ok).toBe(true);
    if (!saved.ok) {
      return;
    }
    expect(
      saved.record.tasks.find((item) => item.taskId === backCnc.taskId)?.plannedEffortMinutes,
    ).toBe(45);
    const cleared = setPlannedEffortOnTask(saved.record, backCnc.taskId, null);
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) {
      return;
    }
    expect(
      cleared.record.tasks.find((item) => item.taskId === backCnc.taskId)?.plannedEffortMinutes,
    ).toBeNull();
    expect(setPlannedEffortOnTask(record, backCnc.taskId, 0)).toEqual({
      ok: false,
      error: "invalid_planned_effort",
    });
  });

  it("freezes effort after start and still allows start with UNKNOWN", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    const ready = withExecutor(assigned.record, backCnc.taskId);
    expect(
      ready.record.tasks.find((item) => item.taskId === backCnc.taskId)?.plannedEffortMinutes,
    ).toBeNull();
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    expect(setPlannedEffortOnTask(started.record, backCnc.taskId, 45)).toEqual({
      ok: false,
      error: "effort_frozen",
    });
    const completed = completeExecutionTask(
      started.record,
      backCnc.taskId,
      "2026-08-15T16:10:00.000Z",
      plannedCompletionInput(backCnc),
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    expect(setPlannedEffortOnTask(completed.record, backCnc.taskId, 45)).toEqual({
      ok: false,
      error: "effort_frozen",
    });
  });
});

function requiredContext(
  confirmations: readonly MaterialReadinessConfirmation[] = [],
): MaterialReadinessContext {
  return { mode: "REQUIRED", confirmations };
}

describe("material readiness start gate", () => {
  it("keeps DISABLED from projecting availability or blocking start", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const lines = materialDemandLines(backCnc, []);
    expect(materialParticipation("DISABLED", lines)).toBe("NOT_ADOPTED");
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    const ready = withExecutor(assigned.record, backCnc.taskId);
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
      null,
      workcenterRegistry,
      { mode: "DISABLED", confirmations: [] },
    );
    expect(started.ok).toBe(true);
    const view = projectExecutionPlanView(
      ready.record,
      ready.people,
      null,
      null,
      ready.people[0]!.personId,
      workcenterRegistry,
      { mode: "DISABLED", confirmations: [] },
    );
    const projected = view.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(projected?.materialParticipation).toBe("NOT_ADOPTED");
    expect(projected?.materialBlockLabel).toBeNull();
    expect(projected?.materialLines).toEqual([]);
    expect(projected?.canClaimStart).toBe(true);
  });

  it("blocks REQUIRED material demands until every line is AVAILABLE", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const lighting = taskByProcess(record, PLACE_LED_MODULES_ID);
    const lines = materialDemandLines(lighting, []);
    expect(lines.some((line) => line.resourceId === "MAT-LED-MODULE")).toBe(true);
    expect(materialParticipation("REQUIRED", lines)).toBe("BLOCKED");
    const people = testPeople();
    const lightingReady = withExecutor(record, lighting.taskId, people);
    const assignedCnc = assignProviderToTask(
      lightingReady.record,
      backCnc.taskId,
      MCH_CNC_4020_ID,
    );
    if (!assignedCnc.ok) {
      throw new Error("expected cnc assignment");
    }
    const cncReady = withExecutor(assignedCnc.record, backCnc.taskId, people);
    const startedCnc = startExecutionTask(
      cncReady.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      people,
    );
    if (!startedCnc.ok) {
      throw new Error("expected cnc start");
    }
    const completedCnc = completeExecutionTask(
      startedCnc.record,
      backCnc.taskId,
      "2026-08-15T16:05:00.000Z",
      plannedCompletionInput(backCnc),
    );
    if (!completedCnc.ok) {
      throw new Error("expected cnc complete");
    }
    const blocked = startExecutionTask(
      completedCnc.record,
      lighting.taskId,
      "2026-08-15T16:10:00.000Z",
      people,
      null,
      workcenterRegistry,
      requiredContext(),
    );
    expect(blocked).toEqual({ ok: false, error: "material_not_ready" });
    const unavailable = startExecutionTask(
      completedCnc.record,
      lighting.taskId,
      "2026-08-15T16:10:00.000Z",
      people,
      null,
      workcenterRegistry,
      requiredContext(
        lines.map((line) => ({
          taskId: lighting.taskId,
          resourceId: line.resourceId,
          status: "NOT_AVAILABLE" as const,
          confirmedBy: "owner",
          confirmedAt: "2026-08-15T16:00:00.000Z",
        })),
      ),
    );
    expect(unavailable).toEqual({ ok: false, error: "material_not_ready" });
    const confirmed = lines.map((line) => ({
      taskId: lighting.taskId,
      resourceId: line.resourceId,
      status: "AVAILABLE" as const,
      confirmedBy: "owner",
      confirmedAt: "2026-08-15T16:00:00.000Z",
    }));
    const started = startExecutionTask(
      completedCnc.record,
      lighting.taskId,
      "2026-08-15T16:10:00.000Z",
      people,
      null,
      workcenterRegistry,
      requiredContext(confirmed),
    );
    expect(started.ok).toBe(true);
    const view = projectExecutionPlanView(
      completedCnc.record,
      people,
      null,
      null,
      people[0]!.personId,
      workcenterRegistry,
      requiredContext(),
    );
    const projected = view.tasks.find((item) => item.taskId === lighting.taskId);
    expect(projected?.materialParticipation).toBe("BLOCKED");
    expect(projected?.canClaimStart).toBe(false);
    expect(projected?.materialBlockLabel).toContain("Materialul nu este confirmat disponibil");
    const inbox = projectOperatorTaskInbox({
      currentOperator: people[0]!,
      people,
      eligibility: null,
      plans: [
        {
          record: completedCnc.record,
          snapshot: null,
          customerDisplayName: null,
          jobId: "job:1",
        },
      ],
      material: requiredContext(),
    });
    expect(inbox.blockedMaterial.some((item) => item.taskId === lighting.taskId)).toBe(true);
    expect(inbox.availableReady.some((item) => item.taskId === lighting.taskId)).toBe(false);
    expect(inbox.blockedMaterial.find((item) => item.taskId === lighting.taskId)?.canClaimStart).toBe(
      false,
    );
  });

  it("does not rewind an in-progress task when readiness becomes REQUIRED", () => {
    const record = planned();
    const backCnc = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
    const assigned = assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error("expected assignment");
    }
    const ready = withExecutor(assigned.record, backCnc.taskId);
    const started = startExecutionTask(
      ready.record,
      backCnc.taskId,
      "2026-08-15T16:00:00.000Z",
      ready.people,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const replay = startExecutionTask(
      started.record,
      backCnc.taskId,
      "2026-08-15T17:00:00.000Z",
      ready.people,
      null,
      workcenterRegistry,
      requiredContext(),
    );
    expect(replay).toEqual({ ok: true, record: started.record, alreadyApplied: true });
    const completed = completeExecutionTask(
      started.record,
      backCnc.taskId,
      "2026-08-15T16:10:00.000Z",
      plannedCompletionInput(backCnc),
    );
    expect(completed.ok).toBe(true);
  });

  it("treats a REQUIRED task with no material demand as not applicable", () => {
    const record = planned();
    const inspect = taskByProcess(record, INSPECT_FINISHED_LETTER_ID);
    const lines = materialDemandLines(inspect, []);
    expect(lines).toEqual([]);
    expect(materialParticipation("REQUIRED", lines)).toBe("NOT_APPLICABLE");
  });
});
