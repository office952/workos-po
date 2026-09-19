import {
  COMMERCIAL_CURRENCY,
  COMMERCIAL_ROUNDING,
  DEFAULT_COMMERCIAL_POLICY,
  validateCommercialPolicy,
  type CommercialPolicy,
} from "./policy.js";
import {
  roundMoney,
  type CommercialPriceCompleteness,
  type CommercialPriceProjection,
} from "./price.js";

export const MANUAL_FIXED_SERVICE_STRATEGY = "MANUAL_FIXED_PER_REQUEST";
export const MISSING_MANUAL_SERVICE_PRICE_REASON =
  "Prețul de montaj nu este confirmat de owner.";
const INVALID_MANUAL_PRICE_REASON = "Prețul de montaj nu este valid.";
const CURRENCY_MISMATCH_REASON =
  "Moneda prețului de montaj nu coincide cu moneda comercială.";

export function isValidManualServiceNetPrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function projectManualFixedServicePrice(
  input: {
    netPrice: number | null | undefined;
    currency?: string;
  },
  policy: CommercialPolicy = DEFAULT_COMMERCIAL_POLICY,
): CommercialPriceProjection {
  const policyIssues = validateCommercialPolicy(policy);
  const reasons: string[] = policyIssues.map((issue) => issue.reason);
  const currency = input.currency ?? COMMERCIAL_CURRENCY;
  if (currency !== policy.currency) {
    reasons.push(CURRENCY_MISMATCH_REASON);
  }

  const base: Omit<
    CommercialPriceProjection,
    | "markupAmount"
    | "discountAmount"
    | "adjustmentAmount"
    | "netPrice"
    | "vatAmount"
    | "grossPrice"
    | "completeness"
    | "unavailableReasons"
  > = {
    internalCost: 0,
    internalCostCurrency: currency,
    internalCostCompleteness: "PARTIAL",
    policyId: policy.id,
    policyVersion: policy.version,
    markupPercent: 0,
    discountPercent: 0,
    vatPercent: policy.vatPercent,
    currency: COMMERCIAL_CURRENCY,
  };

  if (reasons.length > 0) {
    return {
      ...base,
      markupAmount: null,
      discountAmount: null,
      adjustmentAmount: null,
      netPrice: null,
      vatAmount: null,
      grossPrice: null,
      completeness: "UNAVAILABLE",
      unavailableReasons: [...new Set(reasons)],
    };
  }

  if (!isValidManualServiceNetPrice(input.netPrice)) {
    return {
      ...base,
      markupAmount: 0,
      discountAmount: 0,
      adjustmentAmount: 0,
      netPrice: null,
      vatAmount: null,
      grossPrice: null,
      completeness: "PARTIAL",
      unavailableReasons: [MISSING_MANUAL_SERVICE_PRICE_REASON],
    };
  }

  const netPrice = roundMoney(input.netPrice, policy.rounding ?? COMMERCIAL_ROUNDING);
  if (netPrice <= 0) {
    return {
      ...base,
      markupAmount: null,
      discountAmount: null,
      adjustmentAmount: null,
      netPrice: null,
      vatAmount: null,
      grossPrice: null,
      completeness: "UNAVAILABLE",
      unavailableReasons: [INVALID_MANUAL_PRICE_REASON],
    };
  }

  const vatAmount = roundMoney(netPrice * (policy.vatPercent / 100), policy.rounding);
  const grossPrice = roundMoney(netPrice + vatAmount, policy.rounding);
  return {
    ...base,
    markupAmount: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    netPrice,
    vatAmount,
    grossPrice,
    completeness: "COMPLETE",
    unavailableReasons: [],
  };
}

export type LiveJobCommercial = {
  netPrice: number;
  vatAmount: number;
  grossPrice: number;
  currency: "EUR";
  completeness: "COMPLETE";
};

export function projectLiveJobCommercial(
  product: Pick<
    CommercialPriceProjection,
    "completeness" | "netPrice" | "vatAmount" | "grossPrice"
  >,
  installation:
    | Pick<CommercialPriceProjection, "completeness" | "netPrice" | "vatAmount" | "grossPrice">
    | null
    | undefined,
): LiveJobCommercial | null {
  if (
    !installation ||
    product.completeness !== "COMPLETE" ||
    installation.completeness !== "COMPLETE" ||
    product.netPrice == null ||
    product.vatAmount == null ||
    product.grossPrice == null ||
    installation.netPrice == null ||
    installation.vatAmount == null ||
    installation.grossPrice == null
  ) {
    return null;
  }
  return {
    netPrice: roundMoney(product.netPrice + installation.netPrice),
    vatAmount: roundMoney(product.vatAmount + installation.vatAmount),
    grossPrice: roundMoney(product.grossPrice + installation.grossPrice),
    currency: "EUR",
    completeness: "COMPLETE",
  };
}

export function serviceCommercialCompletenessLabel(
  completeness: CommercialPriceCompleteness,
): string {
  switch (completeness) {
    case "COMPLETE":
      return "Complet";
    case "PARTIAL":
      return "Parțial";
    case "UNAVAILABLE":
      return "Indisponibil";
    default: {
      const _exhaustive: never = completeness;
      return _exhaustive;
    }
  }
}
