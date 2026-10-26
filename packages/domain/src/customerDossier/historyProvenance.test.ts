import { describe, expect, it } from "vitest";
import type { QuoteOverviewItem } from "../quotes/overview.js";
import type { RequestOverviewItem } from "../requests/overview.js";
import type { CustomerDocument, CustomerDocumentLink } from "./documents.js";
import type { HistoricalWork } from "./historicalWorks.js";
import { projectCustomerHistory, readCustomerHistoryQuery, type CustomerHistoryInput } from "./history.js";
import type { CustomerSite } from "./sites.js";

/**
 * N-020 · provenance filter (WorkOS / historical record / uploaded document) and the meaning of
 * the facet counts: every filter combines with AND; a facet value counts the entries that match all
 * active filters except its own dimension.
 */
const site = (siteId: string, name: string): CustomerSite => ({
  siteId,
  customerId: "c",
  name,
  address: null,
  city: null,
  contactName: null,
  phone: null,
  accessNotes: null,
  status: "ACTIVE",
  revision: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const request = (requestId: string, title: string): RequestOverviewItem =>
  ({ requestId, reference: `CER-${requestId}`, customerId: "c", title, createdAt: "2026-10-01T08:00:00.000Z", status: "NEW", statusLabel: "Nouă" }) as unknown as RequestOverviewItem;

const quote = (quoteSnapshotId: string, requestId: string): QuoteOverviewItem =>
  ({ quoteSnapshotId, kind: "PRODUCT", productCode: "P", productLabel: "Casetă", inscription: "X", reference: `OF-${quoteSnapshotId}`, requestId, customerId: "c", createdAt: "2026-10-02T08:00:00.000Z", stage: "QUOTE_CREATED", stageLabel: "Creată", superseded: false, orderSnapshotId: null }) as unknown as QuoteOverviewItem;

const work = (workId: string, title: string, eventDate: string, siteId: string | null): HistoricalWork =>
  ({ workId, customerId: "c", siteId, siteSnapshot: null, title, reference: null, description: null, eventDate, eventDateEnd: null, provenance: "HISTORICAL_RECORD", recordedAt: "2026-10-20T00:00:00.000Z", recordedByAccountId: "a", updatedAt: "2026-10-20T00:00:00.000Z", revision: 1 }) as unknown as HistoricalWork;

const document = (documentId: string, title: string, documentDate: string): CustomerDocument =>
  ({ documentId, customerId: "c", title, kind: "CONTRACT", photoStage: null, documentNumber: null, documentDate, description: null, originalFileName: `${documentId}.pdf`, mimeType: "application/pdf", sizeBytes: 10, sha256: "x", storageKey: "k", uploadedAt: "2026-10-20T00:00:00.000Z", uploadedByAccountId: "a", revision: 1 }) as unknown as CustomerDocument;

const link = (kind: CustomerDocumentLink["kind"], subjectId: string): CustomerDocumentLink => ({ kind, subjectId, linkedAt: "2026-10-20T00:00:00.000Z" });

const data: CustomerHistoryInput = {
  requests: [request("r1", "Casetă depozit")],
  quotes: [quote("q1", "r1")],
  jobs: [],
  historicalWorks: [work("h1", "Litere 2021", "2021-06", "s1"), work("h2", "Autocolant", "2025-11", "s2")],
  documents: [document("d1", "Contract-cadru", "2025-10-15"), document("d2", "Act adițional", "2026-09-30"), document("d3", "Factură 2021", "2021-07-02")],
  documentLinks: new Map([
    // d2 belongs to a site only: still an uploaded document of its own. d3 belongs to the 2021 work.
    ["d2", [link("SITE", "s1")]],
    ["d3", [link("HISTORICAL_WORK", "h1")]],
  ]),
  sites: [site("s1", "Depozit"), site("s2", "Showroom")],
  siteAssignments: [{ subjectKind: "REQUEST", subjectId: "r1", siteId: "s1", snapshot: { siteId: "s1", name: "Depozit", address: null, city: null } }],
  documentContentHref: (id) => `/doc/${id}`,
};

const run = (params: Record<string, string> = {}) => projectCustomerHistory(data, readCustomerHistoryQuery({ pageSize: "50", ...params }));
const facet = <T extends { count: number }>(items: readonly T[], pick: (item: T) => boolean) => items.find(pick)?.count;

describe("history provenance", () => {
  it("every entry has exactly one provenance; uploaded documents have no state", () => {
    const history = run();
    expect(history.total).toBe(5);
    expect(history.totals).toMatchObject({ entries: 5, projects: 1, historicalWorks: 2, uploads: 2 });
    const uploads = history.entries.filter((entry) => entry.provenance === "UPLOAD");
    expect(uploads.map((entry) => entry.title).sort()).toEqual(["Act adițional", "Contract-cadru"]);
    for (const entry of uploads) {
      expect(entry.state).toBeNull();
      expect(entry.states).toEqual([]);
    }
    expect(history.facets.provenances).toEqual([
      { provenance: "WORKOS", label: "În WorkOS", count: 1 },
      { provenance: "HISTORICAL_RECORD", label: "Înregistrare istorică", count: 2 },
      { provenance: "UPLOAD", label: "Document încărcat", count: 2 },
    ]);
  });

  it("filters by provenance and ignores an unknown value", () => {
    expect(run({ provenance: "UPLOAD" }).entries.map((entry) => entry.title).sort()).toEqual(["Act adițional", "Contract-cadru"]);
    expect(run({ provenance: "HISTORICAL_RECORD" }).total).toBe(2);
    expect(run({ provenance: "WORKOS" }).entries.map((entry) => entry.kind)).toEqual(["PROJECT"]);
    const unknown = run({ provenance: "SOMETHING" });
    expect(unknown.query.provenance).toBeNull();
    expect(unknown.total).toBe(5);
  });

  it("filters combine with AND; a facet ignores only its own dimension", () => {
    const depozit = run({ site: "s1" });
    // At the Depozit site: the project, the 2021 work and the site-only document.
    expect(depozit.total).toBe(3);
    expect(facet(depozit.facets.provenances, (item) => item.provenance === "UPLOAD")).toBe(1);
    expect(facet(depozit.facets.provenances, (item) => item.provenance === "HISTORICAL_RECORD")).toBe(1);
    // The site facet does not narrow itself: Showroom still counts its own entry.
    expect(facet(depozit.facets.sites, (item) => item.siteId === "s2")).toBe(1);
    expect(facet(depozit.facets.sites, (item) => item.siteId === "s1")).toBe(3);

    const uploadsAtDepozit = run({ site: "s1", provenance: "UPLOAD" });
    expect(uploadsAtDepozit.entries.map((entry) => entry.title)).toEqual(["Act adițional"]);
    // The state facet under a provenance filter: documents have no state, so every count is 0.
    expect(uploadsAtDepozit.facets.states.every((item) => item.count === 0)).toBe(true);
    // Year counts follow the other filters too.
    expect(facet(run({ provenance: "HISTORICAL_RECORD" }).facets.yearCounts, (item) => item.year === 2021)).toBe(1);
    expect(facet(run({ provenance: "HISTORICAL_RECORD" }).facets.yearCounts, (item) => item.year === 2026)).toBe(0);
  });

  it("the state filter never finds an uploaded document", () => {
    const open = run({ state: "OFERTARE" });
    expect(open.entries.map((entry) => entry.provenance)).toEqual(["WORKOS"]);
    expect(facet(open.facets.provenances, (item) => item.provenance === "UPLOAD")).toBe(0);
  });
});
