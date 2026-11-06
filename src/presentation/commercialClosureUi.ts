import type { CommercialDispositionCode } from "../api/commercialClosure";
import type { RequestLinkedOfferTransport } from "../api/types";

export type OfferDecisionLock =
  | { selectable: true; required: boolean }
  | { selectable: false; reason: string };

export type CommercialDecisionDraft = {
  selected: Record<string, CommercialDispositionCode>;
  reasons: Record<CommercialDispositionCode, string>;
  closeReason: string;
};

export const EMPTY_COMMERCIAL_DECISION_DRAFT: CommercialDecisionDraft = {
  selected: {},
  reasons: { NOT_PURSUED: "", DECLINED_BY_CUSTOMER: "" },
  closeReason: "",
};

export const COMMERCIAL_DISPOSITION_OPTIONS: ReadonlyArray<{
  value: CommercialDispositionCode;
  label: string;
}> = [
  { value: "NOT_PURSUED", label: "Nu se mai urmărește" },
  { value: "DECLINED_BY_CUSTOMER", label: "Refuzată de client" },
];

export function offerDecisionLock(offer: RequestLinkedOfferTransport): OfferDecisionLock {
  if (offer.orderSnapshotId || offer.stage === "ORDER_CREATED") {
    return {
      selectable: false,
      reason: "Are comandă. Nu se marchează ca refuzată sau neurmărită.",
    };
  }
  if (offer.stage === "QUOTE_ACCEPTED") {
    return {
      selectable: false,
      reason: "Acceptată. Rămâne obligație de comandă; nu se marchează ca refuzată.",
    };
  }
  if (offer.superseded) {
    return { selectable: false, reason: "Înlocuită de o versiune mai nouă." };
  }
  if (offer.decisionRequired || offer.disposition) {
    return { selectable: true, required: Boolean(offer.decisionRequired) };
  }
  return { selectable: false, reason: "Oferta nu cere o decizie comercială." };
}

export function currentQuoteId(offerIds: readonly string[]): string | null {
  return offerIds[0] ?? null;
}

export function groupsFromDraft(draft: CommercialDecisionDraft): Array<{
  disposition: CommercialDispositionCode;
  reason: string;
  quoteSnapshotIds: string[];
}> {
  const buckets: Record<CommercialDispositionCode, string[]> = {
    NOT_PURSUED: [],
    DECLINED_BY_CUSTOMER: [],
  };
  for (const [quoteSnapshotId, disposition] of Object.entries(draft.selected)) {
    buckets[disposition].push(quoteSnapshotId);
  }
  return (Object.keys(buckets) as CommercialDispositionCode[])
    .filter((disposition) => buckets[disposition].length > 0)
    .map((disposition) => ({
      disposition,
      reason: draft.reasons[disposition].trim(),
      quoteSnapshotIds: buckets[disposition],
    }));
}

export function coversUnresolved(
  draft: CommercialDecisionDraft,
  unresolvedQuoteSnapshotIds: readonly string[],
): boolean {
  return unresolvedQuoteSnapshotIds.every((id) => Boolean(draft.selected[id]));
}

export function draftIsDirty(draft: CommercialDecisionDraft): boolean {
  return (
    Object.keys(draft.selected).length > 0 ||
    draft.reasons.NOT_PURSUED.trim().length > 0 ||
    draft.reasons.DECLINED_BY_CUSTOMER.trim().length > 0 ||
    draft.closeReason.trim().length > 0
  );
}
