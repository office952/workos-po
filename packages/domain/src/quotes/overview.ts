import type {
  CommercialOfferDisposition,
  CommercialState,
} from "../commercial/closure/types.js";
import {
  projectOfferCommercialStatus,
  type OfferCommercialStatusView,
} from "../commercial/journey/offerStatus.js";
import type { QuoteAcceptanceDecision } from "../commercial/quoteAcceptance.js";
import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import {
  formatCustomerMoney,
  quoteDocumentReference,
  quoteSnapshotCustomerTotal,
} from "../commercial/quoteDocument.js";
import type { QuoteSnapshot } from "../commercial/quoteSnapshot.js";
import { matchesSearchFields } from "../searchNormalize.js";

export const QUOTE_OVERVIEW_STAGES = [
  "QUOTE_CREATED",
  "QUOTE_ACCEPTED",
  "ORDER_CREATED",
] as const;
export type QuoteOverviewStage = (typeof QUOTE_OVERVIEW_STAGES)[number];

export const QUOTE_OVERVIEW_NEXT_ACTIONS = [
  "ACCEPT_QUOTE",
  "CREATE_ORDER",
  "OPEN_ORDER",
  "OPEN_ASSEMBLY",
  "OPEN_QUOTE",
] as const;
export type QuoteOverviewNextAction = (typeof QUOTE_OVERVIEW_NEXT_ACTIONS)[number];

export const QUOTE_OVERVIEW_FILTERS = [
  "ALL",
  "FOLLOW_UP",
  "ORDERED",
  "DECIDED",
] as const;
export type QuoteOverviewFilter = (typeof QUOTE_OVERVIEW_FILTERS)[number];

/** PRODUCT = standalone product quote; ASSEMBLY = one commercial record over several product sections. */
export const QUOTE_OVERVIEW_KINDS = ["PRODUCT", "ASSEMBLY"] as const;
export type QuoteOverviewKind = (typeof QUOTE_OVERVIEW_KINDS)[number];

export type QuoteOverviewItem = {
  quoteSnapshotId: string;
  kind: QuoteOverviewKind;
  kindLabel: string;
  /** ASSEMBLY only. */
  assemblyId: string | null;
  sectionCount: number;
  /** ASSEMBLY only: a newer frozen quote exists for the same assembly. */
  superseded: boolean;
  reference: string;
  productCode: string;
  productLabel: string;
  inscription: string;
  customerId: string | null;
  customerDisplayName: string | null;
  createdAt: string;
  grossDisplay: string;
  currency: "EUR";
  stage: QuoteOverviewStage;
  stageLabel: string;
  nextAction: QuoteOverviewNextAction;
  nextActionLabel: string;
  href: string;
  needsAttention: boolean;
  attentionLabel: string | null;
  acceptanceId: string | null;
  orderSnapshotId: string | null;
  /** Existing commercial_request_quote_links only — optional provenance, not required. */
  requestId: string | null;
  requestReference: string | null;
  /** Latest commercial disposition, independent of acceptance/order. */
  disposition: CommercialOfferDisposition | null;
  dispositionLabel: string | null;
} & OfferCommercialStatusView;

export type QuoteOverviewSummary = {
  total: number;
  /** Offers that need the organization to act (never passive customer waiting). */
  needsAttention: number;
  /** "De urmărit": waiting for the customer or for the order confirmation. */
  followUp: number;
  waitingCustomer: number;
  accepted: number;
  ordered: number;
  decided: number;
  assemblies: number;
};

export type QuoteOverviewProjection = {
  summary: QuoteOverviewSummary;
  quotes: readonly QuoteOverviewItem[];
};

