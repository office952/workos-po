import type { QuoteOverviewItem, QuoteOverviewStage } from "../quotes/overview.js";
import { quoteOverviewHref } from "../quotes/overview.js";
import { matchesSearchFields } from "../searchNormalize.js";
import {
  canUploadRequestAttachment,
  projectRequestAttachment,
  type CommercialRequestAttachment,
  type RequestAttachmentProjection,
} from "./attachment.js";
import {
  SITE_INSTALLATION_SCOPE_ID,
  presentSiteInstallationScope,
  projectSiteInstallationScope,
  type SiteInstallationEvidenceInput,
  type SiteInstallationOperatorView,
} from "../installation/scope.js";
import type { SiteInstallationFacts } from "../installation/facts.js";
import {
  UNCONFIGURED_SITE_INSTALLATION_OFFER,
  projectSiteInstallationRequestOffer,
  type OrganizationServiceOffer,
  type SiteInstallationRequestOfferView,
} from "../operationalServices.js";
import {
  commercialRequestStatusLabel,
  type CommercialRequest,
  type CommercialRequestStatus,
} from "./commercialRequest.js";

export const REQUEST_OVERVIEW_FILTERS = [
  "ALL",
  "NEW",
  "IN_REVIEW",
  "WAITING_CUSTOMER",
  "READY_FOR_QUOTE",
  "BLOCKED",
  "CANCELLED",
] as const;
export type RequestOverviewFilter = (typeof REQUEST_OVERVIEW_FILTERS)[number];

export const REQUEST_OVERVIEW_NEXT_ACTIONS = [
  "OPEN_REQUEST",
  "CHOOSE_PRODUCT",
  "OPEN_QUOTE",
] as const;
export type RequestOverviewNextAction = (typeof REQUEST_OVERVIEW_NEXT_ACTIONS)[number];

export const REQUEST_COMMERCIAL_PROGRESS = [
  "QUOTE_CREATED",
  "QUOTE_ACCEPTED",
  "ORDER_CREATED",
] as const;
export type RequestCommercialProgress = (typeof REQUEST_COMMERCIAL_PROGRESS)[number];

export type RequestOverviewItem = {
  requestId: string;
  reference: string;
  customerId: string;
  customerDisplayName: string | null;
  title: string;
  createdAt: string;
  status: CommercialRequestStatus;
  statusLabel: string;
  commercialProgress: RequestCommercialProgress | null;
  commercialProgressLabel: string | null;
  nextAction: RequestOverviewNextAction;
  nextActionLabel: string;
  href: string;
  nextActionHref: string;
  needsAttention: boolean;
  attentionLabel: string | null;
  linkedQuoteCount: number;
};

export type RequestOverviewSummary = {
  total: number;
  needsAttention: number;
  newCount: number;
  inReview: number;
  waitingCustomer: number;
  readyForQuote: number;
  blocked: number;
};

export type RequestOverviewProjection = {
  summary: RequestOverviewSummary;
  requests: readonly RequestOverviewItem[];
};

export type RequestDetailProjection = {
  request: CommercialRequest;
  customerDisplayName: string | null;
  statusLabel: string;
  commercialProgress: RequestCommercialProgress | null;
  commercialProgressLabel: string | null;
  canChangeCustomer: boolean;
  canUpdateStatus: boolean;
  canUploadAttachments: boolean;
  linkedOffers: readonly QuoteOverviewItem[];
  attachments: readonly RequestAttachmentProjection[];
  installationScope: SiteInstallationOperatorView | null;
  installationOffer: SiteInstallationRequestOfferView;
  installationFacts: SiteInstallationFacts | null;
  canWriteInstallationFacts: boolean;
};

