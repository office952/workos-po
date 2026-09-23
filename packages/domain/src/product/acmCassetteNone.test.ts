import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectCommercialPrice } from "../commercial/price.js";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import {
  ATTACH_INTERNAL_FRAME_ID,
  BOND_LETTER_BODY_ID,
  FORM_SHEET_CASSETTE_ID,
  INSPECT_FINISHED_LETTER_ID,
  PACK_PRODUCT_ID,
} from "../processes/catalog.js";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
import {
  ACM_3MM_ID,
  LAB_ATTACH_INTERNAL_FRAME_ID,
  LAB_FORM_SHEET_CASSETTE_ID,
  STEEL_FRAME_PROFILE_ID,
  SVC_CNC_SHEET_PANEL_ID,
  SVC_CUT_METAL_STOCK_ID,
  SVC_PACK_PRODUCT_ID,
} from "../resources/catalog.js";
import { compileEic } from "../resources/eic.js";
import {
  ACM_CASSETTE_NONE_FORM_SCHEMA_ID,
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_CASSETTE_NONE_PROOF_VALUES,
  ACM_CASSETTE_NONE_READY_VALUES,
  ACM_CASSETTE_NONE_TEMPLATE_VERSION,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "./acmCassetteNone.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "./compiler.js";
import {
  confirmReviewedDraft,
  projectConfigurationPreview,
} from "./configurationPreview.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import { getProductTemplate, productTemplates } from "./productRegistry.js";
import {
  resolveOrganizationTechnicalSettings,
} from "./resolveTechnicalSettings.js";
import {
  FRAME_CLEARANCE_SETTING_ID,
  LED_PITCH_SETTING_ID,
  applyResolvedTechnicalSettingValue,
  listTypeTechnicalSettings,
  technicalSettingDefinitionsForTemplate,
} from "./technicalSettings.js";
import {
  createPlatformStarterTechnicalSettingVersions,
  planTechnicalSettingsSave,
} from "./technicalSettingVersion.js";

const lettersReadyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function confirmedAcm(values = ACM_CASSETTE_NONE_READY_VALUES) {
  const definition = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
    templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
    values,
  });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed ACM truth");
  }
  const aggregate = compileAggregate(
    truth,
    acmCassetteNoneTemplate,
    acmCassetteNoneFormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, acmCassetteNoneTemplate);
  return { definition, truth, aggregate, composition };
}

function fieldIds(): string[] {
  return acmCassetteNoneFormSchema.sections.flatMap((section) =>
    section.fields.map((field) => field.id),
  );
}

