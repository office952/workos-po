import { getJson, patchJson, postForm, postJson, putJson, sendJson, TransportError } from "./http";

/** N-020 · transport for the customer dossier (sites, documents, terms, historical works, history). */
const base = (customerId: string) => `/api/customers/${encodeURIComponent(customerId)}`;

export function fetchCustomerDossier(customerId: string): Promise<unknown> {
  return getJson(`${base(customerId)}/dossier`);
}

export type CustomerHistoryParams = {
  q?: string;
  year?: string;
  site?: string;
  state?: string;
  /** N-020 · WORKOS | HISTORICAL_RECORD | UPLOAD; the server validates it and counts each value. */
  provenance?: string;
  page?: number;
  pageSize?: number;
};

export function customerHistoryQueryString(params: CustomerHistoryParams): string {
  const search = new URLSearchParams();
  if (params.q?.trim()) search.set("q", params.q.trim());
  if (params.year) search.set("year", params.year);
  if (params.site) search.set("site", params.site);
  if (params.state) search.set("state", params.state);
  if (params.provenance) search.set("provenance", params.provenance);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function fetchCustomerHistory(customerId: string, params: CustomerHistoryParams): Promise<unknown> {
  return getJson(`${base(customerId)}/history${customerHistoryQueryString(params)}`);
}

export function createCustomerSite(customerId: string, fields: Record<string, string | null>): Promise<unknown> {
  return postJson(`${base(customerId)}/sites`, fields);
}

export function updateCustomerSite(customerId: string, siteId: string, patch: Record<string, unknown>): Promise<unknown> {
  return patchJson(`${base(customerId)}/sites/${encodeURIComponent(siteId)}`, patch);
}

export function assignCustomerSite(
  customerId: string,
  subjectKind: "REQUEST" | "JOB",
  subjectId: string,
  siteId: string | null,
): Promise<unknown> {
  return putJson(`${base(customerId)}/site-assignments`, { subjectKind, subjectId, siteId });
}

export function uploadCustomerDocument(customerId: string, file: File, fields: Record<string, string>): Promise<unknown> {
  const form = new FormData();
  form.set("file", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== "") form.set(key, value);
  }
  return postForm(`${base(customerId)}/documents`, form);
}

export function updateCustomerDocument(customerId: string, documentId: string, patch: Record<string, unknown>): Promise<unknown> {
  return patchJson(`${base(customerId)}/documents/${encodeURIComponent(documentId)}`, patch);
}

export function linkCustomerDocument(customerId: string, documentId: string, kind: string, subjectId: string): Promise<unknown> {
  return postJson(`${base(customerId)}/documents/${encodeURIComponent(documentId)}/links`, { kind, subjectId });
}

export async function unlinkCustomerDocument(customerId: string, documentId: string, kind: string, subjectId: string): Promise<void> {
  const query = new URLSearchParams({ kind, subjectId }).toString();
  const path = `${base(customerId)}/documents/${encodeURIComponent(documentId)}/links?${query}`;
  const result = await sendJson("DELETE", path);
  if (!result.ok) throw new TransportError(`Cererea ${path} a eșuat.`, result.status, result.body);
}

/**
 * N-021 · choose the representative photo of one work, change it, or go back to the automatic choice
 * (`documentId: null`). `expectedRevision` is the work's revision as read (0 when never chosen).
 */
export function setWorkRepresentativePhoto(
  customerId: string,
  body: { workKind: "JOB" | "HISTORICAL_WORK"; workId: string; documentId: string | null; expectedRevision: number },
): Promise<unknown> {
  return putJson(`${base(customerId)}/works/representative-photo`, body);
}

export function fetchCustomerCommercialTerms(customerId: string): Promise<unknown> {
  return getJson(`${base(customerId)}/commercial-terms`);
}

export function saveCustomerCommercialTerms(customerId: string, fields: Record<string, unknown>): Promise<unknown> {
  return putJson(`${base(customerId)}/commercial-terms`, fields);
}

export function createHistoricalWork(customerId: string, fields: Record<string, unknown>): Promise<unknown> {
  return postJson(`${base(customerId)}/historical-works`, fields);
}

export function updateHistoricalWork(customerId: string, workId: string, patch: Record<string, unknown>): Promise<unknown> {
  return patchJson(`${base(customerId)}/historical-works/${encodeURIComponent(workId)}`, patch);
}

export type CustomerWorksParams = CustomerHistoryParams & { kind?: string; id?: string };

export function customerWorksQueryString(params: CustomerWorksParams): string {
  const extra = new URLSearchParams();
  if (params.kind) extra.set("kind", params.kind);
  if (params.id) extra.set("id", params.id);
  const history = customerHistoryQueryString(params);
  const more = extra.toString();
  if (!more) return history;
  return history ? `${history}&${more}` : `?${more}`;
}

/** N-020 · every work of the client: WorkOS jobs and historical records. */
export function fetchCustomerWorks(customerId: string, params: CustomerWorksParams): Promise<unknown> {
  return getJson(`${base(customerId)}/works${customerWorksQueryString(params)}`);
}
