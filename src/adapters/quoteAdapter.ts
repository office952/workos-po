import { presentCostLines } from "./confirmAdapter";
import type { QuoteOfferLineTransport, QuoteSnapshotTransport } from "../api/types";
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
  };
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
      },
    ];
  });
}
