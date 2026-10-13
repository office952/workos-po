import type { ProductProcessComposition } from "../processes/composition.js";
import { canonicalContentHash } from "../production/snapshot.js";
import type { ProductAggregate, ProductTruth } from "../product/types.js";
import {
  costEvidenceQualifierIdentity,
  costSourceLabel,
  getResource,
  lookupCostEvidence,
  resourceUnitLabel,
  type CostEvidence,
  type ResourceUnit,
} from "../resources/catalog.js";
import { costEvidenceNeedsVerification, resourceRequirements } from "../resources/eic.js";
import type { FinancialAccessScope } from "./financialAccess.js";
import type { CommercialPriceProjection } from "./price.js";
import { MANUAL_FIXED_PRODUCT_STRATEGY } from "./productPrice.js";

export const RATE_ACKNOWLEDGEMENT_POLICY = "UNCONFIRMED_RATE_ACKNOWLEDGEMENT_V1" as const;

export const UNCONFIRMED_RATE_IMPACTS = ["DRIVES_SELLING_PRICE", "INTERNAL_COST_ONLY"] as const;
export type UnconfirmedRateImpact = (typeof UNCONFIRMED_RATE_IMPACTS)[number];

export const RATE_ACKNOWLEDGEMENT_STATUSES = [
  "NOT_REQUIRED",
  "REQUIRED",
  "DISCLOSURE_ONLY",
] as const;
export type RateAcknowledgementStatus = (typeof RATE_ACKNOWLEDGEMENT_STATUSES)[number];

export const RATE_ACKNOWLEDGEMENT_ERRORS = [
  "rate_acknowledgement_required",
  "rate_acknowledgement_forbidden",
  "rate_acknowledgement_stale",
] as const;
export type RateAcknowledgementError = (typeof RATE_ACKNOWLEDGEMENT_ERRORS)[number];

export type UnconfirmedRateEvidence = {
  resourceId: string;
  label: string;
  evidenceRowId: string | null;
  amount: number;
  currency: "EUR";
  perUnit: ResourceUnit;
  source: CostEvidence["source"];
  classification: CostEvidence["classification"];
  volumeDepthMm?: number;
  /** Assembly member that froze this rate; absent on standalone product quotes. */
  memberLabel?: string;
  /** Present when the member re-prices a legacy child on current rates, not historical ones. */
  evidenceBasis?: "CURRENT_RATE_REEVALUATION";
  quantity: number;
};

export type RateAcknowledgementRequirement = {
  policy: typeof RATE_ACKNOWLEDGEMENT_POLICY;
  status: RateAcknowledgementStatus;
  impact: UnconfirmedRateImpact | null;
  rates: readonly UnconfirmedRateEvidence[];
  bindingHash: string | null;
};

export type FrozenRateAcknowledgement = {
  policy: typeof RATE_ACKNOWLEDGEMENT_POLICY;
  bindingHash: string;
  impact: "DRIVES_SELLING_PRICE";
  acknowledgedByUserId: string;
  acknowledgedAt: string;
  rates: readonly UnconfirmedRateEvidence[];
};

export type RateAcknowledgementDecision =
  | { ok: true; acknowledgement: FrozenRateAcknowledgement | null }
  | { ok: false; error: RateAcknowledgementError; reasons: readonly string[] };

const REQUIRED_REASON =
  "Prețul clientului folosește tarife neconfirmate. Verifică-le și acceptă-le explicit înainte de înghețare.";
const FORBIDDEN_REASON =
  "Tarifele neconfirmate pot fi acceptate doar de un utilizator cu acces financiar.";
const STALE_REASON =
  "Oferta sau tarifele s-au schimbat după acceptare. Recalculează prețul și acceptă din nou tarifele neconfirmate.";

function isAiDecisionEvidence(evidence: Pick<CostEvidence, "source" | "classification">): boolean {
  return evidence.source === "AI_DECISION" || evidence.classification === "AI_DECISION";
}

