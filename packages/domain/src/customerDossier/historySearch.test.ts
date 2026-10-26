import { describe, expect, it } from "vitest";
import type { CustomerDocument, CustomerDocumentLink } from "./documents.js";
import type { HistoricalWork } from "./historicalWorks.js";
import { projectCustomerHistory, readCustomerHistoryQuery, type CustomerHistoryInput } from "./history.js";
import type { CustomerSite } from "./sites.js";
import { projectCustomerWorks, readCustomerWorksQuery } from "./works.js";

/**
 * N-020 · the history text search reads every word typed: each one must be found in the searchable
 * information of the same entry (title, references, site, documents, and the documented period for
 * a year). Order, case, extra spaces and diacritics do not change the result. The year of an entry
 * is its documented period, never the day a file was uploaded; a period spanning years matches
 * every year from its start to its end, inclusive.
 */
const site = (siteId: string, name: string): CustomerSite =>
  ({ siteId, customerId: "c", name, address: null, city: null, contactName: null, phone: null, accessNotes: null, status: "ACTIVE", revision: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }) as unknown as CustomerSite;

const work = (workId: string, title: string, siteId: string | null, eventDate: string, eventDateEnd: string | null = null, reference: string | null = null): HistoricalWork => ({
  workId,
  customerId: "c",
  siteId,
  siteSnapshot: null,
  title,
  reference,
  description: null,
  eventDate,
  eventDateEnd,
  provenance: "HISTORICAL_RECORD",
  recordedAt: "2026-10-23T00:00:00.000Z",
  recordedByAccountId: "a",
  updatedAt: "2026-10-23T00:00:00.000Z",
  revision: 1,
});

