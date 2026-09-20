import {
  COMMERCIAL_CURRENCY,
  COMMERCIAL_ROUNDING,
  DEFAULT_COMMERCIAL_POLICY,
  validateCommercialPolicy,
  type CommercialPolicy,
} from "./policy.js";
import { policySourceOf, type CommercialPolicySource, type ResolvedCommercialPolicy } from "./resolvePolicy.js";
import {
  quoteCommercialTermsFromPolicy,
  validateQuoteCommercialTerms,
  type QuoteCommercialTerms,
} from "./quoteTerms.js";
import type {
  EicCalculationStatus,
  EicVerificationStatus,
} from "../resources/eic.js";

export type CommercialCostInput = {
  total: number;
  currency: string;
  completeness: "PARTIAL" | "COMPLETE";
  calculationStatus?: EicCalculationStatus;
  verificationStatus?: EicVerificationStatus;
};

export type CommercialPriceCompleteness = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export type CommercialPriceProjection = {
  internalCost: number;
  internalCostCurrency: string;
  internalCostCompleteness: CommercialCostInput["completeness"];
  policyId: string;
  policyVersion: number;
  policySource?: CommercialPolicySource;
  commercialStrategy?: string;
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
  calculationStatus: EicCalculationStatus;
  verificationStatus: EicVerificationStatus;
};

const PARTIAL_EIC_REASON =
  "Costul intern nu este complet pentru această configurație.";
const CURRENCY_MISMATCH_REASON =
  "Moneda costului intern nu coincide cu moneda comercială.";
const INVALID_COST_REASON = "Costul intern nu poate fi folosit pentru preț client.";
const NEGATIVE_NET_REASON = "Prețul net nu poate fi negativ.";

export function commercialCostIsCalculable(input: CommercialCostInput): boolean {
  if (input.calculationStatus === "CALCULABLE") {
    return true;
  }
  if (input.calculationStatus === "UNAVAILABLE") {
    return false;
  }
  return input.completeness === "COMPLETE";
}

function commercialVerificationStatus(
  input: CommercialCostInput,
): EicVerificationStatus {
  return input.verificationStatus ?? "CONFIRMED";
}

export function roundMoney(
  value: number,
  increment: number = COMMERCIAL_ROUNDING,
): number {
  const scale = Math.round(1 / increment);
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

export function projectCommercialPrice(
  input: CommercialCostInput,
  policy: CommercialPolicy | ResolvedCommercialPolicy = DEFAULT_COMMERCIAL_POLICY,
  quoteTerms?: QuoteCommercialTerms,
): CommercialPriceProjection {
  const terms = quoteTerms ?? quoteCommercialTermsFromPolicy(policy);
  const policyIssues = validateCommercialPolicy(policy);
  const termIssues = validateQuoteCommercialTerms(terms);
  const reasons: string[] = [...policyIssues, ...termIssues].map((issue) => issue.reason);
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
    policySource: policySourceOf(policy),
    commercialStrategy: "PRODUCT_COST_PLUS",
    markupPercent: terms.markupPercent,
    discountPercent: terms.discountPercent,
    vatPercent: policy.vatPercent,
    currency: COMMERCIAL_CURRENCY,
    calculationStatus: commercialCostIsCalculable(input) ? "CALCULABLE" : "UNAVAILABLE",
    verificationStatus: commercialVerificationStatus(input),
  };

  if (reasons.length > 0) {
    return unavailableProjection(base, reasons);
  }

  const markupAmount = roundMoney(
    input.total * (terms.markupPercent / 100),
    policy.rounding,
  );
  const adjustmentAmount = roundMoney(terms.adjustmentAmount, policy.rounding);
  const subtotal = roundMoney(
    input.total + markupAmount + adjustmentAmount,
    policy.rounding,
  );
  const discountAmount = roundMoney(
    subtotal * (terms.discountPercent / 100),
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
    completeness: commercialCostIsCalculable(input) ? "COMPLETE" : "PARTIAL",
    unavailableReasons: commercialCostIsCalculable(input) ? [] : [PARTIAL_EIC_REASON],
    calculationStatus: commercialCostIsCalculable(input) ? "CALCULABLE" : "UNAVAILABLE",
    verificationStatus: commercialVerificationStatus(input),
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
    calculationStatus: "UNAVAILABLE",
    verificationStatus: base.verificationStatus,
  };
}
