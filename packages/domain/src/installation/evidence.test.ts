import { describe, expect, it } from "vitest";
import { SVC_SITE_INSTALL_SUBCONTRACT_ID } from "../resources/catalog.js";
import { costEvidenceCoversInstant } from "./evidence.js";

const evidence = {
  resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
  amount: 180,
  currency: "EUR" as const,
  perUnit: "job" as const,
  source: "OWNER_CONFIRMED_PURCHASE" as const,
  classification: "OWNER_CONFIRMED" as const,
  note: "Synthetic subcontract window.",
  supplierLabel: "Montaj Rapid SRL",
  validFrom: "2027-01-01",
  validUntil: "2027-12-31",
};

describe("cost evidence calendar coverage", () => {
  it("treats validUntil as an inclusive UTC calendar date", () => {
    expect(costEvidenceCoversInstant(evidence, "2027-01-01T23:59:59Z")).toBe(true);
    expect(costEvidenceCoversInstant(evidence, "2027-12-31T23:59:59Z")).toBe(true);
    expect(costEvidenceCoversInstant(evidence, "2028-01-01T00:00:00Z")).toBe(false);
    expect(costEvidenceCoversInstant(evidence, "2026-12-31T23:59:59Z")).toBe(false);
    expect(costEvidenceCoversInstant(evidence, "not-a-date")).toBe(false);
    expect(
      costEvidenceCoversInstant(
        { ...evidence, validFrom: "2027-02-30" },
        "2027-03-01T00:00:00Z",
      ),
    ).toBe(false);
  });
});
