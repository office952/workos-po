import type {
  CommercialActorTransport,
  CommercialAuditEventTransport,
  CommercialOfferViewTransport,
  CommercialRequestTransport,
  RequestAssemblyWorkTransport,
  RequestAttachmentTransport,
  RequestDetailTransport,
  RequestInstallationFactsTransport,
  RequestInstallationOfferTransport,
  RequestInstallationScopeTransport,
  RequestLinkedOfferTransport,
  RequestListItemTransport,
  RequestOverviewSummaryTransport,
  RequestOverviewTransport,
} from "../api/types";
import { asBoolean, asNumber, asRecord, asString, asStringList } from "./record";

export function presentRequestList(payload: unknown): RequestListItemTransport[] {
  return presentRequestOverview(payload).requests;
}

/** The request overview with its server summary; the summary is null when the payload has none. */
export function presentRequestOverview(payload: unknown): RequestOverviewTransport {
  const record = asRecord(payload);
  const overview = asRecord(record?.overview);
  const requests = overview?.requests;
  const summary = asRecord(overview?.summary);
  const presentedSummary: RequestOverviewSummaryTransport | null = summary
    ? {
        total: asNumber(summary.total),
        needsAttention: asNumber(summary.needsAttention),
        newCount: asNumber(summary.newCount),
        inReview: asNumber(summary.inReview),
        waitingCustomer: asNumber(summary.waitingCustomer),
        readyForQuote: asNumber(summary.readyForQuote),
        blocked: asNumber(summary.blocked),
      }
    : null;
  return {
    summary: presentedSummary,
    requests: Array.isArray(requests)
      ? requests.flatMap((item) => {
          const presented = presentRequestListItem(item);
          return presented ? [presented] : [];
        })
      : [],
  };
}

export function presentRequestListItem(value: unknown): RequestListItemTransport | null {
  const row = asRecord(value);
  if (!row || typeof row.requestId !== "string" || typeof row.title !== "string") {
    return null;
  }
  return {
    requestId: row.requestId,
    title: row.title,
    reference: asString(row.reference),
    customerId: asString(row.customerId) ?? "",
    customerDisplayName: asString(row.customerDisplayName),
    status: asString(row.status),
    statusLabel: asString(row.statusLabel) ?? asString(row.status) ?? "—",
    contextLabel: asString(row.commercialProgressLabel),
    commercialProgress: asString(row.commercialProgress),
    createdAt: asString(row.createdAt),
    nextAction: asString(row.nextAction) ?? "",
    nextActionLabel: asString(row.nextActionLabel) ?? "",
    nextActionHref: asString(row.nextActionHref),
    needsAttention: asBoolean(row.needsAttention) ?? false,
    attentionLabel: asString(row.attentionLabel),
    linkedQuoteSnapshotId: asString(row.linkedQuoteSnapshotId),
    linkedQuoteProductCode: asString(row.linkedQuoteProductCode),
    linkedAssemblyId: asString(row.linkedAssemblyId),
    commercialState: asString(row.commercialState),
    commercialStateLabel: asString(row.commercialStateLabel),
    ledgerRevision: asNumber(row.ledgerRevision),
  };
}

export function presentRequestDetail(payload: unknown): RequestDetailTransport | null {
  const record = asRecord(payload);
  const detail = asRecord(record?.detail) ?? record;
  const request = detail ? asRecord(detail.request) ?? detail : null;
  if (!request || typeof request.requestId !== "string" || typeof request.title !== "string") {
    return null;
  }
  const commercial = presentCommercialRequest(detail?.commercial);
  const linkedOffers = decorateLinkedOffers(presentLinkedOffers(detail?.linkedOffers), commercial);
  const status = asString(request.status) ?? asString(detail?.status);
  const next = presentRequestNextAction({
    nextAction: asString(detail?.nextAction),
    nextActionLabel: asString(detail?.nextActionLabel),
  });
  return {
    requestId: request.requestId,
    title: request.title,
    reference: asString(request.reference) ?? asString(detail?.reference),
    description: asString(request.description) ?? "",
    customerId: asString(request.customerId) ?? asString(detail?.customerId) ?? "",
    customerDisplayName: asString(detail?.customerDisplayName),
    status,
    statusLabel: asString(detail?.statusLabel) ?? asString(request.status) ?? "—",
    commercialProgress: asString(detail?.commercialProgress),
    commercialProgressLabel: asString(detail?.commercialProgressLabel),
    createdAt: asString(request.createdAt) ?? asString(detail?.createdAt),
    nextAction: next.nextAction,
    nextActionLabel: next.nextActionLabel,
    nextActionHref: next.nextAction ? asString(detail?.nextActionHref) : null,
    linkedQuoteSnapshotId: next.nextAction ? asString(detail?.linkedQuoteSnapshotId) : null,
    linkedQuoteProductCode: next.nextAction ? asString(detail?.linkedQuoteProductCode) : null,
    canUploadAttachments: asBoolean(detail?.canUploadAttachments) ?? false,
    linkedOffers,
    linkedQuoteIds: linkedOffers.map((offer) => offer.quoteSnapshotId),
    linkedQuoteProductCodes: linkedOffers.map((offer) => offer.productCode),
    assemblies: presentRequestAssemblies(detail?.assemblies),
    linkedAssemblyId: asString(detail?.linkedAssemblyId),
    canStartAdditionalWork: asBoolean(detail?.canStartAdditionalWork) ?? false,
    attachments: presentAttachments(detail?.attachments),
    installationOffer: presentInstallationOffer(detail?.installationOffer),
    installationScope: presentInstallationScope(detail?.installationScope),
    installationFacts: presentInstallationFacts(detail?.installationFacts),
    canWriteInstallationFacts: asBoolean(detail?.canWriteInstallationFacts) ?? false,
    canWriteInstallationPrice: asBoolean(detail?.canWriteInstallationPrice) ?? false,
    commercial,
  };
}

