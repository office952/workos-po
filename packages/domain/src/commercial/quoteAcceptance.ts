import {
  QUOTE_SNAPSHOT_SCHEMA_VERSION,
  QUOTE_SNAPSHOT_SCHEMA_VERSION_V2,
  hasValidQuoteSnapshotContentHash,
  hasValidQuoteSnapshotIdentity,
  isSupportedQuoteSnapshot,
  isTrustedFrozenQuoteV2ForOrder,
  type QuoteSnapshot,
} from "./quoteSnapshot.js";

export const QUOTE_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

export const QUOTE_ACCEPTANCE_ERRORS = [
  "quote_not_acceptable",
  "incompatible_quote",
  "service_quote_not_acceptable",
  "incomplete_cost_requires_owner_acceptance",
] as const;
export type QuoteAcceptanceError = (typeof QUOTE_ACCEPTANCE_ERRORS)[number];

/**
 * Commercial & Financial V1 · AUD-PRICING-002. An Owner may accept a quote whose internal cost is
 * not COMPLETE only by an explicit, recorded exception. The quote snapshot is not changed: the
 * exception is attached to the acceptance and carried into the order. It never marks the cost as
 * complete.
 */
export const INCOMPLETE_COST_ACCEPTANCE_POLICY = "INCOMPLETE_COST_ACCEPTANCE_V1" as const;
export const INCOMPLETE_COST_REASON_MAX_LENGTH = 500;

export type IncompleteCostAcceptance = {
  policy: typeof INCOMPLETE_COST_ACCEPTANCE_POLICY;
  quoteSnapshotId: string;
  quoteContentHash: string;
  costCompleteness: "PARTIAL";
  acceptedByUserId: string;
  acceptedAt: string;
  reason: string;
};

export type QuoteAcceptanceDecision = {
  acceptanceId: string;
  schemaVersion: typeof QUOTE_ACCEPTANCE_SCHEMA_VERSION;
  quoteSnapshotId: string;
  quoteContentHash: string;
  acceptedAt: string;
  incompleteCost?: IncompleteCostAcceptance;
};

export type QuoteAcceptanceResult =
  | { ok: true; decision: QuoteAcceptanceDecision }
  | { ok: false; error: QuoteAcceptanceError; reasons: readonly string[] };

const NOT_ACCEPTABLE_REASON =
  "Oferta nu poate fi acceptată până când snapshot-ul înghețat nu este complet.";
const INCOMPATIBLE_REASON = "Snapshot-ul de ofertă nu poate fi acceptat.";
export const INCOMPLETE_COST_ACCEPTANCE_REQUIRED_REASON =
  "Costul intern al ofertei nu este complet. Acceptarea cere confirmarea explicită a Proprietarului, cu motiv.";
export const SERVICE_QUOTE_NOT_ACCEPTABLE_REASON =
  "Oferta cu montaj nu poate fi acceptată în această etapă.";

export function readIncompleteCostReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > INCOMPLETE_COST_REASON_MAX_LENGTH) return null;
  return trimmed;
}

export function isIncompleteCostAcceptanceFor(
  value: IncompleteCostAcceptance | undefined,
  quote: { quoteSnapshotId: string; contentHash: string },
): value is IncompleteCostAcceptance {
  return (
    value !== undefined &&
    value.policy === INCOMPLETE_COST_ACCEPTANCE_POLICY &&
    value.costCompleteness === "PARTIAL" &&
    value.quoteSnapshotId === quote.quoteSnapshotId &&
    value.quoteContentHash === quote.contentHash &&
    value.acceptedByUserId.trim() !== "" &&
    value.reason.trim() !== ""
  );
}

export function recordQuoteAcceptance(
  snapshot: QuoteSnapshot,
  options?: {
    acceptedAt?: string;
    /** Owner exception for an incomplete internal cost (server actor, never from the body). */
    incompleteCost?: { acceptedByUserId: string; reason: string } | null;
  },
): QuoteAcceptanceResult {
  if (snapshot.schemaVersion === QUOTE_SNAPSHOT_SCHEMA_VERSION_V2) {
    if (
      !isTrustedFrozenQuoteV2ForOrder(snapshot) ||
      !hasValidQuoteSnapshotContentHash(snapshot) ||
      !hasValidQuoteSnapshotIdentity(snapshot)
    ) {
      return {
        ok: false,
        error: "service_quote_not_acceptable",
        reasons: [SERVICE_QUOTE_NOT_ACCEPTABLE_REASON],
      };
    }
  } else if (
    !isSupportedQuoteSnapshot(snapshot) ||
    snapshot.quoteSnapshotId.trim() === "" ||
    snapshot.contentHash.trim() === ""
  ) {
    return {
      ok: false,
      error: "incompatible_quote",
      reasons: [INCOMPATIBLE_REASON],
    };
  }
  if (snapshot.commercial.completeness !== "COMPLETE") {
    return {
      ok: false,
      error: "quote_not_acceptable",
      reasons: [NOT_ACCEPTABLE_REASON],
    };
  }
  const acceptedAt = options?.acceptedAt ?? new Date().toISOString();
  let incompleteCost: IncompleteCostAcceptance | undefined;
  if (snapshot.eic.completeness !== "COMPLETE") {
    const exception = options?.incompleteCost;
    const reason = exception ? readIncompleteCostReason(exception.reason) : null;
    if (
      snapshot.schemaVersion !== QUOTE_SNAPSHOT_SCHEMA_VERSION ||
      !exception ||
      exception.acceptedByUserId.trim() === "" ||
      reason === null
    ) {
      return {
        ok: false,
        error: "incomplete_cost_requires_owner_acceptance",
        reasons: [INCOMPLETE_COST_ACCEPTANCE_REQUIRED_REASON],
      };
    }
    incompleteCost = {
      policy: INCOMPLETE_COST_ACCEPTANCE_POLICY,
      quoteSnapshotId: snapshot.quoteSnapshotId,
      quoteContentHash: snapshot.contentHash,
      costCompleteness: "PARTIAL",
      acceptedByUserId: exception.acceptedByUserId,
      acceptedAt,
      reason,
    };
  }

  return {
    ok: true,
    decision: {
      acceptanceId: `qad:${snapshot.quoteSnapshotId}`,
      schemaVersion: QUOTE_ACCEPTANCE_SCHEMA_VERSION,
      quoteSnapshotId: snapshot.quoteSnapshotId,
      quoteContentHash: snapshot.contentHash,
      acceptedAt,
      ...(incompleteCost ? { incompleteCost } : {}),
    },
  };
}

export function quoteAcceptanceErrorLabel(error: QuoteAcceptanceError): string {
  switch (error) {
    case "quote_not_acceptable":
      return NOT_ACCEPTABLE_REASON;
    case "incompatible_quote":
      return INCOMPATIBLE_REASON;
    case "service_quote_not_acceptable":
      return SERVICE_QUOTE_NOT_ACCEPTABLE_REASON;
    case "incomplete_cost_requires_owner_acceptance":
      return INCOMPLETE_COST_ACCEPTANCE_REQUIRED_REASON;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
