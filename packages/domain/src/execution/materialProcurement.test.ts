import { describe, expect, it } from "vitest";
import type { ExecutionPlanRecord } from "./plan.js";
import {
  projectJobMaterialRequirements,
  resolveOperatorReplenishmentSignal,
} from "./materialProcurement.js";

describe("material purchasing from engine-owned estimates", () => {
  const record = {
    tasks: [
      {
        taskId: "task:led",
        resourceDemands: [
          { resourceId: "MAT-LED-MODULE", label: "Module LED", quantity: 120, unit: "buc" },
        ],
      },
      {
        taskId: "task:other",
        resourceDemands: [
          { resourceId: "MAT-LED-MODULE", label: "Module LED", quantity: 24, unit: "buc" },
          { resourceId: "missing-resource", label: "Neprecizat", quantity: 9, unit: "m" },
        ],
      },
    ],
  } as unknown as ExecutionPlanRecord;

  it("derives requirements only from frozen material demands and retains task origins", () => {
    expect(projectJobMaterialRequirements(record)).toEqual([
      {
        resourceId: "MAT-LED-MODULE",
        label: "Module LED",
        unit: "buc",
        estimatedQuantity: 144,
        taskIds: ["task:led", "task:other"],
      },
    ]);
  });

  it("leaves the purchase quantity unspecified and never copies the estimate or zero", () => {
    expect(resolveOperatorReplenishmentSignal(undefined)).toEqual({
      ok: true,
      requestedQuantity: null,
    });
    expect(resolveOperatorReplenishmentSignal(null)).toEqual({
      ok: true,
      requestedQuantity: null,
    });
    expect(resolveOperatorReplenishmentSignal(0)).toEqual({
      ok: false,
      error: "quantity_not_allowed",
    });
    expect(resolveOperatorReplenishmentSignal(144)).toEqual({
      ok: false,
      error: "quantity_not_allowed",
    });
  });
});
