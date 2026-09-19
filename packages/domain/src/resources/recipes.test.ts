import { describe, expect, it } from "vitest";
import {
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_CONTOUR_PLOTTER_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  operationalProcesses,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  PRINT_WIDE_FORMAT_ID,
  WELD_ALUMINIUM_JOIN_ID,
  WELD_STEEL_JOIN_ID,
  WIRE_LIGHTING_ID,
} from "../processes/catalog.js";
import { coverageForCapability, providersForProcess } from "../workcenters/providers.js";
import { recipeGapForProcess } from "../workcenters/recipeGap.js";
import { RETURN_CANT_FORMING_ID } from "./catalog.js";
import {
  costRecipes,
  expectedRecipeKindForProcess,
  getCostRecipe,
  processesMissingRecipe,
  RCP_BOND_LETTER_BODY_ID,
  RCP_CNC_BACK_ID,
  RCP_CNC_FACE_ID,
  RCP_ELECTRICAL_FINISH_ID,
  RCP_PLACE_LED_MODULES_ID,
  RCP_PROFILE_FORMING_ID,
  recipeForProcess,
  recipeForProcessScope,
  resolveRecipeInternalCost,
} from "./recipes.js";

describe("cost recipes", () => {
  it("keeps unique LETTERS recipes without machine-hour rates", () => {
    expect(costRecipes.map((item) => item.id)).toEqual([
      RCP_PROFILE_FORMING_ID,
      RCP_CNC_FACE_ID,
      RCP_CNC_BACK_ID,
      "RCP_VINYL_FACE_LABOR",
      "RCP_VINYL_VOLUME_LABOR",
      RCP_BOND_LETTER_BODY_ID,
      "RCP_CLOSE_LETTER_BODY",
      RCP_PLACE_LED_MODULES_ID,
      RCP_ELECTRICAL_FINISH_ID,
      "RCP_PAINT_RAL",
      "RCP_PACK_PRODUCT",
      "RCP_CNC_SHEET_PANEL",
      "RCP_CUT_METAL_STOCK",
      "RCP_FORM_SHEET_CASSETTE",
      "RCP_ATTACH_INTERNAL_FRAME",
    ]);
    const forming = getCostRecipe(RCP_PROFILE_FORMING_ID);
    expect(forming).toEqual(
      expect.objectContaining({
        kind: "SERVICE",
        processIds: [FORM_ALUMINIUM_PROFILE_ID],
        quantityBasis: "VOLUME_PERIMETER_M",
        unit: "m",
        costEvidenceId: RETURN_CANT_FORMING_ID,
        lifecycle: "ACTIVE",
      }),
    );
    expect(recipeForProcess(FORM_ALUMINIUM_PROFILE_ID)?.id).toBe(RCP_PROFILE_FORMING_ID);
    expect(JSON.stringify(costRecipes)).not.toMatch(/hourly|machineHour|employee|EUR\/h/);
  });

  it("resolves forming cost from existing evidence without inventing quantity", () => {
    const resolved = resolveRecipeInternalCost(RCP_PROFILE_FORMING_ID, 12.5);
    expect(resolved).toEqual({
      status: "RESOLVED",
      recipeId: RCP_PROFILE_FORMING_ID,
      resourceId: RETURN_CANT_FORMING_ID,
      quantity: 12.5,
      unit: "m",
      rate: 5,
      currency: "EUR",
      cost: 62.5,
    });
  });

  it("scopes CNC face and back on the same process with distinct development rates", () => {
    expect(recipeForProcessScope(CUT_SHEET_CNC_ID, "FACE")?.id).toBe(RCP_CNC_FACE_ID);
    expect(recipeForProcessScope(CUT_SHEET_CNC_ID, "BACK")?.id).toBe(RCP_CNC_BACK_ID);
    expect(recipeForProcessScope(CUT_SHEET_CNC_ID, "FACE", "PLEXIGLAS_FACE")?.id).toBe(
      RCP_CNC_FACE_ID,
    );
    expect(recipeForProcessScope(CUT_SHEET_CNC_ID, "FACE", "ACM_CASSETTE_BODY")?.id).toBe(
      "RCP_CNC_SHEET_PANEL",
    );
    expect(expectedRecipeKindForProcess(CUT_SHEET_CNC_ID)).toBe("SERVICE");
    expect(recipeGapForProcess(CUT_SHEET_CNC_ID)).toBe("CANONICAL_COST_EXISTS");
    expect(coverageForCapability("CNC_ROUTING")).toBe("COVERED");
    expect(providersForProcess(CUT_SHEET_CNC_ID).map((item) => item.id)).toEqual([
      "MCH-CNC-4020",
    ]);
    expect(resolveRecipeInternalCost(RCP_CNC_FACE_ID, 12.5)).toEqual(
      expect.objectContaining({ status: "RESOLVED", rate: 3, cost: 37.5 }),
    );
    expect(resolveRecipeInternalCost(RCP_CNC_BACK_ID, 12.5)).toEqual(
      expect.objectContaining({ status: "RESOLVED", rate: 4.5, cost: 56.25 }),
    );
  });

  it("resolves LETTERS assembly labor without employee wages", () => {
    expect(expectedRecipeKindForProcess(BOND_LETTER_BODY_ID)).toBe("LABOR");
    expect(recipeForProcess(BOND_LETTER_BODY_ID)?.id).toBe(RCP_BOND_LETTER_BODY_ID);
    expect(recipeGapForProcess(BOND_LETTER_BODY_ID)).toBe("CANONICAL_COST_EXISTS");
    expect(recipeGapForProcess(CLOSE_LETTER_BODY_ID)).toBe("CANONICAL_COST_EXISTS");
    expect(providersForProcess(BOND_LETTER_BODY_ID).map((item) => item.id)).toEqual([
      "WC_ASSEMBLY_01",
      "WC_ASSEMBLY_02",
    ]);
    expect(JSON.stringify(operationalProcesses)).not.toMatch(/hourlyRate|wage|employeeId/);
  });

  it("keeps painting recipe independent from missing provider", () => {
    expect(recipeForProcess(PAINT_RAL_ID)?.id).toBe("RCP_PAINT_RAL");
    expect(recipeGapForProcess(PAINT_RAL_ID)).toBe("CANONICAL_COST_EXISTS");
    expect(coverageForCapability("PAINTING")).toBe("NO_PROVIDER");
    expect(expectedRecipeKindForProcess(INSPECT_FINISHED_LETTER_ID)).toBe("LABOR");
    expect(processesMissingRecipe("SERVICE")).not.toContain(CUT_SHEET_CNC_ID);
    expect(processesMissingRecipe("LABOR")).not.toContain(BOND_LETTER_BODY_ID);
    expect(processesMissingRecipe("SERVICE")).not.toContain(FORM_ALUMINIUM_PROFILE_ID);
    expect(processesMissingRecipe("LABOR")).toContain(INSPECT_FINISHED_LETTER_ID);
  });

  it("reuses one electrical-finish recipe for wire, PSU and ignition", () => {
    expect(recipeForProcess(WIRE_LIGHTING_ID)?.id).toBe(RCP_ELECTRICAL_FINISH_ID);
    expect(recipeForProcess(INSTALL_OR_CONNECT_PSU_ID)?.id).toBe(RCP_ELECTRICAL_FINISH_ID);
    expect(recipeForProcess(PLACE_LED_MODULES_ID)?.id).toBe(RCP_PLACE_LED_MODULES_ID);
    expect(expectedRecipeKindForProcess(PLACE_LED_MODULES_ID)).toBe("SERVICE");
  });

  it("derives service recipe gaps for unrelated shop-floor processes without inventing recipes", () => {
    expect(recipeForProcess(WELD_STEEL_JOIN_ID)).toBeUndefined();
    expect(recipeGapForProcess(WELD_STEEL_JOIN_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(recipeGapForProcess(WELD_ALUMINIUM_JOIN_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(recipeGapForProcess(PRINT_WIDE_FORMAT_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(recipeGapForProcess(CUT_CONTOUR_PLOTTER_ID)).toBe("SERVICE_RECIPE_MISSING");
    expect(expectedRecipeKindForProcess(WELD_STEEL_JOIN_ID)).toBe("SERVICE");
    expect(providersForProcess(WELD_STEEL_JOIN_ID).map((item) => item.id)).toEqual([
      "MCH-WELD-STEEL",
    ]);
    expect(providersForProcess(WELD_ALUMINIUM_JOIN_ID).map((item) => item.id)).toEqual([
      "MCH-WELD-ALU",
    ]);
    expect(providersForProcess(PRINT_WIDE_FORMAT_ID).map((item) => item.id)).toEqual([
      "MCH-EPSON-60800",
    ]);
    expect(providersForProcess(CUT_CONTOUR_PLOTTER_ID).map((item) => item.id)).toEqual([
      "MCH-CUTTER-PLOTTER",
    ]);
    expect(costRecipes.map((item) => item.processIds).flat()).not.toContain(
      WELD_STEEL_JOIN_ID,
    );
  });
});
