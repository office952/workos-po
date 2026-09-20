import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_POLICY } from "./policy.js";
import { projectCommercialPrice } from "./price.js";
import {
  quoteCommercialTermsFromPolicy,
  quoteCommercialTermsMatchDefaults,
  validateQuoteCommercialTerms,
} from "./quoteTerms.js";

describe("quote commercial terms", () => {
  it("initializes from organization defaults without copying policy identity", () => {
    const terms = quoteCommercialTermsFromPolicy(DEFAULT_COMMERCIAL_POLICY);
    expect(terms).toEqual({
      markupPercent: 35,
      discountPercent: 0,
      adjustmentAmount: 0,
    });
    expect(quoteCommercialTermsMatchDefaults(terms, {
      markupPercent: 35,
      discountPercent: 0,
      adjustmentAmount: 0,
    })).toBe(true);
  });

  it("rejects invalid quote terms", () => {
    expect(
      validateQuoteCommercialTerms({
        markupPercent: -1,
        discountPercent: 0,
        adjustmentAmount: 0,
      }).some((issue) => issue.field === "markupPercent"),
    ).toBe(true);
    expect(
      validateQuoteCommercialTerms({
        markupPercent: 10,
        discountPercent: 120,
        adjustmentAmount: 0,
      }).some((issue) => issue.field === "discountPercent"),
    ).toBe(true);
  });

  it("changes only the current quote calculation", () => {
    const defaults = projectCommercialPrice({
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    const negotiated = projectCommercialPrice(
      {
        total: 382.5,
        currency: "EUR",
        completeness: "COMPLETE",
      },
      DEFAULT_COMMERCIAL_POLICY,
      { markupPercent: 25, discountPercent: 5, adjustmentAmount: 0 },
    );
    expect(defaults.markupPercent).toBe(35);
    expect(negotiated.markupPercent).toBe(25);
    expect(negotiated.discountPercent).toBe(5);
    expect(negotiated.netPrice).not.toBe(defaults.netPrice);
    expect(negotiated.vatPercent).toBe(DEFAULT_COMMERCIAL_POLICY.vatPercent);
  });
});
