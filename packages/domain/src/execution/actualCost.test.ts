import { describe, expect, it } from "vitest";
import { CUT_SHEET_CNC_ID, PLACE_LED_MODULES_ID } from "../processes/catalog.js";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
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
import {
  MAT_LED_MODULE_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  SVC_CNC_FACE_ID,
} from "../resources/catalog.js";
import { freezeAcceptedProductionSnapshot } from "../production/snapshot.js";
import { MCH_CNC_4020_ID, WC_LED_ASSEMBLY_ID } from "../workcenters/catalog.js";
import { createPerson } from "../people/identity.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  startExecutionTask,
  type TaskMutationResult,
} from "./lifecycle.js";
import { projectActualInternalCost } from "./actualCost.js";
import {
  materializeExecutionPlanFromSnapshot,
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

function person() {
  const created = createPerson("Executor test");
  if (!created.ok) {
    throw new Error("expected person");
  }
  return created.person;
}

describe("actual internal cost projection", () => {
  it("stays unavailable until actual consumption exists and does not use planned quantity", () => {
    const { snapshot, record } = planned();
    const cost = projectActualInternalCost(record, snapshot);
    expect(record.plan.eicTotal).toBe(382.5);
    expect(cost.status).toBe("UNAVAILABLE");
    expect(cost.statusLabel).toBe("Indisponibil");
    expect(cost.calculableTotal).toBeNull();
    expect(cost.availableDifference).toBeNull();
    const plexi = cost.lines.find((item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    expect(plexi?.status).toBe("UNAVAILABLE");
    expect(plexi?.actualCost).toBeNull();
    expect(plexi?.unavailableReason).toBe("Fără consum înregistrat");
    expect(cost.lines.some((item) => item.actualCost === 0 && item.status === "UNAVAILABLE")).toBe(
      false,
    );
  });

  it("prices LED actuals from frozen snapshot rates and keeps labor/sheet unavailable", () => {
    const { snapshot, record } = planned();
    const executor = person();
    const backCnc = record.tasks.find(
      (item) => item.processId === CUT_SHEET_CNC_ID && item.scopeLabel === "Spate",
    );
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    if (!backCnc || !lighting) {
      throw new Error("missing tasks");
    }
    let next = unwrap(
      assignProviderToTask(record, backCnc.taskId, MCH_CNC_4020_ID),
    );
    next = unwrap(assignExecutorToTask(next, backCnc.taskId, executor.personId, [executor]));
    next = unwrap(startExecutionTask(next, backCnc.taskId, "2026-08-16T13:00:00.000Z", [executor]));
    next = unwrap(
      completeExecutionTask(next, backCnc.taskId, "2026-08-16T13:10:00.000Z", {
        completedQuantity: 12.7,
      }),
    );
    expect(assignProviderToTask(next, lighting.taskId, WC_LED_ASSEMBLY_ID)).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
    next = unwrap(assignExecutorToTask(next, lighting.taskId, executor.personId, [executor]));
    next = unwrap(
      startExecutionTask(next, lighting.taskId, "2026-08-16T13:20:00.000Z", [executor]),
    );
    next = unwrap(
      completeExecutionTask(next, lighting.taskId, "2026-08-16T13:30:00.000Z", {
        completedQuantity: 125,
        actualConsumption: [{ resourceId: MAT_LED_MODULE_ID, actualQuantity: 127 }],
      }),
    );

    const cost = projectActualInternalCost(next, snapshot);
    const led = cost.lines.find((item) => item.resourceId === MAT_LED_MODULE_ID);
    const labor = cost.lines.find((item) => item.kind === "LABOR");
    expect(led).toMatchObject({
      plannedQuantity: 125,
      actualQuantity: 127,
      rate: 0.5,
      plannedCost: 62.5,
      actualCost: 63.5,
      difference: 1,
      status: "CALCULABLE",
      costSourceLabel: "Tarif înghețat din snapshot",
      quantitySourceLabel: "Consum real înregistrat",
    });
    expect(cost.status).toBe("PARTIAL");
    expect(cost.calculableTotal).toBe(63.5);
    expect(cost.plannedComparableTotal).toBe(62.5);
    expect(cost.availableDifference).toBe(1);
    expect(labor?.status).toBe("UNAVAILABLE");
    expect(labor?.actualCost).toBeNull();
    expect(next.plan.eicTotal).toBe(382.5);
    expect(
      next.tasks.find((item) => item.taskId === lighting.taskId)?.resourceDemands[0]?.quantity,
    ).toBe(125);
    expect(JSON.stringify(cost)).not.toMatch(
      /costEngine|quoteOrchestrator|cost_ora|margin|VAT|FIFO|duration/,
    );
  });

  it("can price a recorded service actual and ignores completion quantity as a cost proxy", () => {
    const { snapshot, record } = planned();
    const executor = person();
    const faceCnc = record.tasks.find(
      (item) => item.processId === CUT_SHEET_CNC_ID && item.scopeLabel === "Față",
    );
    if (!faceCnc) {
      throw new Error("missing face cnc");
    }
    let next = unwrap(assignProviderToTask(record, faceCnc.taskId, MCH_CNC_4020_ID));
    next = unwrap(assignExecutorToTask(next, faceCnc.taskId, executor.personId, [executor]));
    next = unwrap(startExecutionTask(next, faceCnc.taskId, "2026-08-16T13:00:00.000Z", [executor]));
    const completedOnly = unwrap(
      completeExecutionTask(next, faceCnc.taskId, "2026-08-16T13:10:00.000Z", {
        completedQuantity: 12.7,
      }),
    );
    const withoutActual = projectActualInternalCost(completedOnly, snapshot).lines.find(
      (item) => item.resourceId === SVC_CNC_FACE_ID,
    );
    expect(withoutActual?.status).toBe("UNAVAILABLE");
    expect(withoutActual?.actualQuantity).toBeNull();

    const { record: fresh } = planned();
    const face = fresh.tasks.find(
      (item) => item.processId === CUT_SHEET_CNC_ID && item.scopeLabel === "Față",
    );
    if (!face) {
      throw new Error("missing face");
    }
    let withActual = unwrap(assignProviderToTask(fresh, face.taskId, MCH_CNC_4020_ID));
    withActual = unwrap(
      assignExecutorToTask(withActual, face.taskId, executor.personId, [executor]),
    );
    withActual = unwrap(
      startExecutionTask(withActual, face.taskId, "2026-08-16T13:00:00.000Z", [executor]),
    );
    withActual = unwrap(
      completeExecutionTask(withActual, face.taskId, "2026-08-16T13:10:00.000Z", {
        completedQuantity: 12.7,
        actualConsumption: [{ resourceId: SVC_CNC_FACE_ID, actualQuantity: 12.7 }],
      }),
    );
    const service = projectActualInternalCost(withActual, snapshot).lines.find(
      (item) => item.resourceId === SVC_CNC_FACE_ID,
    );
    expect(service).toMatchObject({
      actualQuantity: 12.7,
      rate: 3,
      actualCost: 38.1,
      status: "CALCULABLE",
    });
  });

  it("uses the frozen snapshot rate even when a later live rate would differ", () => {
    const { snapshot, record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    if (!lighting) {
      throw new Error("missing lighting");
    }
    const mutated = {
      ...snapshot,
      eic: {
        ...snapshot.eic,
        lines: snapshot.eic.lines.map((line) =>
          line.resourceId === MAT_LED_MODULE_ID ? { ...line, rate: 99, cost: 99 * 125 } : line,
        ),
      },
    };
    const withActual: ExecutionPlanRecord = {
      ...record,
      tasks: record.tasks.map((task) =>
        task.taskId === lighting.taskId
          ? {
              ...task,
              actualConsumption: [
                {
                  entryId: `act:${task.taskId}:${MAT_LED_MODULE_ID}`,
                  taskId: task.taskId,
                  resourceId: MAT_LED_MODULE_ID,
                  resourceLabel: "Modul LED 12V",
                  actualQuantity: 127,
                  unit: "buc",
                  recordedAt: "2026-08-16T13:30:00.000Z",
                  note: null,
                },
              ],
            }
          : task,
      ),
    };
    const cost = projectActualInternalCost(withActual, mutated);
    expect(cost.lines.find((item) => item.resourceId === MAT_LED_MODULE_ID)?.actualCost).toBe(
      127 * 99,
    );
    expect(cost.lines.find((item) => item.resourceId === MAT_LED_MODULE_ID)?.rate).toBe(99);
  });

  it("marks incompatible units unavailable instead of converting", () => {
    const { snapshot, record } = planned();
    const lighting = record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    if (!lighting) {
      throw new Error("missing lighting");
    }
    const broken: ExecutionPlanRecord = {
      ...record,
      tasks: record.tasks.map((task) =>
        task.taskId === lighting.taskId
          ? {
              ...task,
              actualConsumption: [
                {
                  entryId: `act:${task.taskId}:${MAT_LED_MODULE_ID}`,
                  taskId: task.taskId,
                  resourceId: MAT_LED_MODULE_ID,
                  resourceLabel: "Modul LED 12V",
                  actualQuantity: 127,
                  unit: "m",
                  recordedAt: "2026-08-16T13:30:00.000Z",
                  note: null,
                },
              ],
            }
          : task,
      ),
    };
    const led = projectActualInternalCost(broken, snapshot).lines.find(
      (item) => item.resourceId === MAT_LED_MODULE_ID,
    );
    expect(led?.status).toBe("UNAVAILABLE");
    expect(led?.unavailableReason).toBe("Unitate incompatibilă");
    expect(led?.actualCost).toBeNull();
  });
});
