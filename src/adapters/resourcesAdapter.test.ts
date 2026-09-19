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
      note: "Owner-confirmed",
      lastChangedAt: "2026-09-01T00:00:00.000Z",
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
});