/**
 * AI-generated rates are not Owner confirmations, so they need commercial acknowledgement even
 * though the shared EIC verification status still treats them as verified.
 */
function rateNeedsCommercialAcknowledgement(evidence: CostEvidence): boolean {
  return isAiDecisionEvidence(evidence) || costEvidenceNeedsVerification(evidence);
}

export function collectUnconfirmedRates(
  aggregate: ProductAggregate,
  composition: ProductProcessComposition | undefined,
  evidenceRows: readonly CostEvidence[],
): UnconfirmedRateEvidence[] {
  const byEvidence = new Map<string, UnconfirmedRateEvidence>();
  for (const requirement of resourceRequirements(aggregate, composition)) {
    const evidence = lookupCostEvidence(
      evidenceRows,
      requirement.resourceId,
      requirement.costQualifier,
    );
    if (!evidence || !rateNeedsCommercialAcknowledgement(evidence)) {
      continue;
    }
    const key =
      evidence.evidenceRowId ??
      `${evidence.resourceId}|${costEvidenceQualifierIdentity(evidence.when)}`;
    const existing = byEvidence.get(key);
    if (existing) {
      existing.quantity += requirement.quantity;
      continue;
    }
    byEvidence.set(key, {
      resourceId: evidence.resourceId,
      label: getResource(evidence.resourceId)?.label ?? evidence.resourceId,
      evidenceRowId: evidence.evidenceRowId ?? null,
      amount: evidence.amount,
      currency: "EUR",
      perUnit: evidence.perUnit,
      source: evidence.source,
      classification: evidence.classification,
      ...(evidence.when?.volumeDepthMm !== undefined
        ? { volumeDepthMm: evidence.when.volumeDepthMm }
        : {}),
      quantity: requirement.quantity,
    });
  }
  return [...byEvidence.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, rate]) => rate);
}

export function assessRateAcknowledgement(input: {
  organizationId: string;
  requestId: string | null;
  truth: ProductTruth;
  aggregate: ProductAggregate;
  composition?: ProductProcessComposition;
  costEvidenceRows: readonly CostEvidence[];
  commercial: CommercialPriceProjection;
}): RateAcknowledgementRequirement {
  const rates = collectUnconfirmedRates(
    input.aggregate,
    input.composition,
    input.costEvidenceRows,
  );
  if (rates.length === 0) {
    return {
      policy: RATE_ACKNOWLEDGEMENT_POLICY,
      status: "NOT_REQUIRED",
      impact: null,
      rates: [],
      bindingHash: null,
    };
  }
  if (input.commercial.commercialStrategy === MANUAL_FIXED_PRODUCT_STRATEGY) {
    return {
      policy: RATE_ACKNOWLEDGEMENT_POLICY,
      status: "DISCLOSURE_ONLY",
      impact: "INTERNAL_COST_ONLY",
      rates,
      bindingHash: null,
    };
  }
  return {
    policy: RATE_ACKNOWLEDGEMENT_POLICY,
    status: "REQUIRED",
    impact: "DRIVES_SELLING_PRICE",
    rates,
    bindingHash:
      input.commercial.completeness === "COMPLETE"
        ? rateAcknowledgementBindingHash(input, rates)
        : null,
  };
}

function rateAcknowledgementBindingHash(
  input: Parameters<typeof assessRateAcknowledgement>[0],
  rates: readonly UnconfirmedRateEvidence[],
): string {
  const commercial = input.commercial;
  return canonicalContentHash({
    policy: RATE_ACKNOWLEDGEMENT_POLICY,
    organizationId: input.organizationId,
    requestId: input.requestId,
    productCode: input.truth.templateCode,
    templateVersion: input.truth.templateVersion,
    reviewId: input.truth.reviewId,
    selectedComponentIds: input.truth.selectedComponentIds,
    values: input.truth.values,
    measurements: input.truth.measurements,
    commercial: {
      commercialStrategy: commercial.commercialStrategy ?? null,
      policyId: commercial.policyId,
      policyVersion: commercial.policyVersion,
      internalCost: commercial.internalCost,
      markupPercent: commercial.markupPercent,
      discountPercent: commercial.discountPercent,
      adjustmentAmount: commercial.adjustmentAmount,
      netPrice: commercial.netPrice,
      vatPercent: commercial.vatPercent,
      grossPrice: commercial.grossPrice,
      currency: commercial.currency,
    },
    rates,
  });
}

