import { describe, expect, it } from "vitest";
import { FOREX_10MM_ID } from "../resources/catalog.js";
import { RCP_CNC_BACK_ID } from "../resources/recipes.js";
import { CUT_SHEET_CNC_ID } from "../processes/catalog.js";
import { planBackManufacturing } from "./backManufacturing.js";

describe("constructive BACK manufacturing plan", () => {
  const values = { "back.supportKind": "PANEL", "back.profile": "FLAT", "back.thicknessMm": 10 };
  it("resolves existing flat forex sheet and CNC recipe from confirmed geometry", () => {
    expect(planBackManufacturing(values, 250000)).toEqual({
      status: "READY",
      profile: "FLAT",
      resourceId: FOREX_10MM_ID,
      materialAreaM2: 0.25,
      processId: CUT_SHEET_CNC_ID,
      recipeId: RCP_CNC_BACK_ID,
    });
  });
  it("does not mistake generic CNC sheet cutting for groove machining", () => {
    expect(planBackManufacturing({ ...values, "back.supportKind": "METAL_FRAME", "back.profile": "GROOVED" }, 250000))
      .toEqual({ status: "BLOCKED", reason: "groove_recipe_missing" });
  });
  it("blocks missing, invalid or unsupported measurements and materials", () => {
    expect(planBackManufacturing(values, undefined)).toMatchObject({ status: "BLOCKED", reason: "missing_geometry" });
    expect(planBackManufacturing(values, -1)).toMatchObject({ status: "BLOCKED", reason: "missing_geometry" });
    expect(planBackManufacturing({ ...values, "back.thicknessMm": 99 }, 250000).status).toBe("BLOCKED");
    expect(planBackManufacturing({ ...values, "back.profile": "GROOVED" }, 250000).status).toBe("BLOCKED");
  });
});
