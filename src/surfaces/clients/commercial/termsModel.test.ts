import { describe, expect, it } from "vitest";
import { TransportError } from "../../../api/http";
import { describeDestination } from "../../../routing/destination";
import { readSaveFailure, readValue, resumeTermsOnCurrent, termsConflictRows, termsPayload, versionLine } from "./termsModel";

const format = (value: string) => value.slice(0, 10);

describe("Date comerciale · model", () => {
  it("reads a value with its unit and leaves an empty one empty", () => {
    expect(readValue("paymentTermDays", 45)).toBe("45 de zile");
    expect(readValue("paymentTermDays", 1)).toBe("1 zi");
    expect(readValue("paymentTermDays", 15)).toBe("15 zile");
    expect(readValue("advancePercent", 40)).toBe("40%");
    expect(readValue("bankAccount", null)).toBeNull();
    expect(readValue("bankAccount", "")).toBeNull();
  });

  it("names the revision and the date only when they exist", () => {
    expect(versionLine({ revision: 0, recordedAt: null }, format, 0, false)).toBe("nicio versiune salvată");
    expect(versionLine({ revision: 1, recordedAt: null }, format, 0, false)).toBe("revizia 1");
    expect(versionLine({ revision: 3, recordedAt: "2026-10-25T10:14" }, format, 2, false)).toBe("revizia 3 · 2026-10-25 · 2 versiuni anterioare păstrate");
    expect(versionLine({ revision: 1, recordedAt: "2026-10-24T06:36" }, format, 0, true)).toBe("revizia 1 · 2026-10-24 · în modificare");
  });

  it("sends every field as typed, an empty one cleared, with the revision it starts from", () => {
    expect(termsPayload({ legalName: " Alpha ", bankAccount: "", paymentTermDays: "45" }, 2)).toEqual({ expectedRevision: 2, legalName: "Alpha", bankAccount: null, paymentTermDays: "45" });
  });

  it("tells a version conflict from a refused field and from any other failure", () => {
    expect(readSaveFailure(new TransportError("x", 409, { error: "stale_revision", terms: { revision: 2 } }))).toEqual({ kind: "conflict", current: { revision: 2 } });
    expect(readSaveFailure(new TransportError("x", 400, { error: "invalid_payload", field: "billingContactEmail" }))).toEqual({ kind: "invalid", field: "billingContactEmail" });
    expect(readSaveFailure(new TransportError("x", 422, { error: "reference_document_not_of_customer" }))).toEqual({ kind: "invalid", field: "referenceDocumentId" });
    expect(readSaveFailure(new TransportError("x", 503, { error: "storage_unavailable" }))).toEqual({ kind: "error" });
    expect(readSaveFailure(new Error("network"))).toEqual({ kind: "error" });
  });

  it("compares and resumes: the reader's change stays, the rest comes from the current version", () => {
    const fields = ["billingContactPhone", "paymentTermDays", "currency"];
    const base = { billingContactPhone: "0700 900 111", paymentTermDays: "30", currency: "RON" };
    const draft = { ...base, paymentTermDays: "45" };
    const current = { billingContactPhone: "0700 900 119", paymentTermDays: "60", currency: "RON" };
    const rows = termsConflictRows(fields, base, draft, current);
    expect(rows.map((row) => [row.field, row.mineChanged, row.currentChanged])).toEqual([
      ["paymentTermDays", true, true],
      ["billingContactPhone", false, true],
    ]);
    expect(resumeTermsOnCurrent(fields, base, draft, current)).toEqual({ values: { billingContactPhone: "0700 900 119", paymentTermDays: "45", currency: "RON" }, kept: ["paymentTermDays"], taken: ["billingContactPhone"] });
  });

  it("names another section of the client page by its tab when leaving with changes", () => {
    expect(describeDestination("/clienti/cus-1?sectiune=lucrari&lucrare=job:j1")).toBe("memoria lucrării");
    expect(describeDestination("/clienti/cus-1?sectiune=sedii", "/clienti/cus-1")).toBe("Sedii");
    expect(describeDestination("/clienti/cus-1", "/clienti/cus-1")).toBe("Istoric");
    // From another page (the way back from a request), the client page keeps its own name.
    expect(describeDestination("/clienti/cus-1?sectiune=cereri", "/cereri/r-1")).toBe("fișa clientului");
    expect(describeDestination("/clienti/cus-1?sectiune=cereri")).toBe("fișa clientului");
  });
});
