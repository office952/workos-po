import type { JobOverviewItem } from "../jobs/overview.js";
import type { QuoteOverviewItem } from "../quotes/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import { normalizeSearchText } from "../searchNormalize.js";
import {
  customerDocumentKindLabel,
  customerDocumentLinkKindLabel,
  customerDocumentPreview,
  customerPhotoStageLabel,
  type CustomerDocument,
  type CustomerDocumentLink,
  type CustomerDocumentLinkKind,
} from "./documents.js";
import {
  formatPartialDatePeriod,
  HISTORICAL_WORK_PROVENANCE_LABEL,
  partialDateSortKey,
  partialDateYear,
  type HistoricalWork,
} from "./historicalWorks.js";
import { projectWorkRepresentativePhoto, workRepresentativeKey, type WorkRepresentativeKind, type WorkRepresentativeSelection } from "./representativePhotos.js";
import { customerSiteLine, type CustomerSite, type CustomerSiteSnapshot, type CustomerSiteSubjectKind } from "./sites.js";

/**
 * The searchable history of one customer. A "project" is only a presentation grouping of
 * relations that already exist: a request and its branches. A branch is one quote with its order
 * and job, or a job reached without a quote of this request. Every quote and job appears once.
 * Each branch has its own state, read from the canonical job stage (or the quote stage when
 * there is no job yet); a request whose branches differ shows the branch states, not one
 * misleading summary. Historical works and loose documents are entries of their own.
 * Only metadata is read: no file bytes are opened to answer a search.
 */
export const CUSTOMER_HISTORY_STATES = [
  "OFERTARE",
  "OFERTA_ACCEPTATA",
  "COMANDA_CREATA",
  "ELIBERATA",
  "PLAN_PREGATIT",
  "IN_EXECUTIE",
  "FINALIZAT",
  "OFERTA_INLOCUITA",
  "ANULAT",
] as const;
export type CustomerHistoryState = (typeof CUSTOMER_HISTORY_STATES)[number];

export const CUSTOMER_HISTORY_ENTRY_KINDS = ["PROJECT", "HISTORICAL_WORK", "DOCUMENT"] as const;
export type CustomerHistoryEntryKind = (typeof CUSTOMER_HISTORY_ENTRY_KINDS)[number];

export const CUSTOMER_HISTORY_PAGE_SIZE_DEFAULT = 10;
export const CUSTOMER_HISTORY_PAGE_SIZE_MAX = 50;
export const CUSTOMER_HISTORY_MIXED_STATE_LABEL = "Ramuri în stări diferite";

/**
 * Where an entry comes from: a WorkOS project (request, quotes, jobs), a historical record entered
 * after the fact, or an uploaded document that belongs to no request or work. Documents have no
 * production state; the provenance filter is how they are found as a group.
 */
export const CUSTOMER_HISTORY_PROVENANCES = ["WORKOS", "HISTORICAL_RECORD", "UPLOAD"] as const;
export type CustomerHistoryProvenance = (typeof CUSTOMER_HISTORY_PROVENANCES)[number];

export function customerHistoryProvenanceLabel(provenance: CustomerHistoryProvenance): string {
  switch (provenance) {
    case "WORKOS":
      return "În WorkOS";
    case "HISTORICAL_RECORD":
      return "Înregistrare istorică";
    case "UPLOAD":
      return "Document încărcat";
    default: {
      const _exhaustive: never = provenance;
      return _exhaustive;
    }
  }
}

