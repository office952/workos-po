import { getJson, postJson } from "./http";
import type { QuoteFreezeRequest } from "./types";

export function quoteFreezePath(productCode: string): string {
  return `/api/products/${encodeURIComponent(productCode)}/quote-snapshots`;
}

export function quoteSnapshotPath(
  productCode: string,
  quoteSnapshotId: string,
): string {
  return `/api/products/${encodeURIComponent(productCode)}/quote-snapshots/${encodeURIComponent(quoteSnapshotId)}`;
}

export async function postQuoteSnapshot(
  productCode: string,
  request: QuoteFreezeRequest,
): Promise<unknown> {
  return postJson(quoteFreezePath(productCode), request);
}

export async function fetchQuoteSnapshot(
  productCode: string,
  quoteSnapshotId: string,
): Promise<unknown> {
  return getJson(quoteSnapshotPath(productCode, quoteSnapshotId));
}