const document = (documentId: string, title: string, kind: string, documentNumber: string | null, documentDate: string | null, uploadedAt: string): CustomerDocument =>
  ({
    documentId,
    customerId: "c",
    title,
    kind,
    photoStage: null,
    documentNumber,
    documentDate,
    description: null,
    originalFileName: `${documentId}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 1,
    uploadedAt,
    revision: 1,
  }) as unknown as CustomerDocument;

const link = (kind: CustomerDocumentLink["kind"], subjectId: string): CustomerDocumentLink => ({ kind, subjectId }) as CustomerDocumentLink;

function input(): CustomerHistoryInput {
  return {
    requests: [],
    quotes: [],
    jobs: [],
    sites: [site("s-ghimbav", "Depozit Ghimbav"), site("s-show", "Showroom Brașov")],
    siteAssignments: [],
    historicalWorks: [
      // The 2021 work at Ghimbav: the title does not name the site.
      work("w-2021", "Litere volumetrice și casetă luminoasă", "s-ghimbav", "2021-06", "2021-07", "AC-2021-014"),
      // Same site, another year.
      work("w-2026", "Mentenanță casetă", "s-ghimbav", "2026-03"),
      // Another site, 2021.
      work("w-show", "Autocolant vitrine", "s-show", "2021-11"),
      // A period across two years.
      work("w-span", "Recepție iarnă", "s-show", "2025-11", "2026-02"),
    ],
    documents: [
      document("d-invoice", "Factură litere depozit", "INVOICE", "F-ALC-2021-0412", "2021-07-02", "2026-10-23T08:00:00.000Z"),
      // An uploaded contract without a documented date, uploaded in 2021: its year is not documented.
      document("d-undated", "Contract-cadru vechi", "CONTRACT", null, null, "2021-03-01T08:00:00.000Z"),
    ],
    documentLinks: new Map([["d-invoice", [link("HISTORICAL_WORK", "w-2021")]]]),
    documentContentHref: (id) => `/doc/${id}`,
  };
}

const search = (q: string, extra: Record<string, string> = {}) => projectCustomerHistory(input(), readCustomerHistoryQuery({ q, pageSize: "50", ...extra }));
const ids = (q: string, extra: Record<string, string> = {}) => search(q, extra).entries.map((entry) => entry.entryId);

describe("history text search (N-020)", () => {
  it("„Ghimbav 2021” finds the 2021 work at Ghimbav: the site and the year come from different fields", () => {
    expect(ids("Ghimbav 2021")).toEqual(["historical:w-2021"]);
  });

  it("the order of the words, capitals, extra spaces and diacritics do not change the result", () => {
    const expected = ["historical:w-2021"];
    expect(ids("2021 Ghimbav")).toEqual(expected);
    expect(ids("  GHIMBAV    2021 ")).toEqual(expected);
    expect(ids("ghimbav 2021 casetă")).toEqual(expected);
    expect(ids("ghimbav 2021 caseta")).toEqual(expected);
  });

  it("every word must be found in the same entry", () => {
    // "Ghimbav" is only at Ghimbav, "Autocolant" only at the showroom: no entry has both.
    expect(ids("Ghimbav autocolant")).toEqual([]);
    expect(ids("Ghimbav 2019")).toEqual([]);
  });

  it("says where each word was found, and only there", () => {
    const entry = search("Ghimbav 2021").entries[0];
    // Ghimbav: the site. 2021: the documented period, the reference AC-2021-014 and the invoice number.
    expect(entry?.matchedOn).toEqual(["Sediu", "Anul 2021", "Referință", "Factură: Factură litere depozit"]);
    // The same explanation whatever the order of the words.
    expect(search("2021 ghimbav").entries[0]?.matchedOn).toEqual(entry?.matchedOn);
    // The title contains neither word: it is not named.
    expect(entry?.matchedOn).not.toContain("Titlu");
  });

  it("finds an invoice by its number", () => {
    const result = search("F-ALC-2021-0412");
    expect(result.entries.map((entry) => entry.entryId)).toEqual(["historical:w-2021"]);
    expect(result.entries[0]?.matchedOn).toEqual(["Factură: Factură litere depozit"]);
  });

  it("the year comes from the documented period, never from the upload day", () => {
    // The contract was uploaded in 2021 but has no documented date: "2021" does not find it.
    expect(ids("contract 2021")).toEqual([]);
    expect(ids("contract")).toEqual(["document:d-undated"]);
    // The invoice was uploaded in 2026 but belongs to the 2021 work: "2026 litere" finds nothing.
    expect(ids("2026 litere")).toEqual([]);
  });

  it("a period across years matches each year from its start to its end, inclusive", () => {
    expect(ids("recepție 2025")).toEqual(["historical:w-span"]);
    expect(ids("receptie 2026")).toEqual(["historical:w-span"]);
    expect(ids("recepție 2024")).toEqual([]);
    expect(ids("recepție 2027")).toEqual([]);
    expect(search("recepție 2026").entries[0]?.matchedOn).toEqual(["Anul 2026", "Titlu"]);
  });

  it("combines with the explicit filters (AND) and counts the facets under the text", () => {
    expect(ids("Ghimbav 2021", { year: "2021" })).toEqual(["historical:w-2021"]);
    expect(ids("Ghimbav 2021", { year: "2026" })).toEqual([]);
    expect(ids("Ghimbav 2021", { provenance: "UPLOAD" })).toEqual([]);
    expect(ids("Ghimbav 2021", { site: "s-show" })).toEqual([]);
    const facets = search("Ghimbav 2021", { year: "2026" }).facets;
    expect(facets.yearCounts.find((item) => item.year === 2021)?.count).toBe(1);
    expect(facets.yearCounts.find((item) => item.year === 2026)?.count).toBe(0);
  });

  it("an empty or blank text is no search", () => {
    // Four works and the undated contract (the invoice belongs to the 2021 work).
    expect(search("   ").total).toBe(5);
    expect(search("   ").entries.every((entry) => entry.matchedOn.length === 0)).toBe(true);
  });
});

/**
 * N-020 etapa 4 · Lucrări reads the search with the history's own rule (one function): the same
 * words find the same work in both views. The year of a work is its documented period; the "An"
 * filter and the year groups read the year the period starts, in both views.
 */
describe("Lucrări search = Istoric search (N-020 etapa 4)", () => {
  const works = (q: string, extra: Record<string, string> = {}) => projectCustomerWorks(input(), readCustomerWorksQuery({ q, pageSize: "50", ...extra }));
  const workIds = (q: string, extra: Record<string, string> = {}) => works(q, extra).items.map((item) => item.workId);

  it("„Ghimbav 2021” finds the same 2021 work at Ghimbav in Lucrări as in Istoric", () => {
    expect(ids("Ghimbav 2021")).toEqual(["historical:w-2021"]);
    expect(workIds("Ghimbav 2021")).toEqual(["historical:w-2021"]);
    expect(workIds("2021 ghimbav")).toEqual(workIds("  GHIMBAV   2021 "));
    // The same explanation: site, the year, then the fields that really hold a word (AC-2021-014, F-ALC-2021-0412).
    expect(works("Ghimbav 2021").items[0]!.matchedOn).toEqual(search("Ghimbav 2021").entries[0]!.matchedOn);
    expect(works("Ghimbav 2021").items[0]!.matchedOn.slice(0, 2)).toEqual(["Sediu", "Anul 2021"]);
  });

  it("every word must be found in the same work, as in Istoric", () => {
    expect(workIds("Ghimbav vitrine")).toEqual([]);
    expect(ids("Ghimbav vitrine")).toEqual([]);
    expect(workIds("Ghimbav 2027")).toEqual([]);
  });

  it("a period across years is found with each of its years; the An filter reads the year it starts, as in Istoric", () => {
    expect(workIds("2025")).toEqual(["historical:w-span"]);
    expect(workIds("2026")).toEqual(["historical:w-2026", "historical:w-span"]);
    expect(workIds("2024")).toEqual([]);
    expect(workIds("", { year: "2025" })).toEqual(["historical:w-span"]);
    expect(workIds("", { year: "2026" })).toEqual(["historical:w-2026"]);
    expect(ids("", { year: "2025" })).toEqual(["historical:w-span"]);
    expect(ids("", { year: "2026" })).toEqual(["historical:w-2026"]);
  });

  it("never reads the day a record was entered as the year of the work", () => {
    // Every record here was entered on 2026-10-23; the 2021 works are not found with 2026.
    expect(workIds("Ghimbav 2026")).toEqual(["historical:w-2026"]);
    expect(workIds("2021").sort()).toEqual(["historical:w-2021", "historical:w-show"]);
  });

  it("filters the whole collection on the server, before the page, and counts out of the total", () => {
    const paged = projectCustomerWorks(input(), readCustomerWorksQuery({ q: "Ghimbav 2021", pageSize: "1", page: "1" }));
    expect(paged.total).toBe(1);
    expect(paged.totals.all).toBe(4);
    const second = projectCustomerWorks(input(), readCustomerWorksQuery({ q: "2021", pageSize: "1", page: "2" }));
    expect(second.total).toBe(2);
    expect(second.items).toHaveLength(1);
  });
});
