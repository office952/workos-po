import { getJson } from "./http";

export async function fetchQuoteOverview(): Promise<unknown> {
  return getJson("/api/quotes");
}

export async function fetchQuoteEnvelope(quoteSnapshotId: string): Promise<unknown> {
  return getJson(`/api/quotes/${encodeURIComponent(quoteSnapshotId)}`);
}
