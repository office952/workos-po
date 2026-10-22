import { describe, expect, it } from "vitest";
import type { InboxTaskTransport } from "../api/types";
import { presentInboxContext, presentInboxLane } from "./inboxLane";

function task(partial: Partial<InboxTaskTransport>): InboxTaskTransport {
  return {
    taskId: "t1",
    planId: "p1",
    jobId: null,
    processLabel: "Tăiere",
    scopeLabel: "Spate",
    statusLabel: "Planificat",
    productLabel: "Litere",
    inscription: "WORKOS",
    customerDisplayName: "Client",
    seqLabel: "01",
    waitingForLabels: [],
    requiredCapabilityLabel: null,
    providerLabel: null,
    canClaimStart: false,
    requiresProvider: false,
    lane: "available_ready",
    materialBlockLabel: null,
    ...partial,
  };
}

describe("presentInboxLane", () => {
  it("names each server lane and keeps opening separate from starting", () => {
    expect(presentInboxLane(task({ lane: "in_progress_mine" }))).toMatchObject({
      lane: "in_progress_mine",
      laneLabel: "În lucru de tine",
      actionLabel: "Deschide execuția",
    });
    expect(presentInboxLane(task({ lane: "available_ready", canClaimStart: true }))).toMatchObject({
      lane: "ready",
      laneLabel: "Poate fi pornită",
    });
    expect(
      presentInboxLane(task({
        lane: "available_needs_provider",
        requiresProvider: true,
        requiredCapabilityLabel: "Debitare CNC",
      })).reason,
    ).toBe("Necesită alocare: Debitare CNC");
    expect(
      presentInboxLane(task({
        lane: "waiting_dependencies",
        waitingForLabels: ["Debitare foaie CNC"],
      })).reason,
    ).toBe("Așteaptă: Debitare foaie CNC");
    expect(
      presentInboxLane(task({
        lane: "blocked_material",
        materialBlockLabel: "Modul LED nu este confirmat disponibil.",
      })).reason,
    ).toBe("Modul LED nu este confirmat disponibil.");
  });

  it("does not count in-progress work as ready", () => {
    const current = presentInboxLane(task({ lane: "in_progress_mine", canClaimStart: false }));
    expect(current.lane).not.toBe("ready");
    expect(current.laneLabel).not.toBe("Urmează");
  });

  it("keeps the client and one job name without repeating the same text", () => {
    expect(presentInboxContext(task({
      customerDisplayName: "Nord Market",
      productLabel: "Panou ACM + litere volumetrice",
      inscription: "Nord Market ACM · NORD",
    }))).toBe("Nord Market · Panou ACM + litere volumetrice · Nord Market ACM · NORD");
    expect(presentInboxContext(task({
      customerDisplayName: "Nord Market",
      productLabel: "Litere",
      inscription: "Litere",
    }))).toBe("Nord Market · Litere");
  });
});
