import { describe, expect, it } from "vitest";
import { ACM_3MM_ID, FOREX_10MM_ID } from "../resources/catalog.js";
import { compileDefinition, confirmReviewedDefinition } from "./compiler.js";
import { evaluateProductComponents } from "./componentEvaluation.js";
import { frontlitPlexiAl06FormSchema, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { starterFormulaVersionsForType } from "./resolveFormulas.js";
import {
  LETTERS_MOUNTING_CONTEXT_FIELD,
  LETTERS_MOUNTING_ON_ACM_PANEL,
} from "./lettersMountingContext.js";

const baseLetters = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

describe("letters mounting context on canonical product", () => {
  it("keeps standalone letters without constructive BACK fields ready", () => {
    const definition = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
      templateCode: frontlitPlexiAl06Template.code,
      values: baseLetters,
    });
    expect(definition.readiness).toBe("ready");
    expect(definition.values["back.supportKind"]).toBeUndefined();
  });

  it("requires explicit panel flat BACK when mounting on ACM panel", () => {
    const definition = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
      templateCode: frontlitPlexiAl06Template.code,
      values: { ...baseLetters, [LETTERS_MOUNTING_CONTEXT_FIELD]: LETTERS_MOUNTING_ON_ACM_PANEL },
    });
    expect(definition.readiness).toBe("blocked");
    expect(definition.missing.some((item) => item.componentId === "BACK")).toBe(true);
  });

  it("still costs Forex from face area when panel mount context is confirmed", () => {
    const values = {
      ...baseLetters,
      [LETTERS_MOUNTING_CONTEXT_FIELD]: LETTERS_MOUNTING_ON_ACM_PANEL,
      "back.supportKind": "PANEL",
      "back.profile": "FLAT",
      "face.widthMm": 3000,
      "face.heightMm": 800,
    };
    const definition = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
      templateCode: frontlitPlexiAl06Template.code,
      values,
    });
    expect(definition.readiness).toBe("ready");
    const evaluations = evaluateProductComponents({
      template: frontlitPlexiAl06Template,
      selectedComponentIds: definition.selectedComponentIds,
      values: definition.values,
      measurements: definition.measurements,
      formulaVersionsForType: starterFormulaVersionsForType,
    });
    const requirements = evaluations.flatMap((item) => item.result.requirements);
    const forex = requirements.find((item) => item.resourceId === FOREX_10MM_ID);
    const acm = requirements.find((item) => item.resourceId === ACM_3MM_ID);
    expect(forex?.quantity).toBe(0.25);
    expect(acm).toBeUndefined();
  });

  it("blocks grooved/frame combinations fail-closed", () => {
    const values = {
      ...baseLetters,
      [LETTERS_MOUNTING_CONTEXT_FIELD]: LETTERS_MOUNTING_ON_ACM_PANEL,
      "back.supportKind": "METAL_FRAME",
      "back.profile": "GROOVED",
    };
    const definition = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
      templateCode: frontlitPlexiAl06Template.code,
      values,
    });
    expect(definition.readiness).toBe("blocked");
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    expect("ok" in truth && truth.ok === false).toBe(true);
  });
});
