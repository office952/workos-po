import { describe, expect, it } from "vitest";
import {
  ALUMINIUM_RETURN_PROFILE_ID,
  FOREX_10MM_ID,
  MAT_LED_MODULE_ID,
  MAT_LED_PSU_12V_100W_ID,
  MAT_LED_PSU_12V_160W_ID,
  MAT_LED_PSU_12V_200W_ID,
  MAT_LED_PSU_12V_60W_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  RETURN_CANT_FORMING_ID,
  costEvidence,
  costEvidenceQualifierFieldsFor,
  costEvidenceQualifierIdentity,
  getCostEvidence,
  parseCostEvidenceWhen,
  getResource,
  lookupCostEvidence,
  ownerConfirmedCostSource,
  isValidCostAmount,
  listMaterialSpecifications,
  listServiceResources,
  matchMaterialSpecification,
  matchMaterialSpecificationIn,
  materialFamilies,
  resourceCatalog,
  resourceKindLabel,
  type ResourceDefinition,
} from "./catalog.js";

const plexiglas5mmOpalFixture: ResourceDefinition = {
  id: "plexiglas_5mm_opal",
  label: "Plexiglas 5 mm opal",
  kind: "MATERIAL",
  unit: "m2",
  familyId: "PLEXIGLAS",
  specification: {
    familyId: "PLEXIGLAS",
    form: "sheet",
    thicknessMm: 5,
    opticalType: "opal",
  },
};

const forex5mmFixture: ResourceDefinition = {
  id: "forex_5mm",
  label: "Forex 5 mm",
  kind: "MATERIAL",
  unit: "m2",
  familyId: "FOREX",
  specification: {
    familyId: "FOREX",
    form: "sheet",
    thicknessMm: 5,
  },
};

