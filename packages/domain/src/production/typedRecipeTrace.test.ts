import { describe, expect, it } from "vitest";
import { projectCommercialPrice } from "../commercial/price.js";
import { DEFAULT_COMMERCIAL_POLICY } from "../commercial/policy.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import { acmCassetteNoneFormSchema, acmCassetteNoneTemplate } from "../product/acmCassetteNone.js";
import { compileAcceptedProductEvaluation } from "../product/acceptedEvaluation.js";
import { compileDefinition, confirmReviewedDefinition } from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import { frontlitPlexiAl06FormSchema, frontlitPlexiAl06Template } from "../product/frontlitPlexiAl06.js";
import {
  logoFrontlitPlexiAl06FormSchema,
  logoFrontlitPlexiAl06Template,
  logoReadyValues,
} from "../product/logoFrontlitPlexiAl06.js";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import type { DraftValues, FormSchema, ProductTemplate } from "../product/types.js";
import { CUT_SHEET_CNC_ID } from "../processes/catalog.js";
import { SVC_CNC_FACE_ID, SVC_CNC_SHEET_PANEL_ID, costEvidence } from "../resources/catalog.js";
import { RCP_CNC_FACE_ID, RCP_CNC_SHEET_PANEL_ID, recipeForProcessScope } from "../resources/recipes.js";

const acmValues: DraftValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};
const lettersValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function frozen(template: ProductTemplate, schema: FormSchema, values: DraftValues) {
  const definition = compileDefinition(template, schema, { templateCode: template.code, values });
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("truth was not confirmed");
  }
  const compiled = compileAcceptedProductEvaluation({
    truth,
    template,
    formSchema: schema,
    labels: seededDisplayLabelCatalog(),
    costEvidenceRows: costEvidence,
    formulaVersionsForType: starterFormulaVersionsForType,
  });
  const quote = freezeQuoteSnapshot(
    compiled.truth,
    compiled.aggregate,
    compiled.composition,
    compiled.eic,
    projectCommercialPrice(compiled.eic, DEFAULT_COMMERCIAL_POLICY),
    { createdAt: "2026-10-10T08:00:00.000Z" },
  );
  if (!quote.ok) {
    throw new Error(quote.error);
  }
  return { compiled, quote: quote.snapshot };
}

describe("frozen recipe traces follow the typed recipe selected by EIC", () => {
  it("ACM cassette CNC on FACE freezes the sheet-panel recipe that EIC charged", () => {
    const { compiled, quote } = frozen(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, acmValues);
    const cncNode = compiled.composition.nodes.find((node) => node.processId === CUT_SHEET_CNC_ID);
    expect(cncNode?.scope).toBe("FACE");
    expect(cncNode?.typeId).toBe("ACM_CASSETTE_BODY");
    expect(recipeForProcessScope(CUT_SHEET_CNC_ID, "FACE", cncNode?.typeId)?.id).toBe(RCP_CNC_SHEET_PANEL_ID);
    expect(recipeForProcessScope(CUT_SHEET_CNC_ID, "FACE")?.id).toBe(RCP_CNC_FACE_ID);

    const eicLine = compiled.eic.lines.find((line) => line.resourceId === SVC_CNC_SHEET_PANEL_ID);
    expect(eicLine).toBeDefined();
    expect(compiled.eic.lines.some((line) => line.resourceId === SVC_CNC_FACE_ID)).toBe(false);

    const traces = quote.productionInput.usedRecipes.filter((trace) => trace.processId === CUT_SHEET_CNC_ID);
    expect(traces).toHaveLength(1);
    const trace = traces[0]!;
    expect(trace.recipeId).toBe(RCP_CNC_SHEET_PANEL_ID);
    expect(trace.resourceId).toBe(SVC_CNC_SHEET_PANEL_ID);
    expect(trace.costEvidenceId).toBe(SVC_CNC_SHEET_PANEL_ID);
    expect(trace.unit).toBe("m2");
    expect(trace.currency).toBe(eicLine!.currency);
    expect(trace.rate).toBe(eicLine!.rate);
    expect(trace.quantity).toBe(eicLine!.quantity);
    expect(trace.cost).toBe(eicLine!.cost);

    const operation = quote.productionInput.operations.find((item) => item.processId === CUT_SHEET_CNC_ID)!;
    expect(operation.resourceDemands).toEqual([
      { resourceId: SVC_CNC_SHEET_PANEL_ID, label: "Debitare CNC foaie panou", quantity: eicLine!.quantity, unit: "m2" },
    ]);
    expect(operation.quantities).toEqual([{ label: "Suprafață", value: eicLine!.quantity, unit: "m2" }]);
  });

  it("does not change the monetary EIC of ACM, letters or logo", () => {
    const acm = frozen(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, acmValues);
    const letters = frozen(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, lettersValues);
    const logo = frozen(logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, logoReadyValues);
    expect(acm.quote.eic.total).toBe(acm.compiled.eic.total);
    expect(letters.quote.eic.total).toBe(letters.compiled.eic.total);
    expect(logo.quote.eic.total).toBe(logo.compiled.eic.total);
    expect(acm.compiled.eic.total).toMatchInlineSnapshot(`72.644`);
    expect(letters.compiled.eic.total).toMatchInlineSnapshot(`382.5`);
    expect(logo.compiled.eic.total).toMatchInlineSnapshot(`260.76`);
  });

  it("keeps letters and logo traces unchanged because their typed and untyped recipes coincide", () => {
    for (const [template, schema, values] of [
      [frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, lettersValues],
      [logoFrontlitPlexiAl06Template, logoFrontlitPlexiAl06FormSchema, logoReadyValues],
    ] as const) {
      const { compiled } = frozen(template, schema, values);
      for (const node of compiled.composition.nodes) {
        expect(recipeForProcessScope(node.processId, node.scope, node.typeId)?.id).toBe(
          recipeForProcessScope(node.processId, node.scope)?.id,
        );
      }
    }
  });
});
