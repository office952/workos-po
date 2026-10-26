import { asBoolean, asNumber, asRecord, asString } from "./record";

/** N-020 · presentation models of the customer dossier, read from the server projections only. */
export type Option = { value: string; label: string };

export type DossierDocument = {
  documentId: string;
  title: string;
  kind: string;
  kindLabel: string;
  photoStage: string | null;
  photoStageLabel: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  description: string | null;
  originalFileName: string;
  sizeBytes: number;
  preview: "IMAGE" | "PDF" | "NONE";
  uploadedAt: string;
  revision: number;
  links: Array<{ kind: string; kindLabel: string; subjectId: string; label: string }>;
  viewHref: string;
  downloadHref: string;
};

export type DossierSite = {
  siteId: string;
  name: string;
  address: string | null;
  city: string | null;
  contactName: string | null;
  phone: string | null;
  accessNotes: string | null;
  status: "ACTIVE" | "INACTIVE";
  statusLabel: string;
  revision: number;
  usage: { requests: number; jobs: number; historicalWorks: number; documents: number };
};

export type DossierLinkTarget = { subjectId: string; label: string };

export type CustomerDossierModel = {
  customerId: string;
  permissions: Record<"read" | "editSites" | "uploadDocuments" | "editDocuments" | "recordHistoricalWork" | "editCommercialTerms", boolean>;
  vocabulary: { documentKinds: Option[]; photoStages: Option[]; historyStates: Option[]; maxFileBytes: number };
  sites: DossierSite[];
  siteAssignments: Array<{ subjectKind: "REQUEST" | "JOB"; subjectId: string; siteId: string }>;
  documents: DossierDocument[];
  historicalWorks: Array<{ workId: string; title: string; eventDate: string; eventDateEnd: string | null; reference: string | null; description: string | null; siteId: string | null; revision: number }>;
  linkTargets: { requests: DossierLinkTarget[]; jobs: DossierLinkTarget[]; historicalWorks: DossierLinkTarget[]; sites: DossierLinkTarget[] };
};

export type HistoryBranch = {
  branchId: string;
  state: string;
  stateLabel: string;
  quote: { quoteSnapshotId: string; kind: "PRODUCT" | "ASSEMBLY"; productCode: string; reference: string; stageLabel: string; superseded: boolean } | null;
  orderSnapshotId: string | null;
  job: { jobId: string; stageLabel: string; progressLabel: string | null; productLabel: string; inscription: string } | null;
  site: { siteId: string; name: string; line: string; active: boolean } | null;
};

export type HistoryEntry = {
  entryId: string;
  kind: "PROJECT" | "HISTORICAL_WORK" | "DOCUMENT";
  title: string;
  reference: string | null;
  eventDateLabel: string;
  year: number;
  state: string | null;
  stateLabel: string;
  provenance: string;
  provenanceLabel: string;
  site: { siteId: string; name: string; line: string; active: boolean } | null;
  siteAtTimeLabel: string | null;
  description: string | null;
  request: { requestId: string; reference: string; title: string; statusLabel: string } | null;
  /** Distinct states of the entry's branches (or of the work); the filter matches any of them. */
  states: string[];
  branches: HistoryBranch[];
  historicalWorkId: string | null;
  documents: DossierDocument[];
  photoCount: number;
  matchedOn: string[];
};

export type CustomerHistoryModel = {
  total: number;
  page: number;
  pageCount: number;
  entries: HistoryEntry[];
  /** Server facet counts: each value counts the entries matching every other active filter. */
  facets: {
    years: number[];
    yearCounts: Array<{ year: number; count: number }>;
    states: Array<{ state: string; label: string; count: number }>;
    provenances: Array<{ provenance: string; label: string; count: number }>;
    sites: Array<{ siteId: string; name: string; active: boolean; count: number }>;
  };
  /** The whole history of the client, independent of filters. */
  totals: { entries: number; projects: number; historicalWorks: number; uploads: number; documents: number; photos: number };
};

export type CommercialTermsModel = {
  revision: number;
  recordedAt: string | null;
  fields: Record<string, string | number | null>;
  labels: Record<string, string>;
  currencies: string[];
  referenceDocument: { documentId: string; title: string; documentNumber: string | null } | null;
  revisions: Array<{ revision: number; recordedAt: string }>;
  canEdit: boolean;
  notice: string;
};

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);

