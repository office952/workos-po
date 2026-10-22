import { describe, expect, it } from "vitest";
import { presentInboxDisplayNote, presentInboxTasks } from "./operatorAdapter";

describe("presentInboxTasks", () => {
  it("keeps the server lane facts the atelier needs", () => {
    const tasks = presentInboxTasks({
      inbox: {
        displayOrderNote: "Ordinea de afișare nu reprezintă programare sau prioritate de producție.",
        inProgressMine: [
          {
            taskId: "task-mine",
            planId: "plan-1",
            jobId: "job-1",
            processLabel: "Debitare",
            scopeLabel: "Litere",
            statusLabel: "În lucru",
            productLabel: "Panou ACM + litere volumetrice",
            inscription: "Nord Market ACM · NORD",
            customerDisplayName: "Nord Market",
            seqLabel: "02",
            waitingForLabels: [],
            requiredCapabilityLabel: "Debitare CNC",
            providerLabel: "Router 1",
            canClaimStart: false,
            requiresProvider: true,
            lane: "in_progress_mine",
            materialBlockLabel: null,
          },
        ],
        availableReady: [],
        availableNeedsProvider: [
          {
            taskId: "task-cnc",
            planId: "plan-1",
            lane: "available_needs_provider",
            requiredCapabilityLabel: "Debitare CNC",
            waitingForLabels: [],
          },
        ],
        waitingDependencies: [
          {
            taskId: "task-wait",
            planId: "plan-1",
            waitingForLabels: ["Debitare foaie CNC"],
          },
        ],
        blockedMaterial: [
          {
            taskId: "task-block",
            planId: "plan-1",
            materialBlockLabel: "Materialul nu este confirmat disponibil.",
          },
        ],
      },
    });

    expect(presentInboxDisplayNote({
      inbox: { displayOrderNote: "Ordinea de afișare nu reprezintă programare sau prioritate de producție." },
    })).toBe("Ordinea de afișare nu reprezintă programare sau prioritate de producție.");
    expect(tasks.map((task) => task.lane)).toEqual([
      "in_progress_mine",
      "available_needs_provider",
      "waiting_dependencies",
      "blocked_material",
    ]);
    expect(tasks[0]).toMatchObject({
      customerDisplayName: "Nord Market",
      seqLabel: "02",
      providerLabel: "Router 1",
      requiredCapabilityLabel: "Debitare CNC",
    });
    expect(tasks[2]?.waitingForLabels).toEqual(["Debitare foaie CNC"]);
    expect(tasks[3]?.materialBlockLabel).toBe("Materialul nu este confirmat disponibil.");
  });

  it("uses the server array when a row omits its lane and drops rows outside those arrays", () => {
    const tasks = presentInboxTasks({
      inbox: {
        inProgressMine: [{ taskId: "task-mine", planId: "plan-1" }],
        somewhereElse: [{ taskId: "task-hidden", planId: "plan-1", lane: "available_ready" }],
      },
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.lane).toBe("in_progress_mine");
  });
});
