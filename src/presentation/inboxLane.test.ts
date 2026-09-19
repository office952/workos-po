import { describe, expect, it } from "vitest";
import type { InboxTaskTransport } from "../api/types";
import { presentInboxLane } from "./inboxLane";

function task(partial: Partial<InboxTaskTransport>): InboxTaskTransport {
  return {
    taskId: "t1",
    planId: "p1",
    processLabel: "Tăiere",
    scopeLabel: "Spate",
    statusLabel: "Planificat",
    productLabel: "Litere",
    inscription: "WORKOS",
    canClaimStart: false,
    requiresProvider: false,
    lane: "",
    ...partial,
  };
}

describe("presentInboxLane", () => {
  it("uses canClaimStart as the only ready fact", () => {
    expect(presentInboxLane(task({ canClaimStart: true })).lane).toBe("ready");
    expect(presentInboxLane(task({ statusLabel: "Planificat" })).lane).toBe("next");
    expect(presentInboxLane(task({ canClaimStart: true })).actionLabel).toBe(
      "Deschide execuția",
    );
    expect(presentInboxLane(task({ canClaimStart: false })).actionLabel).toBe(
      "Deschide execuția",
    );
  });
});
