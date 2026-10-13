import { MANUAL_FIXED_PRODUCT_STRATEGY } from "../commercial/productPrice.js";
import {
  RATE_ACKNOWLEDGEMENT_POLICY,
  type RateAcknowledgementRequirement,
  type UnconfirmedRateEvidence,
} from "../commercial/rateAcknowledgement.js";
import { canonicalContentHash } from "../production/snapshot.js";
import {
  CURRENT_RATE_REEVALUATION,
  type AssemblyRuleFailure,
  type ChildRateEvidenceBasis,
  type ConfirmedChildProduct,
} from "./model.js";
import type { AssemblyQuoteSnapshot } from "./snapshots.js";

function legacyChildReason(roleLabel: string): string {
  return `Produsul „${roleLabel}” a fost confirmat înainte de înregistrarea tarifelor folosite, iar acestea nu pot fi reconstituite. Reconfirmă produsul în ansamblu pentru a-l reevalua la tarifele curente.`;
}

/**
 * Chooses the child record a member confirmation persists. A child with recorded rates is reused
 * as stored. A legacy child froze no per-rate evidence, so its historical rates cannot be proven:
 * `candidate` (evaluated on current rates) is kept as a separate record that names the legacy
 * child it re-prices. The legacy record, and every truth or quote referencing it, stays unchanged.
 */
export function resolveConfirmedChildRecord(
  candidate: ConfirmedChildProduct,
  existing: ConfirmedChildProduct | null,
): ConfirmedChildProduct {
  if (!existing) {
    return candidate;
  }
  if (existing.unconfirmedRates) {
    return existing;
  }
  const basis: ChildRateEvidenceBasis = {
    kind: CURRENT_RATE_REEVALUATION,
    reevaluatedFromTruthId: existing.truthId,
  };
  return {
    ...candidate,
    truthId: `pctr:${canonicalContentHash({
      basis,
      truthHash: candidate.truthHash,
      aggregateHash: candidate.aggregateHash,
      productionInputHash: candidate.productionInput.contentHash,
      childQuoteContentHash: candidate.childQuoteContentHash,
      unconfirmedRates: candidate.unconfirmedRates ?? [],
    })}`,
    unconfirmedRates: candidate.unconfirmedRates ?? [],
    rateEvidenceBasis: basis,
  };
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
    const evidenceBasis = child.rateEvidenceBasis?.kind;
    target.push(
      ...child.unconfirmedRates.map((rate) => ({
        ...rate,
        memberLabel: member.roleLabel,
        ...(evidenceBasis ? { evidenceBasis } : {}),
      })),
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
