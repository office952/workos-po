import type { QuoteAcceptanceDecision } from "../commercial/quoteAcceptance.js";
import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import {
  formatCustomerMoney,
  quoteDocumentReference,
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
] as const;
export type QuoteOverviewNextAction = (typeof QUOTE_OVERVIEW_NEXT_ACTIONS)[number];

export const QUOTE_OVERVIEW_FILTERS = [
  "ALL",
  "NEEDS_ACTION",
  "ACCEPTED",
  "ORDERED",
] as const;
export type QuoteOverviewFilter = (typeof QUOTE_OVERVIEW_FILTERS)[number];

export type QuoteOverviewItem = {
  quoteSnapshotId: string;
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
};

export type QuoteOverviewSummary = {
  total: number;
  needsAttention: number;
  accepted: number;
  ordered: number;
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
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function quoteOverviewFilterLabel(filter: QuoteOverviewFilter): string {
  switch (filter) {
    case "ALL":
      return "Toate";
    case "NEEDS_ACTION":
      return "Necesită acțiune";
    case "ACCEPTED":
      return "Acceptate";
    case "ORDERED":
      return "Cu comandă";
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

export function deriveQuoteOverviewAttention(stage: QuoteOverviewStage): {
  needsAttention: boolean;
  attentionLabel: string | null;
} {
  switch (stage) {
    case "QUOTE_CREATED":
      return { needsAttention: true, attentionLabel: "Urmează acceptarea" };
    case "QUOTE_ACCEPTED":
      return { needsAttention: true, attentionLabel: "Urmează comanda" };
    case "ORDER_CREATED":
      return { needsAttention: false, attentionLabel: null };
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
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
  const attention = deriveQuoteOverviewAttention(stage);
  const orderSnapshotId = input.order?.orderSnapshotId ?? null;
  return {
    quoteSnapshotId: input.quote.quoteSnapshotId,
    reference: quoteDocumentReference(input.quote.contentHash),
    productCode: input.quote.productCode,
    productLabel: input.quote.productLabel,
    inscription: input.quote.inscription,
    customerId: input.quote.customer?.customerId ?? null,
    customerDisplayName: input.quote.customer?.displayName ?? null,
    createdAt: input.quote.createdAt,
    grossDisplay: formatCustomerMoney(input.quote.commercial.grossPrice),
    currency: input.quote.commercial.currency,
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
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    acceptanceId: input.acceptance?.acceptanceId ?? null,
    orderSnapshotId,
    requestId: input.requestId ?? null,
    requestReference: input.requestReference ?? null,
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
      accepted: sorted.filter((quote) => quote.stage === "QUOTE_ACCEPTED").length,
      ordered: sorted.filter((quote) => quote.stage === "ORDER_CREATED").length,
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
      case "NEEDS_ACTION":
        return overview.quotes.filter((quote) => quote.needsAttention);
      case "ACCEPTED":
        return overview.quotes.filter((quote) => quote.stage === "QUOTE_ACCEPTED");
      case "ORDERED":
        return overview.quotes.filter((quote) => quote.stage === "ORDER_CREATED");
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  })();
  return byStage.filter((item) => matchesQuoteSearch(item, query));
}
