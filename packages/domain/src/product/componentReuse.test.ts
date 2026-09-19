import { describe, expect, it } from "vitest";
import { compileEic } from "../resources/eic.js";
import { getComponentContract } from "./componentRegistry.js";
import { FACE_AREA_FIELD, plexiglasFaceContract } from "./face.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "./compiler.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "./frontlitPlexiAl06.js";
import type { ProductAggregate, ProductTemplate, ProductTruth } from "./types.js";

describe("component reuse", () => {
  it("uses the same FACE contract independently and from the canonical product", () => {
    const independent = plexiglasFaceContract.calculate({
      values: {
        "face.thicknessMm": 3,
        "face.opticalType": "opal",
      },
      measurements: plexiglasFaceContract.collectMeasurements({
        [FACE_AREA_FIELD]: 250000,
      }),
      shared: {},
      technicalSettings: [],
    });

    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
      },
    );
    const truth = confirmReviewedDefinition(definition, definition.reviewId);
    if ("ok" in truth) {
      throw new Error("expected confirmed truth");
    }
    const aggregate = compileAggregate(
      truth,
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    const fromProduct = aggregate.quantities.find((item) => item.componentId === "FACE");

    expect(getComponentContract("PLEXIGLAS_FACE")).toBe(plexiglasFaceContract);
    expect(fromProduct).toEqual(independent.quantities[0]);
  });

  it("reuses FACE and VOLUME contracts on a test-only composition", () => {
    const synthetic: ProductTemplate = {
      ...frontlitPlexiAl06Template,
      code: "TEST-ONLY-FACE-VOLUME",
      components: frontlitPlexiAl06Template.components.filter((item) =>
        ["FACE", "VOLUME"].includes(item.id),
      ),
    };
    const truth: ProductTruth = {
      status: "CONFIRMED_IN_RUNTIME",
      templateCode: synthetic.code,
      templateVersion: synthetic.version,
      familyId: synthetic.familyId,
      selectedComponentIds: ["FACE", "VOLUME"],
      values: {
        "root.inscription": "TEST",
        "face.thicknessMm": 3,
        "face.opticalType": "opal",
        "face.confirmedAreaMm2": 250000,
        "volume.depthMm": "60",
        "volume.confirmedPerimeterMm": 12500,
      },
      measurements: [
        ...plexiglasFaceContract.collectMeasurements({
          [FACE_AREA_FIELD]: 250000,
        }),
        ...getComponentContract("ALUMINIUM_VOLUME").collectMeasurements({
          "volume.confirmedPerimeterMm": 12500,
        }),
      ],
      reviewId: "test",
      confirmedAt: "2026-08-14T21:00:00.000Z",
    };
    const aggregate = compileAggregate(
      truth,
      synthetic,
      frontlitPlexiAl06FormSchema,
      seededDisplayLabelCatalog(),
    );
    expect(aggregate.quantities.map((item) => item.id)).toEqual([
      "face_area",
      "volume_linear",
      "volume_lateral",
    ]);
    expect(aggregate.componentStatuses.map((item) => item.status)).toEqual([
      "CALCULATED",
      "CALCULATED",
    ]);
    const eic = compileEic(aggregate);
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.total).toBe(104);
    expect(eic.excludedComponentLabels).toEqual([]);
  });

  it("lets generic EIC follow an arbitrary composition status list", () => {
    const aggregate: ProductAggregate = {
      derivedFrom: "ProductTruth",
      productLabel: "Sintetic",
      familyLabel: "Test",
      inscription: "X",
      components: [],
      quantities: [],
      requirements: [
        {
          componentId: "VOLUME",
          resourceId: "aluminium_return_profile",
          quantity: 12.5,
          unit: "m",
          costQualifier: { volumeDepthMm: 60 },
        },
      ],
      componentStatuses: [
        {
          id: "VOLUME",
          label: "Volum",
          typeId: "ALUMINIUM_VOLUME",
          status: "CALCULATED",
          unavailable: [],
        },
        {
          id: "OTHER",
          label: "Altceva",
          typeId: "LIGHTING_FRONT_LED",
          status: "UNAVAILABLE",
          unavailable: ["lipsă"],
        },
      ],
      unavailable: ["lipsă"],
    };
    const eic = compileEic(aggregate);
    expect(eic.completeness).toBe("PARTIAL");
    expect(eic.excludedComponentLabels).toEqual(["Altceva"]);
    expect(eic.total).toBe(37.5);
  });
});
