import { getJson, sendJson, type JsonResult } from "./http";

/**
 * Commercial Continuity V2 · transport for the saved quote variants of a request and for the
 * commercial journal. The server owns every state, action and value; these calls only move them.
 */
const base = (requestId: string) => `/api/requests/${encodeURIComponent(requestId)}`;
const variant = (requestId: string, variantId: string) =>
  `${base(requestId)}/variants/${encodeURIComponent(variantId)}`;

export function fetchRequestVariants(requestId: string): Promise<unknown> {
  return getJson(`${base(requestId)}/variants`);
}

export function fetchRequestVariant(requestId: string, variantId: string): Promise<unknown> {
  return getJson(variant(requestId, variantId));
}

export function createRequestVariant(
  requestId: string,
  input: {
    productCode?: string;
    alternativeOfVariantId?: string;
    copyFromVariantId?: string;
    values?: Record<string, unknown>;
  },
): Promise<JsonResult> {
  return sendJson("POST", `${base(requestId)}/variants`, input);
}

export function saveRequestVariantDraft(
  requestId: string,
  variantId: string,
  input: { expectedVersion: number; values?: Record<string, unknown>; notes?: string | null },
): Promise<JsonResult> {
  return sendJson("PATCH", variant(requestId, variantId), input);
}

export function saveRequestVariantPrice(
  requestId: string,
  variantId: string,
  input: { expectedVersion: number; netPrice: number | null },
): Promise<JsonResult> {
  return sendJson("PUT", `${variant(requestId, variantId)}/price`, input);
}

export function setRequestVariantLifecycle(
  requestId: string,
  variantId: string,
  input: { expectedVersion: number; lifecycle: "ACTIVE" | "WITHDRAWN" },
): Promise<JsonResult> {
  return sendJson("POST", `${variant(requestId, variantId)}/lifecycle`, input);
}

export function fetchRequestJournal(requestId: string): Promise<unknown> {
  return getJson(`${base(requestId)}/journal`);
}

export function appendRequestJournalEntry(requestId: string, input: Record<string, unknown>): Promise<JsonResult> {
  return sendJson("POST", `${base(requestId)}/journal`, input);
}
