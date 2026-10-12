import type { CommercialPriceTransport } from "../api/types";

export type CustomerPrice = {
  netPrice: number | null;
  vatPercent: number | null;
  vatAmount: number | null;
  grossPrice: number | null;
  currency: string;
};

/** Customer price only when the server result is complete and presentable. */
export function presentCustomerPrice(commercial: CommercialPriceTransport | null): CustomerPrice | null {
  if (
    commercial?.completeness !== "COMPLETE" ||
    commercial.unavailableReasons.length > 0 ||
    (commercial.netPrice === null && commercial.grossPrice === null)
  ) {
    return null;
  }
  return {
    netPrice: commercial.netPrice,
    vatPercent: commercial.vatPercent,
    vatAmount: commercial.vatAmount,
    grossPrice: commercial.grossPrice,
    currency: commercial.currency ?? "EUR",
  };
}
