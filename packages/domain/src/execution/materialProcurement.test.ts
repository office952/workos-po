import { describe, expect, it } from "vitest";
import type { ExecutionPlanRecord } from "./plan.js";
import {
  projectJobMaterialRequirements,
  resolveRequestedMaterialQuantity,
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
        label: expect.any(String),
        unit: "buc",
        estimatedQuantity: 144,
        taskIds: ["task:led", "task:other"],
      },
    ]);
  });

  it("never asks workers to count LEDs and never orders below the estimated requirement", () => {
    expect(resolveRequestedMaterialQuantity(120, "buc", undefined)).toEqual({
      ok: true,
      quantity: 120,
    });
    expect(resolveRequestedMaterialQuantity(120, "buc", 200)).toEqual({
      ok: true,
      quantity: 200,
    });
    expect(resolveRequestedMaterialQuantity(120, "buc", 100)).toEqual({
      ok: false,
      error: "below_estimated_requirement",
    });
    expect(resolveRequestedMaterialQuantity(120, "buc", 120.5)).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
    expect(resolveRequestedMaterialQuantity(120, "buc", Number.POSITIVE_INFINITY)).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
  });

  it("rounds up fractional piece estimates to a whole purchasing minimum", () => {
    expect(resolveRequestedMaterialQuantity(120.2, "buc", undefined)).toEqual({
      ok: true, quantity: 121,
    });
    expect(resolveRequestedMaterialQuantity(120.2, "buc", 120)).toEqual({
      ok: false, error: "below_estimated_requirement",
    });
  });

  it("accepts non-piece material quantities directly from the engine", () => {
    expect(resolveRequestedMaterialQuantity(2.4, "m2", 2.5)).toEqual({
      ok: true, quantity: 2.5,
    });
  });
});
