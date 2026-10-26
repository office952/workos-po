import { describe, expect, it } from "vitest";
import { readCustomerCommercialTermsPatch, emptyCustomerCommercialTerms } from "./commercialTerms.js";
import { readCustomerDocumentMetadata } from "./documents.js";
import { formatPartialDatePeriod, parsePartialDate, readHistoricalWorkInput } from "./historicalWorks.js";
import { projectCustomerHistory, readCustomerHistoryQuery, type CustomerHistoryInput } from "./history.js";

describe("customer dossier rules", () => {
  it("reads partial dates at the precision the operator knows", () => {
    expect(parsePartialDate("2021")).toEqual({ ok: true, date: "2021", precision: "YEAR" });
    expect(parsePartialDate("2021-06")).toEqual({ ok: true, date: "2021-06", precision: "MONTH" });
    expect(parsePartialDate("2021-02-30")).toEqual({ ok: false });
    expect(formatPartialDatePeriod("2021-06", "2021-07")).toBe("iun. 2021 – iul. 2021");
    expect(readHistoricalWorkInput({ title: "Viitor", eventDate: "2030" }, null, "2026-10-23")).toEqual({ ok: false, field: "eventDate" });
    expect(readHistoricalWorkInput({ title: "Perioadă", eventDate: "2021-07", eventDateEnd: "2021-06" }, null, "2026-10-23")).toEqual({ ok: false, field: "eventDateEnd" });
  });

  it("requires a stage for photos only and keeps unknown terms empty", () => {
    expect(readCustomerDocumentMetadata({ kind: "PHOTO" }, "f").ok).toBe(false);
    expect(readCustomerDocumentMetadata({ kind: "INVOICE", photoStage: "AFTER" }, "factura")).toMatchObject({ ok: true, metadata: { photoStage: null, title: "factura" } });
    const terms = readCustomerCommercialTermsPatch({ paymentTermDays: "30", advancePercent: "" }, emptyCustomerCommercialTerms());
    expect(terms).toMatchObject({ ok: true, fields: { paymentTermDays: 30, advancePercent: null, currency: null } });
    expect(readCustomerCommercialTermsPatch({ advancePercent: 101 }, emptyCustomerCommercialTerms())).toEqual({ ok: false, field: "advancePercent" });
  });

  it("orders history deterministically and pages without gaps", () => {
    const works = ["2019", "2021-06", "2021-06", "2024-01-15"].map((eventDate, index) => ({
      workId: `w${index}`,
      customerId: "c",
      siteId: null,
      siteSnapshot: null,
      title: `Lucrare ${index}`,
      reference: null,
      description: null,
      eventDate,
      eventDateEnd: null,
      provenance: "HISTORICAL_RECORD" as const,
      recordedAt: "2026-10-23T00:00:00.000Z",
      recordedByAccountId: "a",
      updatedAt: "2026-10-23T00:00:00.000Z",
      revision: 1,
    }));
    const input: CustomerHistoryInput = {
      requests: [],
      quotes: [],
      jobs: [],
      historicalWorks: works,
      documents: [],
      documentLinks: new Map(),
      sites: [],
      siteAssignments: [],
      documentContentHref: (id) => `/doc/${id}`,
    };
    const all = projectCustomerHistory(input, readCustomerHistoryQuery({ pageSize: "50" }));
    expect(all.entries.map((entry) => entry.historicalWorkId)).toEqual(["w3", "w1", "w2", "w0"]);
    const first = projectCustomerHistory(input, readCustomerHistoryQuery({ pageSize: "3" }));
    const second = projectCustomerHistory(input, readCustomerHistoryQuery({ pageSize: "3", page: "2" }));
    expect([...first.entries, ...second.entries].map((entry) => entry.entryId)).toEqual(all.entries.map((entry) => entry.entryId));
    expect(projectCustomerHistory(input, readCustomerHistoryQuery({ year: "2021" })).total).toBe(2);
    expect(projectCustomerHistory(input, readCustomerHistoryQuery({ q: "lucrare 3" })).entries[0]?.matchedOn).toEqual(["Titlu"]);
  });
});
