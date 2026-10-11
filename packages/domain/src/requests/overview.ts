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
import {
  furthestRequestAssembly,
  requestAssemblyCommercialRank,
  type RequestAssemblyWork,
} from "./assemblyWork.js";

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
  "OPEN_ASSEMBLY",
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
  linkedQuoteSnapshotId: string | null;
  linkedQuoteProductCode: string | null;
  linkedAssemblyId: string | null;
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
  assemblies: readonly RequestAssemblyWork[];
  linkedAssemblyId: string | null;
  /** Commercial work already exists and the request status still accepts a further, explicit product or alternative. */
  canStartAdditionalWork: boolean;
  attachments: readonly RequestAttachmentProjection[];
  installationScope: SiteInstallationOperatorView | null;
  installationOffer: SiteInstallationRequestOfferView;
  installationFacts: SiteInstallationFacts | null;
  canWriteInstallationFacts: boolean;
  nextAction: RequestOverviewNextAction;
  nextActionLabel: string;
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
    case "OPEN_ASSEMBLY":
      return "Deschide ansamblul";
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
  assemblies: readonly RequestAssemblyWork[] = [],
): RequestCommercialProgress | null {
  if (
    quotes.some((quote) => quote.stage === "ORDER_CREATED") ||
    assemblies.some((work) => work.orderSnapshotId !== null)
  ) {
    return "ORDER_CREATED";
  }
  if (quotes.some((quote) => quote.stage === "QUOTE_ACCEPTED")) {
    return "QUOTE_ACCEPTED";
  }
  if (
    quotes.some((quote) => quote.stage === "QUOTE_CREATED") ||
    assemblies.some((work) => work.quoteSnapshotId !== null)
  ) {
    return "QUOTE_CREATED";
  }
  return null;
}

export function furthestLinkedQuote(
  quotes: readonly QuoteOverviewItem[],
): QuoteOverviewItem | null {
  return [...quotes].sort((left, right) => {
    const stageDelta =
      QUOTE_COMMERCIAL_RANK[right.stage] - QUOTE_COMMERCIAL_RANK[left.stage];
    if (stageDelta !== 0) {
      return stageDelta;
    }
    return right.createdAt.localeCompare(left.createdAt);
  })[0] ?? null;
}

const QUOTE_COMMERCIAL_RANK: Record<QuoteOverviewStage, number> = {
  QUOTE_CREATED: 1,
  QUOTE_ACCEPTED: 2,
  ORDER_CREATED: 3,
};

export function deriveRequestOverviewNextAction(input: {
  status: CommercialRequestStatus;
  quotes: readonly QuoteOverviewItem[];
  assemblies?: readonly RequestAssemblyWork[];
}): RequestOverviewNextAction {
  const quote = furthestLinkedQuote(input.quotes);
  const assembly = furthestRequestAssembly(input.assemblies ?? []);
  if (
    assembly &&
    (!quote || requestAssemblyCommercialRank(assembly) >= QUOTE_COMMERCIAL_RANK[quote.stage])
  ) {
    return "OPEN_ASSEMBLY";
  }
  if (quote) {
    return "OPEN_QUOTE";
  }
  return requestAcceptsNewProductWork(input.status) ? "CHOOSE_PRODUCT" : "OPEN_REQUEST";
}

export function requestAcceptsNewProductWork(status: CommercialRequestStatus): boolean {
  switch (status) {
    case "NEW":
    case "IN_REVIEW":
    case "READY_FOR_QUOTE":
      return true;
    case "WAITING_CUSTOMER":
    case "BLOCKED":
    case "CANCELLED":
      return false;
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function requestOverviewHref(requestId: string): string {
  return `/requests/${encodeURIComponent(requestId)}`;
}

export function requestOverviewNextActionHref(input: {
  requestId: string;
  nextAction: RequestOverviewNextAction;
  quotes: readonly QuoteOverviewItem[];
  assemblies?: readonly RequestAssemblyWork[];
}): string {
  switch (input.nextAction) {
    case "OPEN_QUOTE": {
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
    case "OPEN_ASSEMBLY": {
      const assembly = furthestRequestAssembly(input.assemblies ?? []);
      return assembly
        ? requestAssemblyHref(assembly.assemblyId)
        : requestOverviewHref(input.requestId);
    }
    case "OPEN_REQUEST":
    case "CHOOSE_PRODUCT":
      return requestOverviewHref(input.requestId);
    default: {
      const _exhaustive: never = input.nextAction;
      return _exhaustive;
    }
  }
}

export function requestAssemblyHref(assemblyId: string): string {
  return `/assemblies/${encodeURIComponent(assemblyId)}`;
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
  assemblies?: readonly RequestAssemblyWork[];
}): RequestOverviewItem {
  const assemblies = input.assemblies ?? [];
  const commercialProgress = deriveRequestCommercialProgress(input.quotes, assemblies);
  const nextAction = deriveRequestOverviewNextAction({
    status: input.request.status,
    quotes: input.quotes,
    assemblies,
  });
  const attention = deriveRequestOverviewAttention({
    status: input.request.status,
    hasLinkedQuotes:
      input.quotes.length > 0 || assemblies.some((work) => work.quoteSnapshotId !== null),
  });
  const furthestQuote = furthestLinkedQuote(input.quotes);
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
      assemblies,
    }),
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    linkedQuoteCount: input.quotes.length,
    linkedQuoteSnapshotId: furthestQuote?.quoteSnapshotId ?? null,
    linkedQuoteProductCode: furthestQuote?.productCode ?? null,
    linkedAssemblyId: furthestRequestAssembly(assemblies)?.assemblyId ?? null,
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
  hasLinkedQuotes?: boolean;
  assemblies?: readonly RequestAssemblyWork[];
  asOf?: string;
}): RequestDetailProjection {
  const assemblies = input.assemblies ?? [];
  const commercialProgress = deriveRequestCommercialProgress(input.quotes, assemblies);
  const attachments = (input.attachments ?? []).map(projectRequestAttachment);
  const selected = input.request.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID);
  const installationFacts = selected ? (input.installationFacts ?? null) : null;
  const hasLinkedQuotes = input.hasLinkedQuotes ?? input.quotes.length > 0;
  const nextAction = deriveRequestOverviewNextAction({
    status: input.request.status,
    quotes: input.quotes,
    assemblies,
  });
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
    assemblies: [...assemblies].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
    linkedAssemblyId: furthestRequestAssembly(assemblies)?.assemblyId ?? null,
    canStartAdditionalWork:
      nextAction !== "CHOOSE_PRODUCT" &&
      (assemblies.length > 0 || input.quotes.length > 0) &&
      requestAcceptsNewProductWork(input.request.status),
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
    nextAction,
    nextActionLabel: requestOverviewNextActionLabel(nextAction),
  };
}
