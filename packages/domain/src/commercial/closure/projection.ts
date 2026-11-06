import type { QuoteOverviewItem, QuoteOverviewNextAction } from "../../quotes/overview.js";
import {
  deriveQuoteOverviewAttention,
  quoteOverviewNextActionLabel,
} from "../../quotes/overview.js";
import { offerMayReceiveDisposition } from "./guards.js";
import { outstandingOrderObligations, resolveOfferCommercialStatus, unresolvedOffers } from "./resolution.js";
import {
  commercialActorRoleLabel,
  commercialOfferDispositionLabel,
  commercialStateLabel,
  type CommercialActor,
  type CommercialAvailableAction,
  type CommercialLedgerEvent,
  type CommercialLedgerState,
  type CommercialOfferDisposition,
  type CommercialOfferFacts,
  type CommercialState,
} from "./types.js";

export type CommercialBlockingReason = {
  code: string;
  label: string;
  quoteSnapshotId: string | null;
};

export type CommercialObligation = {
  quoteSnapshotId: string;
  label: string;
};

export type CommercialOfferView = {
  quoteSnapshotId: string;
  disposition: CommercialOfferDisposition | null;
  dispositionLabel: string | null;
  commerciallyResolved: boolean;
  resolutionSource: string;
  outstandingOrderObligation: boolean;
  decisionRequired: boolean;
  resumable: boolean;
  history: readonly CommercialAuditEventView[];
};

export type CommercialAuditEventView = {
  eventId: string;
  eventKind: CommercialLedgerEvent["eventKind"];
  eventKindLabel: string;
  quoteSnapshotId: string | null;
  disposition: CommercialOfferDisposition | null;
  dispositionLabel: string | null;
  reason: string;
  occurredAt: string;
  actor: {
    displayName: string;
    role: CommercialActor["role"];
    roleLabel: string;
    accountId: string | null;
  };
  operationId: string;
  correlationId: string;
};

export type CommercialRequestView = {
  state: CommercialState;
  stateLabel: string;
  revision: number;
  closedAt: string | null;
  closedBy: CommercialAuditEventView["actor"] | null;
  closeReason: string | null;
  reopenedAt: string | null;
  reopenedBy: CommercialAuditEventView["actor"] | null;
  reopenReason: string | null;
  offers: readonly CommercialOfferView[];
  availableActions: readonly CommercialAvailableAction[];
  blockingReasons: readonly CommercialBlockingReason[];
  outstandingAcceptedWithoutOrder: readonly CommercialObligation[];
  unresolvedQuoteSnapshotIds: readonly string[];
  canClose: boolean;
  canReopen: boolean;
  canSaveDecisions: boolean;
  canCreateQuote: boolean;
  timeline: readonly CommercialAuditEventView[];
};

function presentActor(
  actor: CommercialActor,
  revealAccountId: boolean,
): CommercialAuditEventView["actor"] {
  return {
    displayName: actor.displayName,
    role: actor.role,
    roleLabel: commercialActorRoleLabel(actor.role),
    accountId: revealAccountId ? actor.accountId : null,
  };
}