export function customerHistoryStateLabel(state: CustomerHistoryState): string {
  switch (state) {
    case "OFERTARE":
      return "Ofertare";
    case "OFERTA_ACCEPTATA":
      return "Ofertă acceptată, fără comandă";
    case "COMANDA_CREATA":
      return "Comandă creată";
    case "ELIBERATA":
      return "Eliberată în producție";
    case "PLAN_PREGATIT":
      return "Plan de execuție pregătit";
    case "IN_EXECUTIE":
      return "Execuție în curs";
    case "FINALIZAT":
      return "Finalizată";
    case "OFERTA_INLOCUITA":
      return "Ofertă înlocuită";
    case "ANULAT":
      return "Anulat";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

/** The canonical job stage, one to one. */
export function customerHistoryStateOfJob(stage: JobOverviewItem["stage"]): CustomerHistoryState {
  switch (stage) {
    case "ORDER_CREATED":
      return "COMANDA_CREATA";
    case "RELEASED":
      return "ELIBERATA";
    case "EXECUTION_PLANNED":
      return "PLAN_PREGATIT";
    case "EXECUTION_IN_PROGRESS":
      return "IN_EXECUTIE";
    case "EXECUTION_COMPLETED":
      return "FINALIZAT";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

function stateOfQuote(quote: QuoteOverviewItem): CustomerHistoryState {
  if (quote.stage === "ORDER_CREATED") return "COMANDA_CREATA";
  if (quote.stage === "QUOTE_ACCEPTED") return "OFERTA_ACCEPTATA";
  return quote.superseded ? "OFERTA_INLOCUITA" : "OFERTARE";
}

export type CustomerDocumentProjection = {
  documentId: string;
  title: string;
  kind: CustomerDocument["kind"];
  kindLabel: string;
  photoStage: CustomerDocument["photoStage"];
  photoStageLabel: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  description: string | null;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  preview: "IMAGE" | "PDF" | "NONE";
  uploadedAt: string;
  revision: number;
  links: ReadonlyArray<{ kind: CustomerDocumentLinkKind; kindLabel: string; subjectId: string; label: string }>;
  viewHref: string;
  downloadHref: string;
};

export type CustomerHistoryBranch = {
  branchId: string;
  state: CustomerHistoryState;
  stateLabel: string;
  quote: { quoteSnapshotId: string; kind: QuoteOverviewItem["kind"]; productCode: string; reference: string; stageLabel: string; superseded: boolean; createdAt: string } | null;
  /** The order between the accepted quote and the job, when there is one. */
  orderSnapshotId: string | null;
  job: { jobId: string; orderSnapshotId: string; stage: JobOverviewItem["stage"]; stageLabel: string; progressLabel: string | null; productLabel: string; inscription: string } | null;
  /** The site of the job when it differs from the request site. */
  site: { siteId: string; name: string; line: string; active: boolean } | null;
};

export type CustomerHistoryEntry = {
  entryId: string;
  kind: CustomerHistoryEntryKind;
  title: string;
  reference: string | null;
  eventDate: string;
  eventDateLabel: string;
  year: number;
  state: CustomerHistoryState | null;
  stateLabel: string;
  provenance: CustomerHistoryProvenance;
  provenanceLabel: string;
  site: { siteId: string; name: string; line: string; active: boolean } | null;
  /** Set when the site as recorded at the time differs from today's site data. */
  siteAtTimeLabel: string | null;
  description: string | null;
  request: { requestId: string; reference: string; title: string; statusLabel: string } | null;
  /** PROJECT only: one branch per quote (with its order and job) or per job without a quote here. */
  branches: readonly CustomerHistoryBranch[];
  /** Every distinct branch state (or the single state of a work); used by the state filter. */
  states: readonly CustomerHistoryState[];
  historicalWorkId: string | null;
  documents: readonly CustomerDocumentProjection[];
  photoCount: number;
  /**
   * N-021 · the photo an operator chose for the work, only where the entry is that one work without
   * ambiguity: a historical work, or a project with exactly one job. Null otherwise (the automatic
   * rule applies; a project of several works never takes the choice of one of them).
   */
  representativePhotoId: string | null;
  /** Why this entry matched a text query ("Document: Factură F-2021-118"); empty without a query. */
  matchedOn: readonly string[];
};

export type CustomerHistoryQuery = {
  text: string;
  year: number | null;
  siteId: string | null;
  state: CustomerHistoryState | null;
  provenance: CustomerHistoryProvenance | null;
  page: number;
  pageSize: number;
};

export type CustomerHistoryProjection = {
  query: CustomerHistoryQuery;
  total: number;
  page: number;
  pageCount: number;
  entries: readonly CustomerHistoryEntry[];
  /**
   * Facet counts (faceted search): the count of a value is the number of entries that match every
   * active filter except the one of its own dimension (text always applies). With no filter active
   * the counts describe the whole history; the filters themselves combine with AND.
   */
  facets: {
    years: readonly number[];
    yearCounts: ReadonlyArray<{ year: number; count: number }>;
    /** Entries having at least one branch in that state. */
    states: ReadonlyArray<{ state: CustomerHistoryState; label: string; count: number }>;
    provenances: ReadonlyArray<{ provenance: CustomerHistoryProvenance; label: string; count: number }>;
    sites: ReadonlyArray<{ siteId: string; name: string; active: boolean; count: number }>;
  };
  /** The whole history of the customer, independent of filters and page. */
  totals: { entries: number; projects: number; historicalWorks: number; uploads: number; documents: number; photos: number };
};

export type CustomerHistoryInput = {
  requests: readonly RequestOverviewItem[];
  quotes: readonly QuoteOverviewItem[];
  jobs: readonly JobOverviewItem[];
  historicalWorks: readonly HistoricalWork[];
  documents: readonly CustomerDocument[];
  documentLinks: ReadonlyMap<string, readonly CustomerDocumentLink[]>;
  sites: readonly CustomerSite[];
  siteAssignments: ReadonlyArray<{ subjectKind: CustomerSiteSubjectKind; subjectId: string; siteId: string; snapshot: CustomerSiteSnapshot }>;
  /** N-021 · the stored representative-photo choices, by `workRepresentativeKey`. */
  representativePhotos?: ReadonlyMap<string, WorkRepresentativeSelection>;
  documentContentHref: (documentId: string, disposition: "inline" | "attachment") => string;
};

export function readCustomerHistoryQuery(params: Record<string, string | undefined>): CustomerHistoryQuery {
  const year = Number(params.year);
  const page = Number(params.page);
  const size = Number(params.pageSize);
  const state = (CUSTOMER_HISTORY_STATES as readonly string[]).includes(params.state ?? "")
    ? (params.state as CustomerHistoryState)
    : null;
  const provenance = (CUSTOMER_HISTORY_PROVENANCES as readonly string[]).includes(params.provenance ?? "")
    ? (params.provenance as CustomerHistoryProvenance)
    : null;
  return {
    text: (params.q ?? "").slice(0, 120),
    year: Number.isInteger(year) && year >= 1900 && year <= 2200 ? year : null,
    siteId: params.site ? params.site : null,
    state,
    provenance,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: Number.isInteger(size) && size >= 1 ? Math.min(size, CUSTOMER_HISTORY_PAGE_SIZE_MAX) : CUSTOMER_HISTORY_PAGE_SIZE_DEFAULT,
  };
}

export function projectCustomerDocument(
  document: CustomerDocument,
  links: readonly CustomerDocumentLink[],
  labelFor: (link: CustomerDocumentLink) => string,
  contentHref: (documentId: string, disposition: "inline" | "attachment") => string,
): CustomerDocumentProjection {
  return {
    documentId: document.documentId,
    title: document.title,
    kind: document.kind,
    kindLabel: customerDocumentKindLabel(document.kind),
    photoStage: document.photoStage,
    photoStageLabel: document.photoStage ? customerPhotoStageLabel(document.photoStage) : null,
    documentNumber: document.documentNumber,
    documentDate: document.documentDate,
    description: document.description,
    originalFileName: document.originalFileName,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    preview: customerDocumentPreview(document.mimeType),
    uploadedAt: document.uploadedAt,
    revision: document.revision,
    links: [...links]
      .sort((left, right) => left.kind.localeCompare(right.kind) || left.subjectId.localeCompare(right.subjectId))
      .map((link) => ({
        kind: link.kind,
        kindLabel: customerDocumentLinkKindLabel(link.kind),
        subjectId: link.subjectId,
        label: labelFor(link),
      })),
    viewHref: contentHref(document.documentId, "inline"),
    downloadHref: contentHref(document.documentId, "attachment"),
  };
}

type Draft = Omit<CustomerHistoryEntry, "matchedOn" | "photoCount"> & {
  searchFields: Array<[string, string | null]>;
  /** The years of the documented period (start to end, inclusive); empty when no date is documented. */
  periodYears: readonly number[];
};

/** Every year from the first to the last, inclusive (a documented period spanning years). */
export function yearsBetween(first: number, last: number): number[] {
  if (!Number.isInteger(first) || !Number.isInteger(last) || last < first) return Number.isInteger(first) ? [first] : [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

const YEAR_TERM = /^\d{4}$/;

/** The words of a search: normalized (case, diacritics, spaces), each once, in the order typed. */
export function searchTermsOf(text: string): string[] {
  return [...new Set(normalizeSearchText(text).split(" ").filter(Boolean))];
}

/**
 * N-020 · the words of a history search. Each normalized word must be found in the same entry: in
 * one of its searchable fields (substring, case and diacritics ignored) or, for a four-digit year,
 * in its documented period. Returns the fields that contributed (site, year, then the fields in
 * their order — the same whatever the order of the words), or null when a word is found nowhere.
 */
export function matchSearchTerms(terms: readonly string[], fields: ReadonlyArray<[string, string | null]>, periodYears: readonly number[]): string[] | null {
  const normalized = fields.flatMap(([label, value]) => (value ? [[label, normalizeSearchText(value)] as const] : []));
  const years = new Set<number>();
  const labels = new Set<string>();
  for (const term of terms) {
    let found = false;
    if (YEAR_TERM.test(term) && periodYears.includes(Number(term))) {
      years.add(Number(term));
      found = true;
    }
    for (const [label, value] of normalized) {
      if (value.includes(term)) {
        labels.add(label);
        found = true;
      }
    }
    if (!found) return null;
  }
  // One order whatever the order of the words: the site, the year(s), then the fields as listed.
  const fieldOrder = [...new Set(normalized.map(([label]) => label))].filter((label) => labels.has(label));
  const yearLabels = [...years].sort((left, right) => left - right).map((year) => `Anul ${year}`);
  const [first, ...rest] = fieldOrder;
  // The site is the first field; the documented year comes right after it.
  return first === "Sediu" ? [first, ...yearLabels, ...rest] : [...yearLabels, ...fieldOrder];
}

export function documentSearchFields(document: CustomerDocumentProjection): Array<[string, string | null]> {
  const label = `${document.kindLabel}: ${document.title}`;
  return [
    [label, document.title],
    [label, document.documentNumber],
    [label, document.originalFileName],
    [label, document.description],
    [label, document.photoStageLabel],
  ];
}

export function isoDateLabel(iso: string): string {
  const date = iso.slice(0, 10);
  const [year, month, day] = date.split("-");
  return year && month && day ? formatPartialDatePeriod(`${year}-${month}-${day}`, null) : iso;
}

/** A readable name for what a document is linked to. */
export function createCustomerDocumentLinkLabeler(
  input: Pick<CustomerHistoryInput, "requests" | "jobs" | "historicalWorks" | "sites">,
): (link: CustomerDocumentLink) => string {
  const sitesById = new Map(input.sites.map((site) => [site.siteId, site]));
  const requestsById = new Map(input.requests.map((item) => [item.requestId, item]));
  const worksById = new Map(input.historicalWorks.map((item) => [item.workId, item]));
  const jobsById = new Map(input.jobs.map((item) => [item.jobId, item]));
  return (link: CustomerDocumentLink): string => {
    switch (link.kind) {
      case "SITE":
        return sitesById.get(link.subjectId)?.name ?? "Sediu";
      case "REQUEST": {
        const request = requestsById.get(link.subjectId);
        return request ? `${request.reference} · ${request.title}` : "Cerere";
      }
      case "JOB": {
        const job = jobsById.get(link.subjectId);
        return job ? `${job.productLabel}${job.inscription ? ` · ${job.inscription}` : ""}` : "Lucrare";
      }
      case "HISTORICAL_WORK":
        return worksById.get(link.subjectId)?.title ?? "Lucrare istorică";
      default: {
        const _exhaustive: never = link.kind;
        return _exhaustive;
      }
    }
  };
}

/**
 * What every dossier projection (history, works) reads the same way: the documents of a subject,
 * the site of a request or job with its snapshot, and the site assignments. One implementation.
 */
export function createDossierProjectionContext(input: CustomerHistoryInput) {
  const sitesById = new Map(input.sites.map((site) => [site.siteId, site]));
  const assignment = new Map(input.siteAssignments.map((item) => [`${item.subjectKind}:${item.subjectId}`, item]));
  const linkLabel = createCustomerDocumentLinkLabeler(input);
  const projectedDocuments = new Map(
    input.documents.map((document) => [
      document.documentId,
      projectCustomerDocument(document, input.documentLinks.get(document.documentId) ?? [], linkLabel, input.documentContentHref),
    ]),
  );
  const documentsFor = (kind: CustomerDocumentLinkKind, subjectId: string): CustomerDocumentProjection[] =>
    input.documents
      .filter((document) => (input.documentLinks.get(document.documentId) ?? []).some((link) => link.kind === kind && link.subjectId === subjectId))
      .map((document) => projectedDocuments.get(document.documentId))
      .filter((item): item is CustomerDocumentProjection => Boolean(item));
  const siteView = (siteId: string | null, snapshot: CustomerSiteSnapshot | null) => {
    const site = siteId ? sitesById.get(siteId) : undefined;
    if (!site) return { site: null, siteAtTimeLabel: snapshot ? customerSiteLine(snapshot) : null };
    const current = customerSiteLine(site);
    const atTime = snapshot ? customerSiteLine(snapshot) : null;
    return {
      site: { siteId: site.siteId, name: site.name, line: current, active: site.status === "ACTIVE" },
      siteAtTimeLabel: atTime && atTime !== current ? atTime : null,
    };
  };
  /** The site of a job: its own assignment, else the one of its request. */
  const siteOfJob = (job: JobOverviewItem) => {
    const assigned = assignment.get(`JOB:${job.jobId}`) ?? (job.requestId ? assignment.get(`REQUEST:${job.requestId}`) : undefined);
    return assigned ? siteView(assigned.siteId, assigned.snapshot) : { site: null, siteAtTimeLabel: null };
  };
  /** N-021 · the choice of one work, checked against the work's own documents. */
  const representativeOf = (workKind: WorkRepresentativeKind, workId: string, own: readonly CustomerDocumentProjection[] = documentsFor(workKind, workId)) =>
    projectWorkRepresentativePhoto(input.representativePhotos?.get(workRepresentativeKey(workKind, workId)), own);
  return { assignment, projectedDocuments, documentsFor, siteView, siteOfJob, representativeOf };
}

export function projectCustomerHistory(input: CustomerHistoryInput, query: CustomerHistoryQuery): CustomerHistoryProjection {
  const { assignment, projectedDocuments, documentsFor, siteView, representativeOf } = createDossierProjectionContext(input);

  const drafts: Draft[] = [];
  const claimedQuotes = new Set<string>();
  const claimedJobs = new Set<string>();
  const byCreated = <T extends { createdAt: string }>(left: T, right: T, leftId: string, rightId: string) =>
    left.createdAt.localeCompare(right.createdAt) || leftId.localeCompare(rightId);
  const siteOfJob = (job: JobOverviewItem) => {
    const assigned = assignment.get(`JOB:${job.jobId}`);
    return assigned ? siteView(assigned.siteId, assigned.snapshot).site : null;
  };

  const branchOf = (quote: QuoteOverviewItem | null, job: JobOverviewItem | null): CustomerHistoryBranch => {
    const state = job ? customerHistoryStateOfJob(job.stage) : quote ? stateOfQuote(quote) : "OFERTARE";
    if (quote) claimedQuotes.add(quote.quoteSnapshotId);
    if (job) claimedJobs.add(job.jobId);
    return {
      branchId: job ? `job:${job.jobId}` : `quote:${quote?.quoteSnapshotId ?? ""}`,
      state,
      stateLabel: customerHistoryStateLabel(state),
      quote: quote
        ? {
            quoteSnapshotId: quote.quoteSnapshotId,
            kind: quote.kind,
            productCode: quote.productCode,
            reference: quote.reference,
            stageLabel: quote.stageLabel,
            superseded: quote.superseded,
            createdAt: quote.createdAt,
          }
        : null,
      orderSnapshotId: job?.orderSnapshotId ?? quote?.orderSnapshotId ?? null,
      job: job
        ? {
            jobId: job.jobId,
            orderSnapshotId: job.orderSnapshotId,
            stage: job.stage,
            stageLabel: job.stageLabel,
            progressLabel: job.progressLabel,
            productLabel: job.productLabel,
            inscription: job.inscription,
          }
        : null,
      site: job ? siteOfJob(job) : null,
    };
  };

  /** Quote branches (each with the job of its order), then the request's jobs reached without one of its quotes. */
  const branchesFor = (quotes: QuoteOverviewItem[], jobs: JobOverviewItem[]): CustomerHistoryBranch[] => {
    const sortedQuotes = [...quotes].sort((left, right) => byCreated(left, right, left.quoteSnapshotId, right.quoteSnapshotId));
    const branches = sortedQuotes.map((quote) =>
      branchOf(
        quote,
        quote.orderSnapshotId ? (jobs.find((job) => job.orderSnapshotId === quote.orderSnapshotId && !claimedJobs.has(job.jobId)) ?? null) : null,
      ),
    );
    const rest = jobs.filter((job) => !claimedJobs.has(job.jobId)).sort((left, right) => byCreated(left, right, left.jobId, right.jobId));
    return [...branches, ...rest.map((job) => branchOf(null, job))];
  };

  const buildProject = (request: RequestOverviewItem | null, branches: CustomerHistoryBranch[], entryId: string) => {
    const assigned = request ? assignment.get(`REQUEST:${request.requestId}`) : undefined;
    const jobIds = branches.flatMap((branch) => (branch.job ? [branch.job.jobId] : []));
    const documents = [
      ...(request ? documentsFor("REQUEST", request.requestId) : []),
      ...jobIds.flatMap((jobId) => documentsFor("JOB", jobId)),
    ].filter((item, index, all) => all.findIndex((other) => other.documentId === item.documentId) === index);
    const states: CustomerHistoryState[] = branches.length
      ? CUSTOMER_HISTORY_STATES.filter((state) => branches.some((branch) => branch.state === state))
      : [request?.status === "CANCELLED" ? "ANULAT" : "OFERTARE"];
    const single = states.length === 1 ? (states[0] ?? null) : null;
    const first = branches[0];
    const firstJob = first?.job ? input.jobs.find((job) => job.jobId === first.job?.jobId) : undefined;
    const eventDate = request?.createdAt ?? first?.quote?.createdAt ?? firstJob?.createdAt ?? "";
    const title =
      request?.title ??
      (first?.job ? `${first.job.productLabel}${first.job.inscription ? ` · ${first.job.inscription}` : ""}` : null) ??
      first?.quote?.reference ??
      "Proiect";
    // Without a site on the request, the project shows the site of its jobs when they agree.
    const jobSites = [...new Set(branches.flatMap((branch) => (branch.site ? [branch.site.siteId] : [])))];
    const site = assigned
      ? siteView(assigned.siteId, assigned.snapshot)
      : { site: jobSites.length === 1 ? (branches.find((branch) => branch.site)?.site ?? null) : null, siteAtTimeLabel: null };
    drafts.push({
      entryId,
      kind: "PROJECT",
      title,
      reference: request?.reference ?? first?.quote?.reference ?? null,
      eventDate,
      eventDateLabel: isoDateLabel(eventDate),
      year: Number(eventDate.slice(0, 4)),
      periodYears: eventDate ? [Number(eventDate.slice(0, 4))] : [],
      state: single,
      stateLabel: single ? customerHistoryStateLabel(single) : CUSTOMER_HISTORY_MIXED_STATE_LABEL,
      states,
      provenance: "WORKOS",
      provenanceLabel: "Înregistrat în WorkOS",
      ...site,
      description: null,
      request: request
        ? { requestId: request.requestId, reference: request.reference, title: request.title, statusLabel: request.statusLabel }
        : null,
      branches,
      historicalWorkId: null,
      documents,
      representativePhotoId: jobIds.length === 1 && jobIds[0] ? representativeOf("JOB", jobIds[0]).documentId : null,
      searchFields: [
        ["Titlu", title],
        ["Referință", request?.reference ?? null],
        ...branches.flatMap((branch): Array<[string, string | null]> => {
          const quote = branch.quote ? input.quotes.find((item) => item.quoteSnapshotId === branch.quote?.quoteSnapshotId) : undefined;
          const quoteFields: Array<[string, string | null]> = quote
            ? [
                [`Ofertă ${quote.reference}`, quote.reference],
                [`Ofertă ${quote.reference}`, quote.inscription],
                [`Ofertă ${quote.reference}`, quote.productLabel],
              ]
            : [];
          return [
            ...quoteFields,
            ["Lucrare", branch.job ? `${branch.job.productLabel} ${branch.job.inscription}` : null],
            ["Sediu", branch.site?.name ?? null],
          ];
        }),
        ...documents.flatMap(documentSearchFields),
      ],
    });
  };

  for (const request of input.requests) {
    const quotes = input.quotes.filter((quote) => quote.requestId === request.requestId && !claimedQuotes.has(quote.quoteSnapshotId));
    const orders = new Set(quotes.flatMap((quote) => (quote.orderSnapshotId ? [quote.orderSnapshotId] : [])));
    const jobs = input.jobs.filter((job) => !claimedJobs.has(job.jobId) && (job.requestId === request.requestId || orders.has(job.orderSnapshotId)));
    buildProject(request, branchesFor(quotes, jobs), `project:${request.requestId}`);
  }
  for (const quote of input.quotes) {
    if (claimedQuotes.has(quote.quoteSnapshotId)) continue;
    const jobs = input.jobs.filter((job) => !claimedJobs.has(job.jobId) && quote.orderSnapshotId !== null && job.orderSnapshotId === quote.orderSnapshotId);
    buildProject(null, branchesFor([quote], jobs), `project:${quote.quoteSnapshotId}`);
  }
  for (const job of input.jobs) {
    if (claimedJobs.has(job.jobId)) continue;
    buildProject(null, branchesFor([], [job]), `project:${job.jobId}`);
  }

  for (const work of input.historicalWorks) {
    const documents = documentsFor("HISTORICAL_WORK", work.workId);
    drafts.push({
      entryId: `historical:${work.workId}`,
      kind: "HISTORICAL_WORK",
      title: work.title,
      reference: work.reference,
      eventDate: work.eventDate,
      eventDateLabel: formatPartialDatePeriod(work.eventDate, work.eventDateEnd),
      year: partialDateYear(work.eventDate),
      periodYears: yearsBetween(partialDateYear(work.eventDate), partialDateYear(work.eventDateEnd ?? work.eventDate)),
      state: "FINALIZAT",
      stateLabel: customerHistoryStateLabel("FINALIZAT"),
      states: ["FINALIZAT"],
      provenance: "HISTORICAL_RECORD",
      provenanceLabel: HISTORICAL_WORK_PROVENANCE_LABEL,
      ...siteView(work.siteId, work.siteSnapshot),
      description: work.description,
      request: null,
      branches: [],
      historicalWorkId: work.workId,
      documents,
      representativePhotoId: representativeOf("HISTORICAL_WORK", work.workId, documents).documentId,
      searchFields: [
        ["Titlu", work.title],
        ["Referință", work.reference],
        ["Descriere", work.description],
        ...documents.flatMap(documentSearchFields),
      ],
    });
  }

  for (const document of input.documents) {
    const links = input.documentLinks.get(document.documentId) ?? [];
    if (links.some((link) => link.kind !== "SITE")) continue;
    const projected = projectedDocuments.get(document.documentId);
    if (!projected) continue;
    const siteLink = links.find((link) => link.kind === "SITE");
    const eventDate = document.documentDate ?? document.uploadedAt;
    drafts.push({
      entryId: `document:${document.documentId}`,
      kind: "DOCUMENT",
      title: document.title,
      reference: document.documentNumber,
      eventDate,
      eventDateLabel: isoDateLabel(eventDate),
      year: Number(eventDate.slice(0, 4)),
      periodYears: document.documentDate ? [Number(document.documentDate.slice(0, 4))] : [],
      state: null,
      stateLabel: projected.kindLabel,
      states: [],
      provenance: "UPLOAD",
      provenanceLabel: "Document încărcat",
      ...siteView(siteLink?.subjectId ?? null, null),
      description: document.description,
      request: null,
      branches: [],
      historicalWorkId: null,
      documents: [projected],
      representativePhotoId: null,
      searchFields: documentSearchFields(projected),
    });
  }

  // Every word typed must be found in the same entry; order, case, spaces and diacritics do not matter.
  const terms = searchTermsOf(query.text);
  const matched: CustomerHistoryEntry[] = [];
  for (const draft of drafts) {
    const { searchFields, periodYears, ...entry } = draft;
    const siteName = entry.site?.name ?? null;
    const reasons = terms.length ? matchSearchTerms(terms, [["Sediu", siteName], ...searchFields], periodYears) : [];
    if (reasons === null) continue;
    matched.push({
      ...entry,
      photoCount: entry.documents.filter((document) => document.kind === "PHOTO").length,
      matchedOn: reasons,
    });
  }

  const sortKey = (entry: CustomerHistoryEntry) =>
    entry.kind === "HISTORICAL_WORK" ? partialDateSortKey(entry.eventDate) : entry.eventDate;
  matched.sort((left, right) => sortKey(right).localeCompare(sortKey(left)) || left.entryId.localeCompare(right.entryId));

  type Dimension = "year" | "site" | "state" | "provenance";
  const atSite = (entry: CustomerHistoryEntry, siteId: string) =>
    entry.site?.siteId === siteId || entry.branches.some((branch) => branch.site?.siteId === siteId);
  const passes = (entry: CustomerHistoryEntry, skip: Dimension | null) =>
    (skip === "year" || query.year === null || entry.year === query.year) &&
    (skip === "site" || query.siteId === null || atSite(entry, query.siteId)) &&
    (skip === "state" || query.state === null || entry.states.includes(query.state)) &&
    (skip === "provenance" || query.provenance === null || entry.provenance === query.provenance);
  const filtered = matched.filter((entry) => passes(entry, null));
  const facetBase = (skip: Dimension) => matched.filter((entry) => passes(entry, skip));
  const yearBase = facetBase("year");
  const siteBase = facetBase("site");
  const stateBase = facetBase("state");
  const provenanceBase = facetBase("provenance");
  const pageCount = Math.max(1, Math.ceil(filtered.length / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const start = (page - 1) * query.pageSize;

  const allEntries = drafts;
  return {
    query: { ...query, page },
    total: filtered.length,
    page,
    pageCount,
    entries: filtered.slice(start, start + query.pageSize),
    facets: {
      years: [...new Set(allEntries.map((entry) => entry.year).filter((year) => Number.isFinite(year)))].sort((a, b) => b - a),
      yearCounts: [...new Set(allEntries.map((entry) => entry.year).filter((year) => Number.isFinite(year)))]
        .sort((a, b) => b - a)
        .map((year) => ({ year, count: yearBase.filter((entry) => entry.year === year).length })),
      states: CUSTOMER_HISTORY_STATES.map((state) => ({
        state,
        label: customerHistoryStateLabel(state),
        count: stateBase.filter((entry) => entry.states.includes(state)).length,
      })),
      provenances: CUSTOMER_HISTORY_PROVENANCES.map((provenance) => ({
        provenance,
        label: customerHistoryProvenanceLabel(provenance),
        count: provenanceBase.filter((entry) => entry.provenance === provenance).length,
      })),
      sites: [...input.sites]
        .sort((left, right) => (left.status === right.status ? left.name.localeCompare(right.name, "ro") : left.status === "ACTIVE" ? -1 : 1))
        .map((site) => ({ siteId: site.siteId, name: site.name, active: site.status === "ACTIVE", count: siteBase.filter((entry) => atSite(entry, site.siteId)).length })),
    },
    totals: {
      entries: allEntries.length,
      projects: allEntries.filter((entry) => entry.kind === "PROJECT").length,
      uploads: allEntries.filter((entry) => entry.provenance === "UPLOAD").length,
      historicalWorks: input.historicalWorks.length,
      documents: input.documents.filter((document) => document.kind !== "PHOTO").length,
      photos: input.documents.filter((document) => document.kind === "PHOTO").length,
    },
  };
}
