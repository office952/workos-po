import { describe, expect, it } from "vitest";
import {
  ALUMINIUM_RETURN_PROFILE_ID,
  RETURN_CANT_FORMING_ID,
} from "../resources/catalog.js";
import {
  VOLUME_COMPONENT_ID,
  VOLUME_MISSING_PERIMETER,
  VOLUME_PERIMETER_FIELD,
  aluminiumVolumeContract,
  volumeLinearMeters,
} from "./volume.js";

describe("ALUMINIUM_VOLUME", () => {
  it("converts confirmed perimeter in one path", () => {
    expect(volumeLinearMeters(12500)).toBe(12.5);
  });

  it("builds volume quantity and resource demand without a product", () => {
    const measurements = aluminiumVolumeContract.collectMeasurements({
      [VOLUME_PERIMETER_FIELD]: 12500,
      "volume.depthMm": "60",
    });
    const result = aluminiumVolumeContract.calculate({
      values: { "volume.depthMm": "60" },
      measurements,
      shared: {},
      technicalSettings: [],
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.quantities).toEqual([
      expect.objectContaining({
        componentId: VOLUME_COMPONENT_ID,
        value: 12.5,
        unit: "m",
        label: "Lungime volum",
      }),
      expect.objectContaining({
        componentId: VOLUME_COMPONENT_ID,
        id: "volume_lateral",
        value: 0.75,
        unit: "m2",
        label: "Suprafață laterală volum",
      }),
    ]);
    expect(result.requirements).toEqual([
      {
        componentId: VOLUME_COMPONENT_ID,
        resourceId: ALUMINIUM_RETURN_PROFILE_ID,
        quantity: 12.5,
        unit: "m",
        costQualifier: { volumeDepthMm: 60 },
      },
      {
        componentId: VOLUME_COMPONENT_ID,
        resourceId: RETURN_CANT_FORMING_ID,
        quantity: 12.5,
        unit: "m",
      },
    ]);
    expect(result.unavailable).toEqual([]);
    expect(result.unavailable).not.toContain("Geometrie din Analyzer");
  });

  it("does not invent a VOLUME quantity without measurement", () => {
    const result = aluminiumVolumeContract.calculate({
      values: {},
      measurements: [],
      shared: {},
      technicalSettings: [],
    });
    expect(result.status).toBe("MISSING_MEASUREMENT");
    expect(result.quantities).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.unavailable).toEqual([VOLUME_MISSING_PERIMETER]);
    expect(result.unavailable).not.toContain("Geometrie din Analyzer");
  });
});
