import { describe, expect, it } from "vitest";
import { presentExecutionPlan } from "./executionAdapter";

describe("presentExecutionPlan", () => {
  it("presents planned and actual labels from the server view", () => {
    const presented = presentExecutionPlan({
      executionPlan: {
        plan: {
          planId: "exp:1",
          productLabel: "Litere",
          inscription: "WORKOS",
          sourceSnapshotId: "aps:1",
        },
        statusLabel: "În lucru",
        progress: { completed: 1, total: 2 },
        tasks: [
          {
            taskId: "task:1",
            processLabel: "Debitare",
            scopeLabel: "Față",
            seqLabel: "01",
            status: "COMPLETED",
            statusLabel: "Închisă",
            assignmentLabel: "CNC 4020",
            requiresProvider: true,
            canAssign: false,
            canClaimStart: false,
            canComplete: false,
            requiresCompletedQuantity: true,
            measurableQuantity: { label: "Suprafață", value: 0.25, unit: "m2" },
            completedQuantityLabel: "0,25 m2",
            varianceLabel: "Conform planului",
            waitingFor: [],
            eligibleProviders: [{ id: "mch:cnc", label: "CNC 4020" }],
          },
        ],
      },
    });
    expect(presented?.planId).toBe("exp:1");
    expect(presented?.progressLabel).toBe("1 / 2");
    expect(presented?.tasks[0]?.completedQuantityLabel).toBe("0,25 m2");
    expect(presented?.tasks[0]?.varianceLabel).toBe("Conform planului");
    expect(presented?.tasks[0]?.plannedQuantity).toBe(0.25);
    expect(presented?.tasks[0]?.operatorRelation).toBeNull();
  });
});
