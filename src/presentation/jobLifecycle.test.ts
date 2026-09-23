import { describe, expect, it } from "vitest";
import type { JobListItemTransport } from "../api/types";
import { presentJobLifecycle, presentQuoteContinuation } from "./jobLifecycle";

function job(partial: Partial<JobListItemTransport>): JobListItemTransport {
  return {
    jobId: "job-1",
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "PRD",
    memberLabels: [],
    customerId: null,
    requestId: null,
    priority: "STANDARD",
    priorityLabel: "Standard",
    targetDate: null,
    targetDateLabel: "Fără termen",
    planningEditable: true,
    overdue: false,
    productLabel: "Litere",
    inscription: "WORKOS",
    customerDisplayName: "Atelier",
    stage: "",
    stageLabel: "—",
    nextAction: "",
    nextActionLabel: "",
    needsAttention: false,
    attentionLabel: null,
    progressLabel: null,
    createdAt: null,
    releaseSnapshotId: null,
    planId: null,
    orderSnapshotId: "ord-1",
    ...partial,
  };
}

describe("presentJobLifecycle", () => {
  it("marks release current from the existing next action", () => {
    const steps = presentJobLifecycle(
      job({ nextAction: "RELEASE_TO_PRODUCTION", stageLabel: "Gata de eliberare" }),
    );
    expect(steps.map((step) => `${step.id}:${step.mark}`)).toEqual([
      "accepted:done",
      "created:done",
      "release:current",
      "plan:next",
      "execution:next",
    ]);
  });

  it("marks execution current when a plan already exists", () => {
    const steps = presentJobLifecycle(
      job({
        releaseSnapshotId: "rel-1",
        planId: "plan-1",
        stage: "IN_EXECUTION",
      }),
    );
    expect(steps.find((step) => step.id === "release")?.mark).toBe("done");
    expect(steps.find((step) => step.id === "plan")?.mark).toBe("done");
    expect(steps.find((step) => step.id === "execution")?.mark).toBe("current");
  });
});

describe("presentQuoteContinuation", () => {
  it("advances from existing acceptance and order facts", () => {
    expect(presentQuoteContinuation({ accepted: false, ordered: false })[0]?.mark).toBe(
      "current",
    );
    expect(presentQuoteContinuation({ accepted: true, ordered: false })[1]?.mark).toBe(
      "current",
    );
    expect(presentQuoteContinuation({ accepted: true, ordered: true })[2]?.mark).toBe(
      "current",
    );
  });
});
