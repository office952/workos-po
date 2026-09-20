import type {
  CommercialPriceTransport,
  QuoteCommercialTermsTransport,
} from "../api/types";
import { asNumber, asRecord, asString, asStringList } from "./record";

export function presentQuoteCommercialTerms(
  value: unknown,
): QuoteCommercialTermsTransport | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const markupPercent = asNumber(record.markupPercent);
  const discountPercent = asNumber(record.discountPercent);
  const adjustmentAmount = asNumber(record.adjustmentAmount);
  if (markupPercent === null || discountPercent === null || adjustmentAmount === null) {
    return null;
  }
  return { markupPercent, discountPercent, adjustmentAmount };
}

export function presentPricingMethod(
  value: unknown,
): "PRODUCT_COST_PLUS" | "MANUAL_FIXED_PRODUCT" | null {
  return value === "PRODUCT_COST_PLUS" || value === "MANUAL_FIXED_PRODUCT"
    ? value
    : null;
}

export function presentCommercialPrice(value: unknown): CommercialPriceTransport | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    netPrice: asNumber(record.netPrice),
    grossPrice: asNumber(record.grossPrice),
    vatPercent: asNumber(record.vatPercent),
    vatAmount: asNumber(record.vatAmount),
    currency: asString(record.currency),
    completeness: asString(record.completeness),
    unavailableReasons: asStringList(record.unavailableReasons),
    internalCost: asNumber(record.internalCost),
    internalCostCurrency: asString(record.internalCostCurrency),
    internalCostCompleteness: asString(record.internalCostCompleteness),
    markupPercent: asNumber(record.markupPercent),
    markupAmount: asNumber(record.markupAmount),
    discountPercent: asNumber(record.discountPercent),
    discountAmount: asNumber(record.discountAmount),
    adjustmentAmount: asNumber(record.adjustmentAmount),
    marginAmount: asNumber(record.marginAmount),
    policySource: asString(record.policySource),
    commercialStrategy: asString(record.commercialStrategy),
    calculationStatus: asString(record.calculationStatus),
    verificationStatus: asString(record.verificationStatus),
  };
}

export function presentCommercialPolicySummary(value: unknown): {
  source: string | null;
  sourceLabel: string | null;
  guidance: string | null;
  version: number | null;
} | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  return {
    source: asString(record.source),
    sourceLabel: asString(record.sourceLabel),
    guidance: asString(record.guidance),
    version: asNumber(record.version),
  };
}

export function presentQuoteBlocker(value: unknown): string | null {
  const record = asRecord(value);
  return record ? asString(record.quoteBlocker) : null;
}
