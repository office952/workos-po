import { describe, expect, it } from "vitest";
import type { CostEvidenceRowTransport } from "../api/types";
import {
  costAmountEditLabel,
  costCategoryFromKindLabel,
  costRelationshipCopy,
  costRowAmountContext,
  costRowDetail,
  costVerificationLabel,
  filterCostRegistryRows,
  matchesCostSearch,
  parseCostAmountDraft,
  presentCostVerification,
} from "./costUsability";

function row(over: Partial<CostEvidenceRowTransport> = {}): CostEvidenceRowTransport {
  return {
    resourceId: "plexiglas_3mm_opal",
    resourceLabel: "Plexiglas 3 mm opal",
    evidenceRowId: "row-1",
    qualifierIdentity: null,
    qualifierLabel: null,
    qualifier: null,
    amount: 16,
    currency: "EUR",
    unitLabel: "m²",
    amountDisplay: "16,00 EUR / m²",
    note: null,
    lastChangedAt: null,
    kindLabel: "Material",
    classificationLabel: "Confirmat de owner",
    sourceLabel: "Achiziție confirmată de owner",
    ...over,
  };
}

describe("cost usability presentation", () => {
  it("maps existing kind labels into operator categories", () => {
    expect(costCategoryFromKindLabel("Material")).toBe("materiale");
    expect(costCategoryFromKindLabel("Manoperă")).toBe("manopera");
    expect(costCategoryFromKindLabel("Serviciu")).toBe("servicii");
  });

  it("keeps owner-confirmed and AI decisions out of De confirmat", () => {
    expect(presentCostVerification(row({}))).toBe("confirmed");
    expect(
      presentCostVerification(
        row({ classificationLabel: "Decizie AI / pilot", sourceLabel: "Decizie AI / default de dezvoltare" }),
      ),
    ).toBe("confirmed");
    expect(
      presentCostVerification(
        row({
          classificationLabel: "Default de dezvoltare",
          sourceLabel: "Valoare implicită de platformă",
        }),
      ),
    ).toBe("verify");
  });

  it("treats a catalog gap as missing, not zero", () => {
    const missing = row({
      evidenceRowId: null,
      amount: null,
      amountDisplay: null,
      classificationLabel: null,
      sourceLabel: null,
    });
    expect(presentCostVerification(missing)).toBe("missing");
    expect(costVerificationLabel("missing")).toBe("Cost lipsa");
    expect(costRowAmountContext(missing, true)).toBe("Cost lipsa");
    expect(costRowAmountContext(missing, true)).not.toContain("0");
    expect(costRowDetail(missing)).toBe("Material");
    expect(costRowDetail(missing)).not.toContain("Cost lipsa");
    expect(costRowDetail(row({}), false)).toBe("Material");
    expect(costRowDetail(row({}), false)).not.toContain("Confirmat");
    expect(parseCostAmountDraft("")).toEqual({ ok: false });
    expect(parseCostAmountDraft("  ")).toEqual({ ok: false });
    expect(parseCostAmountDraft("abc")).toEqual({ ok: false });
    expect(parseCostAmountDraft("15")).toEqual({ ok: true, amount: 15 });
    expect(parseCostAmountDraft("15,5")).toEqual({ ok: true, amount: 15.5 });
  });

  it("does not treat an omitted member amount as missing when classification remains", () => {
    const omitted = row({
      amount: null,
      amountDisplay: null,
      classificationLabel: "Confirmat de owner",
    });
    expect(presentCostVerification(omitted)).toBe("confirmed");
    expect(costRowAmountContext(omitted, false)).toBe("Confirmat");
  });

  it("builds a purchase-cost label with the existing unit", () => {
    expect(costAmountEditLabel("materiale", "m²", "EUR")).toBe("Cost achiziție (EUR/m²)");
    expect(costAmountEditLabel("manopera", "ore-persoană", "EUR")).toBe(
      "Cost manoperă (EUR/ore-persoană)",
    );
    expect(costAmountEditLabel("servicii", "m", "EUR")).toBe("Cost operație (EUR/m)");
    expect(costRelationshipCopy("materiale")).toContain("cost intern de material");
    expect(costRelationshipCopy("servicii")).toBeNull();
  });

  it("filters by everyday category, search and verification without defaulting to aluminium", () => {
    const plexi = row({
      resourceId: "plexiglas_3mm_opal",
      resourceLabel: "Plexiglas 3 mm opal",
      classificationLabel: "Default de dezvoltare",
    });
    const aluminium = row({
      resourceId: "aluminium_return_profile",
      resourceLabel: "Profil aluminiu 0,6 mm",
      qualifierIdentity: "volumeDepthMm=60",
      qualifierLabel: "Adâncime volum: 60 mm",
    });
    const cnc = row({
      resourceId: "SVC-CNC-FACE",
      resourceLabel: "CNC față",
      kindLabel: "Serviciu",
      unitLabel: "m",
    });
    const rows = [aluminium, plexi, cnc];
    expect(filterCostRegistryRows(rows, "materiale", "").map((item) => item.resourceId)).toEqual([
      "aluminium_return_profile",
      "plexiglas_3mm_opal",
    ]);
    expect(filterCostRegistryRows(rows, "materiale", "plexiglas").map((item) => item.resourceId)).toEqual([
      "plexiglas_3mm_opal",
    ]);
    expect(filterCostRegistryRows(rows, "servicii", "").map((item) => item.resourceId)).toEqual([
      "SVC-CNC-FACE",
    ]);
    expect(filterCostRegistryRows(rows, "de-confirmat", "").map((item) => item.resourceId)).toEqual([
      "plexiglas_3mm_opal",
    ]);
    expect(matchesCostSearch(plexi, "PLEXI")).toBe(true);
    expect(filterCostRegistryRows(rows, "all", "")[0]?.resourceId).toBe("aluminium_return_profile");
  });
});
