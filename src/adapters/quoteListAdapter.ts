import type { QuoteListItemTransport } from "../api/types";
import { asBoolean, asRecord, asString } from "./record";

export function presentQuoteList(payload: unknown): QuoteListItemTransport[] {
  const record = asRecord(payload);
  const overview = asRecord(record?.overview);
  const quotes = overview?.quotes;
  if (!Array.isArray(quotes)) {
    return [];
  }
  return quotes.flatMap((item) => {
    const presented = presentQuoteListItem(item);
    return presented ? [presented] : [];
  });
}

export function presentQuoteListItem(value: unknown): QuoteListItemTransport | null {
  const row = asRecord(value);
  if (
    !row ||
    typeof row.quoteSnapshotId !== "string" ||
    typeof row.productCode !== "string"
  ) {
    return null;
  }
  return {
    quoteSnapshotId: row.quoteSnapshotId,
    productCode: row.productCode,
    productLabel: asString(row.productLabel) ?? row.productCode,
    reference: asString(row.reference) ?? row.quoteSnapshotId,
    inscription: asString(row.inscription) ?? "",
    customerDisplayName: asString(row.customerDisplayName),
    stage: asString(row.stage),
    stageLabel: asString(row.stageLabel) ?? asString(row.stage) ?? "—",
    createdAt: asString(row.createdAt),
    nextAction: asString(row.nextAction) ?? "",
    nextActionLabel: asString(row.nextActionLabel) ?? "",
    needsAttention: asBoolean(row.needsAttention) ?? false,
    attentionLabel: asString(row.attentionLabel),
    requestId: asString(row.requestId),
    requestReference: asString(row.requestReference),
    orderSnapshotId: asString(row.orderSnapshotId),
  };
}

export function presentQuoteEnvelope(payload: unknown): QuoteListItemTransport | null {
  const record = asRecord(payload);
  return presentQuoteListItem(record?.quote ?? record?.overview ?? record);
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