export function requestOverviewFilterLabel(filter: RequestOverviewFilter): string {
  switch (filter) {
    case "ALL":
      return "Toate";
    case "NEW":
      return "Noi";
    case "IN_REVIEW":
      return "În lucru";
    case "WAITING_CUSTOMER":
      return "Așteaptă clientul";
    case "READY_FOR_QUOTE":
      return "Gata de ofertă";
    case "BLOCKED":
      return "Blocate";
    case "CANCELLED":
      return "Anulate";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function requestOverviewNextActionLabel(action: RequestOverviewNextAction): string {
  switch (action) {
    case "OPEN_REQUEST":
      return "Deschide";
    case "CHOOSE_PRODUCT":
      return "Alege produs";
    case "OPEN_QUOTE":
      return "Deschide oferta";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function requestCommercialProgressLabel(
  progress: RequestCommercialProgress,
): string {
  switch (progress) {
    case "QUOTE_CREATED":
      return "Ofertă creată";
    case "QUOTE_ACCEPTED":
      return "Ofertă acceptată";
    case "ORDER_CREATED":
      return "Comandă creată";
    default: {
      const _exhaustive: never = progress;
      return _exhaustive;
    }
  }
}

export function deriveRequestCommercialProgress(
  quotes: readonly QuoteOverviewItem[],
): RequestCommercialProgress | null {
  if (quotes.some((quote) => quote.stage === "ORDER_CREATED")) {
    return "ORDER_CREATED";
  }
  if (quotes.some((quote) => quote.stage === "QUOTE_ACCEPTED")) {
    return "QUOTE_ACCEPTED";
  }
  if (quotes.some((quote) => quote.stage === "QUOTE_CREATED")) {
    return "QUOTE_CREATED";
  }
  return null;
}

export function furthestLinkedQuote(
  quotes: readonly QuoteOverviewItem[],
): QuoteOverviewItem | null {
  const rank: Record<QuoteOverviewStage, number> = {
    QUOTE_CREATED: 1,
    QUOTE_ACCEPTED: 2,
    ORDER_CREATED: 3,
  };
  return [...quotes].sort((left, right) => {
    const stageDelta = rank[right.stage] - rank[left.stage];
    if (stageDelta !== 0) {
      return stageDelta;
    }
    return right.createdAt.localeCompare(left.createdAt);
  })[0] ?? null;
}

export function deriveRequestOverviewNextAction(input: {
  status: CommercialRequestStatus;
  quotes: readonly QuoteOverviewItem[];
}): RequestOverviewNextAction {
  if (furthestLinkedQuote(input.quotes)) {
    return "OPEN_QUOTE";
  }
  if (input.status === "READY_FOR_QUOTE") {
    return "CHOOSE_PRODUCT";
  }
  return "OPEN_REQUEST";
}

export function requestOverviewHref(requestId: string): string {
  return `/requests/${encodeURIComponent(requestId)}`;
}

export function requestOverviewNextActionHref(input: {
  requestId: string;
  nextAction: RequestOverviewNextAction;
  quotes: readonly QuoteOverviewItem[];
}): string {
  if (input.nextAction !== "OPEN_QUOTE") {
    return requestOverviewHref(input.requestId);
  }
  const quote = furthestLinkedQuote(input.quotes);
  return quote
    ? quoteOverviewHref({
        productCode: quote.productCode,
        quoteSnapshotId: quote.quoteSnapshotId,
        orderSnapshotId: quote.orderSnapshotId,
        nextAction: quote.nextAction,
      })
    : requestOverviewHref(input.requestId);
}

export function deriveRequestOverviewAttention(input: {
  status: CommercialRequestStatus;
  hasLinkedQuotes: boolean;
}): { needsAttention: boolean; attentionLabel: string | null } {
  if (input.hasLinkedQuotes && input.status !== "BLOCKED") {
    return { needsAttention: false, attentionLabel: null };
  }
  switch (input.status) {
    case "NEW":
    case "IN_REVIEW":
    case "WAITING_CUSTOMER":
    case "CANCELLED":
      return { needsAttention: false, attentionLabel: null };
    case "READY_FOR_QUOTE":
      return { needsAttention: true, attentionLabel: "Urmează oferta" };
    case "BLOCKED":
      return { needsAttention: true, attentionLabel: "Blocat" };
    default: {
      const _exhaustive: never = input.status;
      return _exhaustive;
    }
  }
}

export function projectRequestOverviewItem(input: {
  request: CommercialRequest;
  customerDisplayName: string | null;
  quotes: readonly QuoteOverviewItem[];
}): RequestOverviewItem {
  const commercialProgress = deriveRequestCommercialProgress(input.quotes);
  const nextAction = deriveRequestOverviewNextAction({
    status: input.request.status,
    quotes: input.quotes,
  });
  const attention = deriveRequestOverviewAttention({
    status: input.request.status,
    hasLinkedQuotes: input.quotes.length > 0,
  });
  return {
    requestId: input.request.requestId,
    reference: input.request.reference,
    customerId: input.request.customerId,
    customerDisplayName: input.customerDisplayName,
    title: input.request.title,
    createdAt: input.request.createdAt,
    status: input.request.status,
    statusLabel: commercialRequestStatusLabel(input.request.status),
    commercialProgress,
    commercialProgressLabel: commercialProgress
      ? requestCommercialProgressLabel(commercialProgress)
      : null,
    nextAction,
    nextActionLabel: requestOverviewNextActionLabel(nextAction),
    href: requestOverviewHref(input.request.requestId),
    nextActionHref: requestOverviewNextActionHref({
      requestId: input.request.requestId,
      nextAction,
      quotes: input.quotes,
    }),
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    linkedQuoteCount: input.quotes.length,
  };
}

export function projectRequestOverview(
  requests: readonly RequestOverviewItem[],
): RequestOverviewProjection {
  const sorted = [...requests].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return {
    summary: {
      total: sorted.length,
      needsAttention: sorted.filter((request) => request.needsAttention).length,
      newCount: sorted.filter((request) => request.status === "NEW").length,
      inReview: sorted.filter((request) => request.status === "IN_REVIEW").length,
      waitingCustomer: sorted.filter((request) => request.status === "WAITING_CUSTOMER")
        .length,
      readyForQuote: sorted.filter((request) => request.status === "READY_FOR_QUOTE")
        .length,
      blocked: sorted.filter((request) => request.status === "BLOCKED").length,
    },
    requests: sorted,
  };
}

export function matchesRequestSearch(
  item: RequestOverviewItem,
  query: string,
): boolean {
  return matchesSearchFields(
    [item.reference, item.customerDisplayName, item.title],
    query,
  );
}

export function filterRequestOverview(
  overview: RequestOverviewProjection,
  filter: RequestOverviewFilter,
  query = "",
): readonly RequestOverviewItem[] {
  const byStatus = ((): readonly RequestOverviewItem[] => {
    switch (filter) {
      case "ALL":
        return overview.requests;
      case "NEW":
      case "IN_REVIEW":
      case "WAITING_CUSTOMER":
      case "READY_FOR_QUOTE":
      case "BLOCKED":
      case "CANCELLED":
        return overview.requests.filter((request) => request.status === filter);
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  })();
  return byStatus.filter((item) => matchesRequestSearch(item, query));
}

export function projectRequestDetail(input: {
  request: CommercialRequest;
  customerDisplayName: string | null;
  quotes: readonly QuoteOverviewItem[];
  attachments?: readonly CommercialRequestAttachment[];
  serviceOffer?: OrganizationServiceOffer;
  installationFacts?: SiteInstallationFacts | null;
  installationEvidence?: SiteInstallationEvidenceInput;
  asOf?: string;
}): RequestDetailProjection {
  const commercialProgress = deriveRequestCommercialProgress(input.quotes);
  const attachments = (input.attachments ?? []).map(projectRequestAttachment);
  const selected = input.request.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID);
  const installationFacts = selected ? (input.installationFacts ?? null) : null;
  const hasLinkedQuotes = input.quotes.length > 0;
  return {
    request: input.request,
    customerDisplayName: input.customerDisplayName,
    statusLabel: commercialRequestStatusLabel(input.request.status),
    commercialProgress,
    commercialProgressLabel: commercialProgress
      ? requestCommercialProgressLabel(commercialProgress)
      : null,
    canChangeCustomer: !hasLinkedQuotes,
    canUpdateStatus: input.request.status !== "CANCELLED",
    canUploadAttachments: canUploadRequestAttachment(input.request.status),
    linkedOffers: input.quotes,
    attachments,
    installationScope: presentSiteInstallationScope(
      projectSiteInstallationScope({
        selected,
        facts: installationFacts,
        providerMode: input.request.siteInstallationMode,
        evidence: input.installationEvidence,
        manualNetPrice: input.request.installationManualNetEur ?? null,
        asOf: input.asOf,
      }),
    ),
    installationOffer: projectSiteInstallationRequestOffer({
      selected,
      mode: input.request.siteInstallationMode,
      offer: input.serviceOffer ?? UNCONFIGURED_SITE_INSTALLATION_OFFER,
      hasLinkedQuotes,
    }),
    installationFacts,
    canWriteInstallationFacts: selected && !hasLinkedQuotes,
  };
}
