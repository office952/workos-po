import {
  QUOTE_SNAPSHOT_SCHEMA_VERSION_V2,
  isSupportedQuoteSnapshot,
  type QuoteSnapshot,
} from "./quoteSnapshot.js";

export const QUOTE_ACCEPTANCE_SCHEMA_VERSION = 1 as const;

export const QUOTE_ACCEPTANCE_ERRORS = [
  "quote_not_acceptable",
  "incompatible_quote",
  "service_quote_not_acceptable",
] as const;
export type QuoteAcceptanceError = (typeof QUOTE_ACCEPTANCE_ERRORS)[number];

export type QuoteAcceptanceDecision = {
  acceptanceId: string;
  schemaVersion: typeof QUOTE_ACCEPTANCE_SCHEMA_VERSION;
  quoteSnapshotId: string;
  quoteContentHash: string;
  acceptedAt: string;
};

export type QuoteAcceptanceResult =
  | { ok: true; decision: QuoteAcceptanceDecision }
  | { ok: false; error: QuoteAcceptanceError; reasons: readonly string[] };

const NOT_ACCEPTABLE_REASON =
  "Oferta nu poate fi acceptată până când snapshot-ul înghețat nu este complet.";
const INCOMPATIBLE_REASON = "Snapshot-ul de ofertă nu poate fi acceptat.";
export const SERVICE_QUOTE_NOT_ACCEPTABLE_REASON =
  "Oferta cu montaj nu poate fi acceptată în această etapă.";

export function recordQuoteAcceptance(
  snapshot: QuoteSnapshot,
  options?: { acceptedAt?: string },
): QuoteAcceptanceResult {
  if (snapshot.schemaVersion === QUOTE_SNAPSHOT_SCHEMA_VERSION_V2) {
    return {
      ok: false,
      error: "service_quote_not_acceptable",
      reasons: [SERVICE_QUOTE_NOT_ACCEPTABLE_REASON],
    };
  }
  if (
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
  if (
    snapshot.eic.completeness !== "COMPLETE" ||
    snapshot.commercial.completeness !== "COMPLETE"
  ) {
    return {
      ok: false,
      error: "quote_not_acceptable",
      reasons: [NOT_ACCEPTABLE_REASON],
    };
  }

  return {
    ok: true,
    decision: {
      acceptanceId: `qad:${snapshot.quoteSnapshotId}`,
      schemaVersion: QUOTE_ACCEPTANCE_SCHEMA_VERSION,
      quoteSnapshotId: snapshot.quoteSnapshotId,
      quoteContentHash: snapshot.contentHash,
      acceptedAt: options?.acceptedAt ?? new Date().toISOString(),
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
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
