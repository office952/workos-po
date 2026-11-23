import { presentCostLines, presentUnconfirmedRates } from "./confirmAdapter";
import type {
  FrozenRateAcknowledgementTransport,
  QuoteOfferLineTransport,
  QuoteSnapshotTransport,
} from "../api/types";
import { presentCommercialPrice } from "./commercialAdapter";
import { asNumber, asRecord, asString } from "./record";

export function presentQuoteSnapshot(
  payload: unknown,
): QuoteSnapshotTransport | null {
  const record = asRecord(payload);
  const snapshot = record ? asRecord(record.quoteSnapshot) ?? record : null;
  if (
    !snapshot ||
    typeof snapshot.quoteSnapshotId !== "string" ||
    typeof snapshot.productCode !== "string"
  ) {
    return null;
  }
  const eic = asRecord(snapshot.eic);
  const customer = asRecord(snapshot.customer);
  const request = asRecord(record?.request);
  const overview = asRecord(record?.quote) ?? asRecord(record?.overview);
  const order = asRecord(record?.order);
  return {
    quoteSnapshotId: snapshot.quoteSnapshotId,
    productCode: snapshot.productCode,
    productLabel:
      typeof snapshot.productLabel === "string" ? snapshot.productLabel : snapshot.productCode,
    inscription:
      typeof snapshot.inscription === "string" ? snapshot.inscription : null,
    sourceReviewId:
      typeof snapshot.sourceReviewId === "string" ? snapshot.sourceReviewId : null,
    customerId: asString(customer?.customerId) ?? asString(snapshot.customerId),
    customerDisplayName:
      asString(customer?.displayName) ?? asString(snapshot.customerDisplayName),
    requestId:
      asString(request?.requestId) ??
      asString(record?.requestId) ??
      asString(snapshot.requestId) ??
      asString(overview?.requestId),
    requestReference: asString(request?.reference) ?? asString(overview?.requestReference),
    completeness: typeof eic?.completeness === "string" ? eic.completeness : null,
    currency: typeof eic?.currency === "string" ? eic.currency : null,
    lines: presentCostLines(eic?.lines),
    total: typeof eic?.total === "number" ? eic.total : null,
    financialVisible: eic !== null,
    commercial: presentCommercialPrice(snapshot.commercial),
    offerLines: presentOfferLines(snapshot.lines),
    jobCommercial: presentCommercialPrice(snapshot.jobCommercial),
    stage: asString(overview?.stage),
    stageLabel: asString(overview?.stageLabel),
    nextAction: asString(overview?.nextAction),
    nextActionLabel: asString(overview?.nextActionLabel),
    orderSnapshotId: asString(overview?.orderSnapshotId) ?? asString(order?.orderSnapshotId),
    rateAcknowledgement: presentFrozenRateAcknowledgement(snapshot.rateAcknowledgement),
  };
}

export function presentFrozenRateAcknowledgement(
  value: unknown,
): FrozenRateAcknowledgementTransport | null {
  const record = asRecord(value);
  const acknowledgedAt = asString(record?.acknowledgedAt);
  const rates = presentUnconfirmedRates(record?.rates);
  return acknowledgedAt && rates.length > 0 ? { acknowledgedAt, rates } : null;
}

function presentInstallationElectricalDetail(row: Record<string, unknown>): string | null {
  const execution = asRecord(row.siteExecutionContext);
  const technical = asRecord(row.technicalConfiguration);
  const state = asString(execution?.siteElectrical) ?? asString(technical?.siteElectrical);
  const amount = asNumber(asRecord(row.siteElectricalEvidence)?.amount);
  const zero = amount === 0;
  switch (state) {
    case "EXCLUDED_CUSTOMER_RESPONSIBILITY":
      return "Exclus. Responsabilitatea clientului. Nu intră în costul ofertei.";
    case "NOT_APPLICABLE":
      return "Nu se aplică. Nu se cere cost de racord.";
    case "INCLUDED":
      return zero ? "Inclus în lucrare. Cost confirmat explicit la zero." : "Inclus în lucrare.";
    case "SUBCONTRACTED":
      return zero ? "Subcontractat. Cost confirmat explicit la zero." : "Subcontractat.";
    case "UNCONFIRMED":
      return "Neconfirmat. Oferta nu poate fi acceptată până confirmi racordul.";
    default:
      return null;
  }
}

function presentOfferLines(value: unknown): QuoteOfferLineTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    const kind = asString(row?.kind);
    if (!row || !kind) {
      return [];
    }
    const commercial = asRecord(row.commercial);
    const label =
      kind === "SITE_INSTALLATION"
        ? "Montaj la locație"
        : kind === "PRODUCT"
          ? "Produs"
          : asString(row.label) ?? kind;
    return [
      {
        kind,
        label,
        netPrice: asNumber(commercial?.netPrice),
        currency: asString(commercial?.currency),
        detail: kind === "SITE_INSTALLATION" ? presentInstallationElectricalDetail(row) : null,
      },
    ];
  });
}