export function quoteOverviewStageLabel(stage: QuoteOverviewStage): string {
  switch (stage) {
    case "QUOTE_CREATED":
      return "Creată";
    case "QUOTE_ACCEPTED":
      return "Acceptată";
    case "ORDER_CREATED":
      return "Cu comandă";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function quoteOverviewNextActionLabel(action: QuoteOverviewNextAction): string {
  switch (action) {
    case "ACCEPT_QUOTE":
      return "Marchează acceptată";
    case "CREATE_ORDER":
      return "Creează comanda";
    case "OPEN_ORDER":
      return "Deschide comanda";
    case "OPEN_ASSEMBLY":
      return "Deschide ansamblul";
    case "OPEN_QUOTE":
      return "Deschide oferta";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function quoteOverviewKindLabel(kind: QuoteOverviewKind): string {
  switch (kind) {
    case "PRODUCT":
      return "Produs";
    case "ASSEMBLY":
      return "Ansamblu";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function quoteOverviewFilterLabel(filter: QuoteOverviewFilter): string {
  switch (filter) {
    case "ALL":
      return "Toate";
    case "FOLLOW_UP":
      return "De urmărit";
    case "ORDERED":
      return "Cu comandă";
    case "DECIDED":
      return "Decise";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function quoteOverviewFilterHint(filter: QuoteOverviewFilter): string {
  switch (filter) {
    case "ALL":
      return "toate ofertele, inclusiv versiunile înlocuite";
    case "FOLLOW_UP":
      return "așteaptă răspunsul clientului sau confirmarea comenzii";
    case "ORDERED":
      return "lucrul continuă în fișa lucrării";
    case "DECIDED":
      return "refuzate de client sau scoase din urmărire";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function deriveQuoteOverviewStage(input: {
  acceptance: QuoteAcceptanceDecision | null;
  order: OrderSnapshot | null;
}): QuoteOverviewStage {
  if (input.order) {
    return "ORDER_CREATED";
  }
  if (input.acceptance) {
    return "QUOTE_ACCEPTED";
  }
  return "QUOTE_CREATED";
}

export function deriveQuoteOverviewNextAction(
  stage: QuoteOverviewStage,
): QuoteOverviewNextAction {
  switch (stage) {
    case "QUOTE_CREATED":
      return "ACCEPT_QUOTE";
    case "QUOTE_ACCEPTED":
      return "CREATE_ORDER";
    case "ORDER_CREATED":
      return "OPEN_ORDER";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function quoteOverviewHref(item: {
  quoteSnapshotId: string;
  productCode?: string;
  orderSnapshotId?: string | null;
  nextAction?: QuoteOverviewNextAction;
}): string {
  return `/quotes/${encodeURIComponent(item.quoteSnapshotId)}`;
}

export function quoteConfiguratorHref(item: {
  productCode: string;
  quoteSnapshotId: string;
}): string {
  return `/products/${item.productCode}?quote=${encodeURIComponent(item.quoteSnapshotId)}`;
}

/**
 * Attaches the shared commercial status. Attention means the organization must act;
 * an offer waiting for the customer is followed up but never flagged.
 */
export function quoteOverviewCommercialFields(input: {
  stage: QuoteOverviewStage;
  superseded: boolean;
  disposition: CommercialOfferDisposition | null;
  commercialState: CommercialState | null;
}): OfferCommercialStatusView & {
  needsAttention: boolean;
  attentionLabel: string | null;
} {
  const status = projectOfferCommercialStatus({
    ordered: input.stage === "ORDER_CREATED",
    accepted: input.stage !== "QUOTE_CREATED",
    superseded: input.superseded,
    disposition: input.disposition,
    commercialState: input.commercialState,
  });
  const attentionLabel = ((): string | null => {
    switch (status.commercialStatus) {
      case "ACCEPTED_WITHOUT_ORDER":
        return "Urmează comanda";
      case "UNDECIDED_AFTER_CLOSE":
        return status.commercialStatusLabel;
      default:
        return null;
    }
  })();
  return {
    ...status,
    needsAttention: status.obligationKind === "ACTIONABLE",
    attentionLabel,
  };
}

export function projectQuoteOverviewItem(input: {
  quote: QuoteSnapshot;
  acceptance: QuoteAcceptanceDecision | null;
  order: OrderSnapshot | null;
  requestId?: string | null;
  requestReference?: string | null;
}): QuoteOverviewItem {
  const stage = deriveQuoteOverviewStage({
    acceptance: input.acceptance,
    order: input.order,
  });
  const nextAction = deriveQuoteOverviewNextAction(stage);
  const commercial = quoteOverviewCommercialFields({
    stage,
    superseded: false,
    disposition: null,
    commercialState: null,
  });
  const orderSnapshotId = input.order?.orderSnapshotId ?? null;
  const customerTotal = quoteSnapshotCustomerTotal(input.quote);
  return {
    quoteSnapshotId: input.quote.quoteSnapshotId,
    kind: "PRODUCT",
    kindLabel: quoteOverviewKindLabel("PRODUCT"),
    assemblyId: null,
    sectionCount: 1,
    superseded: false,
    reference: quoteDocumentReference(input.quote.contentHash),
    productCode: input.quote.productCode,
    productLabel: input.quote.productLabel,
    inscription: input.quote.inscription,
    customerId: input.quote.customer?.customerId ?? null,
    customerDisplayName: input.quote.customer?.displayName ?? null,
    createdAt: input.quote.createdAt,
    grossDisplay: formatCustomerMoney(customerTotal.grossPrice),
    currency: customerTotal.currency,
    stage,
    stageLabel: quoteOverviewStageLabel(stage),
    nextAction,
    nextActionLabel: quoteOverviewNextActionLabel(nextAction),
    href: quoteOverviewHref({
      productCode: input.quote.productCode,
      quoteSnapshotId: input.quote.quoteSnapshotId,
      orderSnapshotId,
      nextAction,
    }),
    ...commercial,
    acceptanceId: input.acceptance?.acceptanceId ?? null,
    orderSnapshotId,
    requestId: input.requestId ?? null,
    requestReference: input.requestReference ?? null,
    disposition: null,
    dispositionLabel: null,
  };
}

export function projectQuoteOverview(
  quotes: readonly QuoteOverviewItem[],
): QuoteOverviewProjection {
  const sorted = [...quotes].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return {
    summary: {
      total: sorted.length,
      needsAttention: sorted.filter((quote) => quote.needsAttention).length,
      followUp: sorted.filter((quote) => quote.followUp).length,
      waitingCustomer: sorted.filter((quote) => quote.obligationKind === "WAITING").length,
      accepted: sorted.filter((quote) => quote.stage === "QUOTE_ACCEPTED").length,
      ordered: sorted.filter((quote) => quote.commercialStatus === "ORDERED").length,
      decided: sorted.filter((quote) => quote.decided).length,
      assemblies: sorted.filter((quote) => quote.kind === "ASSEMBLY").length,
    },
    quotes: sorted,
  };
}

export function matchesQuoteSearch(
  item: QuoteOverviewItem,
  query: string,
): boolean {
  return matchesSearchFields(
    [
      item.customerDisplayName,
      item.productLabel,
      item.productCode,
      item.inscription,
      item.reference,
      item.requestReference,
      item.kindLabel,
    ],
    query,
  );
}

export function filterQuoteOverview(
  overview: QuoteOverviewProjection,
  filter: QuoteOverviewFilter,
  query = "",
): readonly QuoteOverviewItem[] {
  const byStage = ((): readonly QuoteOverviewItem[] => {
    switch (filter) {
      case "ALL":
        return overview.quotes;
      case "FOLLOW_UP":
        return overview.quotes.filter((quote) => quote.followUp);
      case "ORDERED":
        return overview.quotes.filter((quote) => quote.commercialStatus === "ORDERED");
      case "DECIDED":
        return overview.quotes.filter((quote) => quote.decided);
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  })();
  return byStage.filter((item) => matchesQuoteSearch(item, query));
}