export function presentCreatedRequestId(payload: unknown): string | null {
  const record = asRecord(payload);
  const request = asRecord(record?.request);
  return request ? asString(request.requestId) : null;
}

function presentRequestNextAction(input: {
  nextAction: string | null;
  nextActionLabel: string | null;
}): { nextAction: string; nextActionLabel: string } {
  if (input.nextAction) {
    return {
      nextAction: input.nextAction,
      nextActionLabel: input.nextActionLabel || labelForRequestNextAction(input.nextAction),
    };
  }
  // Fail closed: do not invent OPEN_QUOTE / CHOOSE_PRODUCT / OPEN_REQUEST.
  return {
    nextAction: "",
    nextActionLabel: "",
  };
}

function labelForRequestNextAction(nextAction: string): string {
  switch (nextAction) {
    case "CHOOSE_PRODUCT":
      return "Alege produs";
    case "OPEN_QUOTE":
      return "Deschide oferta";
    case "OPEN_ASSEMBLY":
      return "Deschide ansamblul";
    case "OPEN_REQUEST":
      return "Deschide";
    default:
      return "Deschide";
  }
}

function presentRequestAssemblies(value: unknown): RequestAssemblyWorkTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (
      !row ||
      typeof row.assemblyId !== "string" ||
      typeof row.label !== "string" ||
      typeof row.stageLabel !== "string"
    ) {
      return [];
    }
    return [
      {
        assemblyId: row.assemblyId,
        label: row.label,
        stage: asString(row.stage) ?? "",
        stageLabel: row.stageLabel,
        quoteGrossPrice: asNumber(row.quoteGrossPrice),
        currency: asString(row.currency),
        quoteSnapshotId: asString(row.quoteSnapshotId),
        orderSnapshotId: asString(row.orderSnapshotId),
        hasProduction: asString(row.productionSnapshotId) !== null,
        executionPlanId: asString(row.executionPlanId),
        revisionPending: asBoolean(row.revisionPending) ?? false,
        membersEditable: asBoolean(row.membersEditable) ?? false,
      },
    ];
  });
}

function presentLinkedOffers(value: unknown): RequestLinkedOfferTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.quoteSnapshotId !== "string" || typeof row.productCode !== "string") {
      return [];
    }
    const kind = row.kind === "ASSEMBLY" ? "ASSEMBLY" : "PRODUCT";
    return [
      {
        quoteSnapshotId: row.quoteSnapshotId,
        kind,
        kindLabel: asString(row.kindLabel) ?? (kind === "ASSEMBLY" ? "Ansamblu" : "Produs"),
        assemblyId: asString(row.assemblyId),
        productCode: row.productCode,
        productLabel: asString(row.productLabel),
        inscription: asString(row.inscription)?.trim() || null,
        reference: asString(row.reference),
        stage: asString(row.stage),
        stageLabel: asString(row.stageLabel),
        createdAt: asString(row.createdAt),
        superseded: asBoolean(row.superseded) ?? false,
        needsAttention: asBoolean(row.needsAttention) ?? false,
        attentionLabel: asString(row.attentionLabel),
        nextAction: asString(row.nextAction),
        grossDisplay: asString(row.grossDisplay),
        currency: asString(row.currency),
        orderSnapshotId: asString(row.orderSnapshotId),
        disposition: asString(row.disposition),
        dispositionLabel: asString(row.dispositionLabel),
        decisionRequired: asBoolean(row.decisionRequired) ?? false,
        resumable: asBoolean(row.resumable) ?? false,
      },
    ];
  });
}

