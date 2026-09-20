import type {
  ConfirmTransport,
  CostCompletenessIssueTransport,
  CostLineTransport,
} from "../api/types";
import {
  presentCommercialPolicySummary,
  presentCommercialPrice,
  presentPricingMethod,
  presentQuoteBlocker,
  presentQuoteCommercialTerms,
} from "./commercialAdapter";
import { asRecord } from "./record";

const ISSUE_TYPES = [
  "MISSING_COST_EVIDENCE",
  "MISSING_TECHNICAL_INPUT",
  "UNCALCULATED_COMPONENT",
  "PROVISIONAL_COST_EVIDENCE",
  "OTHER",
] as const;

export function presentCostCompletenessIssues(
  value: unknown,
): CostCompletenessIssueTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (
      !record ||
      typeof record.type !== "string" ||
      !(ISSUE_TYPES as readonly string[]).includes(record.type) ||
      typeof record.label !== "string" ||
      typeof record.reason !== "string"
    ) {
      return [];
    }
    return [
      {
        type: record.type as CostCompletenessIssueTransport["type"],
        label: record.label,
        reason: record.reason,
        resourceId: typeof record.resourceId === "string" ? record.resourceId : null,
        componentLabel:
          typeof record.componentLabel === "string" ? record.componentLabel : null,
        context: typeof record.context === "string" ? record.context : null,
      },
    ];
  });
}

export function presentCostLines(value: unknown): CostLineTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (
      !record ||
      typeof record.resourceId !== "string" ||
      typeof record.label !== "string" ||
      typeof record.quantity !== "number" ||
      typeof record.unit !== "string" ||
      typeof record.rate !== "number" ||
      typeof record.currency !== "string" ||
      typeof record.cost !== "number"
    ) {
      return [];
    }
    return [
      {
        resourceId: record.resourceId,
        label: record.label,
        quantity: record.quantity,
        unit: record.unit,
        rate: record.rate,
        currency: record.currency,
        cost: record.cost,
      },
    ];
  });
}

export function presentConfirm(
  payload: unknown,
  reviewId: string,
): ConfirmTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const eic = asRecord(record.eic);
  if (!eic) {
    return {
      reviewId,
      completeness: null,
      completenessReasons: [],
      costCompletenessIssues: [],
      currency: null,
      lines: [],
      total: null,
      financialVisible: false,
      commercial: presentCommercialPrice(record.commercialPrice),
      commercialPolicy: presentCommercialPolicySummary(record.commercialPolicy),
      organizationDefaults: presentQuoteCommercialTerms(record.organizationDefaults),
      quoteCommercialTerms: presentQuoteCommercialTerms(record.quoteCommercialTerms),
      quoteTermsFromDefaults: record.quoteTermsFromDefaults === true,
      pricingMethod: presentPricingMethod(record.pricingMethod),
      calculatedPriceAvailable: record.calculatedPriceAvailable === true,
      manualProductPriceAuthorized: record.manualProductPriceAuthorized === true,
      quoteBlocker: presentQuoteBlocker(record.commercialExperience),
    };
  }
  return {
    reviewId,
    completeness: typeof eic.completeness === "string" ? eic.completeness : null,
    completenessReasons: Array.isArray(eic.completenessReasons)
      ? eic.completenessReasons.filter((reason) => typeof reason === "string")
      : [],
    costCompletenessIssues: presentCostCompletenessIssues(record.costCompletenessIssues),
    currency: typeof eic.currency === "string" ? eic.currency : null,
    lines: presentCostLines(eic.lines),
    total: typeof eic.total === "number" ? eic.total : null,
    financialVisible: true,
    commercial: presentCommercialPrice(record.commercialPrice),
    commercialPolicy: presentCommercialPolicySummary(record.commercialPolicy),
    organizationDefaults: presentQuoteCommercialTerms(record.organizationDefaults),
    quoteCommercialTerms: presentQuoteCommercialTerms(record.quoteCommercialTerms),
    quoteTermsFromDefaults: record.quoteTermsFromDefaults === true,
    pricingMethod: presentPricingMethod(record.pricingMethod),
    calculatedPriceAvailable: record.calculatedPriceAvailable === true,
    manualProductPriceAuthorized: record.manualProductPriceAuthorized === true,
    quoteBlocker: presentQuoteBlocker(record.commercialExperience),
  };
}
