import { CUT_SHEET_CNC_ID } from "../processes/catalog.js";
import { RCP_CNC_BACK_ID } from "../resources/recipes.js";
import { resolveTypeResources } from "./componentTypes.js";
import { evaluateBackCompatibility } from "./backCompatibility.js";
import type { DraftValues } from "./types.js";

/** Domain evidence for a constructive BACK selection; never estimates groove machining. */
export type BackManufacturingPlan =
  | { status: "READY"; profile: "FLAT"; resourceId: string; materialAreaM2: number; processId: string; recipeId: string }
  | { status: "BLOCKED"; reason: "invalid_profile" | "missing_geometry" | "missing_material" | "groove_recipe_missing" };

export function planBackManufacturing(values: DraftValues, confirmedAreaMm2: number | undefined): BackManufacturingPlan {
  const compatible = evaluateBackCompatibility(values["back.supportKind"], values["back.profile"]);
  if (compatible.status !== "COMPATIBLE") return { status: "BLOCKED", reason: "invalid_profile" };
  if (compatible.profile === "GROOVED") return { status: "BLOCKED", reason: "groove_recipe_missing" };
  if (typeof confirmedAreaMm2 !== "number" || !Number.isFinite(confirmedAreaMm2) || confirmedAreaMm2 <= 0) {
    return { status: "BLOCKED", reason: "missing_geometry" };
  }
  const resources = resolveTypeResources("FOREX_BACK", values);
  if (resources.length !== 1 || resources[0]?.status !== "RESOLVED") {
    return { status: "BLOCKED", reason: "missing_material" };
  }
  return {
    status: "READY",
    profile: "FLAT",
    resourceId: resources[0].resourceId,
    materialAreaM2: confirmedAreaMm2 / 1_000_000,
    processId: CUT_SHEET_CNC_ID,
    recipeId: RCP_CNC_BACK_ID,
  };
}