function presentAttachments(value: unknown): RequestAttachmentTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (
      !row ||
      typeof row.attachmentId !== "string" ||
      typeof row.originalFileName !== "string" ||
      typeof row.downloadHref !== "string"
    ) {
      return [];
    }
    return [
      {
        attachmentId: row.attachmentId,
        originalFileName: row.originalFileName,
        sizeLabel: asString(row.sizeLabel) ?? "",
        createdAt: asString(row.createdAt) ?? "",
        downloadHref: row.downloadHref,
      },
    ];
  });
}

function presentInstallationOffer(
  value: unknown,
): RequestInstallationOfferTransport | null {
  const row = asRecord(value);
  if (!row || typeof row.selected !== "boolean") {
    return null;
  }
  return {
    capabilityId: asString(row.capabilityId) ?? "SITE_INSTALLATION",
    selected: row.selected,
    label: asString(row.label) ?? "Montaj la locație",
    mode: asString(row.mode),
    orgConfigured: asBoolean(row.orgConfigured) ?? false,
    orgOfferMode: asString(row.orgOfferMode),
    canSelectNew: asBoolean(row.canSelectNew) ?? false,
    canChangeSelection: asBoolean(row.canChangeSelection) ?? false,
    canChangeMode: asBoolean(row.canChangeMode) ?? false,
    selectionLocked: asBoolean(row.selectionLocked) ?? false,
    showModeControl: asBoolean(row.showModeControl) ?? false,
    availableModes: asStringList(row.availableModes),
    persistedSelectionPreserved: asBoolean(row.persistedSelectionPreserved) ?? false,
    persistedModeIncompatible: asBoolean(row.persistedModeIncompatible) ?? false,
  };
}

function presentInstallationScope(
  value: unknown,
): RequestInstallationScopeTransport | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const reasons = Array.isArray(row.incompleteReasons) ? row.incompleteReasons : [];
  const ownerCost = asRecord(row.ownerInternalCost);
  return {
    label: asString(row.label) ?? "Montaj la locație",
    eicCompleteness: asString(row.eicCompleteness),
    commercialCompleteness: asString(row.commercialCompleteness),
    commercialNetPrice: asNumber(row.commercialNetPrice),
    ownerInternalCostLabel: asString(ownerCost?.label),
    ownerInternalCostTotal: asNumber(ownerCost?.total),
    incompleteReasons: reasons.flatMap((reason) => {
      const item = asRecord(reason);
      if (!item || typeof item.label !== "string") {
        return [];
      }
      return [{ id: asString(item.id) ?? item.label, label: item.label }];
    }),
  };
}

function presentInstallationFacts(
  value: unknown,
): RequestInstallationFactsTransport | null {
  const row = asRecord(value);
  if (!row || typeof row.version !== "number") {
    return null;
  }
  return {
    version: row.version,
    siteName: asString(row.siteName),
    street: asString(row.street) ?? "",
    city: asString(row.city) ?? "",
    county: asString(row.county),
    postalCode: asString(row.postalCode),
    contactName: asString(row.contactName),
    contactPhone: asString(row.contactPhone),
    accessNotes: asString(row.accessNotes),
    measurementStatus: asString(row.measurementStatus) ?? "",
    mountingSurfaceWidthMm: asNumber(row.mountingSurfaceWidthMm),
    mountingSurfaceHeightMm: asNumber(row.mountingSurfaceHeightMm),
    installationElevationMm: asNumber(row.installationElevationMm),
    facadeType: asString(row.facadeType) ?? "",
    facadeOtherNote: asString(row.facadeOtherNote),
    fixingMethod: asString(row.fixingMethod) ?? "",
    fixingOtherNote: asString(row.fixingOtherNote),
    siteElectrical: asString(row.siteElectrical) ?? "",
    crewSize: asNumber(row.crewSize),
    plannedDurationHours: asNumber(row.plannedDurationHours),
  };
}

function decorateLinkedOffers(
  offers: RequestLinkedOfferTransport[],
  commercial: CommercialRequestTransport | null,
): RequestLinkedOfferTransport[] {
  if (!commercial) {
    return offers;
  }
  const byId = new Map(commercial.offers.map((offer) => [offer.quoteSnapshotId, offer]));
  return offers.map((offer) => {
    const view = byId.get(offer.quoteSnapshotId);
    if (!view) {
      return offer;
    }
    return {
      ...offer,
      disposition: view.disposition,
      dispositionLabel: view.dispositionLabel,
      decisionRequired: view.decisionRequired,
      resumable: view.resumable,
    };
  });
}

