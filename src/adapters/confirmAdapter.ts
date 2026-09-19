import type { ConfirmTransport, CostLineTransport } from "../api/types";
import { presentCommercialPrice, presentQuoteBlocker } from "./commercialAdapter";
import { asRecord } from "./record";

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
      currency: null,
      lines: [],
      total: null,
      financialVisible: false,
      commercial: presentCommercialPrice(record.commercialPrice),
      quoteBlocker: presentQuoteBlocker(record.commercialExperience),
    };
  }
  return {
    reviewId,
    completeness: typeof eic.completeness === "string" ? eic.completeness : null,
    completenessReasons: Array.isArray(eic.completenessReasons)
      ? eic.completenessReasons.filter((reason) => typeof reason === "string")
      : [],
    currency: typeof eic.currency === "string" ? eic.currency : null,
    lines: presentCostLines(eic.lines),
    total: typeof eic.total === "number" ? eic.total : null,
    financialVisible: true,
    commercial: presentCommercialPrice(record.commercialPrice),
    quoteBlocker: presentQuoteBlocker(record.commercialExperience),
  };
}
