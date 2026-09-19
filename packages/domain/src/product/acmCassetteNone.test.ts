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
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_GOLDEN_DEPTH_MM,
  ACM_GOLDEN_HEIGHT_MM,
  ACM_GOLDEN_WIDTH_MM,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
} from "./acmCassetteNone.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "./compiler.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import { CANONICAL_PRODUCT_CODE, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { getProductTemplate, productTemplates } from "./productRegistry.js";

const goldenValues = {
  "root.inscription": "PANOU ACM",
  "root.mountingSystem": "steel_angle",
  "face.widthMm": ACM_GOLDEN_WIDTH_MM,
  "face.heightMm": ACM_GOLDEN_HEIGHT_MM,
  "face.cassetteDepthMm": String(ACM_GOLDEN_DEPTH_MM),
  "face.foldCount": "2",
};

function confirmedAcm() {
  const definition = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
    templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
    values: goldenValues,
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

describe("ACM cassette second product", () => {
  it("registers a clean second ProductTemplate without LETTERS identity", () => {
    expect(acmCassetteNoneTemplate.code).toBe("PRD-ACM-CASSETTE-NONE");
    expect(acmCassetteNoneTemplate.label).toBe("Panou ACM casetat");
    expect(acmCassetteNoneTemplate.familyId).toBe("SIGN_PANELS");
    expect(acmCassetteNoneTemplate.components.map((item) => item.typeId)).toEqual([
      "ACM_CASSETTE_BODY",
      "STEEL_INTERNAL_FRAME",
    ]);
    expect(acmCassetteNoneTemplate.fixedValues["face.finish"]).toBe("none");
    expect(getProductTemplate(ACM_CASSETTE_NONE_PRODUCT_CODE)).toBe(acmCassetteNoneTemplate);
    expect(productTemplates.map((item) => item.code)).toEqual([
      CANONICAL_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
    ]);
    expect(JSON.stringify(acmCassetteNoneTemplate)).not.toMatch(/LETTERS_ACM|ACM_TEST|PANEL_V2/);
  });

  it("confirms golden geometry, frame formula and bounded sheet quantity", () => {
    const { definition, truth, aggregate } = confirmedAcm();
    expect(definition.readiness).toBe("ready");
    expect(truth.status).toBe("CONFIRMED_IN_RUNTIME");
    expect(truth.values["root.mountingSystem"]).toBe("steel_angle");
    expect(truth.values["face.foldCount"]).toBe("2");
    expect(aggregate.quantities.find((item) => item.id === "face_area")?.value).toBe(0.5);
    expect(aggregate.quantities.find((item) => item.id === "cassette_blank_area")?.value).toBe(
      0.6264,
    );
    expect(aggregate.quantities.find((item) => item.id === "frame_external_width_m")?.value).toBe(
      0.992,
    );
    expect(aggregate.quantities.find((item) => item.id === "frame_external_height_m")?.value).toBe(
      0.492,
    );
    expect(aggregate.quantities.find((item) => item.id === "frame_perimeter")?.value).toBe(2.968);
    expect(aggregate.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resourceId: ACM_3MM_ID, quantity: 0.6264, unit: "m2" }),
        expect.objectContaining({
          resourceId: STEEL_FRAME_PROFILE_ID,
          quantity: 2.968,
          unit: "m",
        }),
      ]),
    );
  });

  it("keeps fold as workshop truth and mounting out of the frame", () => {
    const oneFold = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
      templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      values: { ...goldenValues, "face.foldCount": "1" },
    });
    const twoFold = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
      templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
      values: goldenValues,
    });
    const oneTruth = confirmReviewedDefinition(oneFold, oneFold.reviewId);
    const twoTruth = confirmReviewedDefinition(twoFold, twoFold.reviewId);
    if ("ok" in oneTruth || "ok" in twoTruth) {
      throw new Error("expected both fold variants to confirm");
    }
    const oneAgg = compileAggregate(
      oneTruth,
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      seededDisplayLabelCatalog(),
    );
    const twoAgg = compileAggregate(
      twoTruth,
      acmCassetteNoneTemplate,
      acmCassetteNoneFormSchema,
      seededDisplayLabelCatalog(),
    );
    expect(oneAgg.quantities.find((item) => item.id === "frame_perimeter")?.value).toBe(
      twoAgg.quantities.find((item) => item.id === "frame_perimeter")?.value,
    );
    expect(oneAgg.requirements).toEqual(twoAgg.requirements);
    expect(acmCassetteNoneFormSchema.sections[0]?.fields.map((item) => item.id)).toContain(
      "root.mountingSystem",
    );
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
