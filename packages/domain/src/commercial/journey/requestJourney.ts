import { jobHref } from "../../jobs/overview.js";
import type { QuoteOverviewItem } from "../../quotes/overview.js";
import {
  requestAssemblyHref,
  requestAssemblyNeedsPreparation,
  type RequestAssemblyWork,
} from "../../requests/assemblyWork.js";
import {
  commercialRequestStatusLabel,
  type CommercialRequestStatus,
} from "../../requests/commercialRequest.js";
import type { CommercialState } from "../closure/types.js";
import type { OfferCommercialStatus } from "./offerStatus.js";

export const REQUEST_JOURNEY_NEXT_ACTIONS = [
  "OPEN_REQUEST",
  "CHOOSE_PRODUCT",
  "OPEN_QUOTE",
  "OPEN_ASSEMBLY",
  "OPEN_ORDER",
] as const;
export type RequestJourneyNextAction = (typeof REQUEST_JOURNEY_NEXT_ACTIONS)[number];

export const REQUEST_JOURNEY_ITEM_KINDS = [
  "CONFIRM_ORDER",
  "DECIDE_CLOSED_OFFER",
  "CONTINUE_ASSEMBLY",
  "REQUEST_BLOCKED",
  "PREPARE_OFFER",
  "AWAITING_CUSTOMER",
] as const;
export type RequestJourneyItemKind = (typeof REQUEST_JOURNEY_ITEM_KINDS)[number];

/** Every item only navigates; a commercial mutation happens on the target page. */
export type RequestJourneyItem = {
  kind: RequestJourneyItemKind;
  key: string;
  quoteSnapshotId: string | null;
  /** Kind and product of the offer an item names, so a client can route without guessing. */
  quoteKind: QuoteOverviewItem["kind"] | null;
  productCode: string | null;
  assemblyId: string | null;
  title: string;
  detail: string;
  hint: string | null;
  actionLabel: string;
  href: string;
  action: RequestJourneyNextAction;
};

export type RequestJourneyOfferSummary = {
  /** Every offer version; named `count` so it is never read as a money total. */
  count: number;
  awaitingCustomer: number;
  acceptedWithoutOrder: number;
  ordered: number;
  declined: number;
  notPursued: number;
  superseded: number;
  undecided: number;
  summaryLabel: string;
};

export const REQUEST_JOURNEY_PHASES = ["NEW", "OPEN", "REOPENED", "CLOSED"] as const;
export type RequestJourneyPhase = (typeof REQUEST_JOURNEY_PHASES)[number];

export type RequestCommercialJourney = {
  offerSummary: RequestJourneyOfferSummary;
  actionable: readonly RequestJourneyItem[];
  waiting: readonly RequestJourneyItem[];
  actionableCount: number;
  waitingCount: number;
  orderCount: number;
  nextAction: RequestJourneyNextAction;
  nextActionLabel: string;
  nextActionHref: string;
  needsAttention: boolean;
  attentionLabel: string | null;
  /** Commercial phase from the ledger; the administrative status is never rewritten. */
  phase: RequestJourneyPhase;
  phaseLabel: string;
  /** ISO instant of the close or reopen that set the phase. */
  phaseAt: string | null;
  /** Administrative status shown as secondary text when it says something the phase does not. */
  administrativeNote: string | null;
};

export type RequestJourneyLedger = {
  state: CommercialState;
  closedAt: string | null;
  reopenedAt: string | null;
};

type JourneyOffer = Pick<
  QuoteOverviewItem,
  | "quoteSnapshotId"
  | "kind"
  | "productCode"
  | "productLabel"
  | "reference"
  | "createdAt"
  | "href"
  | "orderSnapshotId"
  | "assemblyId"
> & { commercialStatus: OfferCommercialStatus };

