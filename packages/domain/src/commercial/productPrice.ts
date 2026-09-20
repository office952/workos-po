import { projectNetVatGross } from "./money.js";
import {
  COMMERCIAL_CURRENCY,
  DEFAULT_COMMERCIAL_POLICY,
  validateCommercialPolicy,
  type CommercialPolicy,
} from "./policy.js";
import {
  type CommercialPriceCompleteness,
  type CommercialPriceProjection,
} from "./price.js";
import { policySourceOf, type ResolvedCommercialPolicy } from "./resolvePolicy.js";

export const PRODUCT_COST_PLUS_STRATEGY = "PRODUCT_COST_PLUS" as const;
export const MANUAL_FIXED_PRODUCT_STRATEGY = "MANUAL_FIXED_PRODUCT" as const;
export const RESERVED_PRODUCT_PRICING_STRATEGIES = [
  "FIXED_OR_LIST_PRICE",
  "CONFIGURABLE_FORMULA_PRICE",
  "CALCULATED_RECOMMENDATION_WITH_OVERRIDE",
] as const;
export const SUPPORTED_PRODUCT_PRICING_STRATEGIES = [
  PRODUCT_COST_PLUS_STRATEGY,
  MANUAL_FIXED_PRODUCT_STRATEGY,
] as const;
export type SupportedProductPricingStrategy =
  (typeof SUPPORTED_PRODUCT_PRICING_STRATEGIES)[number];
export type ReservedProductPricingStrategy =
  (typeof RESERVED_PRODUCT_PRICING_STRATEGIES)[number];
export type ProductPricingStrategy =
  | SupportedProductPricingStrategy
  | ReservedProductPricingStrategy;

export const MISSING_MANUAL_PRODUCT_PRICE_REASON =
  "Prețul net manual al produsului nu este confirmat.";
export const INVALID_MANUAL_PRODUCT_PRICE_REASON =
  "Prețul net manual al produsului nu este valid.";
const CURRENCY_MISMATCH_REASON =
  "Moneda prețului manual nu coincide cu moneda comercială.";

export function isSupportedProductPricingStrategy(
  value: string,
): value is SupportedProductPricingStrategy {
  return (SUPPORTED_PRODUCT_PRICING_STRATEGIES as readonly string[]).includes(
    value,
  );
}

export function isValidManualProductNetPrice(
  value: number | null | undefined,
): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function projectManualFixedProductPrice(
  input: {
    netPrice: number | null | undefined;
    currency?: string;
    internalCost?: number;
    internalCostCurrency?: string;
    internalCostCompleteness?: CommercialPriceProjection["internalCostCompleteness"];
  },
  policy: CommercialPolicy | ResolvedCommercialPolicy = DEFAULT_COMMERCIAL_POLICY,
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
    internalCost:
      typeof input.internalCost === "number" && Number.isFinite(input.internalCost)
        ? input.internalCost
        : 0,
    internalCostCurrency: input.internalCostCurrency ?? currency,
    internalCostCompleteness: input.internalCostCompleteness ?? "PARTIAL",
    policyId: policy.id,
    policyVersion: policy.version,
    policySource: policySourceOf(policy),
    commercialStrategy: MANUAL_FIXED_PRODUCT_STRATEGY,
    markupPercent: 0,
    discountPercent: 0,
    vatPercent: policy.vatPercent,
    currency: COMMERCIAL_CURRENCY,
    calculationStatus:
      input.internalCostCompleteness === "COMPLETE" ? "CALCULABLE" : "UNAVAILABLE",
    verificationStatus: "CONFIRMED",
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

  if (!isValidManualProductNetPrice(input.netPrice)) {
    return {
      ...base,
      markupAmount: 0,
      discountAmount: 0,
      adjustmentAmount: 0,
      netPrice: null,
      vatAmount: null,
      grossPrice: null,
      completeness: "PARTIAL",
      unavailableReasons: [MISSING_MANUAL_PRODUCT_PRICE_REASON],
    };
  }

  const priced = projectNetVatGross(input.netPrice, policy);
  if (priced.netPrice <= 0) {
    return {
      ...base,
      markupAmount: null,
      discountAmount: null,
      adjustmentAmount: null,
      netPrice: null,
      vatAmount: null,
      grossPrice: null,
      completeness: "UNAVAILABLE",
      unavailableReasons: [INVALID_MANUAL_PRODUCT_PRICE_REASON],
    };
  }

  return {
    ...base,
    markupAmount: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    netPrice: priced.netPrice,
    vatAmount: priced.vatAmount,
    grossPrice: priced.grossPrice,
    completeness: "COMPLETE",
    unavailableReasons: [],
  };
}

export function projectAuthorizedProductCommercialPrice(
  costPlus: CommercialPriceProjection,
  policy: CommercialPolicy | ResolvedCommercialPolicy,
  options: {
    authorized: boolean;
    manualNetPrice?: number | null;
    preferManual?: boolean;
  },
): CommercialPriceProjection {
  const calculatedAvailable = costPlus.completeness === "COMPLETE";
  const hasValidManual =
    options.authorized && isValidManualProductNetPrice(options.manualNetPrice);
  const wantsManual =
    options.authorized && (options.preferManual === true || !calculatedAvailable);

  const costFacts = {
    internalCost: costPlus.internalCost,
    internalCostCurrency: costPlus.internalCostCurrency,
    internalCostCompleteness: costPlus.internalCostCompleteness,
  };

  if (wantsManual && hasValidManual) {
    return projectManualFixedProductPrice(
      { netPrice: options.manualNetPrice, ...costFacts },
      policy,
    );
  }

  if (wantsManual && options.preferManual === true) {
    return projectManualFixedProductPrice(
      { netPrice: options.manualNetPrice, ...costFacts },
      policy,
    );
  }

  return {
    ...costPlus,
    commercialStrategy: PRODUCT_COST_PLUS_STRATEGY,
    policySource: costPlus.policySource ?? policySourceOf(policy),
  };
}

export function productCommercialCompletenessLabel(
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
