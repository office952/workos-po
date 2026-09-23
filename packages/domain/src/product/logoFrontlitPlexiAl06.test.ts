import { describe, expect, it } from "vitest";
import { projectCommercialPrice } from "../commercial/price.js";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { projectManualFixedProductPrice } from "../commercial/productPrice.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import {
  compileDefinition,
  confirmReviewedDefinition,
} from "./compiler.js";
import { getComponentContract } from "./componentRegistry.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import { CANONICAL_PRODUCT_CODE, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "./acmCassetteNone.js";
import {
  LOGO_PRODUCT_CODE,
  logoFrontlitPlexiAl06FormSchema,
  logoFrontlitPlexiAl06Template,
  logoReadyValues,
} from "./logoFrontlitPlexiAl06.js";
import {
  PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1,
  codeDefaultProductEnablement,
  planProductEnablementSave,
  resolveProductEnablement,
} from "./productEnablement.js";
import { costEvidence, PLEXIGLAS_3MM_OPAL_ID } from "../resources/catalog.js";
import { INSPECT_FINISHED_LETTER_ID, INSPECT_FINISHED_LOGO_ID, PACK_PRODUCT_ID } from "../processes/catalog.js";
import { compileAcceptedProductEvaluation } from "./acceptedEvaluation.js";
import { starterFormulaVersionsForType } from "./resolveFormulas.js";

const fieldIds = logoFrontlitPlexiAl06FormSchema.sections.flatMap((section) =>
  section.fields.map((field) => field.id),
);

