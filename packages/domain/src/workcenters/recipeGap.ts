import {
  getOperationalProcess,
  getProductionCapability,
  processesForCapability,
  type ProductionCapabilityClassId,
} from "../processes/catalog.js";
import { lookupCostEvidence, costEvidence, type CostEvidence } from "../resources/catalog.js";
import {
  expectedRecipeKindForProcess,
  recipeForProcess,
} from "../resources/recipes.js";

export const RECIPE_GAP_STATES = [
  "CANONICAL_COST_EXISTS",
  "SERVICE_RECIPE_MISSING",
  "LABOR_RECIPE_MISSING",
  "RESOURCE_COST_MISSING",
  "NOT_APPLICABLE",
  "UNKNOWN",
] as const;
export type RecipeGapState = (typeof RECIPE_GAP_STATES)[number];

export type RecipeGapRow = {
  processId: string | null;
  processLabel: string | null;
  capabilityId: ProductionCapabilityClassId;
  capabilityLabel: string;
  state: RecipeGapState;
  stateLabel: string;
};

export function recipeGapLabel(state: RecipeGapState): string {
  switch (state) {
    case "CANONICAL_COST_EXISTS":
      return "Rețetă: Configurată";
    case "SERVICE_RECIPE_MISSING":
      return "Rețetă serviciu: Lipsă";
    case "LABOR_RECIPE_MISSING":
      return "Rețetă manoperă: Lipsă";
    case "RESOURCE_COST_MISSING":
      return "Cost de resursă lipsește";
    case "NOT_APPLICABLE":
      return "Fără proces operațional încă";
    case "UNKNOWN":
      return "Necunoscut";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function recipeGapForProcess(
  processId: string,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): RecipeGapState {
  const process = getOperationalProcess(processId);
  if (!process) {
    return "UNKNOWN";
  }
  const recipe = recipeForProcess(processId);
  if (recipe) {
    return lookupCostEvidence(evidenceRows, recipe.costEvidenceId)
      ? "CANONICAL_COST_EXISTS"
      : "RESOURCE_COST_MISSING";
  }
  const kind = expectedRecipeKindForProcess(processId);
  if (kind === "LABOR") {
    return "LABOR_RECIPE_MISSING";
  }
  if (kind === "SERVICE") {
    return "SERVICE_RECIPE_MISSING";
  }
  return "UNKNOWN";
}

export function recipeGapsForCapability(
  capabilityId: ProductionCapabilityClassId,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): readonly RecipeGapRow[] {
  const capability = getProductionCapability(capabilityId);
  const capabilityLabel = capability?.label ?? capabilityId;
  const processes = processesForCapability(capabilityId);
  if (processes.length === 0) {
    return [
      {
        processId: null,
        processLabel: null,
        capabilityId,
        capabilityLabel,
        state: "NOT_APPLICABLE",
        stateLabel: recipeGapLabel("NOT_APPLICABLE"),
      },
    ];
  }
  return processes.map((process) => {
    const state = recipeGapForProcess(process.id, evidenceRows);
    return {
      processId: process.id,
      processLabel: process.label,
      capabilityId,
      capabilityLabel,
      state,
      stateLabel: recipeGapLabel(state),
    };
  });
}
