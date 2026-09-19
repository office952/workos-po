import type { RequestDetailTransport, RequestListItemTransport } from "../api/types";
import { asRecord, asString, asStringList } from "./record";

export function presentRequestList(payload: unknown): RequestListItemTransport[] {
  const record = asRecord(payload);
  const overview = asRecord(record?.overview);
  const requests = overview?.requests;
  if (!Array.isArray(requests)) {
    return [];
  }
  return requests.flatMap((item) => {
    const row = asRecord(item);
    if (!row || typeof row.requestId !== "string" || typeof row.title !== "string") {
      return [];
    }
    return [
      {
        requestId: row.requestId,
        title: row.title,
        reference: asString(row.reference),
        customerId: asString(row.customerId) ?? "",
        customerDisplayName: asString(row.customerDisplayName),
        statusLabel: asString(row.statusLabel) ?? asString(row.status) ?? "—",
        contextLabel: asString(row.commercialProgressLabel),
        updatedAt: asString(row.createdAt) ?? asString(row.updatedAt),
        nextActionLabel: asString(row.nextActionLabel) ?? "",
      },
    ];
  });
}

export function presentRequestDetail(payload: unknown): RequestDetailTransport | null {
  const record = asRecord(payload);
  const detail = asRecord(record?.detail) ?? record;
  const request = detail ? asRecord(detail.request) ?? detail : null;
  if (!request || typeof request.requestId !== "string" || typeof request.title !== "string") {
    return null;
  }
  const offers = Array.isArray(detail?.linkedOffers) ? detail.linkedOffers : [];
  const quoteIds: string[] = [];
  const productCodes: string[] = [];
  for (const offer of offers) {
    const row = asRecord(offer);
    if (row && typeof row.quoteSnapshotId === "string") {
      quoteIds.push(row.quoteSnapshotId);
    }
    if (row && typeof row.productCode === "string") {
      productCodes.push(row.productCode);
    }
  }
  return {
    requestId: request.requestId,
    title: request.title,
    description: asString(request.description) ?? "",
    customerId: asString(request.customerId) ?? asString(detail?.customerId) ?? "",
    customerDisplayName: asString(detail?.customerDisplayName),
    statusLabel: asString(detail?.statusLabel) ?? asString(request.status) ?? "—",
    linkedQuoteIds: quoteIds.length > 0 ? quoteIds : asStringList(request.quoteSnapshotIds),
    linkedQuoteProductCodes: productCodes,
  };
}

export function presentCreatedRequestId(payload: unknown): string | null {
  const record = asRecord(payload);
  const request = asRecord(record?.request);
  return request ? asString(request.requestId) : null;
}
