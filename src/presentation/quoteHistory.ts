type QuoteHistoryFields = {
  superseded: boolean;
  attentionLabel: string | null;
  stageLabel: string | null;
  orderSnapshotId: string | null;
};

/** A superseded version without an order is history, never an offer waiting for acceptance. */
export function presentQuoteHistoryState(item: QuoteHistoryFields): string {
  if (item.superseded && !item.orderSnapshotId && item.attentionLabel) {
    return item.attentionLabel;
  }
  return item.stageLabel || "—";
}
