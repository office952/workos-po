import {
  canonicalizeDecisionGroups,
  commercialDecisionsFingerprint,
  commercialReopenFingerprint,
  commercialResumeFingerprint,
  normalizeCommercialOperationId,
  normalizeCommercialReason,
  normalizeExpectedRevision,
} from "./fingerprint.js";
import { resolveOfferCommercialStatus, unresolvedOffers } from "./resolution.js";
import {
  commercialMutationErrorLabel,
  type CommercialActor,
  type CommercialDecisionGroup,
  type CommercialLedgerState,
  type CommercialMutationRefusal,
  type CommercialMutationResult,
  type CommercialOfferFacts,
  type RecordedCommercialOperation,
} from "./types.js";

function refusal(
  error: CommercialMutationRefusal["error"],
  currentRevision: number,
  extra?: { blockingQuoteSnapshotIds?: readonly string[]; reasons?: readonly string[] },
): CommercialMutationRefusal {
  return {
    ok: false,
    error,
    currentRevision,
    blockingQuoteSnapshotIds: extra?.blockingQuoteSnapshotIds ?? [],
    reasons: extra?.reasons ?? [commercialMutationErrorLabel(error)],
  };
}

function requireOwner(
  actor: CommercialActor,
  revision: number,
): CommercialMutationRefusal | null {
  if (actor.role !== "owner") {
    return refusal("forbidden", revision);
  }
  return null;
}

function existingOperationResult(
  existing: RecordedCommercialOperation | null,
  requestId: string,
  fingerprint: string,
  ledger: CommercialLedgerState,
): CommercialMutationResult | null {
  if (!existing) {
    return null;
  }
  if (existing.requestId !== requestId || existing.payloadFingerprint !== fingerprint) {
    return refusal("commercial_operation_conflict", ledger.revision);
  }
  return {
    ok: true,
    idempotent: true,
    nextRevision: existing.resultRevision,
    nextState: ledger.state,
    events: [],
    dispositionWrites: [],
    dispositionDeletes: [],
    payloadFingerprint: fingerprint,
    operationId: existing.operationId,
    closeReason: ledger.closeReason,
    reopenReason: ledger.reopenReason,
  };
}