describe("resource catalog", () => {
  it("keeps unique resource identities", () => {
    const ids = resourceCatalog.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      PLEXIGLAS_3MM_OPAL_ID,
      FOREX_10MM_ID,
      ALUMINIUM_RETURN_PROFILE_ID,
      RETURN_CANT_FORMING_ID,
      MAT_LED_MODULE_ID,
      MAT_LED_PSU_12V_60W_ID,
      MAT_LED_PSU_12V_100W_ID,
      MAT_LED_PSU_12V_160W_ID,
      MAT_LED_PSU_12V_200W_ID,
      "MAT-VINYL-ORACAL-651",
      "SVC-CNC-FACE",
      "SVC-CNC-BACK",
      "LAB-VINYL-FACE",
      "LAB-VINYL-VOLUME",
      "LAB-BOND-LETTER-BODY",
      "LAB-CLOSE-LETTER-BODY",
      "SVC-PLACE-LED-MODULES",
      "SVC-ELECTRICAL-FINISH",
      "SVC-PAINT-RAL",
      "SVC-PACK-PRODUCT",
      "acm_3mm",
      "steel_frame_profile",
      "SVC-CNC-SHEET-PANEL",
      "SVC-CUT-METAL-STOCK",
      "LAB-FORM-SHEET-CASSETTE",
      "LAB-ATTACH-INTERNAL-FRAME",
      "LAB-SITE-INSTALL",
      "SVC-SITE-INSTALL-SUBCONTRACT",
    ]);
  });

  it("classifies live resources as material or service", () => {
    expect(getResource(PLEXIGLAS_3MM_OPAL_ID)?.kind).toBe("MATERIAL");
    expect(getResource(FOREX_10MM_ID)?.kind).toBe("MATERIAL");
    expect(getResource(ALUMINIUM_RETURN_PROFILE_ID)?.kind).toBe("MATERIAL");
    expect(getResource(RETURN_CANT_FORMING_ID)?.kind).toBe("SERVICE");
    expect(resourceKindLabel("SERVICE")).toBe("Serviciu");
    expect(listServiceResources().map((item) => item.id)).toEqual([
      RETURN_CANT_FORMING_ID,
      "SVC-CNC-FACE",
      "SVC-CNC-BACK",
      "SVC-PLACE-LED-MODULES",
      "SVC-ELECTRICAL-FINISH",
      "SVC-PAINT-RAL",
      "SVC-PACK-PRODUCT",
      "SVC-CNC-SHEET-PANEL",
      "SVC-CUT-METAL-STOCK",
      "SVC-SITE-INSTALL-SUBCONTRACT",
    ]);
    expect(getResource("LAB-BOND-LETTER-BODY")?.kind).toBe("LABOR");
    expect(resourceKindLabel("LABOR")).toBe("Manoperă");
  });

  it("separates material family from purchasable specification", () => {
    expect(materialFamilies.map((item) => item.id)).toEqual([
      "PLEXIGLAS",
      "FOREX",
      "ALUMINIUM",
      "LED",
      "VINYL",
      "ACM",
      "STEEL",
    ]);
    const plexiglas = getResource(PLEXIGLAS_3MM_OPAL_ID);
    expect(plexiglas?.familyId).toBe("PLEXIGLAS");
    expect(plexiglas?.label).toBe("Plexiglas 3 mm opal");
    expect(plexiglas?.specification).toEqual({
      familyId: "PLEXIGLAS",
      form: "sheet",
      thicknessMm: 3,
      opticalType: "opal",
    });
    expect(plexiglas?.id).not.toMatch(/face/i);
    expect(getResource(FOREX_10MM_ID)?.id).not.toMatch(/back/i);
    expect(getResource(FOREX_10MM_ID)?.specification?.thicknessMm).toBe(10);
    expect(getResource(ALUMINIUM_RETURN_PROFILE_ID)?.specification).toEqual({
      familyId: "ALUMINIUM",
      form: "profile",
      thicknessMm: 0.6,
    });
    expect(getResource(ALUMINIUM_RETURN_PROFILE_ID)?.costEvidenceQualifiers).toEqual([
      "volumeDepthMm",
    ]);
    expect(getResource(PLEXIGLAS_3MM_OPAL_ID)?.costEvidenceQualifiers).toBeUndefined();
    expect(getResource(RETURN_CANT_FORMING_ID)?.familyId).toBeUndefined();
    expect(getResource(RETURN_CANT_FORMING_ID)?.specification).toBeUndefined();
  });

  it("resolves current Plexiglas 3 mm opal and keeps 5 mm as a non-live fixture", () => {
    expect(
      matchMaterialSpecification("PLEXIGLAS", {
        thicknessMm: 3,
        opticalType: "opal",
        form: "sheet",
      })?.id,
    ).toBe(PLEXIGLAS_3MM_OPAL_ID);
    expect(
      matchMaterialSpecification("PLEXIGLAS", {
        thicknessMm: 5,
        opticalType: "opal",
        form: "sheet",
      }),
    ).toBeUndefined();
    expect(listMaterialSpecifications("PLEXIGLAS").map((item) => item.id)).toEqual([
      PLEXIGLAS_3MM_OPAL_ID,
    ]);
    expect(
      matchMaterialSpecificationIn(
        [...resourceCatalog, plexiglas5mmOpalFixture],
        "PLEXIGLAS",
        { thicknessMm: 5, opticalType: "opal", form: "sheet" },
      )?.id,
    ).toBe("plexiglas_5mm_opal");
  });

  it("resolves current Forex 10 mm and keeps 5 mm as a non-live fixture", () => {
    expect(
      matchMaterialSpecification("FOREX", { thicknessMm: 10, form: "sheet" })?.id,
    ).toBe(FOREX_10MM_ID);
    expect(
      matchMaterialSpecification("FOREX", { thicknessMm: 5, form: "sheet" }),
    ).toBeUndefined();
    expect(
      matchMaterialSpecificationIn(
        [...resourceCatalog, forex5mmFixture],
        "FOREX",
        { thicknessMm: 5, form: "sheet" },
      )?.id,
    ).toBe("forex_5mm");
  });

  it("keeps one active cost evidence row per live resource", () => {
    expect(
      costEvidence.every((item) =>
        resourceCatalog.some((resource) => resource.id === item.resourceId),
      ),
    ).toBe(true);
    expect(getCostEvidence("acm_3mm")).toEqual(
      expect.objectContaining({
        amount: 32,
        classification: "AI_DECISION",
        source: "AI_DECISION",
      }),
    );
    expect(getCostEvidence("steel_frame_profile")).toEqual(
      expect.objectContaining({
        amount: 3.5,
        classification: "AI_DECISION",
        source: "AI_DECISION",
      }),
    );
    expect(getCostEvidence(PLEXIGLAS_3MM_OPAL_ID)).toEqual(
      expect.objectContaining({
        amount: 16,
        currency: "EUR",
        perUnit: "m2",
        classification: "OWNER_CONFIRMED",
      }),
    );
    expect(getCostEvidence(FOREX_10MM_ID)?.amount).toBe(16);
    expect(getCostEvidence(ALUMINIUM_RETURN_PROFILE_ID)).toBeUndefined();
    expect(getCostEvidence(ALUMINIUM_RETURN_PROFILE_ID, { volumeDepthMm: 60 })?.amount).toBe(
      3,
    );
    expect(getCostEvidence(ALUMINIUM_RETURN_PROFILE_ID, { volumeDepthMm: 30 })?.amount).toBe(
      2,
    );
    expect(getCostEvidence(ALUMINIUM_RETURN_PROFILE_ID, { volumeDepthMm: 80 })?.amount).toBe(
      4,
    );
    expect(getCostEvidence(ALUMINIUM_RETURN_PROFILE_ID, { volumeDepthMm: 100 })?.amount).toBe(
      5,
    );
    expect(
      costEvidence
        .filter((item) => item.resourceId === ALUMINIUM_RETURN_PROFILE_ID)
        .map((item) => item.when?.volumeDepthMm)
        .sort((left, right) => (left ?? 0) - (right ?? 0)),
    ).toEqual([30, 60, 80, 100]);
    expect(getCostEvidence(RETURN_CANT_FORMING_ID)?.amount).toBe(5);
    expect(getCostEvidence(RETURN_CANT_FORMING_ID)?.source).toBe("OWNER_CONFIRMED_WORKSHOP");
    expect(JSON.stringify(resourceCatalog)).not.toMatch(/"amount":/);
  });

  it("looks up injected rows without inheriting a qualified aluminium rate", () => {
    const plexi18 = {
      resourceId: PLEXIGLAS_3MM_OPAL_ID,
      amount: 18,
      currency: "EUR" as const,
      perUnit: "m2" as const,
      source: "OWNER_CONFIRMED_PURCHASE" as const,
      classification: "OWNER_CONFIRMED" as const,
      note: "Owner save",
      evidenceRowId: "cev:plexi",
      createdAt: "2026-08-18T00:00:00.000Z",
    };
    const aluminium60 = {
      resourceId: ALUMINIUM_RETURN_PROFILE_ID,
      amount: 3,
      currency: "EUR" as const,
      perUnit: "m" as const,
      source: "OWNER_CONFIRMED_PURCHASE" as const,
      classification: "OWNER_CONFIRMED" as const,
      note: "60 mm only",
      when: { volumeDepthMm: 60 },
      evidenceRowId: "cev:al60",
      createdAt: "2026-08-18T00:00:00.000Z",
    };
    const rows = [plexi18, aluminium60];
    expect(lookupCostEvidence(rows, PLEXIGLAS_3MM_OPAL_ID)?.amount).toBe(18);
    expect(lookupCostEvidence(rows, ALUMINIUM_RETURN_PROFILE_ID)).toBeUndefined();
    expect(
      lookupCostEvidence(rows, ALUMINIUM_RETURN_PROFILE_ID, { volumeDepthMm: 60 })?.amount,
    ).toBe(3);
    expect(
      lookupCostEvidence(rows, ALUMINIUM_RETURN_PROFILE_ID, { volumeDepthMm: 30 }),
    ).toBeUndefined();
    expect(ownerConfirmedCostSource("MATERIAL")).toBe("OWNER_CONFIRMED_PURCHASE");
    expect(ownerConfirmedCostSource("SERVICE")).toBe("OWNER_CONFIRMED_WORKSHOP");
    expect(ownerConfirmedCostSource("LABOR")).toBe("OWNER_CONFIRMED_WORKSHOP");
    expect(isValidCostAmount(18)).toBe(true);
    expect(isValidCostAmount(0)).toBe(false);
    expect(isValidCostAmount(-1)).toBe(false);
    expect(costEvidenceQualifierIdentity()).toBe("unqualified");
    expect(costEvidenceQualifierIdentity({ volumeDepthMm: 60 })).toBe(
      "volumeDepthMm=60",
    );
    expect(costEvidenceQualifierFieldsFor(["volumeDepthMm"])).toEqual([
      {
        kind: "volumeDepthMm",
        label: "Adâncime volum",
        unitLabel: "mm",
      },
    ]);
    expect(parseCostEvidenceWhen(undefined).ok).toBe(true);
    expect(parseCostEvidenceWhen({ volumeDepthMm: 30 })).toEqual({
      ok: true,
      when: { volumeDepthMm: 30 },
    });
    expect(parseCostEvidenceWhen({ volumeDepthMm: 0 }).ok).toBe(false);
    expect(parseCostEvidenceWhen({ volumeDepthMm: 30.5 }).ok).toBe(false);
    expect(parseCostEvidenceWhen({ productCode: "LETTERS" }).ok).toBe(false);
  });
});
