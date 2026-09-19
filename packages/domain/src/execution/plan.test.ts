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
import { LED_PITCH_SETTING_ID } from "../product/technicalSettings.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { freezeAcceptedProductionSnapshot } from "../production/snapshot.js";
import {
  executionTaskId,
  materializeExecutionPlanFromSnapshot,
  projectExecutionPlanView,
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
  const snapshot = freezeAcceptedProductionSnapshot(
    truth,
    aggregate,
    composition,
    compileEic(aggregate, composition),
    { createdAt: "2026-08-15T14:00:00.000Z" },
  );
  return snapshot;
}

describe("persisted execution plan materialization", () => {
  it("creates one planned task per frozen operation from the snapshot", () => {
    const snapshot = freeze();
    const first = materializeExecutionPlanFromSnapshot(snapshot, {
      createdAt: "2026-08-15T15:00:00.000Z",
    });
    const second = materializeExecutionPlanFromSnapshot(snapshot, {
      createdAt: "2026-08-15T16:00:00.000Z",
    });
    expect(first.plan.sourceSnapshotId).toBe(snapshot.snapshotId);
    expect(first.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(first.plan.status).toBe("PLANNED");
    expect(first.plan.taskCount).toBe(12);
    expect(first.tasks).toHaveLength(12);
    expect(first.plan.planId).toBe(second.plan.planId);
    expect(first.tasks.map((item) => item.taskId)).toEqual(
      second.tasks.map((item) => item.taskId),
    );
    expect(new Set(first.tasks.map((item) => item.taskId)).size).toBe(12);
    expect(first.plan.eicTotal).toBe(382.5);
    expect(first.plan.eicCompleteness).toBe("COMPLETE");
  });

  it("maps frozen dependencies to persisted task IDs without inventing order", () => {
    const snapshot = freeze();
    const record = materializeExecutionPlanFromSnapshot(snapshot);
    const bySource = new Map(record.tasks.map((item) => [item.sourceOperationId, item]));
    const faceCut = bySource.get(compositionNodeId("FACE", CUT_SHEET_CNC_ID));
    const bond = record.tasks.find((item) => item.processId === BOND_LETTER_BODY_ID);
    expect(faceCut?.seq).toBeLessThan(bond?.seq ?? 0);
    expect(bond?.dependsOnTaskIds).toEqual(
      (snapshot.operations.find((item) => item.processId === BOND_LETTER_BODY_ID)?.dependsOn ?? []).map(
        (operationId) => executionTaskId(record.plan.planId, operationId),
      ),
    );
    for (const task of record.tasks) {
      for (const dependencyId of task.dependsOnTaskIds) {
        expect(bySource.has(dependencyId) || record.tasks.some((item) => item.taskId === dependencyId)).toBe(
          true,
        );
      }
    }
    expect(record.tasks.map((item) => item.seq)).toEqual(
      record.tasks.map((_, index) => index + 1),
    );
  });

  it("keeps frozen quantities, capabilities and no provider assignment", () => {
    const snapshot = freeze();
    const record = materializeExecutionPlanFromSnapshot(snapshot);
    const view = projectExecutionPlanView(record, [], snapshot);
    expect(view.sourceKind).toBe("PILOT");
    expect(view.sourceKindLabel).toBe("Atelier / test tehnic");
    expect(view.jobHref).toBeNull();
    const placeLed = view.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    const inspect = view.tasks.find((item) => item.processId === INSPECT_FINISHED_LETTER_ID);
    const pack = view.tasks.find((item) => item.processId === PACK_PRODUCT_ID);
    const cnc = view.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("FACE", CUT_SHEET_CNC_ID),
    );
    const bond = view.tasks.find((item) => item.processId === BOND_LETTER_BODY_ID);
    expect(placeLed?.quantities[0]?.value).toBe(125);
    expect(placeLed?.resourceDemands.some((item) => item.label === "Modul LED 12V")).toBe(true);
    expect(cnc?.requiredCapabilityId).toBe("CNC_ROUTING");
    expect(cnc?.eligibleProviders.map((item) => item.label)).toEqual(["CNC 4020"]);
    expect(bond?.eligibleProviders.map((item) => item.label)).toEqual([
      "Masă asamblare 1",
      "Masă asamblare 2",
    ]);
    expect(bond?.providerRequirement).toBe("NOT_REQUIRED");
    expect(bond?.requiresProvider).toBe(false);
    expect(bond?.canAssign).toBe(false);
    expect(placeLed?.providerRequirement).toBe("NOT_REQUIRED");
    expect(placeLed?.requiresProvider).toBe(false);
    expect(placeLed?.canAssign).toBe(false);
    expect(inspect?.eligibleProviders).toEqual([]);
    expect(inspect?.providerRequirement).toBe("NOT_REQUIRED");
    expect(inspect?.requiresProvider).toBe(false);
    expect(inspect?.canAssign).toBe(false);
    expect(inspect?.canStart).toBe(false);
    expect(cnc?.providerRequirement).toBe("REQUIRED");
    expect(cnc?.requiresProvider).toBe(true);
    expect(view.progress).toEqual({
      total: 12,
      completed: 0,
      inProgress: 0,
      planned: 12,
      waitingDependencies: view.tasks.filter((item) => item.waitingFor.length > 0).length,
      noProvider: 0,
      noExecutor: 12,
      varianceCount: 0,
      status: "PLANNED",
    });
    expect(view.progress.status).not.toBe("COMPLETED");
    expect(cnc?.canAssign).toBe(true);
    expect(cnc?.canStart).toBe(false);
    expect(pack?.assignmentLabel).toBe("Nealocat");
    expect(record.tasks.every((item) => item.assignedProvider === null)).toBe(true);
    expect(record.tasks.every((item) => item.startedAt === null && item.completedAt === null)).toBe(
      true,
    );
    expect(JSON.stringify(record)).not.toMatch(
      /employeeId|plannedStart|capacity|pontaj/,
    );
  });

  it("follows frozen vinyl content and ignores later setting or rate changes", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: { ...readyValues, "face.finish": "vinyl", "face.color": "alb" },
      },
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
    const eic = compileEic(aggregate, composition);
    const vinyl = freezeAcceptedProductionSnapshot(truth, aggregate, composition, eic, {
      createdAt: "2026-08-15T14:00:00.000Z",
    });
    const record = materializeExecutionPlanFromSnapshot(vinyl);
    const later = freezeAcceptedProductionSnapshot(truth, aggregate, composition, {
      ...eic,
      total: 999,
      lines: eic.lines.map((line) => ({ ...line, rate: 99, cost: 99 })),
    }, {
      createdAt: "2026-08-16T00:00:00.000Z",
      technicalSettings: vinyl.usedTechnicalSettings.map((item) =>
        item.id === LED_PITCH_SETTING_ID ? { ...item, value: 80 } : item,
      ),
    });
    expect(record.tasks).toHaveLength(13);
    expect(record.tasks.some((item) => item.processLabel === "Aplicare folie")).toBe(true);
    expect(record.plan.eicTotal).toBe(386);
    expect(record.plan.sourceSnapshotHash).toBe(vinyl.contentHash);
    expect(later.contentHash).not.toBe(vinyl.contentHash);
    expect(materializeExecutionPlanFromSnapshot(vinyl).plan.eicTotal).toBe(386);
  });
});
