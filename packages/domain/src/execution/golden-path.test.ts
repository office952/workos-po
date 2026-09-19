import { describe, expect, it } from "vitest";
import {
  APPLY_SURFACE_FINISH_ID,
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PACK_PRODUCT_ID,
  PLACE_LED_MODULES_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
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
} from "../workcenters/catalog.js";
import { createPerson, type Person } from "../people/identity.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  plannedCompletionInput,
  startExecutionTask,
  type TaskMutationResult,
} from "./lifecycle.js";
import {
  materializeExecutionPlanFromSnapshot,
  projectExecutionPlanView,
  type ExecutionPlanRecord,
} from "./plan.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function freeze(values: DraftValues = readyValues) {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  return freezeAcceptedProductionSnapshot(
    truth,
    aggregate,
    composition,
    compileEic(aggregate, composition),
    { createdAt: "2026-08-16T10:00:00.000Z" },
  );
}

function testPeople(): Person[] {
  const created = createPerson("Executor test", { personId: "per:test-executor" });
  if (!created.ok) {
    throw new Error("expected test person");
  }
  return [created.person];
}

function unwrap(result: TaskMutationResult): ExecutionPlanRecord {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.record;
}

function run(
  record: ExecutionPlanRecord,
  taskId: string,
  providerId: string,
  startedAt: string,
  completedAt: string,
): ExecutionPlanRecord {
  const people = testPeople();
  const assigned = unwrap(assignProviderToTask(record, taskId, providerId));
  const withExecutor = unwrap(
    assignExecutorToTask(assigned, taskId, people[0]!.personId, people),
  );
  const started = unwrap(startExecutionTask(withExecutor, taskId, startedAt, people));
  const task = started.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    throw new Error(`missing ${taskId}`);
  }
  return unwrap(
    completeExecutionTask(started, taskId, completedAt, plannedCompletionInput(task)),
  );
}

function runManual(
  record: ExecutionPlanRecord,
  taskId: string,
  startedAt: string,
  completedAt: string,
): ExecutionPlanRecord {
  const people = testPeople();
  const withExecutor = unwrap(
    assignExecutorToTask(record, taskId, people[0]!.personId, people),
  );
  expect(assignProviderToTask(withExecutor, taskId, WC_ASSEMBLY_01_ID)).toEqual({
    ok: false,
    error: "ineligible_provider",
  });
  const started = unwrap(startExecutionTask(withExecutor, taskId, startedAt, people));
  const task = started.tasks.find((item) => item.taskId === taskId);
  if (!task) {
    throw new Error(`missing ${taskId}`);
  }
  expect(task.assignedProvider).toBeNull();
  return unwrap(
    completeExecutionTask(started, taskId, completedAt, plannedCompletionInput(task)),
  );
}

function bySource(record: ExecutionPlanRecord, scope: "FACE" | "BACK" | "VOLUME", processId: string) {
  const task = record.tasks.find(
    (item) => item.sourceOperationId === compositionNodeId(scope, processId),
  );
  if (!task) {
    throw new Error(`missing ${scope} ${processId}`);
  }
  return task;
}

function byProcess(record: ExecutionPlanRecord, processId: string) {
  const task = record.tasks.find((item) => item.processId === processId);
  if (!task) {
    throw new Error(`missing ${processId}`);
  }
  return task;
}

