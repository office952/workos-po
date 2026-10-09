import { describe, expect, it } from "vitest";
import { FOREX_10MM_ID } from "../resources/catalog.js";
import { BACK_COMPONENT_ID, forexBackContract } from "./back.js";
import { frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";

describe("FOREX_BACK", () => {
  it("owns supplied-area to quantity and forex demand without a product", () => {
    const result = forexBackContract.calculate({
      values: { "back.thicknessMm": 10 },
      measurements: [],
      shared: { confirmedAreaMm2: 250000 },
      technicalSettings: [],
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.quantities).toEqual([
      expect.objectContaining({
        componentId: BACK_COMPONENT_ID,
        value: 0.25,
        unit: "m2",
      }),
    ]);
    expect(result.requirements).toEqual([
      {
        componentId: BACK_COMPONENT_ID,
        resourceId: FOREX_10MM_ID,
        quantity: 0.25,
        unit: "m2",
      },
    ]);
  });

  it("derives forex demand only from the confirmed letters face area", () => {
    const base = forexBackContract.calculate({
      values: { "back.thicknessMm": 10 },
      measurements: [],
      shared: { confirmedAreaMm2: 250000 },
      technicalSettings: [],
    });
    const withPanelFacts = forexBackContract.calculate({
      values: {
        "back.thicknessMm": 10,
        "face.widthMm": 3000,
        "face.heightMm": 800,
        "face.cassetteDepthMm": 80,
      },
      measurements: [],
      shared: { confirmedAreaMm2: 250000 },
      technicalSettings: [],
    });
    expect(withPanelFacts).toEqual(base);
    const larger = forexBackContract.calculate({
      values: { "back.thicknessMm": 10 },
      measurements: [],
      shared: { confirmedAreaMm2: 400000 },
      technicalSettings: [],
    });
    expect(larger.requirements).toEqual([
      { componentId: BACK_COMPONENT_ID, resourceId: FOREX_10MM_ID, quantity: 0.4, unit: "m2" },
    ]);
    expect(frontlitPlexiAl06Template.components.find((item) => item.id === "BACK")).toMatchObject({
      typeId: "FOREX_BACK",
      inputMapping: { confirmedAreaMm2FromComponentId: "FACE" },
    });
  });

  it("does not assume FACE area unless composition supplies it", () => {
    const result = forexBackContract.calculate({
      values: { "back.thicknessMm": 10 },
      measurements: [],
      shared: {},
      technicalSettings: [],
    });
    expect(result.status).toBe("MISSING_MEASUREMENT");
    expect(result.quantities).toEqual([]);
    expect(result.requirements).toEqual([]);
  });
});
