import type { CommercialRequestView } from "../commercial/closure/projection.js";
import {
  commercialStateLabel,
  type CommercialState,
} from "../commercial/closure/types.js";
import {
  REQUEST_JOURNEY_NEXT_ACTIONS,
  projectRequestCommercialJourney,
  requestJourneyNextActionLabel,
  type RequestCommercialJourney,
  type RequestJourneyNextAction,
} from "../commercial/journey/requestJourney.js";
import type { QuoteOverviewItem, QuoteOverviewStage } from "../quotes/overview.js";
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
  requestAssemblyHref,
  type RequestAssemblyWork,
} from "./assemblyWork.js";

export { requestAssemblyHref };

/** Commercial filters are primary; administrative status filters stay as secondary controls. */
export const REQUEST_COMMERCIAL_FILTERS = [
  "ALL",
  "ACTIONABLE",
  "NO_OFFER",
  "COMMERCIAL_OPEN",
  "COMMERCIAL_CLOSED",
] as const;
export type RequestCommercialFilter = (typeof REQUEST_COMMERCIAL_FILTERS)[number];

export const REQUEST_ADMINISTRATIVE_FILTERS = [
  "NEW",
  "IN_REVIEW",
  "WAITING_CUSTOMER",
  "READY_FOR_QUOTE",
  "BLOCKED",
  "CANCELLED",
] as const;
export type RequestAdministrativeFilter = (typeof REQUEST_ADMINISTRATIVE_FILTERS)[number];

export const REQUEST_OVERVIEW_FILTERS = [
  ...REQUEST_COMMERCIAL_FILTERS,
  ...REQUEST_ADMINISTRATIVE_FILTERS,
] as const;
export type RequestOverviewFilter = (typeof REQUEST_OVERVIEW_FILTERS)[number];

export const REQUEST_OVERVIEW_NEXT_ACTIONS = REQUEST_JOURNEY_NEXT_ACTIONS;
export type RequestOverviewNextAction = RequestJourneyNextAction;

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
  /** Product and assembly offers, every version. */
  linkedQuoteCount: number;
  linkedQuoteSnapshotId: string | null;
  linkedQuoteProductCode: string | null;
  linkedAssemblyId: string | null;
  commercialState: CommercialState;
  commercialStateLabel: string;
  ledgerRevision: number;
  journey: RequestCommercialJourney;
};

export type RequestOverviewSummary = {
  total: number;
  /** Requests with at least one actionable item ("De rezolvat"). */
  needsAttention: number;
  noOffer: number;
  commerciallyOpen: number;
  commerciallyClosed: number;
  newCount: number;
  inReview: number;
  waitingCustomer: number;
  readyForQuote: number;
  blocked: number;
  cancelled: number;
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
  /** Same target as the request overview row: one request-level next action, never a UI choice. */
  nextActionHref: string;
  linkedQuoteSnapshotId: string | null;
  linkedQuoteProductCode: string | null;
  commercial: CommercialRequestView | null;
  journey: RequestCommercialJourney;
};

