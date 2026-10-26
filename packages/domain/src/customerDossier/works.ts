import { formatPartialDatePeriod, partialDateSortKey, partialDateYear } from "./historicalWorks.js";
import {
  createDossierProjectionContext,
  customerHistoryStateLabel,
  customerHistoryStateOfJob,
  documentSearchFields,
  isoDateLabel,
  matchSearchTerms,
  searchTermsOf,
  yearsBetween,
  CUSTOMER_HISTORY_STATES,
  type CustomerDocumentProjection,
  type CustomerHistoryInput,
  type CustomerHistoryState,
} from "./history.js";

/**
 * N-020 · Owner decision: on the client page "Lucrări" is every work of the client — each WorkOS
 * job and each historical record, once. Requests, quotes and documents without a job are not
 * works (the history stays wider and shows them). States, sites and documents are read with the
 * same rules as the history. The global production register is not touched.
 *
 * Search and year (N-020 etapa 4) follow the history exactly, with its own function: every word
 * must be found in the same work — in one of its fields or, for a four-digit year, in the years of
 * its documented period (a job: the day its order became a job; a historical record: from its
 * start to its end, inclusive). The "An" filter and the year groups read the year the period
 * starts, as in the history. The day a record was entered in the system is never a work's date.
 */
export const CUSTOMER_WORK_KINDS = ["WORKOS", "HISTORICAL"] as const;
export type CustomerWorkKind = (typeof CUSTOMER_WORK_KINDS)[number];

export const CUSTOMER_WORK_PROVENANCE_LABELS = {
  WORKOS: "În WorkOS",
  HISTORICAL_RECORD: "Înregistrare istorică",
} as const;

export const CUSTOMER_WORKS_PAGE_SIZE_DEFAULT = 20;
export const CUSTOMER_WORKS_PAGE_SIZE_MAX = 50;

export type CustomerWorkItem = {
  workId: string;
  provenance: "WORKOS" | "HISTORICAL_RECORD";
  provenanceLabel: string;
  title: string;
  /** For a job: product and inscription; for a historical work: its reference. */
  detail: string | null;
  reference: string | null;
  eventDate: string;
  eventDateLabel: string;
  year: number;
  /** A WorkOS job: its canonical stage. A historical record: done (FINALIZAT), recorded after the fact. */
  state: CustomerHistoryState;
  stateLabel: string;
  site: { siteId: string; name: string; line: string; active: boolean } | null;
  siteAtTimeLabel: string | null;
  description: string | null;
  job: { jobId: string; stageLabel: string; progressLabel: string | null; orderSnapshotId: string } | null;
  request: { requestId: string; reference: string; title: string } | null;
  quote: { quoteSnapshotId: string; reference: string } | null;
  historicalWorkId: string | null;
  documents: readonly CustomerDocumentProjection[];
  photoCount: number;
  /**
   * GO 12 · the photos of the job's request, as context only (they stay attached to the request):
   * sent when the job has no photo of its own and the request has photos. `shared` says that the
   * request has more than one job, so the photos cannot be read as this job's.
   */
  requestPhotos: { requestId: string; photos: readonly CustomerDocumentProjection[]; shared: boolean } | null;
  matchedOn: readonly string[];
};

export type CustomerWorksQuery = {
  /** One work by id ("job:…" or "historical:…"), for its detail view. */
  workId: string | null;
  text: string;
  kind: CustomerWorkKind | null;
  year: number | null;
  siteId: string | null;
  state: CustomerHistoryState | null;
  page: number;
  pageSize: number;
};

export type CustomerWorksProjection = {
  query: CustomerWorksQuery;
  /** Results after filters. */
  total: number;
  page: number;
  pageCount: number;
  items: readonly CustomerWorkItem[];
  /** The full collection, independent of filters and page. */
  totals: { all: number; workos: number; historical: number };
  /**
   * Each count is the number of works the option would show with the other active filters kept
   * (text, provenance and the other dimensions); the option's own dimension is left out. With no
   * filter they add up to the collection.
   */
  facets: {
    years: readonly number[];
    yearCounts: ReadonlyArray<{ year: number; count: number }>;
    states: ReadonlyArray<{ state: CustomerHistoryState; label: string; count: number }>;
    sites: ReadonlyArray<{ siteId: string; name: string; active: boolean; count: number }>;
  };
};