describe("LETTERS execution golden path", () => {
  it("executes machine tasks and then the three manual operations without fake providers", () => {
    const snapshot = freeze();
    let record = materializeExecutionPlanFromSnapshot(snapshot, {
      createdAt: "2026-08-16T10:05:00.000Z",
    });
    const faceCnc = bySource(record, "FACE", CUT_SHEET_CNC_ID);
    const backCnc = bySource(record, "BACK", CUT_SHEET_CNC_ID);
    const volumeForm = bySource(record, "VOLUME", FORM_ALUMINIUM_PROFILE_ID);
    const bond = byProcess(record, BOND_LETTER_BODY_ID);
    const placeLed = byProcess(record, PLACE_LED_MODULES_ID);
    const wire = byProcess(record, WIRE_LIGHTING_ID);
    const psu = byProcess(record, INSTALL_OR_CONNECT_PSU_ID);
    const ignition = byProcess(record, TEST_LIGHTING_IGNITION_ID);
    const close = byProcess(record, CLOSE_LETTER_BODY_ID);
    const uniformity = byProcess(record, TEST_ILLUMINATION_UNIFORMITY_ID);
    const inspect = byProcess(record, INSPECT_FINISHED_LETTER_ID);
    const pack = byProcess(record, PACK_PRODUCT_ID);

    expect(record.tasks).toHaveLength(12);
    expect(placeLed.quantities[0]?.value).toBe(125);
    expect(psu.resourceDemands.some((item) => item.label === "Sursă LED 12V 160W")).toBe(true);

    const people = testPeople();
    record = unwrap(assignProviderToTask(record, faceCnc.taskId, MCH_CNC_4020_ID));
    record = unwrap(assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID));
    record = unwrap(assignExecutorToTask(record, faceCnc.taskId, people[0]!.personId, people));
    record = unwrap(assignExecutorToTask(record, backCnc.taskId, people[0]!.personId, people));
    record = unwrap(startExecutionTask(record, faceCnc.taskId, "2026-08-16T10:10:00.000Z", people));
    record = unwrap(startExecutionTask(record, backCnc.taskId, "2026-08-16T10:11:00.000Z", people));
    const parallel = projectExecutionPlanView(record);
    expect(
      parallel.tasks.filter(
        (item) =>
          (item.taskId === faceCnc.taskId || item.taskId === backCnc.taskId) &&
          item.status === "IN_PROGRESS",
      ),
    ).toHaveLength(2);
    expect(parallel.progress.status).toBe("IN_PROGRESS");
    expect(parallel.progress.inProgress).toBe(2);
    expect(parallel.tasks.find((item) => item.taskId === placeLed.taskId)?.canStart).toBe(false);

    record = unwrap(
      completeExecutionTask(
        record,
        faceCnc.taskId,
        "2026-08-16T10:12:00.000Z",
        plannedCompletionInput(faceCnc),
      ),
    );
    record = unwrap(
      completeExecutionTask(
        record,
        backCnc.taskId,
        "2026-08-16T10:13:00.000Z",
        plannedCompletionInput(backCnc),
      ),
    );
    expect(
      projectExecutionPlanView(record).tasks.find((item) => item.taskId === placeLed.taskId)
        ?.waitingFor,
    ).toEqual([]);

    record = run(record, volumeForm.taskId, MCH_CNC_CANT_LITERE_ID, "2026-08-16T10:14:00.000Z", "2026-08-16T10:15:00.000Z");
    record = runManual(record, placeLed.taskId, "2026-08-16T10:16:00.000Z", "2026-08-16T10:17:00.000Z");
    record = runManual(record, wire.taskId, "2026-08-16T10:18:00.000Z", "2026-08-16T10:19:00.000Z");
    record = runManual(record, psu.taskId, "2026-08-16T10:20:00.000Z", "2026-08-16T10:21:00.000Z");
    record = runManual(record, ignition.taskId, "2026-08-16T10:22:00.000Z", "2026-08-16T10:23:00.000Z");
    record = runManual(record, bond.taskId, "2026-08-16T10:24:00.000Z", "2026-08-16T10:25:00.000Z");
    record = runManual(record, close.taskId, "2026-08-16T10:26:00.000Z", "2026-08-16T10:27:00.000Z");

    const view = projectExecutionPlanView(record);
    const remaining = [uniformity, inspect, pack].map((task) =>
      view.tasks.find((item) => item.taskId === task.taskId),
    );
    expect(view.progress).toEqual({
      total: 12,
      completed: 9,
      inProgress: 0,
      planned: 3,
      waitingDependencies: 2,
      noProvider: 0,
      noExecutor: 3,
      varianceCount: 0,
      status: "IN_PROGRESS",
    });
    expect(view.progress.status).not.toBe("COMPLETED");
    expect(remaining.every((item) => item?.status === "PLANNED")).toBe(true);
    expect(remaining.every((item) => item?.canAssign === false)).toBe(true);
    expect(remaining.every((item) => item?.requiresProvider === false)).toBe(true);
    expect(remaining.every((item) => item?.canStart === false)).toBe(true);
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.waitingFor).toEqual([
      "Probă uniformitate — Iluminare",
    ]);
    expect(view.tasks.find((item) => item.taskId === pack.taskId)?.waitingFor).toEqual([
      "Control calitate final — Produs",
    ]);
    record = runManual(record, uniformity.taskId, "2026-08-16T10:28:00.000Z", "2026-08-16T10:29:00.000Z");
    record = runManual(record, inspect.taskId, "2026-08-16T10:30:00.000Z", "2026-08-16T10:31:00.000Z");
    record = runManual(record, pack.taskId, "2026-08-16T10:32:00.000Z", "2026-08-16T10:33:00.000Z");
    const finished = projectExecutionPlanView(record);
    expect(finished.progress).toEqual({
      total: 12,
      completed: 12,
      inProgress: 0,
      planned: 0,
      waitingDependencies: 0,
      noProvider: 0,
      noExecutor: 0,
      varianceCount: 0,
      status: "COMPLETED",
    });
    expect(record.plan.eicTotal).toBe(382.5);
    expect(record.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(record.tasks.find((item) => item.taskId === placeLed.taskId)?.quantities[0]?.value).toBe(
      125,
    );
    expect(JSON.stringify(record)).not.toMatch(
      /employeeId|plannedStart|capacity|pontaj|actualQty|scrap|gantt/,
    );
  });

  it("keeps the vinyl face operation frozen without fabricating paint or extra providers", () => {
    const vinyl = freeze({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    const record = materializeExecutionPlanFromSnapshot(vinyl);
    const view = projectExecutionPlanView(record);
    expect(record.tasks).toHaveLength(13);
    expect(record.tasks.some((item) => item.processId === APPLY_SURFACE_FINISH_ID)).toBe(true);
    expect(view.tasks.find((item) => item.processId === APPLY_SURFACE_FINISH_ID)?.canAssign).toBe(
      true,
    );
    expect(view.progress.noProvider).toBe(0);
    expect(view.progress.status).toBe("PLANNED");
    expect(record.plan.eicTotal).toBe(386);
  });
});