export function planSaveCommercialDecisions(input: {
  requestId: string;
  ledger: CommercialLedgerState;
  offers: readonly CommercialOfferFacts[];
  groups: readonly CommercialDecisionGroup[];
  close: boolean;
  closeReason: unknown;
  expectedRevision: unknown;
  operationId: unknown;
  actor: CommercialActor;
  existingOperation: RecordedCommercialOperation | null;
}): CommercialMutationResult {
  const forbidden = requireOwner(input.actor, input.ledger.revision);
  if (forbidden) {
    return forbidden;
  }
  const operationId = normalizeCommercialOperationId(input.operationId);
  const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
  if (!operationId || expectedRevision === null) {
    return refusal("invalid_payload", input.ledger.revision);
  }
  if (input.ledger.requestId !== input.requestId) {
    return refusal("not_found", input.ledger.revision);
  }
  const groups = canonicalizeDecisionGroups(input.groups);
  if (groups.length !== input.groups.length) {
    return refusal("homogeneous_reason_required", input.ledger.revision);
  }
  const closeReason = input.close ? normalizeCommercialReason(input.closeReason) : null;
  if (input.close && !closeReason) {
    return refusal("close_reason_required", input.ledger.revision);
  }
  const fingerprint = commercialDecisionsFingerprint({
    requestId: input.requestId,
    groups,
    close: input.close,
    closeReason,
  });
  const replay = existingOperationResult(
    input.existingOperation,
    input.requestId,
    fingerprint,
    input.ledger,
  );
  if (replay) {
    return replay;
  }
  if (expectedRevision !== input.ledger.revision) {
    return refusal("commercial_revision_mismatch", input.ledger.revision);
  }
  if (input.ledger.state === "CLOSED") {
    return refusal("commercial_request_closed", input.ledger.revision);
  }
  if (groups.length === 0 && !input.close) {
    return refusal("invalid_payload", input.ledger.revision);
  }
  if (groups.length === 0 && input.close && input.offers.length > 0) {
    const stillOpen = unresolvedOffers(input.offers);
    if (stillOpen.length > 0) {
      return refusal("unresolved_offers", input.ledger.revision, {
        blockingQuoteSnapshotIds: stillOpen.map((offer) => offer.quoteSnapshotId),
      });
    }
  }

  const seen = new Set<string>();
  const dispositionWrites: Array<{
    quoteSnapshotId: string;
    disposition: (typeof groups)[number]["disposition"];
    reason: string;
  }> = [];
  const eventDrafts: Array<{
    eventKind: "OFFER_DISPOSITION" | "REQUEST_CLOSED";
    quoteSnapshotId: string | null;
    disposition: (typeof groups)[number]["disposition"] | null;
    reason: string;
    supersedesEventId: string | null;
  }> = [];

  for (const group of groups) {
    const reason = normalizeCommercialReason(group.reason);
    if (!reason) {
      return refusal("homogeneous_reason_required", input.ledger.revision);
    }
    if (group.quoteSnapshotIds.length === 0) {
      return refusal("invalid_payload", input.ledger.revision);
    }
    for (const quoteSnapshotId of group.quoteSnapshotIds) {
      if (seen.has(quoteSnapshotId)) {
        return refusal("invalid_payload", input.ledger.revision);
      }
      seen.add(quoteSnapshotId);
      const offer = input.offers.find((item) => item.quoteSnapshotId === quoteSnapshotId);
      if (!offer) {
        return refusal("offer_not_eligible", input.ledger.revision, {
          blockingQuoteSnapshotIds: [quoteSnapshotId],
        });
      }
      if (offer.ordered) {
        return refusal("ordered_offer_not_declinable", input.ledger.revision, {
          blockingQuoteSnapshotIds: [quoteSnapshotId],
        });
      }
      if (offer.accepted) {
        return refusal("accepted_offer_not_declinable", input.ledger.revision, {
          blockingQuoteSnapshotIds: [quoteSnapshotId],
        });
      }
      if (offer.superseded) {
        return refusal("offer_not_eligible", input.ledger.revision, {
          blockingQuoteSnapshotIds: [quoteSnapshotId],
          reasons: [
            "O ofertă înlocuită se rezolvă prin linia de versiuni, nu printr-un refuz al clientului.",
          ],
        });
      }
      const resolution = resolveOfferCommercialStatus(offer);
      if (!resolution.decisionRequired && !offer.currentDisposition) {
        return refusal("offer_not_eligible", input.ledger.revision, {
          blockingQuoteSnapshotIds: [quoteSnapshotId],
        });
      }
      dispositionWrites.push({
        quoteSnapshotId,
        disposition: group.disposition,
        reason,
      });
      eventDrafts.push({
        eventKind: "OFFER_DISPOSITION",
        quoteSnapshotId,
        disposition: group.disposition,
        reason,
        supersedesEventId: offer.currentDispositionEventId,
      });
    }
  }

  const nextFacts = input.offers.map((offer) => {
    const write = dispositionWrites.find((item) => item.quoteSnapshotId === offer.quoteSnapshotId);
    return write
      ? { ...offer, currentDisposition: write.disposition }
      : offer;
  });
  const stillUnresolved = unresolvedOffers(nextFacts);
  if (input.close && stillUnresolved.length > 0) {
    return refusal("unresolved_offers", input.ledger.revision, {
      blockingQuoteSnapshotIds: stillUnresolved.map((offer) => offer.quoteSnapshotId),
    });
  }
  if (input.close && closeReason) {
    eventDrafts.push({
      eventKind: "REQUEST_CLOSED",
      quoteSnapshotId: null,
      disposition: null,
      reason: closeReason,
      supersedesEventId: null,
    });
  }

  return {
    ok: true,
    idempotent: false,
    nextRevision: input.ledger.revision + 1,
    nextState: input.close ? "CLOSED" : "OPEN",
    events: eventDrafts,
    dispositionWrites,
    dispositionDeletes: [],
    payloadFingerprint: fingerprint,
    operationId,
    closeReason,
    reopenReason: null,
  };
}

export function planCloseOfferlessRequest(input: {
  requestId: string;
  ledger: CommercialLedgerState;
  offers: readonly CommercialOfferFacts[];
  reason: unknown;
  expectedRevision: unknown;
  operationId: unknown;
  actor: CommercialActor;
  existingOperation: RecordedCommercialOperation | null;
}): CommercialMutationResult {
  return planSaveCommercialDecisions({
    ...input,
    groups: [],
    close: true,
    closeReason: input.reason,
  });
}

