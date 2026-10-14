import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ExecutionTaskTransport } from "../api/types";
import { QualityControlPanel } from "./QualityControlPanel";

function task(overrides: Partial<ExecutionTaskTransport>): ExecutionTaskTransport {
  return {
    taskId: "task-qc",
    processLabel: "Control",
    scopeLabel: "Față",
    seqLabel: "03",
    status: "IN_PROGRESS",
    statusLabel: "În lucru",
    assignmentLabel: "Nealocat",
    requiresProvider: false,
    requiredCapabilityId: null,
    requiredCapabilityLabel: null,
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
    qualityControl: true,
    ...overrides,
  };
}

describe("QualityControlPanel history", () => {
  it("renders fail, closed correction and pass in chronological order", () => {
    render(
      <QualityControlPanel
        task={task({
          qualityAttempts: [
            {
              attemptSeq: 1,
              result: "FAIL",
              note: "muchie",
              recordedAt: "2026-10-15T08:00:00.000Z",
            },
            {
              attemptSeq: 2,
              result: "PASS",
              note: null,
              recordedAt: "2026-10-15T10:00:00.000Z",
            },
          ],
          reworkEpisodes: [
            {
              episodeSeq: 1,
              status: "CLOSED",
              correctionNote: "retezare",
              closedAt: "2026-10-15T09:00:00.000Z",
            },
          ],
        })}
        pending={false}
        note=""
        correctionNote=""
        onNote={() => undefined}
        onCorrectionNote={() => undefined}
        onPass={() => undefined}
        onFail={() => undefined}
        onCloseCorrection={() => undefined}
      />,
    );

    const history = screen.getByTestId("quality-history");
    const lines = Array.from(history.querySelectorAll("p")).map((line) => line.textContent ?? "");
    expect(lines[0]).toContain("Respins");
    expect(lines[1]).toContain("Corecție închisă");
    expect(lines[1]).toContain("retezare");
    expect(lines[2]).toContain("Acceptat");
  });
});