/**
 * Actor and time must come from the authenticated server request, never from the client body.
 * Acknowledging a quote never confirms the organization rate itself.
 */
export function decideRateAcknowledgement(
  requirement: RateAcknowledgementRequirement,
  input: {
    authorized: boolean;
    submittedBindingHash: string | null;
    actorUserId: string;
    acknowledgedAt: string;
  },
): RateAcknowledgementDecision {
  if (requirement.status !== "REQUIRED") {
    return { ok: true, acknowledgement: null };
  }
  if (!input.authorized || input.actorUserId.trim() === "") {
    return { ok: false, error: "rate_acknowledgement_forbidden", reasons: [FORBIDDEN_REASON] };
  }
  if (input.submittedBindingHash === null) {
    return { ok: false, error: "rate_acknowledgement_required", reasons: [REQUIRED_REASON] };
  }
  if (
    requirement.bindingHash === null ||
    requirement.bindingHash !== input.submittedBindingHash
  ) {
    return { ok: false, error: "rate_acknowledgement_stale", reasons: [STALE_REASON] };
  }
  return {
    ok: true,
    acknowledgement: {
      policy: RATE_ACKNOWLEDGEMENT_POLICY,
      bindingHash: requirement.bindingHash,
      impact: "DRIVES_SELLING_PRICE",
      acknowledgedByUserId: input.actorUserId,
      acknowledgedAt: input.acknowledgedAt,
      rates: requirement.rates.map((rate) => ({ ...rate })),
    },
  };
}

/** Freeze time is metadata, like `createdAt`; it stays outside the snapshot content hash. */
export function rateAcknowledgementHashedContent(
  acknowledgement: FrozenRateAcknowledgement,
): Omit<FrozenRateAcknowledgement, "acknowledgedAt"> {
  return {
    policy: acknowledgement.policy,
    bindingHash: acknowledgement.bindingHash,
    impact: acknowledgement.impact,
    acknowledgedByUserId: acknowledgement.acknowledgedByUserId,
    rates: acknowledgement.rates.map((rate) => ({ ...rate })),
  };
}

export function isFrozenRateAcknowledgement(
  value: unknown,
): value is FrozenRateAcknowledgement {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.policy === RATE_ACKNOWLEDGEMENT_POLICY &&
    record.impact === "DRIVES_SELLING_PRICE" &&
    typeof record.bindingHash === "string" &&
    record.bindingHash !== "" &&
    typeof record.acknowledgedByUserId === "string" &&
    record.acknowledgedByUserId.trim() !== "" &&
    typeof record.acknowledgedAt === "string" &&
    Array.isArray(record.rates) &&
    record.rates.length > 0 &&
    record.rates.every(isUnconfirmedRateEvidence)
  );
}

function isUnconfirmedRateEvidence(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const rate = value as Record<string, unknown>;
  return (
    typeof rate.resourceId === "string" &&
    typeof rate.label === "string" &&
    typeof rate.amount === "number" &&
    Number.isFinite(rate.amount) &&
    rate.amount > 0 &&
    rate.currency === "EUR" &&
    typeof rate.perUnit === "string" &&
    typeof rate.source === "string" &&
    typeof rate.classification === "string" &&
    (rate.memberLabel === undefined || typeof rate.memberLabel === "string") &&
    (rate.evidenceBasis === undefined || rate.evidenceBasis === "CURRENT_RATE_REEVALUATION") &&
    typeof rate.quantity === "number"
  );
}