function presentCommercialActor(value: unknown): CommercialActorTransport | null {
  const row = asRecord(value);
  const displayName = asString(row?.displayName);
  if (!displayName) {
    return null;
  }
  return {
    displayName,
    role: asString(row?.role) ?? "",
    roleLabel: asString(row?.roleLabel) ?? "",
    accountId: asString(row?.accountId),
  };
}

function presentCommercialEvent(value: unknown): CommercialAuditEventTransport | null {
  const row = asRecord(value);
  const eventId = asString(row?.eventId);
  const actor = presentCommercialActor(row?.actor);
  if (!eventId || !actor) {
    return null;
  }
  return {
    eventId,
    eventKind: asString(row?.eventKind) ?? "",
    eventKindLabel: asString(row?.eventKindLabel) ?? "",
    quoteSnapshotId: asString(row?.quoteSnapshotId),
    disposition: asString(row?.disposition),
    dispositionLabel: asString(row?.dispositionLabel),
    reason: asString(row?.reason) ?? "",
    occurredAt: asString(row?.occurredAt) ?? "",
    actor,
    operationId: asString(row?.operationId) ?? "",
    correlationId: asString(row?.correlationId) ?? "",
  };
}

function presentCommercialOffer(value: unknown): CommercialOfferViewTransport | null {
  const row = asRecord(value);
  const quoteSnapshotId = asString(row?.quoteSnapshotId);
  if (!quoteSnapshotId) {
    return null;
  }
  return {
    quoteSnapshotId,
    disposition: asString(row?.disposition),
    dispositionLabel: asString(row?.dispositionLabel),
    commerciallyResolved: asBoolean(row?.commerciallyResolved) ?? false,
    resolutionSource: asString(row?.resolutionSource) ?? "",
    outstandingOrderObligation: asBoolean(row?.outstandingOrderObligation) ?? false,
    decisionRequired: asBoolean(row?.decisionRequired) ?? false,
    resumable: asBoolean(row?.resumable) ?? false,
    history: Array.isArray(row?.history)
      ? row.history.flatMap((item) => {
          const event = presentCommercialEvent(item);
          return event ? [event] : [];
        })
      : [],
  };
}

export function presentCommercialRequest(value: unknown): CommercialRequestTransport | null {
  const row = asRecord(value);
  const state = asString(row?.state);
  if (!state) {
    return null;
  }
  return {
    state,
    stateLabel: asString(row?.stateLabel) ?? state,
    revision: asNumber(row?.revision) ?? 0,
    closedAt: asString(row?.closedAt),
    closedBy: presentCommercialActor(row?.closedBy),
    closeReason: asString(row?.closeReason),
    reopenedAt: asString(row?.reopenedAt),
    reopenedBy: presentCommercialActor(row?.reopenedBy),
    reopenReason: asString(row?.reopenReason),
    offers: Array.isArray(row?.offers)
      ? row.offers.flatMap((item) => {
          const offer = presentCommercialOffer(item);
          return offer ? [offer] : [];
        })
      : [],
    availableActions: asStringList(row?.availableActions),
    blockingReasons: Array.isArray(row?.blockingReasons)
      ? row.blockingReasons.flatMap((item) => {
          const reason = asRecord(item);
          const code = asString(reason?.code);
          const label = asString(reason?.label);
          return code && label
            ? [{ code, label, quoteSnapshotId: asString(reason?.quoteSnapshotId) }]
            : [];
        })
      : [],
    outstandingAcceptedWithoutOrder: Array.isArray(row?.outstandingAcceptedWithoutOrder)
      ? row.outstandingAcceptedWithoutOrder.flatMap((item) => {
          const obligation = asRecord(item);
          const quoteSnapshotId = asString(obligation?.quoteSnapshotId);
          const label = asString(obligation?.label);
          return quoteSnapshotId && label ? [{ quoteSnapshotId, label }] : [];
        })
      : [],
    unresolvedQuoteSnapshotIds: asStringList(row?.unresolvedQuoteSnapshotIds),
    canClose: asBoolean(row?.canClose) ?? false,
    canReopen: asBoolean(row?.canReopen) ?? false,
    canSaveDecisions: asBoolean(row?.canSaveDecisions) ?? false,
    canCreateQuote: asBoolean(row?.canCreateQuote) ?? false,
    timeline: Array.isArray(row?.timeline)
      ? row.timeline.flatMap((item) => {
          const event = presentCommercialEvent(item);
          return event ? [event] : [];
        })
      : [],
  };
}
