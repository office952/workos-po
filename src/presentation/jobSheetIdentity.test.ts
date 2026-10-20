import { describe, expect, it } from "vitest";
import type { JobListItemTransport } from "../api/types";
import {
  presentJobSheetLead,
  presentJobSheetSecondary,
  presentJobSheetTitle,
} from "./jobSheetIdentity";

function job(partial: Partial<JobListItemTransport>): JobListItemTransport {
  return {
    jobId: "job-1",
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "PRD",
    productLabel: "Litere volumetrice",
    inscription: "NORD",
    memberLabels: [],
    customerId: null,
    customerDisplayName: "Client",
    requestId: null,
    stage: "RELEASED",
    stageLabel: "Eliberată",
    nextAction: "CREATE_EXECUTION_PLAN",
    nextActionLabel: "Creează planul de execuție",
    priority: "STANDARD",
    priorityLabel: "Standard",
    targetDate: null,
    targetDateLabel: "Fără termen",
    planningEditable: true,
    overdue: false,
    needsAttention: false,
    attentionLabel: null,
    progressLabel: null,
    createdAt: null,
    releaseSnapshotId: null,
    planId: null,
    orderSnapshotId: "job-1",
    ...partial,
  };
}

describe("job sheet identity", () => {
  it("explains release when the work has no plan", () => {
    const urban = job({
      inscription: "URBAN",
      productLabel: "Litere",
      nextAction: "RELEASE_TO_PRODUCTION",
      nextActionLabel: "Eliberează pentru producție",
      stage: "ORDER_CREATED",
      stageLabel: "Comandă",
    });
    expect(presentJobSheetTitle(urban)).toBe("URBAN");
    expect(presentJobSheetLead(urban)).toContain("Trimite în producție");
    expect(presentJobSheetLead(urban)).not.toContain("Continuă");
  });

  it("uses the assembly product name and keeps a distinct inscription secondary", () => {
    const nord = job({
      kind: "ASSEMBLY",
      kindLabel: "Ansamblu",
      productLabel: "Panou ACM + litere volumetrice",
      inscription: "Nord Market ACM · NORD",
      nextAction: "CONTINUE_EXECUTION",
      nextActionLabel: "Continuă execuția",
      stage: "EXECUTION_IN_PROGRESS",
      stageLabel: "În execuție",
      planId: "plan-1",
    });
    expect(presentJobSheetTitle(nord)).toBe("Panou ACM + litere volumetrice");
    expect(presentJobSheetSecondary(nord)).toBe("Nord Market ACM · NORD");
    expect(presentJobSheetLead(nord)).toBe("Execuția este deschisă. Continuă execuția.");
  });

  it("describes a completed job without sending the operator back to release", () => {
    const done = job({
      stage: "EXECUTION_COMPLETED",
      stageLabel: "Executată",
      nextAction: "",
      nextActionLabel: "",
    });
    expect(presentJobSheetLead(done)).toBe("Lucrarea este executată. Compară planificat cu realizat.");
  });
});
