import { presentCostLines } from "./confirmAdapter";
import type { QuoteSnapshotTransport } from "../api/types";
import { presentCommercialPrice } from "./commercialAdapter";
import { asRecord, asString } from "./record";

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
  return {
    quoteSnapshotId: snapshot.quoteSnapshotId,
    productCode: snapshot.productCode,
    productLabel:
      typeof snapshot.productLabel === "string" ? snapshot.productLabel : snapshot.productCode,
    inscription:
      typeof snapshot.inscription === "string" ? snapshot.inscription : null,
    sourceReviewId:
      typeof snapshot.sourceReviewId === "string" ? snapshot.sourceReviewId : null,
    customerId: asString(snapshot.customerId),
    customerDisplayName: asString(snapshot.customerDisplayName),
    requestId: asString(snapshot.requestId),
    completeness: typeof eic?.completeness === "string" ? eic.completeness : null,
    currency: typeof eic?.currency === "string" ? eic.currency : null,
    lines: presentCostLines(eic?.lines),
    total: typeof eic?.total === "number" ? eic.total : null,
    financialVisible: eic !== null,
    commercial: presentCommercialPrice(snapshot.commercial),
  };
}