export function planReopenCommercialRequest(input: {
  requestId: string;
  ledger: CommercialLedgerState;
  reason: unknown;
  expectedRevision: unknown;
  operationId: unknown;
  actor: CommercialActor;
  existingOperation: RecordedCommercialOperation | null;
}): CommercialMutationResult {
  const forbidden = requireOwner(input.actor, input.ledger.revision);
  if (forbidden) {
    return forbidden;
  }
  const operationId = normalizeCommercialOperationId(input.operationId);
  const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
  const reason = normalizeCommercialReason(input.reason);
  if (!operationId || expectedRevision === null) {
    return refusal("invalid_payload", input.ledger.revision);
  }
  if (!reason) {
    return refusal("reason_required", input.ledger.revision);
  }
  const fingerprint = commercialReopenFingerprint({
    requestId: input.requestId,
    reason,
  });
  const replay = existingOperationResult(
    input.existingOperation,
    input.requestId,
    fingerprint,
    input.ledger,
  );
  if (replay) {
    return replay;
  }
  if (expectedRevision !== input.ledger.revision) {
    return refusal("commercial_revision_mismatch", input.ledger.revision);
  }
  if (input.ledger.state !== "CLOSED") {
    return refusal("commercial_request_open", input.ledger.revision);
  }
  return {
    ok: true,
    idempotent: false,
    nextRevision: input.ledger.revision + 1,
    nextState: "OPEN",
    events: [
      {
        eventKind: "REQUEST_REOPENED",
        quoteSnapshotId: null,
        disposition: null,
        reason,
        supersedesEventId: null,
      },
    ],
    dispositionWrites: [],
    dispositionDeletes: [],
    payloadFingerprint: fingerprint,
    operationId,
    closeReason: null,
    reopenReason: reason,
  };
}

export function planResumeCommercialOffer(input: {
  requestId: string;
  ledger: CommercialLedgerState;
  offers: readonly CommercialOfferFacts[];
  quoteSnapshotId: string;
  reason: unknown;
  expectedRevision: unknown;
  operationId: unknown;
  actor: CommercialActor;
  existingOperation: RecordedCommercialOperation | null;
}): CommercialMutationResult {
  const forbidden = requireOwner(input.actor, input.ledger.revision);
  if (forbidden) {
    return forbidden;
  }
  const operationId = normalizeCommercialOperationId(input.operationId);
  const expectedRevision = normalizeExpectedRevision(input.expectedRevision);
  const reason = normalizeCommercialReason(input.reason);
  const quoteSnapshotId = input.quoteSnapshotId.trim();
  if (!operationId || expectedRevision === null || quoteSnapshotId.length === 0) {
    return refusal("invalid_payload", input.ledger.revision);
  }
  if (!reason) {
    return refusal("reason_required", input.ledger.revision);
  }
  const fingerprint = commercialResumeFingerprint({
    requestId: input.requestId,
    quoteSnapshotId,
    reason,
  });
  const replay = existingOperationResult(
    input.existingOperation,
    input.requestId,
    fingerprint,
    input.ledger,
  );
  if (replay) {
    return replay;
  }
  if (expectedRevision !== input.ledger.revision) {
    return refusal("commercial_revision_mismatch", input.ledger.revision);
  }
  if (input.ledger.state === "CLOSED") {
    return refusal("commercial_request_closed", input.ledger.revision);
  }
  const offer = input.offers.find((item) => item.quoteSnapshotId === quoteSnapshotId);
  if (!offer) {
    return refusal("offer_not_eligible", input.ledger.revision, {
      blockingQuoteSnapshotIds: [quoteSnapshotId],
    });
  }
  if (offer.superseded) {
    return refusal("superseded_offer_not_resumable", input.ledger.revision, {
      blockingQuoteSnapshotIds: [quoteSnapshotId],
    });
  }
  const resolution = resolveOfferCommercialStatus(offer);
  if (!resolution.resumable) {
    return refusal("offer_not_resumable", input.ledger.revision, {
      blockingQuoteSnapshotIds: [quoteSnapshotId],
    });
  }
  return {
    ok: true,
    idempotent: false,
    nextRevision: input.ledger.revision + 1,
    nextState: "OPEN",
    events: [
      {
        eventKind: "OFFER_RESUMED",
        quoteSnapshotId,
        disposition: null,
        reason,
        supersedesEventId: offer.currentDispositionEventId,
      },
    ],
    dispositionWrites: [],
    dispositionDeletes: [quoteSnapshotId],
    payloadFingerprint: fingerprint,
    operationId,
    closeReason: null,
    reopenReason: null,
  };
}