export function readCustomerWorksQuery(params: Record<string, string | undefined>): CustomerWorksQuery {
  const year = Number(params.year);
  const page = Number(params.page);
  const size = Number(params.pageSize);
  return {
    workId: params.id ? params.id : null,
    text: (params.q ?? "").slice(0, 120),
    kind: (CUSTOMER_WORK_KINDS as readonly string[]).includes(params.kind ?? "") ? (params.kind as CustomerWorkKind) : null,
    year: Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null,
    siteId: params.site ? params.site : null,
    state: (CUSTOMER_HISTORY_STATES as readonly string[]).includes(params.state ?? "") ? (params.state as CustomerHistoryState) : null,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: Number.isInteger(size) && size >= 1 ? Math.min(size, CUSTOMER_WORKS_PAGE_SIZE_MAX) : CUSTOMER_WORKS_PAGE_SIZE_DEFAULT,
  };
}

type Draft = Omit<CustomerWorkItem, "matchedOn" | "photoCount"> & {
  sortKey: string;
  searchFields: Array<[string, string | null]>;
  /** The years of the documented period, for a four-digit word of the search. */
  periodYears: readonly number[];
};
type Dimension = "year" | "site" | "state";

export function projectCustomerWorks(input: CustomerHistoryInput, query: CustomerWorksQuery): CustomerWorksProjection {
  const { documentsFor, siteView, siteOfJob } = createDossierProjectionContext(input);
  const requestsById = new Map(input.requests.map((request) => [request.requestId, request]));
  const drafts: Draft[] = [];
  // The request of each job: its own, or the request of the quote its order came from.
  const quoteOfJob = (job: (typeof input.jobs)[number]) => input.quotes.find((item) => item.orderSnapshotId !== null && item.orderSnapshotId === job.orderSnapshotId) ?? null;
  const requestIdOfJob = (job: (typeof input.jobs)[number]) => job.requestId ?? quoteOfJob(job)?.requestId ?? null;
  const jobsPerRequest = new Map<string, number>();
  for (const job of input.jobs) {
    const requestId = requestIdOfJob(job);
    if (requestId) jobsPerRequest.set(requestId, (jobsPerRequest.get(requestId) ?? 0) + 1);
  }
  function requestContextPhotos(requestId: string | null, own: readonly CustomerDocumentProjection[]): CustomerWorkItem["requestPhotos"] {
    if (!requestId || own.some((document) => document.kind === "PHOTO")) return null;
    const photos = documentsFor("REQUEST", requestId).filter((document) => document.kind === "PHOTO");
    return photos.length ? { requestId, photos, shared: (jobsPerRequest.get(requestId) ?? 0) > 1 } : null;
  }

  for (const job of input.jobs) {
    // The quote this job's order came from, and through it the request when the job has none.
    const quote = quoteOfJob(job);
    const request = requestsById.get(requestIdOfJob(job) ?? "") ?? null;
    const state = customerHistoryStateOfJob(job.stage);
    const documents = documentsFor("JOB", job.jobId);
    const detail = `${job.productLabel}${job.inscription ? ` · ${job.inscription}` : ""}`;
    const title = request?.title ?? detail;
    drafts.push({
      workId: `job:${job.jobId}`,
      provenance: "WORKOS",
      provenanceLabel: CUSTOMER_WORK_PROVENANCE_LABELS.WORKOS,
      title,
      detail,
      reference: quote?.reference ?? null,
      eventDate: job.createdAt,
      eventDateLabel: isoDateLabel(job.createdAt),
      year: Number(job.createdAt.slice(0, 4)),
      state,
      stateLabel: customerHistoryStateLabel(state),
      ...siteOfJob(job),
      description: null,
      job: { jobId: job.jobId, stageLabel: job.stageLabel, progressLabel: job.progressLabel, orderSnapshotId: job.orderSnapshotId },
      request: request ? { requestId: request.requestId, reference: request.reference, title: request.title } : null,
      quote: quote ? { quoteSnapshotId: quote.quoteSnapshotId, reference: quote.reference } : null,
      historicalWorkId: null,
      documents,
      requestPhotos: requestContextPhotos(request?.requestId ?? null, documents),
      sortKey: job.createdAt,
      periodYears: [Number(job.createdAt.slice(0, 4))],
      searchFields: [
        ["Titlu", title],
        ["Lucrare", detail],
        ["Referință", request?.reference ?? null],
        [quote ? `Ofertă ${quote.reference}` : "Ofertă", quote?.reference ?? null],
        ...documents.flatMap(documentSearchFields),
      ],
    });
  }

  for (const work of input.historicalWorks) {
    const documents = documentsFor("HISTORICAL_WORK", work.workId);
    drafts.push({
      workId: `historical:${work.workId}`,
      provenance: "HISTORICAL_RECORD",
      provenanceLabel: CUSTOMER_WORK_PROVENANCE_LABELS.HISTORICAL_RECORD,
      title: work.title,
      detail: null,
      reference: work.reference,
      eventDate: work.eventDate,
      eventDateLabel: formatPartialDatePeriod(work.eventDate, work.eventDateEnd),
      year: partialDateYear(work.eventDate),
      state: "FINALIZAT",
      // The provenance ("Înregistrare istorică") is shown apart; the state is the same as for a finished job.
      stateLabel: customerHistoryStateLabel("FINALIZAT"),
      ...siteView(work.siteId, work.siteSnapshot),
      description: work.description,
      job: null,
      request: null,
      quote: null,
      historicalWorkId: work.workId,
      documents,
      requestPhotos: null,
      sortKey: partialDateSortKey(work.eventDate),
      periodYears: yearsBetween(partialDateYear(work.eventDate), partialDateYear(work.eventDateEnd ?? work.eventDate)),
      searchFields: [
        ["Titlu", work.title],
        ["Referință", work.reference],
        ["Descriere", work.description],
        ...documents.flatMap(documentSearchFields),
      ],
    });
  }

  drafts.sort((left, right) => right.sortKey.localeCompare(left.sortKey) || left.workId.localeCompare(right.workId));

  const terms = searchTermsOf(query.text);
  const candidates = drafts.map(({ sortKey: _sortKey, searchFields, periodYears, ...draft }) => {
    void _sortKey;
    // The history's rule, the same function: null when a word is found nowhere in this work.
    const reasons = terms.length ? matchSearchTerms(terms, [["Sediu", draft.site?.name ?? null], ...searchFields], periodYears) : [];
    return { draft, reasons };
  });
  /** Every active filter except `skip`: the same test for the list and for the counts. */
  const passes = ({ draft, reasons }: (typeof candidates)[number], skip: Dimension | null) => {
    if (reasons === null) return false;
    if (query.workId !== null && draft.workId !== query.workId) return false;
    if (query.kind !== null && (query.kind === "WORKOS" ? draft.provenance !== "WORKOS" : draft.provenance !== "HISTORICAL_RECORD")) return false;
    if (skip !== "year" && query.year !== null && draft.year !== query.year) return false;
    if (skip !== "site" && query.siteId !== null && draft.site?.siteId !== query.siteId) return false;
    if (skip !== "state" && query.state !== null && draft.state !== query.state) return false;
    return true;
  };
  const items: CustomerWorkItem[] = candidates
    .filter((candidate) => passes(candidate, null))
    .map(({ draft, reasons }) => ({ ...draft, photoCount: draft.documents.filter((document) => document.kind === "PHOTO").length, matchedOn: reasons ?? [] }));
  const countFor = (skip: Dimension, test: (draft: (typeof candidates)[number]["draft"]) => boolean) => candidates.filter((candidate) => passes(candidate, skip) && test(candidate.draft)).length;
  const years = [...new Set(drafts.map((draft) => draft.year).filter((year) => Number.isFinite(year)))].sort((a, b) => b - a);

  const pageCount = Math.max(1, Math.ceil(items.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * query.pageSize;
  return {
    query: { ...query, page },
    total: items.length,
    page,
    pageCount,
    items: items.slice(start, start + query.pageSize),
    totals: {
      all: drafts.length,
      workos: drafts.filter((draft) => draft.provenance === "WORKOS").length,
      historical: drafts.filter((draft) => draft.provenance === "HISTORICAL_RECORD").length,
    },
    facets: {
      years,
      yearCounts: years.map((year) => ({ year, count: countFor("year", (draft) => draft.year === year) })),
      // A state is offered when the collection has it; its count follows the other filters.
      states: CUSTOMER_HISTORY_STATES.filter((state) => drafts.some((draft) => draft.state === state)).map((state) => ({
        state,
        label: customerHistoryStateLabel(state),
        count: countFor("state", (draft) => draft.state === state),
      })),
      sites: [...input.sites]
        .sort((left, right) => (left.status === right.status ? left.name.localeCompare(right.name, "ro") : left.status === "ACTIVE" ? -1 : 1))
        .map((site) => ({ siteId: site.siteId, name: site.name, active: site.status === "ACTIVE", count: countFor("site", (draft) => draft.site?.siteId === site.siteId) })),
    },
  };
}
