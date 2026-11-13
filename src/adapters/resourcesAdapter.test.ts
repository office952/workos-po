import { describe, expect, it } from "vitest";
import { findCostEvidenceRow, presentResourcesAdmin } from "./resourcesAdapter";

const ownerPayload = {
  writeState: "READY",
  costEvidence: [
    {
      resourceId: "aluminium_return_profile",
      resourceLabel: "Profil aluminiu 0,6 mm",
      evidenceRowId: "row-60",
      qualifierIdentity: "volumeDepthMm=60",
      qualifierLabel: "Adâncime volum: 60 mm",
      qualifier: {
        kind: "volumeDepthMm",
        label: "Adâncime volum",
        unitLabel: "mm",
        value: 60,
      },
      amount: 3,
      currency: "EUR",
      unitLabel: "m",
      amountDisplay: "3,00 EUR / m · Adâncime volum: 60 mm",
      note: "Valoare implicită de platformă. Trebuie confirmată de owner.",
      lastChangedAt: "2026-09-01T00:00:00.000Z",
      kindLabel: "Material",
      classificationLabel: "Default de dezvoltare",
      sourceLabel: "Valoare implicită de platformă",
    },
    {
      resourceId: "aluminium_return_profile",
      resourceLabel: "Profil aluminiu 0,6 mm",
      evidenceRowId: "row-30",
      qualifierIdentity: "volumeDepthMm=30",
      qualifierLabel: "Adâncime volum: 30 mm",
      qualifier: {
        kind: "volumeDepthMm",
        label: "Adâncime volum",
        unitLabel: "mm",
        value: 30,
      },
      amount: 2,
      currency: "EUR",
      unitLabel: "m",
    },
  ],
};

describe("presentResourcesAdmin", () => {
  it("lets Owner edit when amounts and write state are present", () => {
    const presented = presentResourcesAdmin(ownerPayload);
    expect(presented?.canEdit).toBe(true);
    expect(presented?.writeState).toBe("READY");
    expect(presented?.rows[0]?.note).toBe(
      "Valoare implicită de platformă. Trebuie confirmată de proprietar.",
    );
    expect(presented?.rows[0]?.kindLabel).toBe("Material");
    expect(presented?.rows[0]?.classificationLabel).toBe("Default de dezvoltare");
    expect(
      findCostEvidenceRow(
        presented?.rows ?? [],
        "aluminium_return_profile",
        "volumeDepthMm",
        60,
      )?.amount,
    ).toBe(3);
  });

  it("disables edit when amounts are omitted", () => {
    const presented = presentResourcesAdmin({
      writeState: "READY",
      costEvidence: [
        {
          resourceId: "aluminium_return_profile",
          resourceLabel: "Profil aluminiu 0,6 mm",
          evidenceRowId: "row-60",
          qualifier: {
            kind: "volumeDepthMm",
            label: "Adâncime volum",
            unitLabel: "mm",
            value: 60,
          },
        },
      ],
    });
    expect(presented?.canEdit).toBe(false);
    expect(presented?.rows[0]?.amount).toBeNull();
  });

  it("presents catalog resources without cost as missing rows, not as zero", () => {
    const presented = presentResourcesAdmin({
      writeState: "READY",
      costEvidence: [ownerPayload.costEvidence[0]],
      materials: [
        {
          id: "plexiglas_3mm_opal",
          label: "Plexiglas 3 mm opal",
          kindLabel: "Material",
          unitLabel: "m²",
          cost: null,
        },
        {
          id: "aluminium_return_profile",
          label: "Profil aluminiu 0,6 mm",
          kindLabel: "Material",
          unitLabel: "m",
          cost: { amount: 3 },
        },
      ],
    });
    expect(presented?.rows.map((row) => row.resourceId)).toEqual([
      "aluminium_return_profile",
      "plexiglas_3mm_opal",
    ]);
    expect(presented?.rows[1]?.amount).toBeNull();
    expect(presented?.rows[1]?.evidenceRowId).toBeNull();
  });

  it("does not invent missing costs when member payloads omit the cost object", () => {
    const presented = presentResourcesAdmin({
      writeState: "READY",
      costEvidence: [
        {
          resourceId: "plexiglas_3mm_opal",
          resourceLabel: "Plexiglas 3 mm opal",
          evidenceRowId: "row-plexi",
          kindLabel: "Material",
          classificationLabel: "Confirmat de owner",
        },
      ],
      materials: [
        {
          id: "forex_10mm",
          label: "Forex 10 mm",
          kindLabel: "Material",
          unitLabel: "m²",
        },
      ],
    });
    expect(presented?.rows.map((row) => row.resourceId)).toEqual(["plexiglas_3mm_opal"]);
  });
});