function options(value: unknown): Option[] {
  return list(value).flatMap((item) => {
    const record = asRecord(item);
    const optionValue = asString(record?.value);
    return optionValue ? [{ value: optionValue, label: text(record?.label, optionValue) }] : [];
  });
}

function linkTargets(value: unknown): DossierLinkTarget[] {
  return list(value).flatMap((item) => {
    const record = asRecord(item);
    const subjectId = asString(record?.subjectId);
    return subjectId ? [{ subjectId, label: text(record?.label, subjectId) }] : [];
  });
}

export function presentDossierDocument(value: unknown): DossierDocument | null {
  const record = asRecord(value);
  const documentId = asString(record?.documentId);
  if (!record || !documentId) return null;
  const preview = record.preview === "IMAGE" || record.preview === "PDF" ? record.preview : "NONE";
  return {
    documentId,
    title: text(record.title, "Document"),
    kind: text(record.kind),
    kindLabel: text(record.kindLabel),
    photoStage: asString(record.photoStage),
    photoStageLabel: asString(record.photoStageLabel),
    documentNumber: asString(record.documentNumber),
    documentDate: asString(record.documentDate),
    description: asString(record.description),
    originalFileName: text(record.originalFileName),
    sizeBytes: asNumber(record.sizeBytes) ?? 0,
    preview,
    uploadedAt: text(record.uploadedAt),
    revision: asNumber(record.revision) ?? 1,
    links: list(record.links).flatMap((item) => {
      const link = asRecord(item);
      const kind = asString(link?.kind);
      const subjectId = asString(link?.subjectId);
      return kind && subjectId ? [{ kind, subjectId, kindLabel: text(link?.kindLabel, kind), label: text(link?.label) }] : [];
    }),
    viewHref: text(record.viewHref),
    downloadHref: text(record.downloadHref),
  };
}

export function presentSite(value: unknown): DossierSite | null {
  const record = asRecord(value);
  const siteId = asString(record?.siteId);
  if (!record || !siteId) return null;
  const usage = asRecord(record.usage);
  return {
    siteId,
    name: text(record.name, "Sediu"),
    address: asString(record.address),
    city: asString(record.city),
    contactName: asString(record.contactName),
    phone: asString(record.phone),
    accessNotes: asString(record.accessNotes),
    status: record.status === "INACTIVE" ? "INACTIVE" : "ACTIVE",
    statusLabel: text(record.statusLabel),
    revision: asNumber(record.revision) ?? 1,
    usage: {
      requests: asNumber(usage?.requests) ?? 0,
      jobs: asNumber(usage?.jobs) ?? 0,
      historicalWorks: asNumber(usage?.historicalWorks) ?? 0,
      documents: asNumber(usage?.documents) ?? 0,
    },
  };
}

export function presentCustomerDossier(payload: unknown): CustomerDossierModel | null {
  const dossier = asRecord(asRecord(payload)?.dossier);
  const customerId = asString(dossier?.customerId);
  if (!dossier || !customerId) return null;
  const permissions = asRecord(dossier.permissions);
  const vocabulary = asRecord(dossier.vocabulary);
  const targets = asRecord(dossier.linkTargets);
  const can = (key: string) => asBoolean(permissions?.[key]) === true;
  return {
    customerId,
    permissions: {
      read: can("read"),
      editSites: can("editSites"),
      uploadDocuments: can("uploadDocuments"),
      editDocuments: can("editDocuments"),
      recordHistoricalWork: can("recordHistoricalWork"),
      editCommercialTerms: can("editCommercialTerms"),
    },
    vocabulary: {
      documentKinds: options(vocabulary?.documentKinds),
      photoStages: options(vocabulary?.photoStages),
      historyStates: options(vocabulary?.historyStates),
      maxFileBytes: asNumber(vocabulary?.maxFileBytes) ?? 0,
    },
    sites: list(dossier.sites).flatMap((item) => {
      const site = presentSite(item);
      return site ? [site] : [];
    }),
    siteAssignments: list(dossier.siteAssignments).flatMap((item) => {
      const record = asRecord(item);
      const subjectKind = record?.subjectKind === "REQUEST" || record?.subjectKind === "JOB" ? record.subjectKind : null;
      const subjectId = asString(record?.subjectId);
      const siteId = asString(record?.siteId);
      return subjectKind && subjectId && siteId ? [{ subjectKind, subjectId, siteId }] : [];
    }),
    documents: list(dossier.documents).flatMap((item) => {
      const document = presentDossierDocument(item);
      return document ? [document] : [];
    }),
    historicalWorks: list(dossier.historicalWorks).flatMap((item) => {
      const record = asRecord(item);
      const workId = asString(record?.workId);
      return record && workId
        ? [
            {
              workId,
              title: text(record.title),
              eventDate: text(record.eventDate),
              eventDateEnd: asString(record.eventDateEnd),
              reference: asString(record.reference),
              description: asString(record.description),
              siteId: asString(record.siteId),
              revision: asNumber(record.revision) ?? 1,
            },
          ]
        : [];
    }),
    linkTargets: {
      requests: linkTargets(targets?.requests),
      jobs: linkTargets(targets?.jobs),
      historicalWorks: linkTargets(targets?.historicalWorks),
      sites: linkTargets(targets?.sites),
    },
  };
}

