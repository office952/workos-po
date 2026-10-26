import { describe, expect, it } from "vitest";
import type { JobOverviewItem, JobStage } from "../jobs/overview.js";
import type { QuoteOverviewItem, QuoteOverviewStage } from "../quotes/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import type { CustomerDocument, CustomerDocumentLink } from "./documents.js";
import type { HistoricalWork } from "./historicalWorks.js";
import { projectCustomerHistory, readCustomerHistoryQuery, type CustomerHistoryInput } from "./history.js";
import { projectCustomerWorks, readCustomerWorksQuery } from "./works.js";

/**
 * Owner decision (N-020): on the client page "Lucrări" means every work of the client — WorkOS
 * jobs and historical records, each once. Requests, quotes and loose documents are not works.
 */
const request = (requestId: string, title: string): RequestOverviewItem =>
  ({ requestId, reference: `CER-${requestId}`, customerId: "c", title, createdAt: "2026-10-01T08:00:00.000Z", status: "NEW", statusLabel: "Nouă" }) as unknown as RequestOverviewItem;
const quote = (id: string, requestId: string | null, stage: QuoteOverviewStage, orderSnapshotId: string | null): QuoteOverviewItem =>
  ({ quoteSnapshotId: id, kind: "PRODUCT", productCode: "P", productLabel: "Litere", inscription: id.toUpperCase(), reference: `OF-${id}`, requestId, customerId: "c", createdAt: "2026-10-02T08:00:00.000Z", stage, stageLabel: stage, superseded: false, orderSnapshotId }) as unknown as QuoteOverviewItem;
const job = (jobId: string, requestId: string | null, orderSnapshotId: string, stage: JobStage, createdAt = "2026-10-03T08:00:00.000Z"): JobOverviewItem =>
  ({ jobId, requestId, orderSnapshotId, stage, stageLabel: stage, productLabel: "Litere", inscription: jobId.toUpperCase(), progressLabel: null, createdAt }) as unknown as JobOverviewItem;
