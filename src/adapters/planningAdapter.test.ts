import { describe, expect, it } from "vitest";
import { presentPlanningWorkload } from "./planningAdapter";

describe("planning adapter", () => {
  it("presents workload without inventing zero for unknown effort", () => {
    const presented = presentPlanningWorkload({
      workload: {
        canEditEffort: true,
        providers: [
          {
            provider: { kind: "MACHINE", kindLabel: "Utilaj", id: "mch:1", label: "CNC" },
            knownQueuedMinutes: 45,
            unknownEffortCount: 1,
            tasks: [
              {
                taskId: "task:a",
                executionPlanId: "exp:1",
                status: "PLANNED",
                statusLabel: "Planificat",
                processLabel: "Debitare",
                requiredCapabilityLabel: "CNC",
                productLabel: "Litere",
                inscription: "ALPHA",
                jobId: "job-1",
                jobHref: "lucrari/job-1",
                executionHref: "/executie/exp:1?task=task:a",
                assignedProvider: { id: "mch:1", kind: "MACHINE", label: "CNC" },
                plannedEffortMinutes: null,
                requiresProvider: true,
                canEditEffort: true,
              },
            ],
          },
        ],
        unassigned: [],
      },
    });
    expect(presented?.canEditEffort).toBe(true);
    expect(presented?.providers[0]?.knownQueuedMinutes).toBe(45);
    expect(presented?.providers[0]?.unknownEffortCount).toBe(1);
    expect(presented?.providers[0]?.tasks[0]?.plannedEffortMinutes).toBeNull();
    expect(presented?.manual).toEqual([]);
  });

  it("keeps server binding explanations without inventing an assignment", () => {
    const task = { taskId: "task:manual", executionPlanId: "exp:1", executionHref: "/atelier?plan=exp%3A1&task=task%3Amanual", status: "PLANNED", providerBindingState: "NOT_REQUIRED", providerBindingLabel: "Fără utilaj sau zonă obligatorie.", assignedProvider: null, plannedEffortMinutes: null };
    const view = presentPlanningWorkload({ workload: { providers: [], unassigned: [], manual: [task] } });
    expect(view?.manual[0]).toMatchObject({ assignedProvider: null, plannedEffortMinutes: null, providerBindingState: "NOT_REQUIRED", providerBindingLabel: "Fără utilaj sau zonă obligatorie." });
  });
});