export function presentCustomerHistory(payload: unknown): CustomerHistoryModel | null {
  const history = asRecord(asRecord(payload)?.history);
  if (!history) return null;
  const facets = asRecord(history.facets);
  const totals = asRecord(history.totals);
  return {
    total: asNumber(history.total) ?? 0,
    page: asNumber(history.page) ?? 1,
    pageCount: asNumber(history.pageCount) ?? 1,
    entries: list(history.entries).flatMap((item): HistoryEntry[] => {
      const record = asRecord(item);
      const entryId = asString(record?.entryId);
      if (!record || !entryId) return [];
      const kind = record.kind === "HISTORICAL_WORK" || record.kind === "DOCUMENT" ? record.kind : "PROJECT";
      const site = asRecord(record.site);
      const request = asRecord(record.request);
      return [
        {
          entryId,
          kind,
          title: text(record.title),
          reference: asString(record.reference),
          eventDateLabel: text(record.eventDateLabel),
          year: asNumber(record.year) ?? 0,
          state: asString(record.state),
          stateLabel: text(record.stateLabel),
          provenance: text(record.provenance),
          provenanceLabel: text(record.provenanceLabel),
          site: site && asString(site.siteId)
            ? { siteId: text(site.siteId), name: text(site.name), line: text(site.line), active: site.active !== false }
            : null,
          siteAtTimeLabel: asString(record.siteAtTimeLabel),
          description: asString(record.description),
          request: request && asString(request.requestId)
            ? { requestId: text(request.requestId), reference: text(request.reference), title: text(request.title), statusLabel: text(request.statusLabel) }
            : null,
          historicalWorkId: asString(record.historicalWorkId),
          states: list(record.states).filter((value): value is string => typeof value === "string"),
          branches: list(record.branches).flatMap((value): HistoryBranch[] => {
            const branch = asRecord(value);
            const branchId = asString(branch?.branchId);
            if (!branch || !branchId) return [];
            const quote = asRecord(branch.quote);
            const job = asRecord(branch.job);
            const branchSite = asRecord(branch.site);
            return [
              {
                branchId,
                state: text(branch.state),
                stateLabel: text(branch.stateLabel),
                quote: quote && asString(quote.quoteSnapshotId)
                  ? {
                      quoteSnapshotId: text(quote.quoteSnapshotId),
                      kind: quote.kind === "ASSEMBLY" ? "ASSEMBLY" : "PRODUCT",
                      productCode: text(quote.productCode),
                      reference: text(quote.reference),
                      stageLabel: text(quote.stageLabel),
                      superseded: quote.superseded === true,
                    }
                  : null,
                orderSnapshotId: asString(branch.orderSnapshotId),
                job: job && asString(job.jobId)
                  ? { jobId: text(job.jobId), stageLabel: text(job.stageLabel), progressLabel: asString(job.progressLabel), productLabel: text(job.productLabel), inscription: text(job.inscription) }
                  : null,
                site: branchSite && asString(branchSite.siteId)
                  ? { siteId: text(branchSite.siteId), name: text(branchSite.name), line: text(branchSite.line), active: branchSite.active !== false }
                  : null,
              },
            ];
          }),
          documents: list(record.documents).flatMap((value) => {
            const document = presentDossierDocument(value);
            return document ? [document] : [];
          }),
          photoCount: asNumber(record.photoCount) ?? 0,
          matchedOn: list(record.matchedOn).filter((value): value is string => typeof value === "string"),
        },
      ];
    }),
    facets: {
      years: list(facets?.years).filter((value): value is number => typeof value === "number"),
      yearCounts: list(facets?.yearCounts).flatMap((value) => {
        const record = asRecord(value);
        const year = asNumber(record?.year);
        return year ? [{ year, count: asNumber(record?.count) ?? 0 }] : [];
      }),
      states: list(facets?.states).flatMap((value) => {
        const record = asRecord(value);
        const state = asString(record?.state);
        return state ? [{ state, label: text(record?.label, state), count: asNumber(record?.count) ?? 0 }] : [];
      }),
      provenances: list(facets?.provenances).flatMap((value) => {
        const record = asRecord(value);
        const provenance = asString(record?.provenance);
        return provenance ? [{ provenance, label: text(record?.label, provenance), count: asNumber(record?.count) ?? 0 }] : [];
      }),
      sites: list(facets?.sites).flatMap((value) => {
        const record = asRecord(value);
        const siteId = asString(record?.siteId);
        return siteId ? [{ siteId, name: text(record?.name), active: record?.active !== false, count: asNumber(record?.count) ?? 0 }] : [];
      }),
    },
    totals: {
      entries: asNumber(totals?.entries) ?? 0,
      projects: asNumber(totals?.projects) ?? 0,
      historicalWorks: asNumber(totals?.historicalWorks) ?? 0,
      uploads: asNumber(totals?.uploads) ?? 0,
      documents: asNumber(totals?.documents) ?? 0,
      photos: asNumber(totals?.photos) ?? 0,
    },
  };
}

