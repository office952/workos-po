import { describe, expect, it } from "vitest";
import { PLEXIGLAS_3MM_OPAL_ID } from "../resources/catalog.js";
import {
  FACE_AREA_FIELD,
  FACE_COMPONENT_ID,
  FACE_MISSING_AREA,
  plexiglasFaceContract,
} from "./face.js";

const currentFaceConfig = {
  "face.thicknessMm": 3,
  "face.opticalType": "opal",
};

describe("PLEXIGLAS_FACE", () => {
  it("converts confirmed area to quantity and plexiglas demand without a product", () => {
    const measurements = plexiglasFaceContract.collectMeasurements({
      [FACE_AREA_FIELD]: 250000,
    });
    const result = plexiglasFaceContract.calculate({
      values: currentFaceConfig,
      measurements,
      shared: {},
      technicalSettings: [],
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.typeId).toBe("PLEXIGLAS_FACE");
    expect(result.quantities).toEqual([
      expect.objectContaining({
        componentId: FACE_COMPONENT_ID,
        value: 0.25,
        unit: "m2",
      }),
    ]);
    expect(result.requirements).toEqual([
      {
        componentId: FACE_COMPONENT_ID,
        resourceId: PLEXIGLAS_3MM_OPAL_ID,
        quantity: 0.25,
        unit: "m2",
      },
    ]);
    expect(result.unavailable).toEqual([]);
    expect(result.unavailable).not.toContain("Geometrie din Analyzer");
  });

  it("does not invent a FACE quantity without measurement", () => {
    const result = plexiglasFaceContract.calculate({
      values: currentFaceConfig,
      measurements: [],
      shared: {},
      technicalSettings: [],
    });
    expect(result.status).toBe("MISSING_MEASUREMENT");
    expect(result.quantities).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.unavailable).toEqual([FACE_MISSING_AREA]);
    expect(result.unavailable).not.toContain("Geometrie din Analyzer");
  });
});
