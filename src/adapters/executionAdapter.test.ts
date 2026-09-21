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
            canAssignProvider: false,
            canClaimStart: false,
            canComplete: false,
            requiresCompletedQuantity: true,
            measurableQuantity: { label: "Suprafață", value: 0.25, unit: "m2" },
            completedQuantityLabel: "0,25 m2",
            varianceLabel: "Conform planului",
            waitingFor: [],
            eligibleProviders: [
              {
                id: "mch:cnc",
                kind: "MACHINE",
                kindLabel: "Utilaj",
                label: "CNC 4020",
              },
            ],
          },
        ],
      },
    });
    expect(presented?.planId).toBe("exp:1");
    expect(presented?.progressLabel).toBe("1 / 2");
    expect(presented?.progress).toBeNull();
    expect(presented?.tasks[0]?.completedQuantityLabel).toBe("0,25 m2");
    expect(presented?.tasks[0]?.varianceLabel).toBe("Conform planului");
    expect(presented?.tasks[0]?.plannedQuantity).toBe(0.25);
    expect(presented?.tasks[0]?.operatorRelation).toBeNull();
    expect(presented?.tasks[0]?.canAssignProvider).toBe(false);
    expect(presented?.tasks[0]?.eligibleProviders).toEqual([
      {
        id: "mch:cnc",
        kind: "MACHINE",
        kindLabel: "Utilaj",
        label: "CNC 4020",
      },
    ]);
  });

  it("reads the source job and required capability from server transport", () => {
    const presented = presentExecutionPlan({
      executionPlan: {
        plan: {
          planId: "exp:1",
          productLabel: "Litere",
          inscription: "NORD",
          sourceSnapshotId: "aps:1",
        },
        statusLabel: "În lucru",
        progress: { completed: 0, total: 1 },
        tasks: [
          {
            taskId: "task:1",
            processLabel: "Debitare",
            scopeLabel: "Spate",
            seqLabel: "01",
            status: "PLANNED",
            statusLabel: "Planificat",
            assignmentLabel: "Nealocat",
            requiresProvider: true,
            requiredCapabilityId: "CNC_ROUTING",
            canAssign: false,
            canAssignProvider: false,
            canClaimStart: false,
            canComplete: false,
            requiresCompletedQuantity: true,
            measurableQuantity: { label: "Lungime", value: 12.5, unit: "m" },
            waitingFor: [],
            eligibleProviders: [],
          },
        ],
      },
      job: { jobId: "ord:1", href: "/jobs/ord:1" },
    });
    expect(presented?.jobId).toBe("ord:1");
    expect(presented?.tasks[0]?.requiredCapabilityId).toBe("CNC_ROUTING");
    expect(presented?.tasks[0]?.canAssign).toBe(false);
    expect(presented?.tasks[0]?.canAssignProvider).toBe(false);
  });

  it("does not treat domain canAssign as viewer mutation permission", () => {
    const presented = presentExecutionPlan({
      executionPlan: {
        plan: { planId: "exp:1", productLabel: "Litere", inscription: "NORD" },
        tasks: [
          {
            taskId: "task:1",
            processLabel: "Debitare",
            status: "PLANNED",
            canAssign: true,
            eligibleProviders: [
              { id: "mch:b", kind: "MACHINE", kindLabel: "Utilaj", label: "CNC B" },
            ],
          },
        ],
      },
    });
    expect(presented?.tasks[0]?.canAssign).toBe(true);
    expect(presented?.tasks[0]?.canAssignProvider).toBe(false);
    expect(presented?.tasks[0]?.eligibleProviders[0]?.id).toBe("mch:b");
  });

  it("transports plan progress and dependency labels without noExecutor", () => {
    const presented = presentExecutionPlan({
      executionPlan: {
        plan: { planId: "exp:1", productLabel: "Litere", inscription: "NORD" },
        statusLabel: "În lucru",
        progress: {
          total: 4,
          completed: 1,
          inProgress: 1,
          planned: 2,
          waitingDependencies: 1,
          noProvider: 1,
          noExecutor: 3,
          varianceCount: 1,
        },
        tasks: [
          {
            taskId: "task:1",
            processLabel: "Cablare",
            dependsOnLabels: ["Debitare foaie CNC"],
            waitingFor: ["Debitare foaie CNC"],
            assignedExecutor: { id: "per:andrei", label: "Andrei Goghi" },
            startedByLabel: "Andrei Goghi",
          },
        ],
      },
    });
    expect(presented?.progress).toEqual({
      total: 4,
      completed: 1,
      inProgress: 1,
      planned: 2,
      waitingDependencies: 1,
      noProvider: 1,
      varianceCount: 1,
    });
    expect(presented?.progress && "noExecutor" in presented.progress).toBe(false);
    expect(presented?.tasks[0]?.dependsOnLabels).toEqual(["Debitare foaie CNC"]);
    expect(presented?.tasks[0]?.waitingFor).toEqual(["Debitare foaie CNC"]);
    expect(presented?.tasks[0]?.executorLabel).toBe("Andrei Goghi");
    expect(presented?.tasks[0]?.startedByLabel).toBe("Andrei Goghi");
  });

  it("transports planned resources, consumption eligibility, and persisted actuals", () => {
    const presented = presentExecutionPlan({
      executionPlan: {
        plan: { planId: "exp:1", productLabel: "Litere", inscription: "NORD" },
        tasks: [
          {
            taskId: "task:led",
            processLabel: "Montaj LED",
            canRecordActualConsumption: true,
            resourceDemands: [
              {
                resourceId: "res:plexi",
                label: "Plexiglas opal 3 mm",
                quantity: 0.85,
                unit: "m²",
              },
              {
                resourceId: "res:screws",
                label: "Șuruburi inox",
                quantity: 12,
                unit: "buc",
              },
            ],
            actualConsumption: [
              {
                resourceId: "res:plexi",
                resourceLabel: "Plexiglas opal 3 mm",
                actualQuantity: 0.8,
                unit: "m²",
                note: "Rest din foaie",
              },
            ],
          },
        ],
      },
    });
    expect(presented?.tasks[0]?.canRecordActualConsumption).toBe(true);
    expect(presented?.tasks[0]?.plannedResources).toEqual([
      {
        resourceId: "res:plexi",
        label: "Plexiglas opal 3 mm",
        plannedQuantity: 0.85,
        unit: "m²",
      },
      {
        resourceId: "res:screws",
        label: "Șuruburi inox",
        plannedQuantity: 12,
        unit: "buc",
      },
    ]);
    expect(presented?.tasks[0]?.actualConsumption).toEqual([
      {
        resourceId: "res:plexi",
        label: "Plexiglas opal 3 mm",
        actualQuantity: 0.8,
        unit: "m²",
        note: "Rest din foaie",
      },
    ]);
    expect(JSON.stringify(presented)).not.toMatch(/rate|internalCost|EUR/);
  });

  it("fails closed when canRecordActualConsumption is absent", () => {
    const presented = presentExecutionPlan({
      executionPlan: {
        plan: { planId: "exp:1", productLabel: "Litere", inscription: "NORD" },
        tasks: [
          {
            taskId: "task:led",
            processLabel: "Montaj LED",
            resourceDemands: [
              {
                resourceId: "res:plexi",
                label: "Plexiglas opal 3 mm",
                quantity: 0.85,
                unit: "m²",
              },
            ],
          },
        ],
      },
    });
    expect(presented?.tasks[0]?.canRecordActualConsumption).toBe(false);
    expect(presented?.tasks[0]?.plannedResources).toHaveLength(1);
    expect(presented?.tasks[0]?.actualConsumption).toEqual([]);
  });
});