export function unconfirmedRateReasonLabel(rate: Pick<UnconfirmedRateEvidence, "source" | "classification">): string {
  if (isAiDecisionEvidence(rate)) {
    return "Valoare generată automat (AI), neconfirmată de owner";
  }
  switch (rate.source) {
    case "PLATFORM_DEFAULT":
      return "Valoare implicită de platformă, neconfirmată de firmă";
    case "LEGACY_EVIDENCE":
      return "Tarif preluat din evidența veche, neconfirmat";
    case "PILOT_INTERNAL_EVIDENCE":
      return "Tarif de pilot, neconfirmat";
    case "AI_DECISION":
    case "OWNER_CONFIRMED_PURCHASE":
    case "OWNER_CONFIRMED_WORKSHOP":
      return rate.classification === "DEVELOPMENT_DEFAULT"
        ? "Tarif implicit, neconfirmat de firmă"
        : "Tarif neconfirmat";
    default: {
      const _exhaustive: never = rate.source;
      return _exhaustive;
    }
  }
}

export type ScopedUnconfirmedRate = {
  resourceId: string;
  label: string;
  reason: string;
  sourceLabel: string;
  unitLabel: string;
  context: string | null;
  amount?: number;
  currency?: "EUR";
  quantity?: number;
};

function scopeUnconfirmedRate(
  rate: UnconfirmedRateEvidence,
  access: FinancialAccessScope,
): ScopedUnconfirmedRate {
  return {
    resourceId: rate.resourceId,
    label: rate.label,
    reason: unconfirmedRateReasonLabel(rate),
    sourceLabel: costSourceLabel(rate.source),
    unitLabel: resourceUnitLabel(rate.perUnit),
    context: unconfirmedRateContext(rate),
    ...(access === "owner"
      ? { amount: rate.amount, currency: rate.currency, quantity: rate.quantity }
      : {}),
  };
}

function unconfirmedRateContext(rate: UnconfirmedRateEvidence): string | null {
  const parts = [
    rate.memberLabel,
    rate.evidenceBasis === "CURRENT_RATE_REEVALUATION" ? "Reevaluat la tarifele curente" : undefined,
    rate.volumeDepthMm !== undefined ? `Adâncime ${rate.volumeDepthMm} mm` : undefined,
  ].filter((part): part is string => part !== undefined && part !== "");
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Only a user who may acknowledge receives the binding; the server re-checks both anyway. */
export function scopeRateAcknowledgementRequirement(
  requirement: RateAcknowledgementRequirement,
  access: FinancialAccessScope,
  canAcknowledge: boolean,
): Record<string, unknown> | null {
  if (access === "workshop") {
    return null;
  }
  const acknowledgeable = canAcknowledge && requirement.status === "REQUIRED";
  return {
    policy: requirement.policy,
    status: requirement.status,
    impact: requirement.impact,
    bindingHash: acknowledgeable ? requirement.bindingHash : null,
    canAcknowledge: acknowledgeable,
    rates: requirement.rates.map((rate) => scopeUnconfirmedRate(rate, access)),
  };
}

export function scopeFrozenRateAcknowledgement(
  acknowledgement: FrozenRateAcknowledgement,
  access: FinancialAccessScope,
): Record<string, unknown> | null {
  if (access === "workshop") {
    return null;
  }
  return {
    policy: acknowledgement.policy,
    impact: acknowledgement.impact,
    acknowledgedByUserId: acknowledgement.acknowledgedByUserId,
    acknowledgedAt: acknowledgement.acknowledgedAt,
    rates: acknowledgement.rates.map((rate) => scopeUnconfirmedRate(rate, access)),
  };
}

export function rateAcknowledgementErrorLabel(error: RateAcknowledgementError): string {
  switch (error) {
    case "rate_acknowledgement_required":
      return REQUIRED_REASON;
    case "rate_acknowledgement_forbidden":
      return FORBIDDEN_REASON;
    case "rate_acknowledgement_stale":
      return STALE_REASON;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
