import { describe, expect, it } from "vitest";
import {
  actualConsumptionDraftKey,
  canEditActualConsumption,
  collectActualConsumptionInput,
} from "./executionActuals";
import type { ExecutionTaskTransport, PlannedResourceTransport } from "../api/types";

const plexi: PlannedResourceTransport = {
  resourceId: "res:plexi",
  label: "Plexiglas opal 3 mm",
  plannedQuantity: 0.85,
  unit: "m²",
};
const screws: PlannedResourceTransport = {
  resourceId: "res:screws",
  label: "Șuruburi inox",
  plannedQuantity: 12,
  unit: "buc",
};

function task(
  overrides: Partial<ExecutionTaskTransport> = {},
): ExecutionTaskTransport {
  return {
    taskId: "task:led",
    processLabel: "Montaj LED",
    scopeLabel: "Față",
    seqLabel: "03",
    status: "IN_PROGRESS",
    statusLabel: "În lucru",
    assignmentLabel: "CNC 4020",
    requiresProvider: false,
    requiredCapabilityId: null,
    canAssign: false,
    canAssignProvider: false,
    canClaimStart: false,
    canComplete: true,
    canRecordActualConsumption: true,
    requiresCompletedQuantity: false,
    plannedQuantity: null,
    plannedQuantityLabel: null,
    completedQuantityLabel: null,
    varianceLabel: null,
    waitingFor: [],
    dependsOnLabels: [],
    eligibleProviders: [],
    startBlockReason: null,
    operatorRelation: "owned",
    startedByLabel: "Andrei Goghi",
    executorLabel: "Andrei Goghi",
    plannedResources: [plexi, screws],
    actualConsumption: [],
    ...overrides,
  };
}

describe("execution actual consumption presentation", () => {
  it("exposes editable actuals only for an owned in-progress completable task with resources", () => {
    expect(canEditActualConsumption(task())).toBe(true);
    expect(canEditActualConsumption(task({ canComplete: false }))).toBe(false);
    expect(canEditActualConsumption(task({ canRecordActualConsumption: false }))).toBe(false);
    expect(canEditActualConsumption(task({ plannedResources: [] }))).toBe(false);
    expect(canEditActualConsumption(task({ status: "COMPLETED" }))).toBe(false);
  });

  it("omits blank fields and never invents planned quantities", () => {
    const collected = collectActualConsumptionInput(
      [plexi, screws],
      {
        [actualConsumptionDraftKey("task:led", plexi.resourceId)]: "0,80",
        [actualConsumptionDraftKey("task:led", screws.resourceId)]: "  ",
      },
      "task:led",
    );
    expect(collected).toEqual({
      ok: true,
      actualConsumption: [{ resourceId: "res:plexi", actualQuantity: 0.8 }],
    });
    expect(JSON.stringify(collected)).not.toContain("0.85");
    expect(JSON.stringify(collected)).not.toContain("12");
  });

  it("posts both explicit actuals and omits the payload when nothing was entered", () => {
    expect(
      collectActualConsumptionInput(
        [plexi, screws],
        {
          [actualConsumptionDraftKey("task:led", plexi.resourceId)]: "0,80",
          [actualConsumptionDraftKey("task:led", screws.resourceId)]: "11",
        },
        "task:led",
      ),
    ).toEqual({
      ok: true,
      actualConsumption: [
        { resourceId: "res:plexi", actualQuantity: 0.8 },
        { resourceId: "res:screws", actualQuantity: 11 },
      ],
    });
    expect(collectActualConsumptionInput([plexi, screws], {}, "task:led")).toEqual({
      ok: true,
    });
  });

  it("rejects non-numeric or negative drafts without sending a line", () => {
    expect(
      collectActualConsumptionInput(
        [plexi],
        { [actualConsumptionDraftKey("task:led", plexi.resourceId)]: "abc" },
        "task:led",
      ),
    ).toEqual({ ok: false });
    expect(
      collectActualConsumptionInput(
        [plexi],
        { [actualConsumptionDraftKey("task:led", plexi.resourceId)]: "-1" },
        "task:led",
      ),
    ).toEqual({ ok: false });
  });
});