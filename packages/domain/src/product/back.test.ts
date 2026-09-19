import { describe, expect, it } from "vitest";
import { FOREX_10MM_ID } from "../resources/catalog.js";
import { BACK_COMPONENT_ID, forexBackContract } from "./back.js";

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