export function requestJourneyNextActionLabel(action: RequestJourneyNextAction): string {
  switch (action) {
    case "OPEN_REQUEST":
      return "Deschide cererea";
    case "CHOOSE_PRODUCT":
      return "Alege produsul";
    case "OPEN_QUOTE":
      return "Deschide oferta";
    case "OPEN_ASSEMBLY":
      return "Deschide ansamblul";
    case "OPEN_ORDER":
      return "Fișa lucrării";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function requestJourneyPhaseLabel(phase: RequestJourneyPhase): string {
  switch (phase) {
    case "NEW":
      return "Nouă";
    case "OPEN":
      return "Deschisă";
    case "REOPENED":
      return "Redeschisă";
    case "CLOSED":
      return "Încheiată comercial";
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function requestJourneyOfferSummaryLabel(
  summary: Omit<RequestJourneyOfferSummary, "summaryLabel">,
): string {
  if (summary.count === 0) {
    return "Fără ofertă";
  }
  const parts = [plural(summary.count, "ofertă", "oferte")];
  if (summary.ordered > 0) {
    parts.push(`${summary.ordered} cu comandă`);
  }
  if (summary.acceptedWithoutOrder > 0) {
    parts.push(plural(summary.acceptedWithoutOrder, "acceptată fără comandă", "acceptate fără comandă"));
  }
  if (summary.awaitingCustomer > 0) {
    parts.push(plural(summary.awaitingCustomer, "nedecisă", "nedecise"));
  }
  if (summary.declined > 0) {
    parts.push(plural(summary.declined, "refuzată", "refuzate"));
  }
  if (summary.notPursued > 0) {
    parts.push(plural(summary.notPursued, "neurmărită", "neurmărite"));
  }
  if (summary.undecided > 0) {
    parts.push(plural(summary.undecided, "fără decizie", "fără decizie"));
  }
  if (summary.superseded > 0) {
    parts.push(plural(summary.superseded, "înlocuită", "înlocuite"));
  }
  return parts.join(" · ");
}

function summarizeOffers(offers: readonly JourneyOffer[]): RequestJourneyOfferSummary {
  const count = (status: OfferCommercialStatus) =>
    offers.filter((offer) => offer.commercialStatus === status).length;
  const summary = {
    count: offers.length,
    awaitingCustomer: count("AWAITING_CUSTOMER"),
    acceptedWithoutOrder: count("ACCEPTED_WITHOUT_ORDER"),
    ordered: count("ORDERED"),
    declined: count("DECLINED_BY_CUSTOMER"),
    notPursued: count("NOT_PURSUED"),
    superseded: count("SUPERSEDED"),
    undecided: count("UNDECIDED_AFTER_CLOSE"),
  };
  return { ...summary, summaryLabel: requestJourneyOfferSummaryLabel(summary) };
}

function byCreatedThenId<T extends { createdAt: string; quoteSnapshotId: string }>(
  left: T,
  right: T,
): number {
  const time = left.createdAt.localeCompare(right.createdAt);
  return time !== 0 ? time : left.quoteSnapshotId.localeCompare(right.quoteSnapshotId);
}

function offerItem(offer: JourneyOffer): RequestJourneyItem | null {
  const identity = `${offer.productLabel} · ${offer.reference}`;
  const target = {
    key: `offer:${offer.quoteSnapshotId}`,
    quoteSnapshotId: offer.quoteSnapshotId,
    quoteKind: offer.kind,
    productCode: offer.productCode,
    assemblyId: offer.assemblyId,
  };
  switch (offer.commercialStatus) {
    case "ACCEPTED_WITHOUT_ORDER":
      return {
        kind: "CONFIRM_ORDER",
        ...target,
        title: "Confirmarea comenzii",
        detail: `${identity} · acceptată de client, fără comandă`,
        hint: "Se confirmă în ofertă, numai de proprietar.",
        actionLabel: "Deschide pentru confirmare",
        href: offer.href,
        action: "OPEN_QUOTE",
      };
    case "UNDECIDED_AFTER_CLOSE":
      return {
        kind: "DECIDE_CLOSED_OFFER",
        ...target,
        title: "Ofertă fără decizie comercială",
        detail: `${identity} · urmărirea comercială este încheiată`,
        hint: "Redeschide urmărirea comercială pentru a decide oferta.",
        actionLabel: "Deschide oferta",
        href: offer.href,
        action: "OPEN_QUOTE",
      };
    case "AWAITING_CUSTOMER":
      return {
        kind: "AWAITING_CUSTOMER",
        ...target,
        title: "Ofertă nedecisă",
        detail: identity,
        hint: "Nu există încă o decizie comercială înregistrată.",
        actionLabel: "Deschide oferta",
        href: offer.href,
        action: "OPEN_QUOTE",
      };
    case "ORDERED":
    case "DECLINED_BY_CUSTOMER":
    case "NOT_PURSUED":
    case "SUPERSEDED":
      return null;
    default: {
      const _exhaustive: never = offer.commercialStatus;
      return _exhaustive;
    }
  }
}

function requestLevelItems(input: {
  status: CommercialRequestStatus;
  requestHref: string;
  open: boolean;
  hasWork: boolean;
}): RequestJourneyItem[] {
  if (input.status === "BLOCKED") {
    return [
      {
        kind: "REQUEST_BLOCKED",
        key: "request:blocked",
        quoteSnapshotId: null,
        quoteKind: null,
        productCode: null,
        assemblyId: null,
        title: "Cerere blocată",
        detail: "Cererea are o problemă care trebuie rezolvată.",
        hint: null,
        actionLabel: "Deschide cererea",
        href: input.requestHref,
        action: "OPEN_REQUEST",
      },
    ];
  }
  if (input.status === "READY_FOR_QUOTE" && input.open && !input.hasWork) {
    return [
      {
        kind: "PREPARE_OFFER",
        key: "request:prepare-offer",
        quoteSnapshotId: null,
        quoteKind: null,
        productCode: null,
        assemblyId: null,
        title: "Urmează oferta",
        detail: "Cererea este gata de ofertă și nu are încă un produs ales.",
        hint: null,
        actionLabel: requestJourneyNextActionLabel("CHOOSE_PRODUCT"),
        href: input.requestHref,
        action: "CHOOSE_PRODUCT",
      },
    ];
  }
  return [];
}

function assemblyItems(assemblies: readonly RequestAssemblyWork[]): RequestJourneyItem[] {
  return [...assemblies]
    .filter(requestAssemblyNeedsPreparation)
    .sort((left, right) => {
      const time = left.updatedAt.localeCompare(right.updatedAt);
      return time !== 0 ? time : left.assemblyId.localeCompare(right.assemblyId);
    })
    .map((work) => ({
      kind: "CONTINUE_ASSEMBLY" as const,
      key: `assembly:${work.assemblyId}`,
      quoteSnapshotId: null,
      quoteKind: null,
      productCode: null,
      assemblyId: work.assemblyId,
      title: "Continuă ansamblul",
      detail: `${work.label} · ${work.stageLabel}`,
      hint: work.revisionPending ? "Ansamblul s-a schimbat după ultima ofertă." : null,
      actionLabel: "Continuă ansamblul",
      href: requestAssemblyHref(work.assemblyId),
      action: "OPEN_ASSEMBLY" as const,
    }));
}

function phaseOf(input: {
  ledger: RequestJourneyLedger;
  status: CommercialRequestStatus;
  hasWork: boolean;
}): { phase: RequestJourneyPhase; phaseAt: string | null } {
  if (input.ledger.state === "CLOSED") {
    return { phase: "CLOSED", phaseAt: input.ledger.closedAt };
  }
  if (input.ledger.reopenedAt) {
    return { phase: "REOPENED", phaseAt: input.ledger.reopenedAt };
  }
  if (input.status === "NEW" && !input.hasWork) {
    return { phase: "NEW", phaseAt: null };
  }
  return { phase: "OPEN", phaseAt: null };
}

function administrativeNote(status: CommercialRequestStatus): string | null {
  switch (status) {
    case "WAITING_CUSTOMER":
    case "BLOCKED":
    case "CANCELLED":
      return commercialRequestStatusLabel(status);
    case "NEW":
    case "IN_REVIEW":
    case "READY_FOR_QUOTE":
      return null;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * The single commercial journey of a request. Cereri, request detail and the customer
 * dossier read this same object, so their next action, target and counts agree.
 */
export function projectRequestCommercialJourney(input: {
  status: CommercialRequestStatus;
  requestHref: string;
  /** Whether the administrative status still accepts new product work. */
  acceptsNewProductWork: boolean;
  offers: readonly JourneyOffer[];
  assemblies: readonly RequestAssemblyWork[];
  ledger: RequestJourneyLedger;
}): RequestCommercialJourney {
  const open = input.ledger.state === "OPEN";
  const offers = [...input.offers].sort(byCreatedThenId);
  const hasWork = offers.length > 0 || input.assemblies.length > 0;
  const offerItems = offers.flatMap((offer) => {
    const item = offerItem(offer);
    return item ? [item] : [];
  });
  const actionable = [
    ...requestLevelItems({
      status: input.status,
      requestHref: input.requestHref,
      open,
      hasWork,
    }),
    ...offerItems.filter((item) => item.kind !== "AWAITING_CUSTOMER"),
    ...(open ? assemblyItems(input.assemblies) : []),
  ];
  const waiting = offerItems.filter((item) => item.kind === "AWAITING_CUSTOMER");
  const orders = offers.filter(
    (offer) => offer.commercialStatus === "ORDERED" && offer.orderSnapshotId,
  );
  const next = ((): { action: RequestJourneyNextAction; label: string; href: string } => {
    const [onlyActionable] = actionable;
    if (actionable.length === 1 && onlyActionable) {
      return {
        action: onlyActionable.action,
        label:
          onlyActionable.kind === "CONFIRM_ORDER" || onlyActionable.kind === "CONTINUE_ASSEMBLY"
            ? onlyActionable.title
            : onlyActionable.actionLabel,
        href: onlyActionable.href,
      };
    }
    if (actionable.length > 1) {
      return {
        action: "OPEN_REQUEST",
        label: `${actionable.length} de rezolvat`,
        href: input.requestHref,
      };
    }
    if (!hasWork && open && input.acceptsNewProductWork) {
      return {
        action: "CHOOSE_PRODUCT",
        label: requestJourneyNextActionLabel("CHOOSE_PRODUCT"),
        href: input.requestHref,
      };
    }
    const [onlyWaiting] = waiting;
    if (waiting.length === 1 && onlyWaiting) {
      return {
        action: "OPEN_QUOTE",
        label: requestJourneyNextActionLabel("OPEN_QUOTE"),
        href: onlyWaiting.href,
      };
    }
    if (waiting.length > 1) {
      return {
        action: "OPEN_REQUEST",
        label: requestJourneyNextActionLabel("OPEN_REQUEST"),
        href: input.requestHref,
      };
    }
    const [onlyOrder] = orders;
    if (orders.length === 1 && onlyOrder?.orderSnapshotId) {
      return {
        action: "OPEN_ORDER",
        label: requestJourneyNextActionLabel("OPEN_ORDER"),
        href: jobHref({ orderSnapshotId: onlyOrder.orderSnapshotId }),
      };
    }
    if (orders.length > 1) {
      return { action: "OPEN_REQUEST", label: "Fișele lucrărilor", href: input.requestHref };
    }
    return {
      action: "OPEN_REQUEST",
      label: requestJourneyNextActionLabel("OPEN_REQUEST"),
      href: input.requestHref,
    };
  })();
  const { phase, phaseAt } = phaseOf({ ledger: input.ledger, status: input.status, hasWork });
  const [firstActionable] = actionable;
  return {
    offerSummary: summarizeOffers(offers),
    actionable,
    waiting,
    actionableCount: actionable.length,
    waitingCount: waiting.length,
    orderCount: orders.length,
    nextAction: next.action,
    nextActionLabel: next.label,
    nextActionHref: next.href,
    needsAttention: actionable.length > 0,
    attentionLabel:
      actionable.length > 1
        ? `${actionable.length} de rezolvat`
        : (firstActionable?.title ?? null),
    phase,
    phaseLabel: requestJourneyPhaseLabel(phase),
    phaseAt,
    administrativeNote: administrativeNote(input.status),
  };
}
