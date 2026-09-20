import {
  validateCommercialPolicy,
  type CommercialPolicy,
  type CommercialPolicyIssue,
} from "./policy.js";

export type QuoteCommercialTerms = {
  markupPercent: number;
  discountPercent: number;
  adjustmentAmount: number;
};

export type OrganizationCommercialDefaults = {
  markupPercent: number;
  discountPercent: number;
  adjustmentAmount: number;
};

export function organizationCommercialDefaultsFromPolicy(
  policy: Pick<
    CommercialPolicy,
    "markupPercent" | "defaultDiscountPercent" | "defaultAdjustment"
  >,
): OrganizationCommercialDefaults {
  return {
    markupPercent: policy.markupPercent,
    discountPercent: policy.defaultDiscountPercent,
    adjustmentAmount: policy.defaultAdjustment,
  };
}

export function quoteCommercialTermsFromOrganizationDefaults(
  defaults: OrganizationCommercialDefaults,
): QuoteCommercialTerms {
  return {
    markupPercent: defaults.markupPercent,
    discountPercent: defaults.discountPercent,
    adjustmentAmount: defaults.adjustmentAmount,
  };
}

export function quoteCommercialTermsFromPolicy(
  policy: Pick<
    CommercialPolicy,
    "markupPercent" | "defaultDiscountPercent" | "defaultAdjustment"
  >,
): QuoteCommercialTerms {
  return quoteCommercialTermsFromOrganizationDefaults(
    organizationCommercialDefaultsFromPolicy(policy),
  );
}

export function validateQuoteCommercialTerms(
  terms: QuoteCommercialTerms,
): CommercialPolicyIssue[] {
  return validateCommercialPolicy({
    id: "QUOTE_COMMERCIAL_TERMS",
    label: "Termeni comerciali ai ofertei",
    currency: "EUR",
    markupPercent: terms.markupPercent,
    vatPercent: 0,
    rounding: 0.01,
    defaultDiscountPercent: terms.discountPercent,
    defaultAdjustment: terms.adjustmentAmount,
    version: 1,
    status: "ACTIVE",
  }).map((issue) => {
    if (issue.field === "markupPercent") {
      return issue;
    }
    if (issue.field === "defaultDiscountPercent") {
      return { field: "discountPercent", reason: issue.reason };
    }
    if (issue.field === "defaultAdjustment") {
      return { field: "adjustmentAmount", reason: issue.reason };
    }
    return issue;
  }).filter(
    (issue) =>
      issue.field === "markupPercent" ||
      issue.field === "discountPercent" ||
      issue.field === "adjustmentAmount",
  );
}

export function quoteCommercialTermsMatchDefaults(
  terms: QuoteCommercialTerms,
  defaults: OrganizationCommercialDefaults,
): boolean {
  return (
    terms.markupPercent === defaults.markupPercent &&
    terms.discountPercent === defaults.discountPercent &&
    terms.adjustmentAmount === defaults.adjustmentAmount
  );
}