export function requestOverviewFilterLabel(filter: RequestOverviewFilter): string {
  switch (filter) {
    case "ALL":
      return "Toate";
    case "ACTIONABLE":
      return "De rezolvat";
    case "NO_OFFER":
      return "Fără ofertă";
    case "COMMERCIAL_OPEN":
      return "Deschise";
    case "COMMERCIAL_CLOSED":
      return "Încheiate";
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
  return requestJourneyNextActionLabel(action);
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

/** Furthest historical stage, for display only; it never chooses the next action. */
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

/** Furthest historical stage, for display only; it never chooses the next action. */
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

export type RequestLedgerInput = {
  state: CommercialState;
  revision: number;
  closedAt: string | null;
  reopenedAt: string | null;
};

const OPEN_LEDGER: RequestLedgerInput = {
  state: "OPEN",
  revision: 0,
  closedAt: null,
  reopenedAt: null,
};

export function projectRequestJourney(input: {
  request: CommercialRequest;
  quotes: readonly QuoteOverviewItem[];
  assemblies: readonly RequestAssemblyWork[];
  ledger: RequestLedgerInput;
}): RequestCommercialJourney {
  return projectRequestCommercialJourney({
    status: input.request.status,
    requestHref: requestOverviewHref(input.request.requestId),
    acceptsNewProductWork: requestAcceptsNewProductWork(input.request.status),
    offers: input.quotes,
    assemblies: input.assemblies,
    ledger: input.ledger,
  });
}

export function projectRequestOverviewItem(input: {
  request: CommercialRequest;
  customerDisplayName: string | null;
  /** Product and assembly offers linked to this request, decorated with commercial facts. */
  quotes: readonly QuoteOverviewItem[];
  assemblies?: readonly RequestAssemblyWork[];
  ledger?: RequestLedgerInput;
}): RequestOverviewItem {
  const assemblies = input.assemblies ?? [];
  const ledger = input.ledger ?? OPEN_LEDGER;
  const commercialProgress = deriveRequestCommercialProgress(input.quotes, assemblies);
  const journey = projectRequestJourney({
    request: input.request,
    quotes: input.quotes,
    assemblies,
    ledger,
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
    nextAction: journey.nextAction,
    nextActionLabel: journey.nextActionLabel,
    href: requestOverviewHref(input.request.requestId),
    nextActionHref: journey.nextActionHref,
    needsAttention: journey.needsAttention,
    attentionLabel: journey.attentionLabel,
    linkedQuoteCount: input.quotes.length,
    linkedQuoteSnapshotId: furthestQuote?.quoteSnapshotId ?? null,
    linkedQuoteProductCode: furthestQuote?.productCode ?? null,
    linkedAssemblyId: furthestRequestAssembly(assemblies)?.assemblyId ?? null,
    commercialState: ledger.state,
    commercialStateLabel: commercialStateLabel(ledger.state),
    ledgerRevision: ledger.revision,
    journey,
  };
}

export function projectRequestOverview(
  requests: readonly RequestOverviewItem[],
): RequestOverviewProjection {
  const sorted = [...requests].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const byStatus = (status: CommercialRequestStatus) =>
    sorted.filter((request) => request.status === status).length;
  return {
    summary: {
      total: sorted.length,
      needsAttention: sorted.filter((request) => request.needsAttention).length,
      noOffer: sorted.filter((request) => request.journey.offerSummary.count === 0).length,
      commerciallyOpen: sorted.filter((request) => request.commercialState === "OPEN").length,
      commerciallyClosed: sorted.filter((request) => request.commercialState === "CLOSED")
        .length,
      newCount: byStatus("NEW"),
      inReview: byStatus("IN_REVIEW"),
      waitingCustomer: byStatus("WAITING_CUSTOMER"),
      readyForQuote: byStatus("READY_FOR_QUOTE"),
      blocked: byStatus("BLOCKED"),
      cancelled: byStatus("CANCELLED"),
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
  const byFilter = ((): readonly RequestOverviewItem[] => {
    switch (filter) {
      case "ALL":
        return overview.requests;
      case "ACTIONABLE":
        return overview.requests.filter((request) => request.needsAttention);
      case "NO_OFFER":
        return overview.requests.filter((request) => request.journey.offerSummary.count === 0);
      case "COMMERCIAL_OPEN":
        return overview.requests.filter((request) => request.commercialState === "OPEN");
      case "COMMERCIAL_CLOSED":
        return overview.requests.filter((request) => request.commercialState === "CLOSED");
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
  return byFilter.filter((item) => matchesRequestSearch(item, query));
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
  commercial?: CommercialRequestView | null;
}): RequestDetailProjection {
  const assemblies = input.assemblies ?? [];
  const commercial = input.commercial ?? null;
  const commercialState = commercial?.state ?? "OPEN";
  const commercialProgress = deriveRequestCommercialProgress(input.quotes, assemblies);
  const attachments = (input.attachments ?? []).map(projectRequestAttachment);
  const selected = input.request.optionalScopeIds.includes(SITE_INSTALLATION_SCOPE_ID);
  const installationFacts = selected ? (input.installationFacts ?? null) : null;
  const hasLinkedQuotes = input.hasLinkedQuotes ?? input.quotes.length > 0;
  const journey = projectRequestJourney({
    request: input.request,
    quotes: input.quotes,
    assemblies,
    ledger: commercial
      ? {
          state: commercial.state,
          revision: commercial.revision,
          closedAt: commercial.closedAt,
          reopenedAt: commercial.reopenedAt,
        }
      : OPEN_LEDGER,
  });
  const furthestQuote = furthestLinkedQuote(input.quotes);
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
      commercialState === "OPEN" &&
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
    nextAction: journey.nextAction,
    nextActionLabel: journey.nextActionLabel,
    nextActionHref: journey.nextActionHref,
    linkedQuoteSnapshotId: furthestQuote?.quoteSnapshotId ?? null,
    linkedQuoteProductCode: furthestQuote?.productCode ?? null,
    commercial,
    journey,
  };
}