describe("ACM cassette Product Truth V2", () => {
  it("keeps the same SKU and bumps template/form to v2", () => {
    expect(acmCassetteNoneTemplate.code).toBe("PRD-ACM-CASSETTE-NONE");
    expect(acmCassetteNoneTemplate.version).toBe(ACM_CASSETTE_NONE_TEMPLATE_VERSION);
    expect(acmCassetteNoneTemplate.version).toBe("2");
    expect(acmCassetteNoneTemplate.formSchemaId).toBe(ACM_CASSETTE_NONE_FORM_SCHEMA_ID);
    expect(acmCassetteNoneFormSchema.id).toBe("prd-acm-cassette-none-form-v2");
    expect(acmCassetteNoneTemplate.fixedValues["face.materialFamily"]).toBe("acm");
    expect(acmCassetteNoneTemplate.fixedValues["face.thicknessMm"]).toBe(3);
    expect(acmCassetteNoneTemplate.fixedValues["face.finish"]).toBe("none");
    expect(acmCassetteNoneTemplate.fixedValues["back.materialFamily"]).toBe("steel");
    expect(acmCassetteNoneTemplate.components.map((item) => item.typeId)).toEqual([
      "ACM_CASSETTE_BODY",
      "STEEL_INTERNAL_FRAME",
    ]);
    expect(getProductTemplate(ACM_CASSETTE_NONE_PRODUCT_CODE)).toBe(acmCassetteNoneTemplate);
    expect(productTemplates.map((item) => item.code)).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      "PRD-LOGO-FRONTLIT-PLEXI-AL06",
    ]);
  });

  it("accepts free numeric depth and optional second return", () => {
    const depthField = acmCassetteNoneFormSchema.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "face.cassetteDepthMm");
    expect(depthField?.type).toBe("number");
    expect(depthField?.options).toBeUndefined();
    expect(fieldIds()).not.toContain("root.mountingSystem");
    expect(fieldIds()).not.toContain("face.foldCount");

    expect(
      compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
        templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
        values: { ...ACM_CASSETTE_NONE_READY_VALUES, "face.cassetteDepthMm": 73 },
      }).readiness,
    ).toBe("ready");
    expect(
      compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
        templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
        values: { ...ACM_CASSETTE_NONE_READY_VALUES, "face.cassetteDepthMm": 73.5 },
      }).readiness,
    ).toBe("ready");
    expect(
      compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
        templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
        values: { ...ACM_CASSETTE_NONE_READY_VALUES, "face.cassetteDepthMm": 0 },
      }).readiness,
    ).toBe("blocked");

    const missingReturn = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
      templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      values: ACM_CASSETTE_NONE_READY_VALUES,
    });
    expect(missingReturn.readiness).toBe("ready");
    expect(missingReturn.values["face.backReturnMm"]).toBeUndefined();
    const zeroReturn = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
      templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      values: { ...ACM_CASSETTE_NONE_READY_VALUES, "face.backReturnMm": 0 },
    });
    expect(zeroReturn.readiness).toBe("ready");
    expect(zeroReturn.values["face.backReturnMm"]).toBe(0);
    expect(
      compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
        templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
        values: { ...ACM_CASSETTE_NONE_READY_VALUES, "face.backReturnMm": 25 },
      }).readiness,
    ).toBe("ready");
    expect(
      compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
        templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
        values: { ...ACM_CASSETTE_NONE_READY_VALUES, "face.backReturnMm": -1 },
      }).readiness,
    ).toBe("blocked");
  });

  it("does not persist crafted removed fields as V2 ProductTruth", () => {
    const definition = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
      templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      values: {
        ...ACM_CASSETTE_NONE_READY_VALUES,
        "root.mountingSystem": "steel_angle",
        "face.foldCount": "2",
      },
    });
    expect(definition.readiness).toBe("ready");
    expect(definition.values["root.mountingSystem"]).toBeUndefined();
    expect(definition.values["face.foldCount"]).toBeUndefined();
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    if ("ok" in truth) {
      throw new Error("expected confirmed ACM truth");
    }
    expect(truth.values["root.mountingSystem"]).toBeUndefined();
    expect(truth.values["face.foldCount"]).toBeUndefined();
  });

  it("confirms golden geometry and the 3000 x 500 proof blank", () => {
    const golden = confirmedAcm();
    expect(golden.definition.readiness).toBe("ready");
    expect(golden.truth.status).toBe("CONFIRMED_IN_RUNTIME");
    expect(golden.truth.templateVersion).toBe("2");
    expect(golden.aggregate.quantities.find((item) => item.id === "face_area")?.value).toBe(0.5);
    expect(golden.aggregate.quantities.find((item) => item.id === "cassette_blank_area")?.value).toBe(
      0.6264,
    );
    expect(golden.aggregate.quantities.find((item) => item.id === "frame_external_width_m")?.value).toBe(
      0.992,
    );
    expect(golden.aggregate.quantities.find((item) => item.id === "frame_external_height_m")?.value).toBe(
      0.492,
    );
    expect(golden.aggregate.quantities.find((item) => item.id === "frame_perimeter")?.value).toBe(2.968);
    expect(golden.aggregate.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: ACM_3MM_ID, quantity: 0.6264, unit: "m2" }),
        expect.objectContaining({
          resourceId: STEEL_FRAME_PROFILE_ID,
          quantity: 2.968,
          unit: "m",
        }),
      ]),
    );

    const proof = confirmedAcm(ACM_CASSETTE_NONE_PROOF_VALUES);
    expect(proof.aggregate.quantities.find((item) => item.id === "cassette_blank_area")?.value).toBeCloseTo(
      2.2791,
      6,
    );
    expect(proof.aggregate.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: ACM_3MM_ID, quantity: 2.2791, unit: "m2" }),
      ]),
    );
  });

  it("changes frame size from organization clearance, not a source constant", () => {
    const definition = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
      templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      values: ACM_CASSETTE_NONE_READY_VALUES,
    });
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    if ("ok" in truth) {
      throw new Error("expected confirmed ACM truth");
    }
    const clearance = listTypeTechnicalSettings("STEEL_INTERNAL_FRAME").find(
      (item) => item.id === FRAME_CLEARANCE_SETTING_ID,
    );
    if (!clearance) {
      throw new Error("expected frame clearance definition");
    }
    const six = compileAggregate(
      truth,
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      seededDisplayLabelCatalog(),
      {
        technicalSettingsForType: (typeId) =>
          typeId === "STEEL_INTERNAL_FRAME"
            ? [applyResolvedTechnicalSettingValue(clearance, 6)]
            : [],
      },
    );
    expect(six.quantities.find((item) => item.id === "frame_external_width_m")?.value).toBe(0.988);
    expect(six.quantities.find((item) => item.id === "frame_external_height_m")?.value).toBe(0.488);
    const missing = compileAggregate(
      truth,
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      seededDisplayLabelCatalog(),
      {
        technicalSettingsForType: () => [],
      },
    );
    expect(missing.componentStatuses.find((item) => item.typeId === "STEEL_INTERNAL_FRAME")?.status).toBe(
      "UNAVAILABLE",
    );
  });

  it("invalidates ACM crv1 when frame clearance changes and leaves Letters crv1 intact", () => {
    const starters = createPlatformStarterTechnicalSettingVersions({
      now: "2026-09-21T00:00:00.000Z",
      rowIdFor: (definitionId) => `tsv:${definitionId}:v1`,
    });
    const firstAcm = resolveOrganizationTechnicalSettings(starters, {
      requiredDefinitions: technicalSettingDefinitionsForTemplate(acmCassetteNoneTemplate),
    });
    const firstLetters = resolveOrganizationTechnicalSettings(starters, {
      requiredDefinitions: technicalSettingDefinitionsForTemplate(frontlitPlexiAl06Template),
    });
    expect(firstAcm.ok).toBe(true);
    expect(firstLetters.ok).toBe(true);
    if (!firstAcm.ok || !firstLetters.ok) {
      throw new Error("expected starter resolution");
    }
    const acmPreview = projectConfigurationPreview(
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, values: ACM_CASSETTE_NONE_READY_VALUES },
      firstAcm.settings,
    );
    const lettersPreview = projectConfigurationPreview(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
      firstLetters.settings,
    );
    expect(acmPreview.reviewId).toMatch(/^crv1:/);
    expect(lettersPreview.reviewId).toMatch(/^crv1:/);

    const planned = planTechnicalSettingsSave(
      starters,
      [{ settingId: FRAME_CLEARANCE_SETTING_ID, value: 6 }],
      { kind: "USER", userId: "user-1" },
      {
        now: "2026-09-21T01:00:00.000Z",
        rowIdFor: (definitionId) => `tsv:${definitionId}:v2`,
      },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      throw new Error("expected clearance save plan");
    }
    const nextRows = starters.map((row) =>
      row.settingId === FRAME_CLEARANCE_SETTING_ID ? { ...row, status: "RETIRED" as const } : row,
    );
    const secondAcm = resolveOrganizationTechnicalSettings([...nextRows, ...planned.next], {
      requiredDefinitions: technicalSettingDefinitionsForTemplate(acmCassetteNoneTemplate),
    });
    const secondLetters = resolveOrganizationTechnicalSettings([...nextRows, ...planned.next], {
      requiredDefinitions: technicalSettingDefinitionsForTemplate(frontlitPlexiAl06Template),
    });
    expect(secondAcm.ok).toBe(true);
    expect(secondLetters.ok).toBe(true);
    if (!secondAcm.ok || !secondLetters.ok) {
      throw new Error("expected next resolution");
    }
    const staleAcm = confirmReviewedDraft(
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, values: ACM_CASSETTE_NONE_READY_VALUES },
      acmPreview.reviewId ?? "",
      "2026-09-21T01:00:00.000Z",
      secondAcm.settings,
    );
    expect("ok" in staleAcm && staleAcm.reason).toBe("review_mismatch");
    const stillLetters = confirmReviewedDraft(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      { templateCode: CANONICAL_PRODUCT_CODE, values: lettersReadyValues },
      lettersPreview.reviewId ?? "",
      "2026-09-21T01:00:00.000Z",
      secondLetters.settings,
    );
    expect("status" in stillLetters && stillLetters.status).toBe("CONFIRMED_IN_RUNTIME");

    const lightingChange = planTechnicalSettingsSave(
      starters,
      [{ settingId: LED_PITCH_SETTING_ID, value: 80 }],
      { kind: "USER", userId: "user-1" },
      {
        now: "2026-09-21T02:00:00.000Z",
        rowIdFor: (definitionId) => `tsv:${definitionId}:pitch`,
      },
    );
    expect(lightingChange.ok).toBe(true);
    if (!lightingChange.ok) {
      throw new Error("expected lighting save plan");
    }
    const lightingRows = starters.map((row) =>
      row.settingId === LED_PITCH_SETTING_ID ? { ...row, status: "RETIRED" as const } : row,
    );
    const lightingAcm = resolveOrganizationTechnicalSettings(
      [...lightingRows, ...lightingChange.next],
      { requiredDefinitions: technicalSettingDefinitionsForTemplate(acmCassetteNoneTemplate) },
    );
    expect(lightingAcm.ok).toBe(true);
    if (!lightingAcm.ok) {
      throw new Error("expected ACM after lighting change");
    }
    const stillAcm = confirmReviewedDraft(
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, values: ACM_CASSETTE_NONE_READY_VALUES },
      acmPreview.reviewId ?? "",
      "2026-09-21T02:00:00.000Z",
      lightingAcm.settings,
    );
    expect("status" in stillAcm && stillAcm.status).toBe("CONFIRMED_IN_RUNTIME");
  });

  it("resolves only the settings required by selected component types", () => {
    const lightingOnly = createPlatformStarterTechnicalSettingVersions({
      now: "2026-09-21T00:00:00.000Z",
      rowIdFor: (definitionId) => `tsv:${definitionId}:v1`,
    }).filter((row) => row.typeId === "LIGHTING_FRONT_LED");
    const letters = resolveOrganizationTechnicalSettings(lightingOnly, {
      requiredDefinitions: technicalSettingDefinitionsForTemplate(frontlitPlexiAl06Template),
    });
    const acm = resolveOrganizationTechnicalSettings(lightingOnly, {
      requiredDefinitions: technicalSettingDefinitionsForTemplate(acmCassetteNoneTemplate),
    });
    expect(letters.ok).toBe(true);
    expect(acm.ok).toBe(false);
    if (acm.ok) {
      throw new Error("expected ACM to fail closed without frame clearance");
    }
  });

  it("composes ACM processes from type ids, not LETTERS extras", () => {
    const { composition } = confirmedAcm();
    expect(composition.lightingCalculationReadiness).toBe("NOT_APPLICABLE");
    expect(composition.nodes.map((item) => item.processId)).toEqual(
      expect.arrayContaining([
        ATTACH_INTERNAL_FRAME_ID,
        FORM_SHEET_CASSETTE_ID,
        PACK_PRODUCT_ID,
      ]),
    );
    expect(composition.nodes.map((item) => item.processId)).not.toContain(BOND_LETTER_BODY_ID);
    expect(composition.nodes.map((item) => item.processId)).not.toContain(
      INSPECT_FINISHED_LETTER_ID,
    );
    expect(frontlitPlexiAl06Template.code).toBe(CANONICAL_PRODUCT_CODE);
  });

  it("keeps generic compilers free of product-code forks", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const compiler = readFileSync(join(here, "compiler.ts"), "utf8");
    const eic = readFileSync(join(here, "../resources/eic.ts"), "utf8");
    const composition = readFileSync(join(here, "../processes/composition.ts"), "utf8");
    expect(compiler).not.toMatch(/PRD-LETTERS|PRD-ACM|CANONICAL_PRODUCT/);
    expect(eic).not.toMatch(/PRD-LETTERS|PRD-ACM|CANONICAL_PRODUCT/);
    expect(composition).not.toMatch(/template\.code ===/);
    expect(composition).toContain("selectedTypeIds");
    expect(composition).toContain("NOT_APPLICABLE");
  });

  it("uses generic EIC and becomes COMPLETE on classified ACM cost evidence", () => {
    const { aggregate, composition } = confirmedAcm();
    const eic = compileEic(aggregate, composition);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.completenessReasons).toEqual([]);
    expect(eic.total).toBeCloseTo(72.644, 6);
    expect(lineCost(eic, ACM_3MM_ID)).toBeCloseTo(20.0448, 6);
    expect(lineCost(eic, STEEL_FRAME_PROFILE_ID)).toBeCloseTo(10.388, 6);
    expect(lineCost(eic, SVC_CNC_SHEET_PANEL_ID)).toBeCloseTo(11.2752, 6);
    expect(lineCost(eic, LAB_FORM_SHEET_CASSETTE_ID)).toBe(8);
    expect(lineCost(eic, SVC_CUT_METAL_STOCK_ID)).toBeCloseTo(5.936, 6);
    expect(lineCost(eic, LAB_ATTACH_INTERNAL_FRAME_ID)).toBe(12);
    expect(lineCost(eic, SVC_PACK_PRODUCT_ID)).toBe(5);
    expect(eic.lines.some((line) => line.resourceId === "SVC-CNC-FACE")).toBe(false);
    expect(JSON.stringify(eic)).not.toMatch(/ACM CostEngine|frontend|PRD-ACM/i);
    const commercial = projectCommercialPrice(eic, DEFAULT_COMMERCIAL_POLICY);
    expect(commercial.completeness).toBe("COMPLETE");
    expect(commercial.netPrice).toBe(98.07);
    expect(commercial.vatAmount).toBe(20.59);
    expect(commercial.grossPrice).toBe(118.66);
  });

  it("freezes a generic ACM Quote Snapshot with production input", () => {
    const { truth, aggregate, composition } = confirmedAcm();
    const eic = compileEic(aggregate, composition);
    const commercial = projectCommercialPrice(eic, DEFAULT_COMMERCIAL_POLICY);
    const frozen = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      throw new Error("expected ACM quote freeze");
    }
    expect(frozen.snapshot.productCode).toBe(ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(frozen.snapshot.eic.completeness).toBe("COMPLETE");
    expect(frozen.snapshot.eic.total).toBeCloseTo(72.644, 6);
    expect(frozen.snapshot.commercial.grossPrice).toBe(118.66);
    expect(frozen.snapshot.productionInput.operations.length).toBeGreaterThan(0);
    expect(JSON.stringify(frozen.snapshot)).not.toMatch(/ACM Quote|ACM CostEngine/i);
  });
});

function lineCost(eic: ReturnType<typeof compileEic>, resourceId: string): number {
  return eic.lines
    .filter((line) => line.resourceId === resourceId)
    .reduce((sum, line) => sum + line.cost, 0);
}