export function presentCommercialTerms(payload: unknown): CommercialTermsModel | null {
  const record = asRecord(payload);
  const fields = asRecord(record?.fields);
  const labels = asRecord(record?.labels);
  if (!record || !fields || !labels) return null;
  const terms = asRecord(record.terms);
  const reference = asRecord(record.referenceDocument);
  return {
    revision: asNumber(terms?.revision) ?? 0,
    recordedAt: asString(terms?.recordedAt),
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, typeof value === "number" || typeof value === "string" ? value : null]),
    ),
    labels: Object.fromEntries(Object.entries(labels).map(([key, value]) => [key, text(value, key)])),
    currencies: list(record.currencies).filter((value): value is string => typeof value === "string"),
    referenceDocument: reference && asString(reference.documentId)
      ? { documentId: text(reference.documentId), title: text(reference.title), documentNumber: asString(reference.documentNumber) }
      : null,
    revisions: list(record.revisions).flatMap((value) => {
      const item = asRecord(value);
      const revision = asNumber(item?.revision);
      return revision ? [{ revision, recordedAt: text(item?.recordedAt) }] : [];
    }),
    canEdit: record.canEdit === true,
    notice: text(record.notice),
  };
}

/**
 * One saved version of the commercial terms as the server sends it on its own (the `terms` of a
 * save or of a 409 `stale_revision`): the revision, when it was saved and the values of the fields
 * the page already knows. Null when the answer holds no version.
 */
export function presentCommercialTermsVersion(
  payload: unknown,
  fieldKeys: string[],
): { revision: number; recordedAt: string | null; fields: Record<string, string | number | null> } | null {
  const record = asRecord(payload);
  const revision = asNumber(record?.revision);
  if (!record || revision === null) return null;
  return {
    revision,
    recordedAt: asString(record.recordedAt),
    fields: Object.fromEntries(
      fieldKeys.map((key) => {
        const value = record[key];
        return [key, typeof value === "number" || typeof value === "string" ? value : null];
      }),
    ),
  };
}

export type WorkItem = {
  workId: string;
  provenance: "WORKOS" | "HISTORICAL_RECORD";
  provenanceLabel: string;
  title: string;
  detail: string | null;
  reference: string | null;
  eventDateLabel: string;
  year: number;
  state: string;
  stateLabel: string;
  site: { siteId: string; name: string; line: string; active: boolean } | null;
  siteAtTimeLabel: string | null;
  description: string | null;
  job: { jobId: string; stageLabel: string; progressLabel: string | null } | null;
  request: { requestId: string; reference: string; title: string } | null;
  quote: { quoteSnapshotId: string; reference: string } | null;
  historicalWorkId: string | null;
  documents: DossierDocument[];
  photoCount: number;
  /** GO 12 · the request photos, as context only, when the job has none of its own (server). */
  requestPhotos: { requestId: string; photos: DossierDocument[]; shared: boolean } | null;
  matchedOn: string[];
};

