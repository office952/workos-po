import { describe, expect, it } from "vitest";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
  selectedComponentIds,
} from "./compiler.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import type { DraftConfiguration } from "./types.js";

function draft(values: DraftConfiguration["values"]): DraftConfiguration {
  return { templateCode: CANONICAL_PRODUCT_CODE, values };
}

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

describe("canonical product", () => {
  it("has a stable identity and unique component ids", () => {
    expect(frontlitPlexiAl06Template.code).toBe(CANONICAL_PRODUCT_CODE);
    expect(frontlitPlexiAl06Template.familyId).toBe("LIGHTED_VOLUMETRIC_SIGNS");
    expect(frontlitPlexiAl06Template.legacyReference).toBe(
      "TPL-VOLUMETRIC-LETTERS_v2",
    );
    expect(frontlitPlexiAl06Template.formSchemaId).toBe(
      frontlitPlexiAl06FormSchema.id,
    );
    const ids = frontlitPlexiAl06Template.components.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("fixes product identity and keeps lighting required", () => {
    expect(frontlitPlexiAl06Template.fixedValues["face.materialFamily"]).toBe(
      "plexiglas",
    );
    expect(frontlitPlexiAl06Template.fixedValues["face.thicknessMm"]).toBe(3);
    expect(frontlitPlexiAl06Template.fixedValues["face.opticalType"]).toBe("opal");
    expect(frontlitPlexiAl06Template.fixedValues["back.thicknessMm"]).toBe(10);
    expect(frontlitPlexiAl06Template.fixedValues["volume.materialFamily"]).toBe(
      "aluminium",
    );
    expect(frontlitPlexiAl06Template.fixedValues["volume.thicknessMm"]).toBe(0.6);
    expect(frontlitPlexiAl06Template.fixedValues["lighting.mode"]).toBe(
      "front_lit",
    );
    expect(
      frontlitPlexiAl06Template.components.find((item) => item.id === "LIGHTING")
        ?.required,
    ).toBe(true);
    const labels = frontlitPlexiAl06FormSchema.sections
      .flatMap((section) => section.fields)
      .map((field) => field.label);
    expect(labels).not.toContain("Include iluminare");
    expect(labels).not.toContain("Material față");
    expect(labels).not.toContain("Material cant");
    expect(labels).not.toContain("Finisaj cant");
  });

  it("keeps canonical depth options", () => {
    const depth = frontlitPlexiAl06FormSchema.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "volume.depthMm");
    expect(depth?.options?.map((option) => option.value)).toEqual([
      "30",
      "60",
      "80",
      "100",
    ]);
  });

  it("keeps form field ids unique and bound to known components", () => {
    const fields = frontlitPlexiAl06FormSchema.sections.flatMap(
      (section) => section.fields,
    );
    const fieldIds = fields.map((field) => field.id);
    expect(new Set(fieldIds).size).toBe(fieldIds.length);
    const componentIds = new Set([
      "ROOT",
      ...frontlitPlexiAl06Template.components.map((item) => item.id),
    ]);
    for (const field of fields) {
      expect(componentIds.has(field.componentId)).toBe(true);
      if (field.type === "select") {
        expect(field.options?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("module law", () => {
  it("includes required lighting without an include toggle", () => {
    expect(selectedComponentIds(frontlitPlexiAl06Template, readyValues)).toEqual([
      "FACE",
      "VOLUME",
      "BACK",
      "LIGHTING",
    ]);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft(readyValues),
    );
    expect(definition.values["lighting.mode"]).toBe("front_lit");
    expect(definition.values["face.materialFamily"]).toBe("plexiglas");
    expect(definition.values["face.opticalType"]).toBe("opal");
    expect(definition.values["volume.materialFamily"]).toBe("aluminium");
  });

  it("keeps product-fixed identity when the draft tries to change it", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft({
        ...readyValues,
        "face.materialFamily": "aluminum",
        "face.opticalType": "transparent",
        "lighting.mode": "halo",
      }),
    );
    expect(definition.values["face.materialFamily"]).toBe("plexiglas");
    expect(definition.values["face.opticalType"]).toBe("opal");
    expect(definition.values["lighting.mode"]).toBe("front_lit");
  });
});

describe("ProductDefinition", () => {
  it("compiles a valid draft to ready", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft(readyValues),
    );
    expect(definition.readiness).toBe("ready");
    expect(definition.missing).toEqual([]);
    expect(definition.selectedComponentIds).toEqual([
      "FACE",
      "VOLUME",
      "BACK",
      "LIGHTING",
    ]);
    expect(definition.templateCode).toBe(CANONICAL_PRODUCT_CODE);
  });

  it("blocks when a selected required field is missing", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft({ ...readyValues, "root.inscription": "" }),
    );
    expect(definition.readiness).toBe("blocked");
    expect(definition.missing.some((item) => item.fieldId === "root.inscription")).toBe(
      true,
    );
  });
});

describe("ProductTruth and ProductAggregate", () => {
  it("forbids confirmation while definition is blocked", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft({ ...readyValues, "root.inscription": "" }),
    );
    const result = confirmReviewedDefinition(definition, definition.reviewId);
    expect(result).toMatchObject({ ok: false, reason: "not_ready" });
  });

  it("confirms the exact reviewed definition, not a later draft", () => {
    const reviewed = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft(readyValues),
    );
    const changed = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft({ ...readyValues, "root.inscription": "CHANGED" }),
    );
    const rejected = confirmReviewedDefinition(changed, reviewed.reviewId);
    expect(rejected).toMatchObject({ ok: false, reason: "review_mismatch" });

    const truth = confirmReviewedDefinition(
      reviewed,
      reviewed.reviewId,
      "2026-08-14T18:00:00.000Z",
    );
    if ("ok" in truth) {
      throw new Error("expected confirmed truth");
    }
    expect(truth.values["root.inscription"]).toBe("WORKOS");
    expect(
      truth.measurements.find((item) => item.fieldId === "volume.confirmedPerimeterMm")
        ?.value,
    ).toBe(12500);
    expect(truth.measurements[0]?.source).toBe("OPERATOR_MANUAL");

    const aggregate = compileAggregate(
      truth,
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    expect(aggregate.quantities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "VOLUME",
          value: 12.5,
          unit: "m",
        }),
        expect.objectContaining({
          componentId: "FACE",
          value: 0.25,
          unit: "m2",
        }),
        expect.objectContaining({
          componentId: "BACK",
          value: 0.25,
          unit: "m2",
        }),
      ]),
    );
    expect(aggregate.unavailable).not.toContain(
      "Cantitatea de module LED nu poate fi calculată: lipsește perimetrul de volum confirmat",
    );
    expect(aggregate.componentStatuses.find((item) => item.id === "LIGHTING")?.status).toBe(
      "CALCULATED",
    );
    expect(aggregate.quantities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          componentId: "LIGHTING",
          id: "ledModuleQuantity",
          value: 125,
          unit: "buc",
        }),
      ]),
    );
    expect(aggregate.unavailable).toEqual([]);
    expect(aggregate.unavailable).not.toContain("Geometrie din Analyzer");
    expect(aggregate.unavailable).not.toContain("Regula de pas LED nu este stabilită");
    expect(truth.measurements.every((item) => item.source === "OPERATOR_MANUAL")).toBe(true);
    expect(truth.measurements.every((item) => item.confirmed)).toBe(true);
    expect(JSON.stringify(aggregate)).not.toMatch(
      /ledPitchMm|ledModulePowerW|psuReservePercent/,
    );
    expect(JSON.stringify(aggregate)).not.toMatch(/quote|markup/i);
    expect(JSON.stringify(aggregate)).not.toMatch(/RETURN_CANT|Lungime cant|"Cant"/);
  });

  it("blocks when the confirmed perimeter is missing", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft({ ...readyValues, "volume.confirmedPerimeterMm": null }),
    );
    expect(definition.readiness).toBe("blocked");
    expect(
      definition.missing.some(
        (item) => item.fieldId === "volume.confirmedPerimeterMm",
      ),
    ).toBe(true);
  });

  it("blocks when the confirmed face area is missing", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft({ ...readyValues, "face.confirmedAreaMm2": null }),
    );
    expect(definition.readiness).toBe("blocked");
    expect(
      definition.missing.some((item) => item.fieldId === "face.confirmedAreaMm2"),
    ).toBe(true);
  });

  it("does not invent a quantity without confirmed measurement", () => {
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      draft(readyValues),
    );
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    if ("ok" in truth) {
      throw new Error("expected confirmed truth");
    }
    const aggregate = compileAggregate(
      { ...truth, measurements: [] },
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    expect(aggregate.quantities).toEqual([]);
  });
});
