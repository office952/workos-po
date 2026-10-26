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
  const kind = row.kind === "ASSEMBLY" ? "ASSEMBLY" : "PRODUCT";
  return {
    quoteSnapshotId: row.quoteSnapshotId,
    kind,
    kindLabel: asString(row.kindLabel) ?? (kind === "ASSEMBLY" ? "Ansamblu" : "Produs"),
    assemblyId: kind === "ASSEMBLY" ? asString(row.assemblyId) : null,
    sectionCount: typeof row.sectionCount === "number" ? row.sectionCount : 1,
    superseded: asBoolean(row.superseded) ?? false,
    grossDisplay: asString(row.grossDisplay),
    currency: asString(row.currency),
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

/** A measurement of the frozen offer exactly as the server labels it (value and unit unconverted). */
export type QuotePreviewMeasurement = { label: string; value: number; unit: string };

/**
 * N-020 · what the offer preview of Cereri și oferte reads from `GET /api/quotes/:id` beyond the list
 * row: the confirmed measurements the server already labels (`quoteSnapshot.truth.measurements`)
 * and the acceptance time. Unlabelled measurements and the quantities are left out: naming or
 * choosing them is the domain's (`projectQuoteDocument`), which is not exposed as data.
 */
export type QuotePreviewDetail = { measurements: QuotePreviewMeasurement[]; acceptedAt: string | null };

export function presentQuotePreviewDetail(payload: unknown): QuotePreviewDetail | null {
  const record = asRecord(payload);
  if (!record) return null;
  const truth = asRecord(asRecord(record.quoteSnapshot)?.truth);
  const raw = Array.isArray(truth?.measurements) ? truth.measurements : [];
  const measurements = raw.flatMap((item): QuotePreviewMeasurement[] => {
    const row = asRecord(item);
    const label = asString(row?.label);
    const unit = asString(row?.unit);
    if (!row || !label || !unit || typeof row.value !== "number" || row.confirmed !== true) return [];
    return [{ label, value: row.value, unit }];
  });
  return { measurements, acceptedAt: asString(asRecord(record.acceptance)?.acceptedAt) };
}

export function presentQuoteAcceptanceFact(stage: string | null): string {
  switch (stage) {
    case "QUOTE_ACCEPTED":
    case "ORDER_CREATED":
      return "Acceptată";
    case "QUOTE_CREATED":
      return "Neacceptată";
    default:
      return "—";
  }
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
