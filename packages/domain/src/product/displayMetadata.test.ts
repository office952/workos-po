import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "./frontlitPlexiAl06.js";
import {
  createDisplayLabelCatalog,
  DISPLAY_LABEL_MAX_LENGTH,
  isKnownProductSystemEntity,
  isProductSystemEntityKind,
  presentedTemplate,
  seedDisplayLabelRecords,
  seededDisplayLabelCatalog,
  validateDisplayLabel,
} from "./displayMetadata.js";

describe("display metadata", () => {
  it("seeds every family category template and constructive type", () => {
    const seeds = seedDisplayLabelRecords();
    expect(seeds.map((item) => `${item.entityKind}:${item.entityId}`)).toEqual([
      "PRODUCT_FAMILY:LIGHTED_VOLUMETRIC_SIGNS",
      "PRODUCT_FAMILY:SIGN_PANELS",
      "PRODUCT_CATEGORY:FRONT_LIT_VOLUMETRIC_LETTERS",
      "PRODUCT_CATEGORY:HALO_LIT_VOLUMETRIC_LETTERS",
      "PRODUCT_CATEGORY:FULL_ALUMINIUM_VOLUMETRIC_LETTERS",
      "PRODUCT_CATEGORY:ACM_CASSETTE_PANELS",
      `PRODUCT_TEMPLATE:${CANONICAL_PRODUCT_CODE}`,
      "PRODUCT_TEMPLATE:PRD-ACM-CASSETTE-NONE",
      "COMPONENT_TYPE:PLEXIGLAS_FACE",
      "COMPONENT_TYPE:ALUMINIUM_VOLUME",
      "COMPONENT_TYPE:FOREX_BACK",
      "COMPONENT_TYPE:LIGHTING_FRONT_LED",
      "COMPONENT_TYPE:ACM_CASSETTE_BODY",
      "COMPONENT_TYPE:STEEL_INTERNAL_FRAME",
    ]);
    expect(isKnownProductSystemEntity("COMPONENT_TYPE", "PLEXIGLAS_FACE")).toBe(true);
    expect(isKnownProductSystemEntity("COMPONENT_TYPE", "FACE_PLEXIGLAS_3MM")).toBe(
      false,
    );
    expect(isProductSystemEntityKind("PRODUCT_FAMILY")).toBe(true);
    expect(isProductSystemEntityKind("TECHNICAL_SETTING")).toBe(false);
  });

  it("rejects empty overlong and missing labels", () => {
    const valid = validateDisplayLabel("  Plexiglas  ");
    expect(valid.ok).toBe(true);
    if (valid.ok) {
      expect(valid.displayLabel).toBe("Plexiglas");
    }
    expect(validateDisplayLabel("").ok).toBe(false);
    expect(validateDisplayLabel("   ").ok).toBe(false);
    expect(validateDisplayLabel("x".repeat(DISPLAY_LABEL_MAX_LENGTH + 1)).ok).toBe(
      false,
    );
    expect(validateDisplayLabel(12).ok).toBe(false);
    expect(() => createDisplayLabelCatalog([])).toThrow(/missing_display_labels/);
  });

  it("keeps stable ids when a presented label changes", () => {
    const records = seedDisplayLabelRecords().map((item) =>
      item.entityId === "PLEXIGLAS_FACE"
        ? { ...item, displayLabel: "Plexiglas opal administrat", revision: 2 }
        : item,
    );
    const labels = createDisplayLabelCatalog(records);
    const template = presentedTemplate(CANONICAL_PRODUCT_CODE, labels);
    expect(template?.code).toBe(CANONICAL_PRODUCT_CODE);
    expect(template?.components.map((item) => item.typeId)).toEqual([
      "PLEXIGLAS_FACE",
      "ALUMINIUM_VOLUME",
      "FOREX_BACK",
      "LIGHTING_FRONT_LED",
    ]);
    expect(labels.label("COMPONENT_TYPE", "PLEXIGLAS_FACE")).toBe(
      "Plexiglas opal administrat",
    );
    expect(labels.revision("COMPONENT_TYPE", "PLEXIGLAS_FACE")).toBe(2);
    expect(seededDisplayLabelCatalog().label("COMPONENT_TYPE", "PLEXIGLAS_FACE")).toBe(
      "Plexiglas",
    );
  });
});
