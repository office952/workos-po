import { CUT_SHEET_CNC_ID } from "../processes/catalog.js";
import { SVC_CNC_BACK_ID, costEvidence, type CostEvidence } from "../resources/catalog.js";
import {
  RCP_CNC_BACK_ID,
  getCostRecipe,
  resolveRecipeInternalCost,
  type CostRecipe,
} from "../resources/recipes.js";
import { evaluateBackCompatibility, type BackProfile } from "./backCompatibility.js";
import { resolveTypeResources } from "./componentTypes.js";
import type { DraftValues } from "./types.js";

/**
 * Channel machining is a different operation from contour cutting.
 * RCP_CNC_BACK stays the contour recipe. This id is resolved only when a real
 * recipe and a distinct cost evidence row exist.
 */
export const FOREX_BACK_CHANNEL_RECIPE_ID = "RCP_CNC_BACK_CHANNEL";

export type BackCncCut = {
  processId: typeof CUT_SHEET_CNC_ID;
  recipeId: typeof RCP_CNC_BACK_ID;
  quantityM: number;
};

export type BackCncGroove = {
  processId: string;
  recipeId: string;
  quantityM: number;
};

/** Domain evidence for a constructive BACK selection. */
export type BackManufacturingPlan =
  | {
      status: "READY";
      profile: BackProfile;
      resourceId: string;
      materialAreaM2: number;
      processId: typeof CUT_SHEET_CNC_ID;
      recipeId: typeof RCP_CNC_BACK_ID;
      cut: BackCncCut;
      groove: BackCncGroove | null;
    }
  | {
      status: "BLOCKED";
      reason:
        | "invalid_profile"
        | "missing_geometry"
        | "missing_material"
        | "groove_recipe_missing"
        | "cnc_cost_unavailable";
    };

export type BackManufacturingBlockReason = Extract<
  BackManufacturingPlan,
  { status: "BLOCKED" }
>["reason"];

export function backManufacturingBlockLabel(reason: BackManufacturingBlockReason): string {
  switch (reason) {
    case "invalid_profile":
      return "Profilul spatelui nu este recunoscut.";
    case "missing_geometry":
      return "Spatele se calculează după ce introduci suprafața literelor.";
    case "missing_material":
      return "Alege materialul spatelui.";
    case "groove_recipe_missing":
      return "Spatele cu canal nu are încă o rețetă de prelucrare.";
    case "cnc_cost_unavailable":
      return "Debitarea CNC a spatelui nu are perimetru confirmat sau cost verificat.";
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function forexBackChannelRecipe(): CostRecipe | undefined {
  const recipe = getCostRecipe(FOREX_BACK_CHANNEL_RECIPE_ID);
  if (
    !recipe ||
    recipe.id === RCP_CNC_BACK_ID ||
    recipe.costEvidenceId === SVC_CNC_BACK_ID ||
    !recipe.applicableTypeIds?.includes("FOREX_BACK")
  ) {
    return undefined;
  }
  return recipe;
}

function confirmedPerimeterM(values: DraftValues): number | undefined {
  const perimeterMm = values["volume.confirmedPerimeterMm"];
  if (typeof perimeterMm !== "number" || !Number.isFinite(perimeterMm) || perimeterMm <= 0) {
    return undefined;
  }
  return perimeterMm / 1000;
}

export function planBackManufacturing(
  values: DraftValues,
  confirmedAreaMm2: number | undefined,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): BackManufacturingPlan {
  const support = values["back.supportKind"];
  const profile = values["back.profile"];
  const compatible = evaluateBackCompatibility(
    support === null ? undefined : support,
    profile === null ? undefined : profile,
  );
  if (compatible.status !== "COMPATIBLE") {
    return { status: "BLOCKED", reason: "invalid_profile" };
  }
  if (compatible.profile === "GROOVED" && !forexBackChannelRecipe()) {
    return { status: "BLOCKED", reason: "groove_recipe_missing" };
  }
  if (typeof confirmedAreaMm2 !== "number" || !Number.isFinite(confirmedAreaMm2) || confirmedAreaMm2 <= 0) {
    return { status: "BLOCKED", reason: "missing_geometry" };
  }
  const resources = resolveTypeResources("FOREX_BACK", values);
  if (resources.length !== 1 || resources[0]?.status !== "RESOLVED") {
    return { status: "BLOCKED", reason: "missing_material" };
  }
  const quantityM = confirmedPerimeterM(values);
  if (quantityM === undefined) {
    return { status: "BLOCKED", reason: "cnc_cost_unavailable" };
  }
  const cutCost = resolveRecipeInternalCost(RCP_CNC_BACK_ID, quantityM, evidenceRows);
  if (cutCost.status !== "RESOLVED") {
    return { status: "BLOCKED", reason: "cnc_cost_unavailable" };
  }
  const cut: BackCncCut = {
    processId: CUT_SHEET_CNC_ID,
    recipeId: RCP_CNC_BACK_ID,
    quantityM,
  };
  if (compatible.profile === "FLAT") {
    return {
      status: "READY",
      profile: "FLAT",
      resourceId: resources[0].resourceId,
      materialAreaM2: confirmedAreaMm2 / 1_000_000,
      processId: CUT_SHEET_CNC_ID,
      recipeId: RCP_CNC_BACK_ID,
      cut,
      groove: null,
    };
  }
  const channel = forexBackChannelRecipe();
  if (!channel || channel.processIds.length === 0) {
    return { status: "BLOCKED", reason: "groove_recipe_missing" };
  }
  if (channel.quantityBasis !== "VOLUME_PERIMETER_M") {
    return { status: "BLOCKED", reason: "cnc_cost_unavailable" };
  }
  const grooveCost = resolveRecipeInternalCost(channel.id, quantityM, evidenceRows);
  if (grooveCost.status !== "RESOLVED" || grooveCost.resourceId === cutCost.resourceId) {
    return {
      status: "BLOCKED",
      reason: grooveCost.status === "RESOLVED" ? "groove_recipe_missing" : "cnc_cost_unavailable",
    };
  }
  const processId = channel.processIds[0];
  if (!processId) {
    return { status: "BLOCKED", reason: "groove_recipe_missing" };
  }
  return {
    status: "READY",
    profile: "GROOVED",
    resourceId: resources[0].resourceId,
    materialAreaM2: confirmedAreaMm2 / 1_000_000,
    processId: CUT_SHEET_CNC_ID,
    recipeId: RCP_CNC_BACK_ID,
    cut,
    groove: {
      processId,
      recipeId: channel.id,
      quantityM,
    },
  };
}
