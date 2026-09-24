import { describe, expect, it } from "vitest";
import type { ExecutionTaskTransport } from "../api/types";
import {
  hasViewerExecutionAction,
  presentCurrentTaskRole,
  presentExecutionNextAction,
} from "./executionNextAction";

function task(
  overrides: Partial<ExecutionTaskTransport> = {},
): ExecutionTaskTransport {
  return {
    taskId: "task:1",
    processLabel: "Debitare",
    scopeLabel: "Spate",
    seqLabel: "01",
    status: "PLANNED",
    statusLabel: "Planificat",
    assignmentLabel: "Nealocat",
    requiresProvider: false,
    requiredCapabilityId: null,
    canAssign: false,
    canAssignProvider: false,
    canClaimStart: false,
    canComplete: false,
    requiresCompletedQuantity: false,
    plannedQuantity: null,
    plannedQuantityLabel: null,
    completedQuantityLabel: null,
    varianceLabel: null,
    waitingFor: [],
    dependsOnLabels: [],
    eligibleProviders: [],
    startBlockReason: null,
    operatorRelation: null,
    startedByLabel: null,
    executorLabel: null,
    canRecordActualConsumption: false,
    plannedResources: [],
    actualConsumption: [],
    plannedEffortMinutes: null,
    plannedTimeLabel: "Necunoscut",
    actualDurationMinutes: null,
    actualDurationLabel: "Necunoscut",
    timeVarianceMinutes: null,
    timeVarianceLabel: null,
    machineRuns: [],
    machineRunTotalMinutes: null,
    machineRunTotalLabel: null,
    canStartMachineRun: false,
    canStopMachineRun: false,
    completionBlockedByActiveMachineRun: false,
    activeMachineRunLabel: null,
    activeMachineRunStartedLabel: null,
    ...overrides,
  };
}

describe("presentExecutionNextAction", () => {
  it("maps server flags into operator copy without treating no-executor as a blocker", () => {
    expect(
      presentExecutionNextAction(task({ waitingFor: ["Debitare foaie CNC"] }), true),
    ).toBe("Așteaptă: Debitare foaie CNC");
    expect(
      presentExecutionNextAction(
        task({
          requiresProvider: true,
          assignmentLabel: "Nealocat",
          eligibleProviders: [],
        }),
        true,
      ),
    ).toBe("Lipsește utilajul / zona necesară");
    expect(presentExecutionNextAction(task({ canAssignProvider: true }), true)).toBe(
      "Alocare utilaj / zonă necesară",
    );
    expect(presentExecutionNextAction(task({ canComplete: true }), true)).toBe(
      "Poate fi închisă",
    );
    expect(presentExecutionNextAction(task({ canClaimStart: true }), true)).toBe(
      "Poate fi pornită",
    );
    expect(presentExecutionNextAction(task({ canClaimStart: true }), false)).toBe(
      "Identifică operatorul",
    );
    expect(
      presentExecutionNextAction(task({ operatorRelation: "not_eligible" }), true),
    ).toBe("Necesită operator calificat");
    expect(
      presentExecutionNextAction(task({ operatorRelation: "owned_by_other" }), true),
    ).toBe("În lucru la alt operator");
  });

  it("does not call an unassigned eligible provider missing", () => {
    const memberWaiting = task({
      requiresProvider: true,
      assignmentLabel: "Nealocat",
      canAssign: true,
      canAssignProvider: false,
      operatorRelation: "missing_provider",
      eligibleProviders: [
        {
          id: "mch:cnc",
          kind: "MACHINE",
          kindLabel: "Utilaj",
          label: "CNC 4020",
        },
      ],
    });
    expect(presentExecutionNextAction(memberWaiting, true)).toBe(
      "Așteaptă alocarea utilajului / zonei",
    );
    expect(presentExecutionNextAction(memberWaiting, true)).not.toBe("Utilaj lipsește");
    expect(presentExecutionNextAction(memberWaiting, true)).not.toBe(
      "Lipsește utilajul / zona necesară",
    );
  });

  it("keeps provider wording usable for a work center", () => {
    expect(
      presentExecutionNextAction(
        task({
          requiresProvider: true,
          assignmentLabel: "Nealocat",
          canAssignProvider: true,
          eligibleProviders: [
            {
              id: "wc:paint",
              kind: "WORKCENTER",
              kindLabel: "Zonă",
              label: "Vopsitorie",
            },
          ],
        }),
        true,
      ),
    ).toBe("Alocare utilaj / zonă necesară");
    expect(
      presentExecutionNextAction(
        task({
          requiresProvider: true,
          assignmentLabel: "Nealocat",
          operatorRelation: "missing_provider",
          eligibleProviders: [],
        }),
        true,
      ),
    ).toBe("Lipsește utilajul / zona necesară");
  });

  it("does not invent eligibility and distinguishes selected vs actionable copy", () => {
    const blocked = task({ waitingFor: ["Cablare"] });
    const ready = task({ taskId: "task:2", canClaimStart: true });
    expect(hasViewerExecutionAction(blocked)).toBe(false);
    expect(presentCurrentTaskRole(blocked, ready)).toBe("Sarcina selectată din plan");
    expect(presentCurrentTaskRole(ready, ready)).toBe("Următoarea sarcină acționabilă");
  });
});
