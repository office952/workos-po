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
    ).toBe("Utilaj lipsește");
    expect(presentExecutionNextAction(task({ canAssignProvider: true }), true)).toBe(
      "Alocare utilaj necesară",
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

  it("does not invent eligibility and distinguishes selected vs actionable copy", () => {
    const blocked = task({ waitingFor: ["Cablare"] });
    const ready = task({ taskId: "task:2", canClaimStart: true });
    expect(hasViewerExecutionAction(blocked)).toBe(false);
    expect(presentCurrentTaskRole(blocked, ready)).toBe("Sarcina selectată din plan");
    expect(presentCurrentTaskRole(ready, ready)).toBe("Următoarea sarcină acționabilă");
  });
});
