import { describe, expect, it } from "vitest";
import { lightingFrontLedContract } from "./lighting.js";

describe("unpriced advanced LED configuration safeguards", () => {
  for (const advanced of ([ 
    { "lighting.moduleTypeId": "example-module" },
    { "lighting.voltageV": 12 },
    { "lighting.colorTemperatureK": 4000 },
    { "lighting.moduleTypeId": "example-module", "lighting.voltageV": 24, "lighting.colorTemperatureK": 6000 },
  ] as Record<string, string | number | boolean | null>[])) {
    it("blocks unversioned LED module selections without requirements or quantities", () => {
      const result = lightingFrontLedContract.calculate({
        values: { "lighting.mode": "front_lit", ...advanced },
        measurements: [],
        shared: {},
        technicalSettings: [],
      });
      expect(result.status).toBe("UNAVAILABLE");
      expect(result.quantities).toEqual([]);
      expect(result.requirements).toEqual([]);
      expect(result.unavailable).toContain(
        "Selecția LED necesită catalog de module, compatibilitate electrică și rețete versionate.",
      );
    });
  }
});
