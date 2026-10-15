import { describe, expect, it } from "vitest";
import { FOREX_10MM_ID, SVC_CNC_BACK_ID, costEvidence } from "../resources/catalog.js";
import { RCP_CNC_BACK_ID, getCostRecipe, resolveRecipeInternalCost } from "../resources/recipes.js";
import { CUT_SHEET_CNC_ID } from "../processes/catalog.js";
import {
  FOREX_BACK_CHANNEL_RECIPE_ID,
  forexBackChannelRecipe,
  planBackManufacturing,
} from "./backManufacturing.js";

describe("constructive BACK manufacturing plan", () => {
  const values = {
    "back.supportKind": "PANEL",
    "back.profile": "FLAT",
    "back.thicknessMm": 10,
    "volume.confirmedPerimeterMm": 12500,
  };

  it("resolves flat forex sheet and the existing CNC contour recipe from confirmed geometry", () => {
    expect(planBackManufacturing(values, 250000)).toEqual({
      status: "READY",
      profile: "FLAT",
      resourceId: FOREX_10MM_ID,
      materialAreaM2: 0.25,
      processId: CUT_SHEET_CNC_ID,
      recipeId: RCP_CNC_BACK_ID,
      cut: {
        processId: CUT_SHEET_CNC_ID,
        recipeId: RCP_CNC_BACK_ID,
        quantityM: 12.5,
      },
      groove: null,
    });
    expect(planBackManufacturing({ ...values, "volume.confirmedPerimeterMm": 1000 }, 250000)).toMatchObject({
      cut: { quantityM: 1 },
      materialAreaM2: 0.25,
    });
  });

  it("keeps flat available on a metal frame and grooved available as a choice on a panel", () => {
    expect(planBackManufacturing({ ...values, "back.supportKind": "METAL_FRAME" }, 250000)).toMatchObject({
      status: "READY",
      profile: "FLAT",
      groove: null,
    });
    expect(planBackManufacturing({ ...values, "back.profile": "GROOVED" }, 250000)).toEqual({
      status: "BLOCKED",
      reason: "groove_recipe_missing",
    });
  });

  it("does not mistake generic CNC sheet cutting for groove machining", () => {
    expect(getCostRecipe(FOREX_BACK_CHANNEL_RECIPE_ID)).toBeUndefined();
    expect(forexBackChannelRecipe()).toBeUndefined();
    expect(resolveRecipeInternalCost(RCP_CNC_BACK_ID, 12.5).status).toBe("RESOLVED");
    expect(planBackManufacturing({ ...values, "back.profile": "GROOVED", "back.supportKind": "PANEL" }, 250000))
      .toEqual({ status: "BLOCKED", reason: "groove_recipe_missing" });
    const { "back.supportKind": _ignoredSupport, ...standalone } = values;
    expect(planBackManufacturing({ ...standalone, "back.profile": "GROOVED" }, 250000))
      .toEqual({ status: "BLOCKED", reason: "groove_recipe_missing" });
  });

  it("blocks CNC contour cost when the confirmed perimeter or the back rate is missing", () => {
    expect(planBackManufacturing(values, 250000, [])).toEqual({
      status: "BLOCKED",
      reason: "cnc_cost_unavailable",
    });
    expect(planBackManufacturing(values, 250000, costEvidence.filter((item) => item.resourceId !== SVC_CNC_BACK_ID)))
      .toEqual({ status: "BLOCKED", reason: "cnc_cost_unavailable" });
    const { "volume.confirmedPerimeterMm": _ignoredPerimeter, ...withoutPerimeter } = values;
    expect(planBackManufacturing(withoutPerimeter, 250000))
      .toEqual({ status: "BLOCKED", reason: "cnc_cost_unavailable" });
  });

  it("blocks missing, invalid or unsupported measurements and materials", () => {
    expect(planBackManufacturing(values, undefined)).toMatchObject({ status: "BLOCKED", reason: "missing_geometry" });
    expect(planBackManufacturing(values, -1)).toMatchObject({ status: "BLOCKED", reason: "missing_geometry" });
    expect(planBackManufacturing({ ...values, "back.thicknessMm": 99 }, 250000).status).toBe("BLOCKED");
    expect(planBackManufacturing({ ...values, "back.profile": "GROOVED" }, 250000).status).toBe("BLOCKED");
    expect(planBackManufacturing({ ...values, "back.profile": "AUTO" }, 250000)).toEqual({
      status: "BLOCKED",
      reason: "invalid_profile",
    });
  });
});
