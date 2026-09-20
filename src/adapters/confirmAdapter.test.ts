import { describe, expect, it } from "vitest";
import { presentConfirm } from "./confirmAdapter";

describe("presentConfirm", () => {
  it("preserves the review identity used for confirmation", () => {
    const presented = presentConfirm(
      {
        eic: {
          completeness: "COMPLETE",
          completenessReasons: [],
          currency: "EUR",
          total: 382.5,
          lines: [
            {
              resourceId: "aluminium_return_profile",
              label: "Profil aluminiu 0,6 mm",
              quantity: 12.5,
              unit: "m",
              rate: 3,
              currency: "EUR",
              cost: 37.5,
            },
          ],
        },
      },
      "crv1:kept",
    );
    expect(presented?.reviewId).toBe("crv1:kept");
    expect(presented?.financialVisible).toBe(true);
    expect(presented?.lines[0]?.cost).toBe(37.5);
    expect(presented?.costCompletenessIssues).toEqual([]);
  });

  it("preserves owner cost-completeness issues without inventing rates", () => {
    const presented = presentConfirm(
      {
        eic: {
          completeness: "PARTIAL",
          completenessReasons: ["Tarif lipsă pentru Plexiglas 3 mm opal"],
          currency: "EUR",
          total: 345,
          lines: [],
        },
        costCompletenessIssues: [
          {
            type: "MISSING_COST_EVIDENCE",
            resourceId: "plexiglas_3mm_opal",
            label: "Plexiglas 3 mm opal",
            reason: "Tarif lipsă pentru Plexiglas 3 mm opal",
          },
        ],
      },
      "crv1:gaps",
    );
    expect(presented?.costCompletenessIssues).toEqual([
      {
        type: "MISSING_COST_EVIDENCE",
        impact: "BLOCKS_CALCULATION",
        resourceId: "plexiglas_3mm_opal",
        label: "Plexiglas 3 mm opal",
        reason: "Tarif lipsă pentru Plexiglas 3 mm opal",
        componentLabel: null,
        context: null,
        rate: null,
      },
    ]);
    expect(presented?.costCompletenessIssues[0]?.rate).toBeNull();
  });

  it("does not invent cost lines when financial context is omitted", () => {
    const presented = presentConfirm({ truth: {} }, "crv1:hidden");
    expect(presented).toEqual({
      reviewId: "crv1:hidden",
      completeness: null,
      calculationStatus: null,
      verificationStatus: null,
      completenessReasons: [],
      costCompletenessIssues: [],
      currency: null,
      lines: [],
      total: null,
      financialVisible: false,
      commercial: null,
      commercialPolicy: null,
      organizationDefaults: null,
      quoteCommercialTerms: null,
      quoteTermsFromDefaults: false,
      pricingMethod: null,
      calculatedPriceAvailable: false,
      manualProductPriceAuthorized: false,
      quoteBlocker: null,
    });
  });
});
