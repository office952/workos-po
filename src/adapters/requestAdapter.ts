import type {
  RequestAttachmentTransport,
  RequestDetailTransport,
  RequestInstallationFactsTransport,
  RequestInstallationOfferTransport,
  RequestInstallationScopeTransport,
  RequestLinkedOfferTransport,
  RequestListItemTransport,
} from "../api/types";
import { asBoolean, asNumber, asRecord, asString, asStringList } from "./record";

export function presentRequestList(payload: unknown): RequestListItemTransport[] {
  const record = asRecord(payload);
  const overview = asRecord(record?.overview);
  const requests = overview?.requests;
  if (!Array.isArray(requests)) {
    return [];
  }
  return requests.flatMap((item) => {
    const presented = presentRequestListItem(item);
    return presented ? [presented] : [];
  });
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
  };
}

export function presentRequestDetail(payload: unknown): RequestDetailTransport | null {
  const record = asRecord(payload);
  const detail = asRecord(record?.detail) ?? record;
  const request = detail ? asRecord(detail.request) ?? detail : null;
  if (!request || typeof request.requestId !== "string" || typeof request.title !== "string") {
    return null;
  }
  const linkedOffers = presentLinkedOffers(detail?.linkedOffers);
  const status = asString(request.status) ?? asString(detail?.status);
  const next = presentRequestNextAction({
    nextAction: asString(detail?.nextAction),
    nextActionLabel: asString(detail?.nextActionLabel),
    linkedOfferCount: linkedOffers.length,
    status,
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
    canUploadAttachments: asBoolean(detail?.canUploadAttachments) ?? false,
    linkedOffers,
    linkedQuoteIds: linkedOffers.map((offer) => offer.quoteSnapshotId),
    linkedQuoteProductCodes: linkedOffers.map((offer) => offer.productCode),
    attachments: presentAttachments(detail?.attachments),
    installationOffer: presentInstallationOffer(detail?.installationOffer),
    installationScope: presentInstallationScope(detail?.installationScope),
    installationFacts: presentInstallationFacts(detail?.installationFacts),
    canWriteInstallationFacts: asBoolean(detail?.canWriteInstallationFacts) ?? false,
    canWriteInstallationPrice: asBoolean(detail?.canWriteInstallationPrice) ?? false,
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
  linkedOfferCount: number;
  status: string | null;
}): { nextAction: string; nextActionLabel: string } {
  if (input.nextAction) {
    return {
      nextAction: input.nextAction,
      nextActionLabel: input.nextActionLabel || labelForRequestNextAction(input.nextAction),
    };
  }
  if (input.linkedOfferCount > 0) {
    return {
      nextAction: "OPEN_QUOTE",
      nextActionLabel: input.nextActionLabel || "Deschide oferta",
    };
  }
  if (input.status === "READY_FOR_QUOTE") {
    return {
      nextAction: "CHOOSE_PRODUCT",
      nextActionLabel: input.nextActionLabel || "Alege produs",
    };
  }
  return {
    nextAction: "OPEN_REQUEST",
    nextActionLabel: input.nextActionLabel || "Deschide",
  };
}

function labelForRequestNextAction(nextAction: string): string {
  switch (nextAction) {
    case "CHOOSE_PRODUCT":
      return "Alege produs";
    case "OPEN_QUOTE":
      return "Deschide oferta";
    case "OPEN_REQUEST":
      return "Deschide";
    default:
      return "Deschide";
  }
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
    return [
      {
        quoteSnapshotId: row.quoteSnapshotId,
        productCode: row.productCode,
        reference: asString(row.reference),
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
    fixingMethod: asString(row.fixingMethod) ?? "",
    siteElectrical: asString(row.siteElectrical) ?? "",
    crewSize: asNumber(row.crewSize),
    plannedDurationHours: asNumber(row.plannedDurationHours),
  };
}
