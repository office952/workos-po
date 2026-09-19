import { describe, expect, it } from "vitest";
import { createPerson, retirePerson } from "../people/identity.js";
import { CUT_SHEET_CNC_ID, INSPECT_FINISHED_LETTER_ID } from "../processes/catalog.js";
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
import { MCH_CNC_4020_ID } from "../workcenters/catalog.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  plannedCompletionInput,
  startExecutionTask,
} from "./lifecycle.js";
import { materializeExecutionPlanFromSnapshot, projectExecutionPlanView } from "./plan.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function planned() {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values: readyValues },
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
  const snapshot = freezeAcceptedProductionSnapshot(
    truth,
    aggregate,
    composition,
    compileEic(aggregate, composition),
    { createdAt: "2026-08-16T17:00:00.000Z" },
  );
  return {
    snapshot,
    record: materializeExecutionPlanFromSnapshot(snapshot, {
      createdAt: "2026-08-16T17:05:00.000Z",
    }),
  };
}

describe("task executor assignment", () => {
  it("assigns an ACTIVE person, locks after start, and freezes the display label", () => {
    const { snapshot, record } = planned();
    const created = createPerson("Maria Ionescu", { personId: "per:maria" });
    if (!created.ok) {
      throw new Error("expected person");
    }
    const people = [created.person];
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!backCnc) {
      throw new Error("missing cnc");
    }
    expect(
      assignExecutorToTask(record, backCnc.taskId, "per:unknown", people),
    ).toEqual({ ok: false, error: "unknown_person" });
    const assigned = assignExecutorToTask(record, backCnc.taskId, created.person.personId, people);
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    expect(
      assigned.record.tasks.find((item) => item.taskId === backCnc.taskId)?.assignedExecutor,
    ).toEqual({ id: "per:maria", label: "Maria Ionescu" });

    const renamed = { ...created.person, displayName: "Maria I." };
    const withProvider = assignProviderToTask(assigned.record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!withProvider.ok) {
      throw new Error("expected provider");
    }
    const started = startExecutionTask(
      withProvider.record,
      backCnc.taskId,
      "2026-08-16T17:10:00.000Z",
      [renamed],
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    expect(
      started.record.tasks.find((item) => item.taskId === backCnc.taskId)?.assignedExecutor,
    ).toEqual({ id: "per:maria", label: "Maria I." });
    expect(
      assignExecutorToTask(started.record, backCnc.taskId, created.person.personId, people),
    ).toEqual({ ok: false, error: "reassignment_locked" });

    const retired = retirePerson(renamed, "2026-08-16T17:20:00.000Z");
    if (!retired.ok) {
      throw new Error("expected retire");
    }
    const completed = completeExecutionTask(
      started.record,
      backCnc.taskId,
      "2026-08-16T17:21:00.000Z",
      plannedCompletionInput(backCnc),
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const view = projectExecutionPlanView(completed.record, [retired.person]);
    const done = view.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(done?.assignedExecutor).toEqual({ id: "per:maria", label: "Maria I." });
    expect(done?.completion?.outcome).toBe("COMPLETED_AS_PLANNED");
    expect(completed.record.plan.eicTotal).toBe(382.5);
    expect(completed.record.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(JSON.stringify(snapshot)).not.toMatch(/personId|Maria|executor/);
  });

  it("rejects retired people for new assignment and start", () => {
    const { record } = planned();
    const created = createPerson("Executor test");
    if (!created.ok) {
      throw new Error("expected person");
    }
    const retired = retirePerson(created.person, "2026-08-16T17:12:00.000Z");
    if (!retired.ok) {
      throw new Error("expected retire");
    }
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!backCnc) {
      throw new Error("missing cnc");
    }
    expect(
      assignExecutorToTask(record, backCnc.taskId, created.person.personId, [retired.person]),
    ).toEqual({ ok: false, error: "retired_person" });

    const assigned = assignExecutorToTask(record, backCnc.taskId, created.person.personId, [
      created.person,
    ]);
    if (!assigned.ok) {
      throw new Error("expected assign while active");
    }
    const withProvider = assignProviderToTask(assigned.record, backCnc.taskId, MCH_CNC_4020_ID);
    if (!withProvider.ok) {
      throw new Error("expected provider");
    }
    expect(
      startExecutionTask(
        withProvider.record,
        backCnc.taskId,
        "2026-08-16T17:13:00.000Z",
        [retired.person],
      ),
    ).toEqual({ ok: false, error: "retired_person" });
  });

  it("does not let an executor bypass a required missing provider", () => {
    const { record } = planned();
    const created = createPerson("Executor test");
    if (!created.ok) {
      throw new Error("expected person");
    }
    const backCnc = record.tasks.find(
      (item) => item.processId === CUT_SHEET_CNC_ID && item.scope === "BACK",
    );
    if (!backCnc) {
      throw new Error("missing back CNC");
    }
    const assigned = assignExecutorToTask(record, backCnc.taskId, created.person.personId, [
      created.person,
    ]);
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    expect(
      startExecutionTask(
        assigned.record,
        backCnc.taskId,
        "2026-08-16T17:14:00.000Z",
        [created.person],
      ),
    ).toEqual({ ok: false, error: "missing_assignment" });
    const view = projectExecutionPlanView(assigned.record, [created.person]);
    expect(view.tasks.find((item) => item.taskId === backCnc.taskId)?.canStart).toBe(false);
    expect(view.tasks.find((item) => item.taskId === backCnc.taskId)?.requiresProvider).toBe(true);
  });

  it("lets a manual task start with an executor once dependencies are complete", () => {
    const { record } = planned();
    const created = createPerson("Executor test");
    if (!created.ok) {
      throw new Error("expected person");
    }
    const inspect = record.tasks.find((item) => item.processId === INSPECT_FINISHED_LETTER_ID);
    if (!inspect) {
      throw new Error("missing inspect");
    }
    const assigned = assignExecutorToTask(record, inspect.taskId, created.person.personId, [
      created.person,
    ]);
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    expect(
      startExecutionTask(
        assigned.record,
        inspect.taskId,
        "2026-08-16T17:15:00.000Z",
        [created.person],
      ),
    ).toEqual({ ok: false, error: "dependencies_incomplete" });
    const view = projectExecutionPlanView(assigned.record, [created.person]);
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.canAssign).toBe(false);
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.requiresProvider).toBe(
      false,
    );
    expect(view.tasks.find((item) => item.taskId === inspect.taskId)?.canStart).toBe(false);
  });
});