export type CustomerWorksModel = {
  total: number;
  page: number;
  pageCount: number;
  items: WorkItem[];
  totals: { all: number; workos: number; historical: number };
  /** Counts under the other active filters, from the server; null when the server sends none. */
  facets: {
    years: number[];
    yearCounts: Array<{ year: number; count: number | null }>;
    states: Array<{ state: string; label: string; count: number }>;
    sites: Array<{ siteId: string; name: string; active: boolean; count: number | null }>;
  };
};

export function presentCustomerWorks(payload: unknown): CustomerWorksModel | null {
  const works = asRecord(asRecord(payload)?.works);
  if (!works) return null;
  const totals = asRecord(works.totals);
  const facets = asRecord(works.facets);
  return {
    total: asNumber(works.total) ?? 0,
    page: asNumber(works.page) ?? 1,
    pageCount: asNumber(works.pageCount) ?? 1,
    items: list(works.items).flatMap((value): WorkItem[] => {
      const item = asRecord(value);
      const workId = asString(item?.workId);
      if (!item || !workId) return [];
      const site = asRecord(item.site);
      const job = asRecord(item.job);
      const request = asRecord(item.request);
      const quote = asRecord(item.quote);
      const requestPhotos = asRecord(item.requestPhotos);
      return [
        {
          workId,
          provenance: item.provenance === "HISTORICAL_RECORD" ? "HISTORICAL_RECORD" : "WORKOS",
          provenanceLabel: text(item.provenanceLabel),
          title: text(item.title),
          detail: asString(item.detail),
          reference: asString(item.reference),
          eventDateLabel: text(item.eventDateLabel),
          year: asNumber(item.year) ?? 0,
          state: text(item.state),
          stateLabel: text(item.stateLabel),
          site: site && asString(site.siteId) ? { siteId: text(site.siteId), name: text(site.name), line: text(site.line), active: site.active !== false } : null,
          siteAtTimeLabel: asString(item.siteAtTimeLabel),
          description: asString(item.description),
          job: job && asString(job.jobId) ? { jobId: text(job.jobId), stageLabel: text(job.stageLabel), progressLabel: asString(job.progressLabel) } : null,
          request: request && asString(request.requestId) ? { requestId: text(request.requestId), reference: text(request.reference), title: text(request.title) } : null,
          quote: quote && asString(quote.quoteSnapshotId) ? { quoteSnapshotId: text(quote.quoteSnapshotId), reference: text(quote.reference) } : null,
          historicalWorkId: asString(item.historicalWorkId),
          documents: list(item.documents).flatMap((entry) => {
            const document = presentDossierDocument(entry);
            return document ? [document] : [];
          }),
          photoCount: asNumber(item.photoCount) ?? 0,
          requestPhotos:
            requestPhotos && asString(requestPhotos.requestId)
              ? {
                  requestId: text(requestPhotos.requestId),
                  photos: list(requestPhotos.photos).flatMap((entry) => {
                    const document = presentDossierDocument(entry);
                    return document ? [document] : [];
                  }),
                  shared: requestPhotos.shared === true,
                }
              : null,
          matchedOn: list(item.matchedOn).filter((entry): entry is string => typeof entry === "string"),
        },
      ];
    }),
    totals: { all: asNumber(totals?.all) ?? 0, workos: asNumber(totals?.workos) ?? 0, historical: asNumber(totals?.historical) ?? 0 },
    facets: {
      years: list(facets?.years).filter((value): value is number => typeof value === "number"),
      yearCounts: list(facets?.yearCounts).flatMap((value) => {
        const record = asRecord(value);
        const year = asNumber(record?.year);
        return year !== null && year !== undefined ? [{ year, count: asNumber(record?.count) ?? null }] : [];
      }),
      states: list(facets?.states).flatMap((value) => {
        const record = asRecord(value);
        const state = asString(record?.state);
        return state ? [{ state, label: text(record?.label, state), count: asNumber(record?.count) ?? 0 }] : [];
      }),
      sites: list(facets?.sites).flatMap((value) => {
        const record = asRecord(value);
        const siteId = asString(record?.siteId);
        return siteId ? [{ siteId, name: text(record?.name), active: record?.active !== false, count: asNumber(record?.count) ?? null }] : [];
      }),
    },
  };
}
