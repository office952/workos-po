import type { QuoteListItemTransport } from "../api/types";
import { asRecord, asString } from "./record";

export function presentQuoteList(payload: unknown): QuoteListItemTransport[] {
  const record = asRecord(payload);
  const overview = asRecord(record?.overview);
  const quotes = overview?.quotes;
  if (!Array.isArray(quotes)) {
    return [];
  }
  return quotes.flatMap((item) => {
    const row = asRecord(item);
    if (
      !row ||
      typeof row.quoteSnapshotId !== "string" ||
      typeof row.productCode !== "string"
    ) {
      return [];
    }
    return [
      {
        quoteSnapshotId: row.quoteSnapshotId,
        productCode: row.productCode,
        productLabel: asString(row.productLabel) ?? row.productCode,
        reference: asString(row.reference) ?? row.quoteSnapshotId,
        inscription: asString(row.inscription) ?? "",
        customerDisplayName: asString(row.customerDisplayName),
        stageLabel: asString(row.stageLabel) ?? asString(row.stage) ?? "—",
        updatedAt: asString(row.createdAt) ?? asString(row.updatedAt),
        nextActionLabel: asString(row.nextActionLabel) ?? "",
        requestId: asString(row.requestId),
        orderSnapshotId: asString(row.orderSnapshotId),
      },
    ];
  });
}

export function presentAcceptanceId(payload: unknown): string | null {
  const record = asRecord(payload);
  const decision = asRecord(record?.acceptanceDecision) ?? asRecord(record?.acceptance);
  return decision ? asString(decision.acceptanceId) : null;
}

export function presentOrderSnapshotId(payload: unknown): string | null {
  const record = asRecord(payload);
  const order = asRecord(record?.orderSnapshot) ?? asRecord(record?.order);
  return order ? asString(order.orderSnapshotId) : null;
}

export function presentReleaseSnapshotId(payload: unknown): string | null {
  const record = asRecord(payload);
  const snapshot = asRecord(record?.snapshot);
  return snapshot ? asString(snapshot.snapshotId) : null;
}
