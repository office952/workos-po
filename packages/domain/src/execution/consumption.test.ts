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
import { MAT_LED_MODULE_ID, PLEXIGLAS_3MM_OPAL_ID } from "../resources/catalog.js";
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
import { actualConsumptionEntryId, buildActualConsumption } from "./consumption.js";
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

describe("execution actual resource consumption", () => {
  it("records actual consumption against frozen planned resources without mutating plan truth", () => {
    const { snapshot, record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!lighting || !backCnc) {
      throw new Error("missing tasks");
    }
    const moduleDemand = lighting.resourceDemands.find(
      (item) => item.resourceId === MAT_LED_MODULE_ID,
    );
    if (!moduleDemand) {
      throw new Error("missing LED module demand");
    }
    expect(moduleDemand.quantity).toBe(125);
    expect(lighting.actualConsumption).toEqual([]);

    const startedCnc = startAssigned(record, backCnc.taskId, MCH_CNC_4020_ID);
    const completedCnc = unwrap(
      completeExecutionTask(
        startedCnc,
        backCnc.taskId,
        "2026-08-16T12:11:00.000Z",
        plannedCompletionInput(backCnc),
      ),
    );
    expect(completedCnc.tasks.find((item) => item.taskId === backCnc.taskId)?.actualConsumption).toEqual(
      [],
    );

    const startedLed = startAssigned(completedCnc, lighting.taskId);
    const completedLed = unwrap(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 125,
        actualConsumption: [
          {
            resourceId: MAT_LED_MODULE_ID,
            actualQuantity: 127,
            note: "2 module sparte la montaj",
          },
        ],
      }),
    );
    const ledDone = completedLed.tasks.find((item) => item.taskId === lighting.taskId);
    expect(ledDone?.actualConsumption).toEqual([
      {
        entryId: actualConsumptionEntryId(lighting.taskId, MAT_LED_MODULE_ID),
        taskId: lighting.taskId,
        resourceId: MAT_LED_MODULE_ID,
        resourceLabel: "Modul LED 12V",
        actualQuantity: 127,
        unit: "buc",
        recordedAt: "2026-08-16T12:12:00.000Z",
        note: "2 module sparte la montaj",
      },
    ]);
    expect(ledDone?.resourceDemands.find((item) => item.resourceId === MAT_LED_MODULE_ID)?.quantity).toBe(
      125,
    );
    expect(ledDone?.quantities[0]?.value).toBe(125);
    expect(completedLed.plan.eicTotal).toBe(382.5);
    expect(completedLed.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(JSON.stringify(completedLed)).not.toMatch(
      /"actualCost"|inventoryEngine|scrap|machineHours|laborMinutes/,
    );

    const view = projectExecutionPlanView(completedLed);
    const ledView = view.tasks.find((item) => item.taskId === lighting.taskId);
    expect(ledView?.hasPlannedResources).toBe(true);
    expect(ledView?.canRecordActualConsumption).toBe(false);
    expect(ledView?.canComplete).toBe(false);
  });

  it("records multiple planned resources on the same complete and leaves unused planned rows unrecorded", () => {
    const { record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!lighting || !backCnc) {
      throw new Error("missing tasks");
    }
    expect(lighting.resourceDemands.length).toBeGreaterThan(1);
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
        completedQuantity: 125,
        actualConsumption: lighting.resourceDemands.map((demand) => ({
          resourceId: demand.resourceId,
          actualQuantity: demand.quantity,
        })),
      }),
    );
    const ledDone = completedLed.tasks.find((item) => item.taskId === lighting.taskId);
    expect(ledDone?.actualConsumption.map((item) => item.resourceId)).toEqual(
      lighting.resourceDemands.map((item) => item.resourceId),
    );
  });

  it("rejects invalid quantity, unit, resource and unexpected actuals on tasks without planned resources", () => {
    const { record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const inspect = record.tasks.find((item) => item.processLabel === "Control calitate final");
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!lighting || !inspect || !backCnc) {
      throw new Error("missing tasks");
    }
    expect(inspect.resourceDemands).toEqual([]);
    expect(
      buildActualConsumption(
        inspect,
        [{ resourceId: MAT_LED_MODULE_ID, actualQuantity: 1 }],
        "2026-08-16T12:20:00.000Z",
      ),
    ).toEqual({ ok: false, error: "invalid_resource" });

    const startedCnc = startAssigned(record, backCnc.taskId, MCH_CNC_4020_ID);
    expect(
      completeExecutionTask(startedCnc, backCnc.taskId, "2026-08-16T12:11:00.000Z", {
        completedQuantity: 12.5,
        actualConsumption: [
          { resourceId: PLEXIGLAS_3MM_OPAL_ID, actualQuantity: 0.87 },
        ],
      }),
    ).toEqual({ ok: false, error: "invalid_resource" });

    const completedCnc = unwrap(
      completeExecutionTask(
        startedCnc,
        backCnc.taskId,
        "2026-08-16T12:11:00.000Z",
        plannedCompletionInput(backCnc),
      ),
    );
    const startedLed = startAssigned(completedCnc, lighting.taskId);
    expect(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 125,
        actualConsumption: [{ resourceId: MAT_LED_MODULE_ID, actualQuantity: -1 }],
      }),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    expect(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 125,
        actualConsumption: [{ resourceId: MAT_LED_MODULE_ID, actualQuantity: Number.NaN }],
      }),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    expect(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 125,
        actualConsumption: [
          { resourceId: MAT_LED_MODULE_ID, actualQuantity: 127, unit: "m2" },
        ],
      }),
    ).toEqual({ ok: false, error: "invalid_unit" });
    expect(
      completeExecutionTask(startedLed, lighting.taskId, "2026-08-16T12:12:00.000Z", {
        completedQuantity: 125,
        actualConsumption: [
          { resourceId: MAT_LED_MODULE_ID, actualQuantity: 127 },
          { resourceId: MAT_LED_MODULE_ID, actualQuantity: 1 },
        ],
      }),
    ).toEqual({ ok: false, error: "invalid_resource" });
  });

  it("keeps qualitative completion optional and freezes the first complete including actuals", () => {
    const { record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const wire = record.tasks.find((item) => item.processId === WIRE_LIGHTING_ID);
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!lighting || !wire || !backCnc) {
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
        completedQuantity: 125,
        actualConsumption: [{ resourceId: MAT_LED_MODULE_ID, actualQuantity: 127 }],
      }),
    );
    const rewrite = completeExecutionTask(completedLed, lighting.taskId, "2026-08-16T12:40:00.000Z", {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: MAT_LED_MODULE_ID, actualQuantity: 200 }],
    });
    expect(rewrite).toEqual({ ok: true, record: completedLed, alreadyApplied: true });
    expect(
      completedLed.tasks.find((item) => item.taskId === lighting.taskId)?.actualConsumption[0]
        ?.actualQuantity,
    ).toBe(127);

    const startedWire = startAssigned(completedLed, wire.taskId);
    const completedWire = unwrap(
      completeExecutionTask(startedWire, wire.taskId, "2026-08-16T12:13:00.000Z"),
    );
    expect(
      completedWire.tasks.find((item) => item.taskId === wire.taskId)?.actualConsumption,
    ).toEqual([]);
    const wireView = projectExecutionPlanView(completedWire).tasks.find(
      (item) => item.taskId === wire.taskId,
    );
    expect(wireView?.hasPlannedResources).toBe(true);
    expect(wireView?.canRecordActualConsumption).toBe(false);
  });

  it("rejects actual consumption before the task is in progress", () => {
    const { record } = planned();
    const backCnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!backCnc) {
      throw new Error("missing cnc");
    }
    expect(
      completeExecutionTask(record, backCnc.taskId, "2026-08-16T12:11:00.000Z", {
        completedQuantity: 12.5,
        actualConsumption: backCnc.resourceDemands.map((demand) => ({
          resourceId: demand.resourceId,
          actualQuantity: demand.quantity,
        })),
      }),
    ).toEqual({ ok: false, error: "invalid_transition" });
  });
});