function eventKindLabel(kind: CommercialLedgerEvent["eventKind"]): string {
  switch (kind) {
    case "OFFER_DISPOSITION":
      return "Decizie pe ofertă";
    case "OFFER_RESUMED":
      return "Ofertă reluată";
    case "REQUEST_CLOSED":
      return "Urmărire comercială încheiată";
    case "REQUEST_REOPENED":
      return "Urmărire comercială redeschisă";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function presentCommercialAuditEvent(
  event: CommercialLedgerEvent,
  revealAccountId: boolean,
): CommercialAuditEventView {
  return {
    eventId: event.eventId,
    eventKind: event.eventKind,
    eventKindLabel: eventKindLabel(event.eventKind),
    quoteSnapshotId: event.quoteSnapshotId,
    disposition: event.disposition,
    dispositionLabel: event.disposition
      ? commercialOfferDispositionLabel(event.disposition)
      : null,
    reason: event.reason,
    occurredAt: event.occurredAt,
    actor: presentActor(event.actor, revealAccountId),
    operationId: event.operationId,
    correlationId: event.correlationId,
  };
}

export function projectCommercialRequestView(input: {
  ledger: CommercialLedgerState;
  offers: readonly CommercialOfferFacts[];
  events: readonly CommercialLedgerEvent[];
  actorIsOwner: boolean;
  revealAccountId: boolean;
}): CommercialRequestView {
  const unresolved = unresolvedOffers(input.offers);
  const obligations = outstandingOrderObligations(input.offers);
  const open = input.ledger.state === "OPEN";
  const owner = input.actorIsOwner;
  const availableActions: CommercialAvailableAction[] = [];
  if (owner && open && input.offers.some((offer) => offerMayReceiveDisposition(offer))) {
    availableActions.push("SAVE_DECISIONS");
  }
  if (owner && open && unresolved.length === 0 && input.offers.length > 0) {
    availableActions.push("SAVE_AND_CLOSE");
  }
  if (owner && open && input.offers.length === 0) {
    availableActions.push("CLOSE_OFFERLESS");
  }
  if (owner && !open) {
    availableActions.push("REOPEN");
  }
  if (owner && open && input.offers.some((offer) => resolveOfferCommercialStatus(offer).resumable)) {
    availableActions.push("RESUME_OFFER");
  }
  if (open) {
    availableActions.push("CREATE_QUOTE");
  }
  if (input.offers.some((offer) => offer.accepted && !offer.ordered)) {
    availableActions.push("CREATE_ORDER");
  }
  if (input.offers.some((offer) => !offer.accepted && !offer.ordered && !offer.superseded && !offer.currentDisposition) && open) {
    availableActions.push("ACCEPT_QUOTE");
  }
  if (!input.offers.some((offer) => offer.ordered)) {
    availableActions.push("ADMINISTRATIVE_CANCEL");
  }

  const blockingReasons: CommercialBlockingReason[] = unresolved.map((offer) => ({
    code: "unresolved_offer",
    label: "Oferta nu are încă o decizie comercială.",
    quoteSnapshotId: offer.quoteSnapshotId,
  }));

  const timeline = [...input.events]
    .sort((left, right) => {
      const time = left.occurredAt.localeCompare(right.occurredAt);
      if (time !== 0) {
        return time;
      }
      if (left.ledgerRevision !== right.ledgerRevision) {
        return left.ledgerRevision - right.ledgerRevision;
      }
      return left.sequenceInOperation - right.sequenceInOperation;
    })
    .map((event) => presentCommercialAuditEvent(event, input.revealAccountId));

  return {
    state: input.ledger.state,
    stateLabel: commercialStateLabel(input.ledger.state),
    revision: input.ledger.revision,
    closedAt: input.ledger.closedAt,
    closedBy: input.ledger.closedBy
      ? presentActor(input.ledger.closedBy, input.revealAccountId)
      : null,
    closeReason: input.ledger.closeReason,
    reopenedAt: input.ledger.reopenedAt,
    reopenedBy: input.ledger.reopenedBy
      ? presentActor(input.ledger.reopenedBy, input.revealAccountId)
      : null,
    reopenReason: input.ledger.reopenReason,
    offers: input.offers.map((offer) => {
      const resolution = resolveOfferCommercialStatus(offer);
      return {
        quoteSnapshotId: offer.quoteSnapshotId,
        disposition: offer.currentDisposition,
        dispositionLabel: offer.currentDisposition
          ? commercialOfferDispositionLabel(offer.currentDisposition)
          : null,
        commerciallyResolved: resolution.commerciallyResolved,
        resolutionSource: resolution.source,
        outstandingOrderObligation: resolution.outstandingOrderObligation,
        decisionRequired: resolution.decisionRequired,
        resumable: resolution.resumable,
        history: timeline.filter((event) => event.quoteSnapshotId === offer.quoteSnapshotId),
      };
    }),
    availableActions: [...new Set(availableActions)],
    blockingReasons,
    outstandingAcceptedWithoutOrder: obligations.map((offer) => ({
      quoteSnapshotId: offer.quoteSnapshotId,
      label: "Ofertă acceptată, fără comandă",
    })),
    unresolvedQuoteSnapshotIds: unresolved.map((offer) => offer.quoteSnapshotId),
    canClose: owner && open && unresolved.length === 0,
    canReopen: owner && !open,
    canSaveDecisions:
      owner && open && input.offers.some((offer) => offerMayReceiveDisposition(offer)),
    canCreateQuote: open,
    timeline,
  };
}

export function decorateQuoteOverviewItem(
  item: QuoteOverviewItem,
  offer: CommercialOfferFacts | undefined,
  commercialState: CommercialState,
): QuoteOverviewItem {
  if (!offer) {
    return item;
  }
  const resolution = resolveOfferCommercialStatus(offer);
  const disposition = offer.currentDisposition;
  const dispositionLabel = disposition ? commercialOfferDispositionLabel(disposition) : null;
  let nextAction: QuoteOverviewNextAction = item.nextAction;
  let attention = {
    needsAttention: item.needsAttention,
    attentionLabel: item.attentionLabel,
  };
  if (resolution.source === "DISPOSITION") {
    nextAction = item.kind === "ASSEMBLY" ? "OPEN_ASSEMBLY" : "OPEN_QUOTE";
    attention = { needsAttention: false, attentionLabel: dispositionLabel };
  } else if (resolution.source === "SUPERSEDED_LINEAGE") {
    attention = {
      needsAttention: false,
      attentionLabel: item.attentionLabel ?? "Înlocuită de o versiune mai nouă",
    };
  } else if (resolution.source === "ACCEPTED") {
    attention = deriveQuoteOverviewAttention("QUOTE_ACCEPTED");
  } else if (resolution.source === "UNRESOLVED" && commercialState === "CLOSED") {
    nextAction = item.kind === "ASSEMBLY" ? "OPEN_ASSEMBLY" : "OPEN_QUOTE";
    attention = { needsAttention: true, attentionLabel: "Fără decizie comercială" };
  }
  return {
    ...item,
    disposition,
    dispositionLabel,
    nextAction,
    nextActionLabel: quoteOverviewNextActionLabel(nextAction),
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
  };
}

export function commercialNextActionWhenClosed(input: {
  quotes: readonly QuoteOverviewItem[];
}): "OPEN_QUOTE" | "OPEN_REQUEST" {
  const obligation = input.quotes.find(
    (quote) => quote.stage === "QUOTE_ACCEPTED" && !quote.orderSnapshotId,
  );
  return obligation ? "OPEN_QUOTE" : "OPEN_REQUEST";
}

const OWNER_ONLY_ACTIONS = new Set<CommercialAvailableAction>([
  "SAVE_DECISIONS",
  "SAVE_AND_CLOSE",
  "CLOSE_OFFERLESS",
  "REOPEN",
  "RESUME_OFFER",
  "ACCEPT_QUOTE",
  "CREATE_ORDER",
  "ADMINISTRATIVE_CANCEL",
]);

export function scopeCommercialRequestView(
  view: CommercialRequestView,
  revealOwnerMutations: boolean,
): CommercialRequestView {
  if (revealOwnerMutations) {
    return view;
  }
  const hideAccount = (
    actor: CommercialAuditEventView["actor"] | null,
  ): CommercialAuditEventView["actor"] | null =>
    actor ? { ...actor, accountId: null } : null;
  return {
    ...view,
    availableActions: view.availableActions.filter((action) => !OWNER_ONLY_ACTIONS.has(action)),
    canClose: false,
    canReopen: false,
    canSaveDecisions: false,
    closedBy: hideAccount(view.closedBy),
    reopenedBy: hideAccount(view.reopenedBy),
    timeline: view.timeline.map((event) => ({
      ...event,
      actor: hideAccount(event.actor) ?? event.actor,
    })),
    offers: view.offers.map((offer) => ({
      ...offer,
      history: offer.history.map((event) => ({
        ...event,
        actor: hideAccount(event.actor) ?? event.actor,
      })),
    })),
  };
}
