import { describe, expect, it } from "vitest";
import { CUT_SHEET_CNC_ID, PLACE_LED_MODULES_ID, WIRE_LIGHTING_ID } from "../processes/catalog.js";
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
    { createdAt: "2026-08-16T12:00:00.000Z" },
  );
  return {
    snapshot,
    record: materializeExecutionPlanFromSnapshot(snapshot, {
      createdAt: "2026-08-16T12:05:00.000Z",
    }),
  };
}

function unwrap(result: TaskMutationResult): ExecutionPlanRecord {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.record;
}

function testPeople(): Person[] {
  const created = createPerson("Executor test", { personId: "per:test-executor" });
  if (!created.ok) {
    throw new Error("expected test person");
  }
  return [created.person];
}

function startAssigned(
  record: ExecutionPlanRecord,
  taskId: string,
  providerId?: string,
): ExecutionPlanRecord {
  const people = testPeople();
  const withProvider = providerId
    ? unwrap(assignProviderToTask(record, taskId, providerId))
    : record;
  const withExecutor = unwrap(
    assignExecutorToTask(withProvider, taskId, people[0]!.personId, people),
  );
  return unwrap(startExecutionTask(withExecutor, taskId, "2026-08-16T12:10:00.000Z", people));
}

describe("minimal execution completion evidence", () => {
  it("completes CNC 12.5 m and LED 125 buc as planned without mutating frozen truth", () => {
    const { snapshot, record } = planned();
    const cnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    if (!cnc || !lighting) {
      throw new Error("missing measurable tasks");
    }
    expect(cnc.quantities[0]).toMatchObject({ value: 12.5, unit: "m" });
    expect(lighting.quantities[0]).toMatchObject({ value: 125, unit: "buc" });

    const startedCnc = startAssigned(record, cnc.taskId, MCH_CNC_4020_ID);
    const completedCnc = unwrap(
      completeExecutionTask(
        startedCnc,
        cnc.taskId,
        "2026-08-16T12:11:00.000Z",
        { completedQuantity: 12.5, note: "Executat conform fișei" },
      ),
    );
    const cncDone = completedCnc.tasks.find((item) => item.taskId === cnc.taskId);
    expect(cncDone?.completion).toEqual({
      outcome: "COMPLETED_AS_PLANNED",
      completedQuantity: 12.5,
      completedQuantityUnit: "m",
      note: "Executat conform fișei",
    });
    expect(cncDone?.quantities[0]?.value).toBe(12.5);

    const startedLed = startAssigned(completedCnc, lighting.taskId);
    const completedLed = unwrap(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 125,
      }),
    );
    const view = projectExecutionPlanView(completedLed);
    const ledView = view.tasks.find((item) => item.taskId === lighting.taskId);
    expect(ledView?.completion?.outcome).toBe("COMPLETED_AS_PLANNED");
    expect(ledView?.completedQuantityLabel).toBe("Realizat: 125 buc");
    expect(ledView?.varianceLabel).toBe("Conform planului");
    expect(view.progress.varianceCount).toBe(0);
    expect(completedLed.plan.eicTotal).toBe(382.5);
    expect(completedLed.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(JSON.stringify(completedLed)).not.toMatch(
      /employeeId|"actualCost"|inventoryEngine|scrap|machineHours|laborMinutes/,
    );
  });

  it("records a quantity variance without blocking completion or repricing", () => {
    const { snapshot, record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!lighting || !backCnc) {
      throw new Error("missing tasks");
    }
    const startedCnc = startAssigned(record, backCnc.taskId, MCH_CNC_4020_ID);
    const completedCnc = unwrap(
      completeExecutionTask(
        startedCnc,
        backCnc.taskId,
        "2026-08-16T12:11:00.000Z",
        plannedCompletionInput(backCnc),
      ),
    );
    const startedLed = startAssigned(completedCnc, lighting.taskId);
    const completedLed = unwrap(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 123,
        note: "2 module înlocuite în timpul montajului",
      }),
    );
    const view = projectExecutionPlanView(completedLed);
    const ledView = view.tasks.find((item) => item.taskId === lighting.taskId);
    expect(ledView?.status).toBe("COMPLETED");
    expect(ledView?.completion?.outcome).toBe("COMPLETED_WITH_VARIANCE");
    expect(ledView?.completedQuantityLabel).toBe("Realizat: 123 buc");
    expect(ledView?.varianceLabel).toBe("Diferență față de plan: -2 buc");
    expect(ledView?.quantities[0]?.value).toBe(125);
    expect(view.progress.varianceCount).toBe(1);
    expect(view.progress.status).toBe("IN_PROGRESS");
    expect(completedLed.plan.eicTotal).toBe(382.5);
    expect(completedLed.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
  });

  it("rejects invalid quantities and unexpected quantity on qualitative tasks", () => {
    const { record } = planned();
    const cnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    const wire = record.tasks.find((item) => item.processId === WIRE_LIGHTING_ID);
    if (!cnc || !wire) {
      throw new Error("missing tasks");
    }
    const startedCnc = startAssigned(record, cnc.taskId, MCH_CNC_4020_ID);
    expect(
      completeExecutionTask(startedCnc, cnc.taskId, "2026-08-16T12:11:00.000Z"),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    expect(
      completeExecutionTask(startedCnc, cnc.taskId, "2026-08-16T12:11:00.000Z", {
        completedQuantity: -1,
      }),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    expect(
      completeExecutionTask(startedCnc, cnc.taskId, "2026-08-16T12:11:00.000Z", {
        completedQuantity: Number.NaN,
      }),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    expect(
      completeExecutionTask(startedCnc, cnc.taskId, "2026-08-16T12:11:00.000Z", {
        completedQuantity: 12.5,
        note: "x".repeat(281),
      }),
    ).toEqual({ ok: false, error: "invalid_note" });

    const completedCnc = unwrap(
      completeExecutionTask(
        startedCnc,
        cnc.taskId,
        "2026-08-16T12:11:00.000Z",
        plannedCompletionInput(cnc),
      ),
    );
    const lighting = completedCnc.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    if (!lighting) {
      throw new Error("missing lighting");
    }
    const startedLed = startAssigned(completedCnc, lighting.taskId);
    const completedLed = unwrap(
      completeExecutionTask(
        startedLed,
        lighting.taskId,
        "2026-08-16T12:12:00.000Z",
        plannedCompletionInput(lighting),
      ),
    );
    const startedWire = startAssigned(completedLed, wire.taskId);
    expect(
      completeExecutionTask(startedWire, wire.taskId, "2026-08-16T12:13:00.000Z", {
        completedQuantity: 1,
      }),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    const completedWire = unwrap(
      completeExecutionTask(startedWire, wire.taskId, "2026-08-16T12:13:00.000Z"),
    );
    expect(
      completedWire.tasks.find((item) => item.taskId === wire.taskId)?.completion?.outcome,
    ).toBe("COMPLETED_AS_PLANNED");
    expect(
      completedWire.tasks.find((item) => item.taskId === wire.taskId)?.completion
        ?.completedQuantity,
    ).toBeNull();
  });

  it("keeps completion evidence immutable after the first complete", () => {
    const { record } = planned();
    const cnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!cnc) {
      throw new Error("missing cnc");
    }
    const started = startAssigned(record, cnc.taskId, MCH_CNC_4020_ID);
    const completed = unwrap(
      completeExecutionTask(started, cnc.taskId, "2026-08-16T12:11:00.000Z", {
        completedQuantity: 12.5,
        note: "prima",
      }),
    );
    const again = completeExecutionTask(completed, cnc.taskId, "2026-08-16T12:40:00.000Z", {
      completedQuantity: 10,
      note: "rescrie",
    });
    expect(again).toEqual({ ok: true, record: completed, alreadyApplied: true });
    expect(completed.tasks.find((item) => item.taskId === cnc.taskId)?.completion?.note).toBe(
      "prima",
    );
    expect(
      completed.tasks.find((item) => item.taskId === cnc.taskId)?.completion?.completedQuantity,
    ).toBe(12.5);
  });
});
