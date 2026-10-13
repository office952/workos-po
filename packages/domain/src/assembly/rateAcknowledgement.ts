import { MANUAL_FIXED_PRODUCT_STRATEGY } from "../commercial/productPrice.js";
import {
  RATE_ACKNOWLEDGEMENT_POLICY,
  type RateAcknowledgementRequirement,
  type UnconfirmedRateEvidence,
} from "../commercial/rateAcknowledgement.js";
import { canonicalContentHash } from "../production/snapshot.js";
import type { AssemblyRuleFailure, ConfirmedChildProduct } from "./model.js";
import type { AssemblyQuoteSnapshot } from "./snapshots.js";

function legacyChildReason(roleLabel: string): string {
  return `Produsul „${roleLabel}” a fost confirmat înainte de verificarea tarifelor neconfirmate și nu poate susține o ofertă nouă de ansamblu.`;
}

/**
 * Assesses the rates frozen in every member's child quote. `candidate` must be the assembly quote
 * built without an acknowledgement: its content hash binds the assembly truth, child quote
 * hashes, commercial values and identities.
 */
export function assessAssemblyRateAcknowledgement(input: {
  candidate: AssemblyQuoteSnapshot;
  children: readonly ConfirmedChildProduct[];
}): { ok: true; requirement: RateAcknowledgementRequirement } | AssemblyRuleFailure {
  const priceRates: UnconfirmedRateEvidence[] = [];
  const internalCostRates: UnconfirmedRateEvidence[] = [];
  for (const member of input.candidate.members) {
    const child = input.children.find((item) => item.truthId === member.confirmedTruthId);
    if (!child?.unconfirmedRates) {
      return { ok: false, error: "stale_child", reasons: [legacyChildReason(member.roleLabel)] };
    }
    const target =
      member.commercial.commercialStrategy === MANUAL_FIXED_PRODUCT_STRATEGY
        ? internalCostRates
        : priceRates;
    target.push(
      ...child.unconfirmedRates.map((rate) => ({ ...rate, memberLabel: member.roleLabel })),
    );
  }
  if (priceRates.length > 0) {
    return {
      ok: true,
      requirement: {
        policy: RATE_ACKNOWLEDGEMENT_POLICY,
        status: "REQUIRED",
        impact: "DRIVES_SELLING_PRICE",
        rates: priceRates,
        bindingHash: canonicalContentHash({
          policy: RATE_ACKNOWLEDGEMENT_POLICY,
          organizationId: input.candidate.organizationId,
          requestId: input.candidate.requestId,
          assemblyId: input.candidate.assemblyId,
          assemblyQuoteContentHash: input.candidate.contentHash,
          rates: priceRates,
        }),
      },
    };
  }
  if (internalCostRates.length > 0) {
    return {
      ok: true,
      requirement: {
        policy: RATE_ACKNOWLEDGEMENT_POLICY,
        status: "DISCLOSURE_ONLY",
        impact: "INTERNAL_COST_ONLY",
        rates: internalCostRates,
        bindingHash: null,
      },
    };
  }
  return {
    ok: true,
    requirement: {
      policy: RATE_ACKNOWLEDGEMENT_POLICY,
      status: "NOT_REQUIRED",
      impact: null,
      rates: [],
      bindingHash: null,
    },
  };
}
