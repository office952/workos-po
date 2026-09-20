import type { CommercialPriceTransport } from "../api/types";
import { asNumber, asRecord, asString, asStringList } from "./record";

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
    policySource: asString(record.policySource),
    commercialStrategy: asString(record.commercialStrategy),
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