describe("volumetric logo product", () => {
  it("is a distinct template and reuses the front-lit component contracts", () => {
    expect(logoFrontlitPlexiAl06Template.code).toBe(LOGO_PRODUCT_CODE);
    expect(logoFrontlitPlexiAl06Template.code).not.toBe(CANONICAL_PRODUCT_CODE);
    expect(logoFrontlitPlexiAl06Template.code).not.toBe(ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(logoFrontlitPlexiAl06Template.version).toBe("1");
    expect(logoFrontlitPlexiAl06Template.familyId).toBe("LIGHTED_VOLUMETRIC_SIGNS");
    expect(logoFrontlitPlexiAl06Template.categoryId).toBe("FRONT_LIT_VOLUMETRIC_LOGO");
    expect(logoFrontlitPlexiAl06Template.categoryId).not.toBe(frontlitPlexiAl06Template.categoryId);
    expect(logoFrontlitPlexiAl06Template.components.map((item) => item.typeId)).toEqual(
      frontlitPlexiAl06Template.components.map((item) => item.typeId),
    );
    expect(getComponentContract("PLEXIGLAS_FACE")?.typeId).toBe("PLEXIGLAS_FACE");
    expect(getComponentContract("ALUMINIUM_VOLUME")?.typeId).toBe("ALUMINIUM_VOLUME");
    expect(getComponentContract("FOREX_BACK")?.typeId).toBe("FOREX_BACK");
    expect(getComponentContract("LIGHTING_FRONT_LED")?.typeId).toBe("LIGHTING_FRONT_LED");
    expect(logoFrontlitPlexiAl06Template.fixedValues).toEqual(frontlitPlexiAl06Template.fixedValues);
    expect(fieldIds).not.toContain("root.designation");
    expect(fieldIds).not.toContain("pieceCount");
    expect(fieldIds.join(" ")).not.toMatch(/pieces\[|svg|dwg|cad/i);
    expect(
      logoFrontlitPlexiAl06FormSchema.sections[0]?.fields[0]?.label,
    ).toBe("Denumire logo");
    expect(logoFrontlitPlexiAl06FormSchema.sections[0]?.fields[0]?.id).toBe("root.inscription");
  });

  it("blocks confirm without designation, area, or perimeter and accepts the shared depths", () => {
    const missingName = compileDefinition(logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, {
      templateCode: LOGO_PRODUCT_CODE,
      values: { ...logoReadyValues, "root.inscription": "" },
    });
    expect(missingName.missing.map((item) => item.fieldId)).toContain("root.inscription");

    const missingArea = compileDefinition(logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, {
      templateCode: LOGO_PRODUCT_CODE,
      values: { ...logoReadyValues, "face.confirmedAreaMm2": "" },
    });
    expect(missingArea.missing.map((item) => item.fieldId)).toContain("face.confirmedAreaMm2");

    const missingPerimeter = compileDefinition(
      logoFrontlitPlexiAl06Template,
      logoFrontlitPlexiAl06FormSchema,
      {
        templateCode: LOGO_PRODUCT_CODE,
        values: { ...logoReadyValues, "volume.confirmedPerimeterMm": "" },
      },
    );
    expect(missingPerimeter.missing.map((item) => item.fieldId)).toContain(
      "volume.confirmedPerimeterMm",
    );

    for (const depth of ["30", "60", "80", "100"]) {
      const definition = compileDefinition(
        logoFrontlitPlexiAl06Template,
        logoFrontlitPlexiAl06FormSchema,
        {
          templateCode: LOGO_PRODUCT_CODE,
          values: { ...logoReadyValues, "volume.depthMm": depth },
        },
      );
      expect(definition.missing).toEqual([]);
      expect(definition.values["volume.depthMm"]).toBe(depth);
    }
  });

  it("stores one homogeneous set as total area and perimeter", () => {
    const definition = compileDefinition(
      logoFrontlitPlexiAl06Template,
      logoFrontlitPlexiAl06FormSchema,
      {
        templateCode: LOGO_PRODUCT_CODE,
        values: {
          ...logoReadyValues,
          "root.inscription": "NORD LOGO",
          "face.confirmedAreaMm2": 240000,
          "volume.confirmedPerimeterMm": 12600,
        },
      },
    );
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    expect("ok" in truth).toBe(false);
    if ("ok" in truth) {
      return;
    }
    expect(truth.templateCode).toBe(LOGO_PRODUCT_CODE);
    expect(truth.values["root.inscription"]).toBe("NORD LOGO");
    expect(truth.values["face.confirmedAreaMm2"]).toBe(240000);
    expect(truth.values["volume.confirmedPerimeterMm"]).toBe(12600);
    expect(JSON.stringify(truth)).not.toMatch(/pieceCount|pieces/);
    const evaluated = compileAcceptedProductEvaluation({
      truth,
      template: logoFrontlitPlexiAl06Template,
      formSchema: logoFrontlitPlexiAl06FormSchema,
      labels: seededDisplayLabelCatalog(),
      costEvidenceRows: costEvidence,
      formulaVersionsForType: starterFormulaVersionsForType,
    });
    expect(evaluated.aggregate.inscription).toBe("NORD LOGO");
    const formulaIds = evaluated.formulaTraces.map((item) => item.formulaId);
    expect(formulaIds).toEqual(
      expect.arrayContaining([
        "LIGHTING_FRONT_LED.ledModuleQuantity",
        "LIGHTING_FRONT_LED.totalLedLoadW",
        "LIGHTING_FRONT_LED.requiredPsuCapacityW",
      ]),
    );
    expect(formulaIds.some((id) => id.toLowerCase().includes("logo"))).toBe(false);
    expect(evaluated.composition.nodes.filter((node) => node.processId === INSPECT_FINISHED_LOGO_ID)).toHaveLength(1);
    expect(evaluated.composition.nodes.filter((node) => node.processId === PACK_PRODUCT_ID)).toHaveLength(1);
    expect(evaluated.composition.nodes.some((node) => node.processId === INSPECT_FINISHED_LETTER_ID)).toBe(
      false,
    );
    const costPlus = projectCommercialPrice(evaluated.eic, DEFAULT_COMMERCIAL_POLICY);
    expect(costPlus.completeness).toBe("COMPLETE");
    const manual = projectManualFixedProductPrice({ netPrice: 900 });
    const manualFrozen = freezeQuoteSnapshot(
      evaluated.truth,
      evaluated.aggregate,
      evaluated.composition,
      evaluated.eic,
      manual,
      { createdAt: "2026-09-24T00:00:00.000Z" },
    );
    expect(manualFrozen.ok).toBe(true);
    if (manualFrozen.ok) {
      expect(manualFrozen.snapshot.commercial.commercialStrategy).toBe("MANUAL_FIXED_PRODUCT");
    }
    const partial = compileAcceptedProductEvaluation({
      truth,
      template: logoFrontlitPlexiAl06Template,
      formSchema: logoFrontlitPlexiAl06FormSchema,
      labels: seededDisplayLabelCatalog(),
      costEvidenceRows: costEvidence.filter((item) => item.resourceId !== PLEXIGLAS_3MM_OPAL_ID),
      formulaVersionsForType: starterFormulaVersionsForType,
    });
    expect(partial.eic.completeness).toBe("PARTIAL");
    expect(partial.eic.total).not.toBe(900);
  });

  it("stays disabled until an organization enables it", () => {
    expect([...PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1]).not.toContain(LOGO_PRODUCT_CODE);
    const resolution = codeDefaultProductEnablement();
    expect(resolution.enabledTemplateCodes).not.toContain(LOGO_PRODUCT_CODE);
    const saved = planProductEnablementSave(
      [],
      [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: true },
        { templateCode: LOGO_PRODUCT_CODE, enabled: true },
      ],
      { now: "2026-09-24T00:00:00.000Z", actorUserId: "owner-1", rowId: "pev:logo" },
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok || !saved.next) {
      return;
    }
    const enabled = resolveProductEnablement([saved.next]);
    expect(enabled.ok && enabled.enabledTemplateCodes).toContain(LOGO_PRODUCT_CODE);
    const disabled = planProductEnablementSave(
      saved.next ? [saved.next] : [],
      [
        { templateCode: CANONICAL_PRODUCT_CODE, enabled: true },
        { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, enabled: true },
        { templateCode: LOGO_PRODUCT_CODE, enabled: false },
      ],
      { now: "2026-09-24T01:00:00.000Z", actorUserId: "owner-1", rowId: "pev:logo-off" },
    );
    expect(disabled.ok).toBe(true);
    if (!disabled.ok || !disabled.next) {
      return;
    }
    const after = resolveProductEnablement([
      { ...saved.next, status: "RETIRED" },
      disabled.next,
    ]);
    expect(after.ok && after.enabledTemplateCodes).not.toContain(LOGO_PRODUCT_CODE);
  });
});