const work = (workId: string, eventDate: string, title = `Lucrare ${workId}`): HistoricalWork => ({
  workId,
  customerId: "c",
  siteId: null,
  siteSnapshot: null,
  title,
  reference: null,
  description: null,
  eventDate,
  eventDateEnd: null,
  provenance: "HISTORICAL_RECORD",
  recordedAt: "2026-10-23T00:00:00.000Z",
  recordedByAccountId: "a",
  updatedAt: "2026-10-23T00:00:00.000Z",
  revision: 1,
});
const document = (documentId: string): CustomerDocument => ({
  documentId,
  customerId: "c",
  kind: "INVOICE",
  photoStage: null,
  title: `Factură ${documentId}`,
  documentNumber: `F-${documentId}`,
  documentDate: null,
  description: null,
  originalFileName: `${documentId}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 1,
  sha256: "x",
  storageKey: documentId,
  uploadedAt: "2026-10-23T00:00:00.000Z",
  uploadedByAccountId: "a",
  revision: 1,
});

function input(parts: Partial<CustomerHistoryInput>): CustomerHistoryInput {
  return { requests: [], quotes: [], jobs: [], historicalWorks: [], documents: [], documentLinks: new Map(), sites: [], siteAssignments: [], documentContentHref: (id) => `/doc/${id}`, ...parts };
}
const works = (data: CustomerHistoryInput, params: Record<string, string> = {}) => projectCustomerWorks(data, readCustomerWorksQuery({ pageSize: "50", ...params }));

// The Alpha Clima shape: two WorkOS jobs, three historical works, a request with two open quotes.
const alpha = input({
  requests: [request("showroom", "Showroom"), request("receptie", "Recepție"), request("depozit", "Depozit")],
  quotes: [quote("q1", "showroom", "ORDER_CREATED", "o1"), quote("q2", "receptie", "ORDER_CREATED", "o2"), quote("q3", "depozit", "QUOTE_CREATED", null), quote("q4", "depozit", "QUOTE_CREATED", null)],
  jobs: [job("j1", "showroom", "o1", "EXECUTION_COMPLETED", "2026-10-05T06:30:00.000Z"), job("j2", "receptie", "o2", "EXECUTION_IN_PROGRESS", "2026-10-23T13:46:00.000Z")],
  historicalWorks: [work("h2021", "2021-06", "Litere depozit 2021"), work("h2025", "2025-11-12"), work("h2026", "2026-03-20")],
  documents: [document("d1"), document("d2"), document("loose")],
  documentLinks: new Map<string, CustomerDocumentLink[]>([
    ["d1", [{ kind: "HISTORICAL_WORK", subjectId: "h2021", linkedAt: "x" }]],
    ["d2", [{ kind: "JOB", subjectId: "j1", linkedAt: "x" }]],
  ]),
});

describe("customer works collection", () => {
  it("lists two WorkOS jobs and three historical works as five works; open quotes are not works", () => {
    const all = works(alpha);
    expect(all.totals).toEqual({ all: 5, workos: 2, historical: 3 });
    expect(all.total).toBe(5);
    expect(all.items.map((item) => item.workId)).toEqual(["job:j2", "job:j1", "historical:h2026", "historical:h2025", "historical:h2021"]);
    expect(all.items.map((item) => item.provenanceLabel)).toEqual(["În WorkOS", "În WorkOS", "Înregistrare istorică", "Înregistrare istorică", "Înregistrare istorică"]);
    // The history keeps the wider view: three projects, three historical works, one loose document.
    expect(projectCustomerHistory(alpha, readCustomerHistoryQuery({ pageSize: "50" })).total).toBe(7);
  });

  it("a request with two jobs contributes two distinct works, each once", () => {
    const data = input({
      requests: [request("r1", "Casetă")],
      quotes: [quote("q1", "r1", "ORDER_CREATED", "o1"), quote("q2", "r1", "ORDER_CREATED", "o2"), quote("q3", "r1", "QUOTE_CREATED", null)],
      jobs: [job("j1", "r1", "o1", "ORDER_CREATED"), job("j2", null, "o2", "RELEASED")],
    });
    const all = works(data);
    expect(all.totals.all).toBe(2);
    expect(all.items.map((item) => [item.job?.jobId, item.quote?.reference, item.request?.requestId, item.state])).toEqual([
      ["j1", "OF-q1", "r1", "COMANDA_CREATA"],
      ["j2", "OF-q2", "r1", "ELIBERATA"],
    ]);
  });

  it("filters by provenance, year, state and text, and reports results out of the full total", () => {
    const historical = works(alpha, { kind: "HISTORICAL" });
    expect(historical.total).toBe(3);
    expect(historical.totals.all).toBe(5);
    expect(works(alpha, { kind: "HISTORICAL", year: "2021" }).items.map((item) => item.title)).toEqual(["Litere depozit 2021"]);
    expect(works(alpha, { kind: "WORKOS" }).items.map((item) => item.job?.jobId)).toEqual(["j2", "j1"]);
    expect(works(alpha, { state: "IN_EXECUTIE" }).items.map((item) => item.workId)).toEqual(["job:j2"]);
    expect(works(alpha, { state: "FINALIZAT" }).items.map((item) => item.workId)).toEqual(["job:j1", "historical:h2026", "historical:h2025", "historical:h2021"]);
    expect(works(alpha, { q: "F-d1" }).items.map((item) => item.workId)).toEqual(["historical:h2021"]);
  });

  it("serves the same documents for a work in Istoric and in Lucrări", () => {
    const fromWorks = works(alpha).items.find((item) => item.workId === "historical:h2021");
    const fromHistory = projectCustomerHistory(alpha, readCustomerHistoryQuery({ pageSize: "50" })).entries.find((entry) => entry.historicalWorkId === "h2021");
    expect(fromWorks?.documents.map((item) => item.documentId)).toEqual(["d1"]);
    expect(fromWorks?.documents).toEqual(fromHistory?.documents);
    const jobDocs = works(alpha).items.find((item) => item.workId === "job:j1")?.documents.map((item) => item.documentId);
    expect(jobDocs).toEqual(["d2"]);
  });

  it("pages deterministically and keeps counts coherent", () => {
    const page1 = works(alpha, { pageSize: "2" });
    const page2 = works(alpha, { pageSize: "2", page: "2" });
    const page3 = works(alpha, { pageSize: "2", page: "3" });
    expect(page1.pageCount).toBe(3);
    expect([...page1.items, ...page2.items, ...page3.items].map((item) => item.workId)).toEqual(works(alpha).items.map((item) => item.workId));
    expect(page2.totals.all).toBe(5);
  });

  it("covers a client without works and a client with only historical works", () => {
    const none = works(input({ requests: [request("r1", "Doar cerere")], quotes: [quote("q1", "r1", "QUOTE_CREATED", null)] }));
    expect(none.totals).toEqual({ all: 0, workos: 0, historical: 0 });
    expect(none.items).toEqual([]);
    const onlyHistorical = works(input({ historicalWorks: [work("h1", "2019"), work("h2", "2021-06-14")] }));
    expect(onlyHistorical.totals).toEqual({ all: 2, workos: 0, historical: 2 });
    expect(onlyHistorical.items.map((item) => item.provenance)).toEqual(["HISTORICAL_RECORD", "HISTORICAL_RECORD"]);
  });

  it("GO 12 · counts each year, site and state under the other active filters, never past the list", () => {
    const sited = input({
      ...alpha,
      sites: [{ siteId: "s1", customerId: "c", name: "Depozit", address: null, city: null, contactName: null, phone: null, accessNotes: null, status: "ACTIVE", createdAt: "x", updatedAt: "x", revision: 1 }] as unknown as CustomerHistoryInput["sites"],
      historicalWorks: [{ ...work("h2021", "2021-06", "Litere depozit 2021"), siteId: "s1" }, work("h2025", "2025-11-12"), { ...work("h2026", "2026-03-20"), siteId: "s1" }],
    });
    const all = works(sited);
    // Without filters, the year counts add up to the collection and match the list.
    expect(all.facets.yearCounts).toEqual([{ year: 2026, count: 3 }, { year: 2025, count: 1 }, { year: 2021, count: 1 }]);
    expect(all.facets.yearCounts.reduce((sum, item) => sum + item.count, 0)).toBe(all.total);
    expect(all.facets.sites.find((site) => site.siteId === "s1")?.count).toBe(2);
    // Under a provenance filter, every count follows it; the own dimension is left out.
    const historical = works(sited, { kind: "HISTORICAL" });
    expect(historical.facets.yearCounts).toEqual([{ year: 2026, count: 1 }, { year: 2025, count: 1 }, { year: 2021, count: 1 }]);
    const inSite = works(sited, { kind: "HISTORICAL", site: "s1" });
    expect(inSite.total).toBe(2);
    expect(inSite.facets.yearCounts).toEqual([{ year: 2026, count: 1 }, { year: 2025, count: 0 }, { year: 2021, count: 1 }]);
    expect(inSite.facets.sites.find((site) => site.siteId === "s1")?.count).toBe(2);
    // A chosen year: its own count equals the list total.
    const year = works(sited, { year: "2026" });
    expect(year.facets.yearCounts.find((item) => item.year === 2026)?.count).toBe(year.total);
    expect(works(sited, { state: "IN_EXECUTIE" }).facets.states.find((item) => item.state === "FINALIZAT")?.count).toBe(4);
    // The text search narrows the counts as well.
    expect(works(sited, { q: "F-d1" }).facets.yearCounts).toEqual([{ year: 2026, count: 0 }, { year: 2025, count: 0 }, { year: 2021, count: 1 }]);
  });

  it("GO 12 · a job without its own photo carries its request photos as context, shared when the request has several jobs", () => {
    const photo = (id: string): CustomerDocument => ({ ...document(id), kind: "PHOTO", photoStage: "BEFORE", title: `Foto ${id}`, mimeType: "image/png" });
    const single = input({
      requests: [request("r1", "Recepție")],
      quotes: [quote("q1", "r1", "ORDER_CREATED", "o1")],
      jobs: [job("j1", "r1", "o1", "EXECUTION_IN_PROGRESS")],
      documents: [photo("p1")],
      documentLinks: new Map<string, CustomerDocumentLink[]>([["p1", [{ kind: "REQUEST", subjectId: "r1", linkedAt: "x" }]]]),
    });
    const item = works(single).items[0]!;
    // The photo stays attached to the request: it is not among the documents of the job.
    expect(item.documents).toEqual([]);
    expect(item.photoCount).toBe(0);
    expect(item.requestPhotos).toMatchObject({ requestId: "r1", shared: false });
    expect(item.requestPhotos?.photos.map((entry) => entry.documentId)).toEqual(["p1"]);
    // Two jobs on one request: the photos cannot be read as either job's.
    const branches = input({
      ...single,
      quotes: [quote("q1", "r1", "ORDER_CREATED", "o1"), quote("q2", "r1", "ORDER_CREATED", "o2")],
      jobs: [job("j1", "r1", "o1", "EXECUTION_IN_PROGRESS"), job("j2", null, "o2", "RELEASED")],
    });
    expect(works(branches).items.map((entry) => entry.requestPhotos?.shared)).toEqual([true, true]);
    // A job with its own photo needs no context.
    const own = input({ ...single, documentLinks: new Map<string, CustomerDocumentLink[]>([["p1", [{ kind: "REQUEST", subjectId: "r1", linkedAt: "x" }, { kind: "JOB", subjectId: "j1", linkedAt: "x" }]]]) });
    expect(works(own).items[0]?.requestPhotos).toBeNull();
    // Historical works have no request.
    expect(works(alpha).items.filter((entry) => entry.provenance === "HISTORICAL_RECORD").every((entry) => entry.requestPhotos === null)).toBe(true);
  });
});
