import { describe, expect, it } from "vitest";
import { compileDefinition } from "./compiler.js";
import { compileAcceptedProductEvaluation } from "./acceptedEvaluation.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import { costEvidence, FOREX_10MM_ID } from "../resources/catalog.js";
import { starterFormulaVersionsForType } from "./resolveFormulas.js";
import { projectCommercialPrice } from "../commercial/price.js";
import { confirmReviewedDraft, projectConfigurationPreview } from "./configurationPreview.js";
import { FRONTLIT_FLAT_BACK_PRODUCT_CODE, frontlitFlatBackFormSchema, frontlitFlatBackTemplate } from "./frontlitFlatBack.js";
import { frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { getFormSchemaForTemplate, getProductTemplate } from "./productRegistry.js";
import { PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1 } from "./productEnablement.js";

const draft = {
  templateCode: FRONTLIT_FLAT_BACK_PRODUCT_CODE,
  values: {
    "root.inscription": "WORKOS",
    "face.finish": "none",
    "face.confirmedAreaMm2": 250000,
    "volume.depthMm": "60",
    "volume.finish": "none",
    "volume.confirmedPerimeterMm": 12500,
    "back.supportKind": "PANEL",
    "back.profile": "FLAT",
  },
};

describe("opt-in flat BACK product in existing configurator", () => {
  it("registers a distinct product, remains disabled by default and leaves original identity alone", () => {
    expect(getProductTemplate(FRONTLIT_FLAT_BACK_PRODUCT_CODE)).toBe(frontlitFlatBackTemplate);
    expect(getFormSchemaForTemplate(FRONTLIT_FLAT_BACK_PRODUCT_CODE)).toBe(frontlitFlatBackFormSchema);
    expect(PLATFORM_DEFAULT_ENABLED_TEMPLATE_CODES_V1).not.toContain(FRONTLIT_FLAT_BACK_PRODUCT_CODE);
    expect(frontlitPlexiAl06Template.code).not.toBe(FRONTLIT_FLAT_BACK_PRODUCT_CODE);
  });

  it("publishes BACK fields and permits a reviewed flat-panel configuration", () => {
    const preview = projectConfigurationPreview(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, draft);
    expect(preview.formSchema.sections.some((section) => section.componentId === "BACK")).toBe(true);
    expect(preview.readiness).toBe("ready");
    expect(preview.reviewId).toBeTruthy();
    const compiled = compileDefinition(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, draft);
    expect(compiled.values["back.profile"]).toBe("FLAT");
    expect(compiled.values["back.supportKind"]).toBe("PANEL");
    const confirmed = confirmReviewedDraft(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, draft, preview.reviewId!);
    expect(confirmed).toMatchObject({ templateCode: FRONTLIT_FLAT_BACK_PRODUCT_CODE });
  });

  it("carries reviewed flat BACK through the sole server evaluation and commercial price", () => {
    const definition = compileDefinition(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, draft);
    const truth = confirmReviewedDraft(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, draft, definition.reviewId);
    if ("ok" in truth) throw new Error("expected confirmed product truth");
    const accepted = compileAcceptedProductEvaluation({
      truth,
      template: frontlitFlatBackTemplate,
      formSchema: frontlitFlatBackFormSchema,
      labels: seededDisplayLabelCatalog(),
      costEvidenceRows: costEvidence,
      formulaVersionsForType: starterFormulaVersionsForType,
    });
    expect(accepted.truth.templateCode).toBe(FRONTLIT_FLAT_BACK_PRODUCT_CODE);
    expect(accepted.truth.values["back.profile"]).toBe("FLAT");
    expect(accepted.eic.completeness).toBe("COMPLETE");
    expect(accepted.evaluations.some((item) => item.component.id === "BACK")).toBe(true);
    expect(accepted.aggregate.requirements.some((item) => item.resourceId === FOREX_10MM_ID)).toBe(true);
    expect(projectCommercialPrice(accepted.eic).grossPrice).toBeGreaterThan(0);
  });

  it("blocks a frame/grooved injection even if request bypasses the form", () => {
    const preview = projectConfigurationPreview(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, {
      ...draft,
      values: { ...draft.values, "back.supportKind": "METAL_FRAME", "back.profile": "GROOVED" },
    });
    expect(preview.readiness).toBe("blocked");
    expect(preview.reviewId).toBeNull();
  });

  it("requires both BACK choices rather than silently falling back to old pricing", () => {
    const preview = projectConfigurationPreview(frontlitFlatBackTemplate, frontlitFlatBackFormSchema, {
      ...draft, values: { ...draft.values, "back.profile": "" },
    });
    expect(preview.readiness).toBe("blocked");
  });
});
