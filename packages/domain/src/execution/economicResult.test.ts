import { describe, expect, it } from "vitest";
import type { ActualInternalCostProjection } from "./actualCost.js";
import { projectJobEconomicResult } from "./economicResult.js";

function operational(status: ActualInternalCostProjection["status"], total: number | null): ActualInternalCostProjection {
  return {
    status,
    statusLabel: status,
    currency: "EUR",
    calculableTotal: total,
    plannedComparableTotal: total === null ? null : 300,
    availableDifference: total === null ? null : total - 300,
    calculableCount: total === null ? 0 : 1,
    unavailableCount: status === "COMPLETE" ? 0 : 1,
    lines: [],
  };
}

const base = {
  productLabel: "Litere",
  orderNetPrice: 1000,
  estimatedCostTotal: 400,
  estimatedCostCompleteness: "COMPLETE" as const,
  acceptedIncompleteCost: false,
  executionLabel: "În execuție",
  hasExcludedInstallation: false,
};

describe("job economic result", () => {
  it("computes the estimated margin only from a complete estimate", () => {
    expect(projectJobEconomicResult({ ...base, operational: null }).estimatedMargin.value).toBe(600);
    const partial = projectJobEconomicResult({
      ...base,
      estimatedCostCompleteness: "PARTIAL",
      operational: null,
      acceptedIncompleteCost: true,
    });
    expect(partial.estimatedMargin.value).toBeNull();
    expect(partial.estimatedMargin.unavailableReason).toMatch(/nu este complet/);
    expect(partial.estimatedCost.acceptedIncomplete).toBe(true);
  });

  it("never turns unknown or partial operational cost into zero or a margin", () => {
    const none = projectJobEconomicResult({ ...base, operational: operational("UNAVAILABLE", null) });
    expect(none.operationalCost.calculableTotal).toBeNull();
    expect(none.operationalCost.completeness).toBe("UNAVAILABLE");
    expect(none.operationalMargin.value).toBeNull();
    const partial = projectJobEconomicResult({ ...base, operational: operational("PARTIAL", 250) });
    expect(partial.operationalCost.differenceFromEstimate).toBe(-50);
    expect(partial.operationalMargin.value).toBeNull();
    const complete = projectJobEconomicResult({ ...base, operational: operational("COMPLETE", 350) });
    expect(complete.operationalMargin.value).toBe(650);
  });

  it("states that confirmed cost is not modelled and duration is not costed", () => {
    const result = projectJobEconomicResult({ ...base, operational: null, hasExcludedInstallation: true });
    expect(result.confirmedCost.status).toBe("NOT_MODELLED");
    expect(result.notes.join(" ")).toMatch(/nu sunt transformate în cost/);
    expect(result.notes.join(" ")).toMatch(/nu profit net/);
    expect(result.excludedScopeLabel).toMatch(/Montajul/);
  });
});
