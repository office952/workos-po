import {
  COMMERCIAL_CURRENCY,
  COMMERCIAL_ROUNDING,
  DEFAULT_COMMERCIAL_POLICY,
  validateCommercialPolicy,
  type CommercialPolicy,
} from "./policy.js";

export type CommercialCostInput = {
  total: number;
  currency: string;
  completeness: "PARTIAL" | "COMPLETE";
};

export type CommercialPriceCompleteness = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export type CommercialPriceProjection = {
  internalCost: number;
  internalCostCurrency: string;
  internalCostCompleteness: CommercialCostInput["completeness"];
  policyId: string;
  policyVersion: number;
  markupPercent: number;
  markupAmount: number | null;
  discountPercent: number;
  discountAmount: number | null;
  adjustmentAmount: number | null;
  netPrice: number | null;
  vatPercent: number;
  vatAmount: number | null;
  grossPrice: number | null;
  currency: typeof COMMERCIAL_CURRENCY;
  completeness: CommercialPriceCompleteness;
  unavailableReasons: readonly string[];
};

const PARTIAL_EIC_REASON =
  "Costul intern nu este complet pentru această configurație.";
const CURRENCY_MISMATCH_REASON =
  "Moneda costului intern nu coincide cu moneda comercială.";
const INVALID_COST_REASON = "Costul intern nu poate fi folosit pentru preț client.";
const NEGATIVE_NET_REASON = "Prețul net nu poate fi negativ.";

export function roundMoney(
  value: number,
  increment: number = COMMERCIAL_ROUNDING,
): number {
  const scale = Math.round(1 / increment);
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function projectCommercialPrice(
  input: CommercialCostInput,
  policy: CommercialPolicy = DEFAULT_COMMERCIAL_POLICY,
): CommercialPriceProjection {
  const policyIssues = validateCommercialPolicy(policy);
  const reasons: string[] = policyIssues.map((issue) => issue.reason);
  const costUsable = Number.isFinite(input.total) && input.total >= 0;
  if (!costUsable) {
    reasons.push(INVALID_COST_REASON);
  }
  if (input.currency !== policy.currency) {
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
    internalCost: input.total,
    internalCostCurrency: input.currency,
    internalCostCompleteness: input.completeness,
    policyId: policy.id,
    policyVersion: policy.version,
    markupPercent: policy.markupPercent,
    discountPercent: policy.defaultDiscountPercent,
    vatPercent: policy.vatPercent,
    currency: COMMERCIAL_CURRENCY,
  };

  if (reasons.length > 0) {
    return unavailableProjection(base, reasons);
  }

  const markupAmount = roundMoney(
    input.total * (policy.markupPercent / 100),
    policy.rounding,
  );
  const adjustmentAmount = roundMoney(policy.defaultAdjustment, policy.rounding);
  const subtotal = roundMoney(
    input.total + markupAmount + adjustmentAmount,
    policy.rounding,
  );
  const discountAmount = roundMoney(
    subtotal * (policy.defaultDiscountPercent / 100),
    policy.rounding,
  );
  const netPrice = roundMoney(subtotal - discountAmount, policy.rounding);
  if (netPrice < 0) {
    return unavailableProjection(base, [NEGATIVE_NET_REASON]);
  }
  const vatAmount = roundMoney(netPrice * (policy.vatPercent / 100), policy.rounding);
  const grossPrice = roundMoney(netPrice + vatAmount, policy.rounding);

  return {
    ...base,
    markupAmount,
    discountAmount,
    adjustmentAmount,
    netPrice,
    vatAmount,
    grossPrice,
    completeness: input.completeness === "COMPLETE" ? "COMPLETE" : "PARTIAL",
    unavailableReasons: input.completeness === "COMPLETE" ? [] : [PARTIAL_EIC_REASON],
  };
}

export function commercialCompletenessLabel(
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

function unavailableProjection(
  base: Omit<
    CommercialPriceProjection,
    | "markupAmount"
    | "discountAmount"
    | "adjustmentAmount"
    | "netPrice"
    | "vatAmount"
    | "grossPrice"
    | "completeness"
    | "unavailableReasons"
  >,
  reasons: readonly string[],
): CommercialPriceProjection {
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
