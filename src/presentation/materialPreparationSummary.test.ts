import { describe, expect, it } from "vitest";
import type { JobMaterialPreparationTransport } from "../api/jobMaterials";
import { presentMaterialPreparationSummary } from "./materialPreparationSummary";

const preparation: JobMaterialPreparationTransport = {
  jobId: "job-1",
  planId: "plan-1",
  lines: [
    {
      resourceId: "mat-1",
      label: "Placă ACM",
      unit: "mp",
      estimatedQuantity: 2,
      taskIds: ["task-1"],
      canCheck: false,
      latestCheck: {
        status: "MISSING",
        checkedByLabel: "Ion",
        checkedAt: "2026-10-18T00:00:00Z",
      },
      openRequest: {
        requestId: "req-1",
        requestedQuantity: 2,
        unit: "mp",
        status: "OPEN",
        requestedByLabel: "Ion",
        requestedAt: "2026-10-18T00:00:00Z",
        requiresReview: true,
      },
    },
  ],
};

describe("presentMaterialPreparationSummary", () => {
  it("names a missing material and a review request without calling them a start block", () => {
    const lines = presentMaterialPreparationSummary({ status: "success", data: preparation });
    expect(lines.join(" ")).toContain("Placă ACM: material insuficient");
    expect(lines.join(" ")).toContain("solicitare de aprovizionare de revizuit");
    expect(lines.join(" ")).not.toContain("totul este disponibil");
  });

  it("keeps the last reading when a later update fails", () => {
    const lines = presentMaterialPreparationSummary({ status: "error", data: preparation });
    expect(lines[0]).toContain("Ultima citire rămâne");
    expect(lines.join(" ")).toContain("material insuficient");
  });

  it("does not claim availability when the reading has not arrived", () => {
    expect(presentMaterialPreparationSummary({ status: "loading", data: undefined }).join(" ")).toContain(
      "nu este încă cunoscută",
    );
    expect(presentMaterialPreparationSummary({ status: "error", data: undefined }).join(" ")).toContain(
      "Nu se declară că totul este disponibil",
    );
  });
});
