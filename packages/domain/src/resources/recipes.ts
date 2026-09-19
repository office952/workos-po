import type { ProductProcessComposition } from "../processes/composition.js";
import {
  APPLY_SURFACE_FINISH_ID,
  ATTACH_INTERNAL_FRAME_ID,
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_METAL_STOCK_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  FORM_SHEET_CASSETTE_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PACK_PRODUCT_ID,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
  getOperationalProcess,
  getProductionCapability,
  operationalProcesses,
} from "../processes/catalog.js";
import type { ComponentTypeId, ProductAggregate } from "../product/types.js";
import {
  costEvidence,
  getCostEvidence,
  getResource,
  isProductResourceUnit,
  lookupCostEvidence,
  type CostEvidence,
  LAB_ATTACH_INTERNAL_FRAME_ID,
  LAB_BOND_LETTER_BODY_ID,
  LAB_CLOSE_LETTER_BODY_ID,
  LAB_FORM_SHEET_CASSETTE_ID,
  LAB_VINYL_FACE_ID,
  LAB_VINYL_VOLUME_ID,
  RETURN_CANT_FORMING_ID,
  SVC_CNC_BACK_ID,
  SVC_CNC_FACE_ID,
  SVC_CNC_SHEET_PANEL_ID,
  SVC_CUT_METAL_STOCK_ID,
  SVC_ELECTRICAL_FINISH_ID,
  SVC_PACK_PRODUCT_ID,
  SVC_PAINT_RAL_ID,
  SVC_PLACE_LED_MODULES_ID,
  type ResourceUnit,
} from "./catalog.js";
import type { ResourceRequirement } from "./requirement.js";

export const RECIPE_KINDS = ["SERVICE", "LABOR"] as const;
export type RecipeKind = (typeof RECIPE_KINDS)[number];

export const RECIPE_LIFECYCLES = ["ACTIVE", "PARTIAL"] as const;
export type RecipeLifecycle = (typeof RECIPE_LIFECYCLES)[number];

export const RECIPE_QUANTITY_BASES = [
  "VOLUME_PERIMETER_M",
  "FACE_AREA_M2",
  "BACK_AREA_M2",
  "VOLUME_LATERAL_AREA_M2",
  "CASSETTE_BLANK_AREA_M2",
  "FRAME_PERIMETER_M",
  "LED_MODULE_QTY",
  "PRODUCT_UNIT",
] as const;
export type RecipeQuantityBasis = (typeof RECIPE_QUANTITY_BASES)[number];

export const RECIPE_SCOPES = [
  "FACE",
  "VOLUME",
  "BACK",
  "LIGHTING",
  "BODY",
  "PRODUCT",
] as const;
export type RecipeScope = (typeof RECIPE_SCOPES)[number];

export const RCP_PROFILE_FORMING_ID = "RCP_PROFILE_FORMING";
export const RCP_CNC_FACE_ID = "RCP_CNC_FACE";
export const RCP_CNC_BACK_ID = "RCP_CNC_BACK";
export const RCP_VINYL_FACE_LABOR_ID = "RCP_VINYL_FACE_LABOR";
export const RCP_VINYL_VOLUME_LABOR_ID = "RCP_VINYL_VOLUME_LABOR";
export const RCP_BOND_LETTER_BODY_ID = "RCP_BOND_LETTER_BODY";
export const RCP_CLOSE_LETTER_BODY_ID = "RCP_CLOSE_LETTER_BODY";
export const RCP_PLACE_LED_MODULES_ID = "RCP_PLACE_LED_MODULES";
export const RCP_ELECTRICAL_FINISH_ID = "RCP_ELECTRICAL_FINISH";
export const RCP_PAINT_RAL_ID = "RCP_PAINT_RAL";
export const RCP_PACK_PRODUCT_ID = "RCP_PACK_PRODUCT";
export const RCP_CNC_SHEET_PANEL_ID = "RCP_CNC_SHEET_PANEL";
export const RCP_CUT_METAL_STOCK_ID = "RCP_CUT_METAL_STOCK";
export const RCP_FORM_SHEET_CASSETTE_ID = "RCP_FORM_SHEET_CASSETTE";
export const RCP_ATTACH_INTERNAL_FRAME_ID = "RCP_ATTACH_INTERNAL_FRAME";

export type CostRecipe = {
  readonly id: string;
  readonly kind: RecipeKind;
  readonly label: string;
  readonly description: string;
  readonly lifecycle: RecipeLifecycle;
  readonly processIds: readonly string[];
  readonly scopes?: readonly RecipeScope[];
  readonly applicableTypeIds?: readonly ComponentTypeId[];
  readonly quantityBasis: RecipeQuantityBasis;
  readonly unit: ResourceUnit;
  readonly costEvidenceId: string;
};

export type RecipeCostResolution =
  | {
      status: "RESOLVED";
      recipeId: string;
      resourceId: string;
      quantity: number;
      unit: ResourceUnit;
      rate: number;
      currency: "EUR";
      cost: number;
    }
  | {
      status: "INCOMPLETE";
      recipeId: string;
      reason: string;
    };

export const costRecipes: readonly CostRecipe[] = [
  {
    id: RCP_PROFILE_FORMING_ID,
    kind: "SERVICE",
    label: "Formare profil aluminiu",
    description:
      "Rețetă de serviciu pentru formarea cantului. Consumă evidența existentă return_cant_forming. Cantitatea vine din perimetrul de volum, nu din rețetă.",
    lifecycle: "ACTIVE",
    processIds: [FORM_ALUMINIUM_PROFILE_ID],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: RETURN_CANT_FORMING_ID,
  },
  {
    id: RCP_CNC_FACE_ID,
    kind: "SERVICE",
    label: "Debitare CNC față",
    description:
      "Debitare foaie față pe perimetrul confirmat. Tariful de dezvoltare include 2 treceri legacy.",
    lifecycle: "ACTIVE",
    processIds: [CUT_SHEET_CNC_ID],
    scopes: ["FACE"],
    applicableTypeIds: ["PLEXIGLAS_FACE"],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: SVC_CNC_FACE_ID,
  },
  {
    id: RCP_CNC_BACK_ID,
    kind: "SERVICE",
    label: "Debitare CNC spate",
    description:
      "Debitare foaie spate pe același perimetru confirmat. Tariful de dezvoltare include 3 treceri legacy.",
    lifecycle: "ACTIVE",
    processIds: [CUT_SHEET_CNC_ID],
    scopes: ["BACK"],
    applicableTypeIds: ["FOREX_BACK"],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: SVC_CNC_BACK_ID,
  },
  {
    id: RCP_VINYL_FACE_LABOR_ID,
    kind: "LABOR",
    label: "Aplicare folie față",
    description: "Manoperă de aplicare pe suprafața feței. Nu este costul foliei.",
    lifecycle: "ACTIVE",
    processIds: [APPLY_SURFACE_FINISH_ID],
    scopes: ["FACE"],
    quantityBasis: "FACE_AREA_M2",
    unit: "m2",
    costEvidenceId: LAB_VINYL_FACE_ID,
  },
  {
    id: RCP_VINYL_VOLUME_LABOR_ID,
    kind: "LABOR",
    label: "Aplicare folie volum",
    description: "Manoperă de aplicare pe cant. Nu este costul foliei.",
    lifecycle: "ACTIVE",
    processIds: [APPLY_SURFACE_FINISH_ID],
    scopes: ["VOLUME"],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: LAB_VINYL_VOLUME_ID,
  },
  {
    id: RCP_BOND_LETTER_BODY_ID,
    kind: "LABOR",
    label: "Lipire față-volum",
    description: "Manoperă de lipire pe perimetrul de volum.",
    lifecycle: "ACTIVE",
    processIds: [BOND_LETTER_BODY_ID],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: LAB_BOND_LETTER_BODY_ID,
  },
  {
    id: RCP_CLOSE_LETTER_BODY_ID,
    kind: "LABOR",
    label: "Închidere corp",
    description:
      "Manoperă de prindere a spatelui. Default de dezvoltare; legacy nu avea tarif intern.",
    lifecycle: "ACTIVE",
    processIds: [CLOSE_LETTER_BODY_ID],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: LAB_CLOSE_LETTER_BODY_ID,
  },
  {
    id: RCP_PLACE_LED_MODULES_ID,
    kind: "SERVICE",
    label: "Montare module LED",
    description: "Serviciu de montaj pe cantitatea de module. Nu este prețul modulului.",
    lifecycle: "ACTIVE",
    processIds: [PLACE_LED_MODULES_ID],
    quantityBasis: "LED_MODULE_QTY",
    unit: "buc",
    costEvidenceId: SVC_PLACE_LED_MODULES_ID,
  },
  {
    id: RCP_ELECTRICAL_FINISH_ID,
    kind: "SERVICE",
    label: "Pregătire electrică",
    description:
      "Cablare, pregătire sursă și probă de aprindere. Un cost pe produs, nu pe sursă.",
    lifecycle: "ACTIVE",
    processIds: [WIRE_LIGHTING_ID, INSTALL_OR_CONNECT_PSU_ID, TEST_LIGHTING_IGNITION_ID],
    quantityBasis: "PRODUCT_UNIT",
    unit: "buc",
    costEvidenceId: SVC_ELECTRICAL_FINISH_ID,
  },
  {
    id: RCP_PAINT_RAL_ID,
    kind: "SERVICE",
    label: "Vopsire RAL",
    description: "Vopsire volum după asamblare, doar când finisajul este vopsit.",
    lifecycle: "ACTIVE",
    processIds: [PAINT_RAL_ID],
    quantityBasis: "VOLUME_PERIMETER_M",
    unit: "m",
    costEvidenceId: SVC_PAINT_RAL_ID,
  },
  {
    id: RCP_PACK_PRODUCT_ID,
    kind: "SERVICE",
    label: "Ambalare",
    description: "Ambalare pe suprafața feței.",
    lifecycle: "ACTIVE",
    processIds: [PACK_PRODUCT_ID],
    quantityBasis: "FACE_AREA_M2",
    unit: "m2",
    costEvidenceId: SVC_PACK_PRODUCT_ID,
  },
  {
    id: RCP_CNC_SHEET_PANEL_ID,
    kind: "SERVICE",
    label: "Debitare CNC foaie panou",
    description:
      "Debitare CNC de foaie de panou pe suprafața dezvoltată. Include contur și V-groove. Nu este tariful pe perimetru de literă.",
    lifecycle: "ACTIVE",
    processIds: [CUT_SHEET_CNC_ID],
    scopes: ["FACE"],
    applicableTypeIds: ["ACM_CASSETTE_BODY"],
    quantityBasis: "CASSETTE_BLANK_AREA_M2",
    unit: "m2",
    costEvidenceId: SVC_CNC_SHEET_PANEL_ID,
  },
  {
    id: RCP_CUT_METAL_STOCK_ID,
    kind: "SERVICE",
    label: "Debitare semifabricat metalic",
    description: "Debitare profil de cadru intern pe perimetrul cadrului.",
    lifecycle: "ACTIVE",
    processIds: [CUT_METAL_STOCK_ID],
    quantityBasis: "FRAME_PERIMETER_M",
    unit: "m",
    costEvidenceId: SVC_CUT_METAL_STOCK_ID,
  },
  {
    id: RCP_FORM_SHEET_CASSETTE_ID,
    kind: "LABOR",
    label: "Formare casetă din foaie",
    description:
      "Îndoire manuală după V-groove. Un cost pe produs în V1; foldCount rămâne adevăr de atelier.",
    lifecycle: "ACTIVE",
    processIds: [FORM_SHEET_CASSETTE_ID],
    quantityBasis: "PRODUCT_UNIT",
    unit: "buc",
    costEvidenceId: LAB_FORM_SHEET_CASSETTE_ID,
  },
  {
    id: RCP_ATTACH_INTERNAL_FRAME_ID,
    kind: "LABOR",
    label: "Prindere cadru intern",
    description: "Manoperă de prindere a cadrului intern de corpul casetat.",
    lifecycle: "ACTIVE",
    processIds: [ATTACH_INTERNAL_FRAME_ID],
    quantityBasis: "PRODUCT_UNIT",
    unit: "buc",
    costEvidenceId: LAB_ATTACH_INTERNAL_FRAME_ID,
  },
];

export function getCostRecipe(id: string): CostRecipe | undefined {
  return costRecipes.find((item) => item.id === id);
}

export function recipeForProcess(processId: string): CostRecipe | undefined {
  return costRecipes.find((item) => item.processIds.includes(processId));
}

export function recipeForProcessScope(
  processId: string,
  scope: string,
  typeId?: string | null,
): CostRecipe | undefined {
  const matches = costRecipes.filter((item) => item.processIds.includes(processId));
  const typed = typeId
    ? matches.filter((item) => item.applicableTypeIds?.includes(typeId as ComponentTypeId))
    : [];
  const pool = typed.length > 0 ? typed : matches;
  return (
    pool.find((item) => item.scopes?.includes(scope as RecipeScope)) ??
    pool.find((item) => item.scopes === undefined)
  );
}

export function recipesOfKind(kind: RecipeKind): readonly CostRecipe[] {
  return costRecipes.filter((item) => item.kind === kind);
}

export function expectedRecipeKindForProcess(processId: string): RecipeKind | null {
  const process = getOperationalProcess(processId);
  if (!process) {
    return null;
  }
  const capability = getProductionCapability(process.requiredCapabilityId);
  if (!capability) {
    return null;
  }
  switch (capability.kind) {
    case "HUMAN_SKILL":
      return "LABOR";
    case "MACHINE":
    case "WORKSTATION":
      return "SERVICE";
    default: {
      const _exhaustive: never = capability.kind;
      return _exhaustive;
    }
  }
}

export function processesMissingRecipe(kind: RecipeKind): readonly string[] {
  return operationalProcesses
    .filter((process) => expectedRecipeKindForProcess(process.id) === kind)
    .filter((process) => !recipeForProcess(process.id))
    .map((process) => process.id);
}

export function recipeQuantityBasisLabel(basis: RecipeQuantityBasis): string {
  switch (basis) {
    case "VOLUME_PERIMETER_M":
      return "Perimetru volum (m)";
    case "FACE_AREA_M2":
      return "Suprafață față (m²)";
    case "BACK_AREA_M2":
      return "Suprafață spate (m²)";
    case "VOLUME_LATERAL_AREA_M2":
      return "Suprafață laterală volum (m²)";
    case "CASSETTE_BLANK_AREA_M2":
      return "Foaie dezvoltată (m²)";
    case "FRAME_PERIMETER_M":
      return "Perimetru cadru intern (m)";
    case "LED_MODULE_QTY":
      return "Cantitate module LED (buc)";
    case "PRODUCT_UNIT":
      return "Produs (buc)";
    default: {
      const _exhaustive: never = basis;
      return _exhaustive;
    }
  }
}

export function recipeKindLabel(kind: RecipeKind): string {
  switch (kind) {
    case "SERVICE":
      return "Rețetă serviciu";
    case "LABOR":
      return "Rețetă manoperă";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function recipeLifecycleLabel(lifecycle: RecipeLifecycle): string {
  switch (lifecycle) {
    case "ACTIVE":
      return "Activă";
    case "PARTIAL":
      return "Parțială";
    default: {
      const _exhaustive: never = lifecycle;
      return _exhaustive;
    }
  }
}

export function resolveRecipeInternalCost(
  recipeId: string,
  quantity: number,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): RecipeCostResolution {
  const recipe = getCostRecipe(recipeId);
  if (!recipe) {
    return { status: "INCOMPLETE", recipeId, reason: "Rețeta nu există." };
  }
  const resource = getResource(recipe.costEvidenceId);
  const evidence = lookupCostEvidence(evidenceRows, recipe.costEvidenceId);
  if (!resource || !evidence) {
    return {
      status: "INCOMPLETE",
      recipeId,
      reason: "Evidența de cost lipsește.",
    };
  }
  if (recipe.unit !== resource.unit || recipe.unit !== evidence.perUnit) {
    return {
      status: "INCOMPLETE",
      recipeId,
      reason: "Unitatea rețetei nu coincide cu evidența de cost.",
    };
  }
  return {
    status: "RESOLVED",
    recipeId: recipe.id,
    resourceId: recipe.costEvidenceId,
    quantity,
    unit: recipe.unit,
    rate: evidence.amount,
    currency: evidence.currency,
    cost: quantity * evidence.amount,
  };
}

export function quantityForRecipe(
  recipe: CostRecipe,
  aggregate: ProductAggregate,
): number | undefined {
  switch (recipe.quantityBasis) {
    case "VOLUME_PERIMETER_M":
      return quantityById(aggregate, "volume_linear");
    case "FACE_AREA_M2":
      return quantityById(aggregate, "face_area");
    case "BACK_AREA_M2":
      return quantityById(aggregate, "back_area");
    case "VOLUME_LATERAL_AREA_M2":
      return quantityById(aggregate, "volume_lateral");
    case "CASSETTE_BLANK_AREA_M2":
      return quantityById(aggregate, "cassette_blank_area");
    case "FRAME_PERIMETER_M":
      return quantityById(aggregate, "frame_perimeter");
    case "LED_MODULE_QTY":
      return quantityById(aggregate, "ledModuleQuantity");
    case "PRODUCT_UNIT":
      return 1;
    default: {
      const _exhaustive: never = recipe.quantityBasis;
      return _exhaustive;
    }
  }
}

export function collectRecipeRequirements(
  aggregate: ProductAggregate,
  composition: ProductProcessComposition,
): ResourceRequirement[] {
  const seen = new Set<string>();
  const existing = new Set(aggregate.requirements.map((item) => item.resourceId));
  const requirements: ResourceRequirement[] = [];
  for (const node of composition.nodes) {
    const recipe = recipeForProcessScope(node.processId, node.scope, node.typeId);
    if (!recipe || seen.has(recipe.id) || existing.has(recipe.costEvidenceId)) {
      continue;
    }
    seen.add(recipe.id);
    const quantity = quantityForRecipe(recipe, aggregate);
    if (quantity === undefined || !isProductResourceUnit(recipe.unit)) {
      continue;
    }
    requirements.push({
      componentId: requirementComponentId(node.scope),
      resourceId: recipe.costEvidenceId,
      quantity,
      unit: recipe.unit,
    });
  }
  return requirements;
}

function quantityById(aggregate: ProductAggregate, id: string): number | undefined {
  return aggregate.quantities.find((item) => item.id === id)?.value;
}

function requirementComponentId(scope: string): string {
  switch (scope) {
    case "FACE":
    case "VOLUME":
    case "BACK":
    case "LIGHTING":
      return scope;
    default:
      return "ROOT";
  }
}

export function assertCostRecipeRegistry(): void {
  const ids = new Set<string>();
  const owned = new Set<string>();
  for (const recipe of costRecipes) {
    if (ids.has(recipe.id)) {
      throw new Error(`Duplicate recipe: ${recipe.id}`);
    }
    ids.add(recipe.id);
    if (!getCostEvidence(recipe.costEvidenceId)) {
      throw new Error(`Unknown cost evidence ${recipe.costEvidenceId} on ${recipe.id}`);
    }
    const resource = getResource(recipe.costEvidenceId);
    if (!resource) {
      throw new Error(`Unknown resource ${recipe.costEvidenceId} on ${recipe.id}`);
    }
    if (recipe.unit !== resource.unit) {
      throw new Error(`Unit mismatch on ${recipe.id}`);
    }
    const scopes = recipe.scopes ?? ["*"];
    const typeKeys = recipe.applicableTypeIds ?? ["*"];
    for (const processId of recipe.processIds) {
      if (!getOperationalProcess(processId)) {
        throw new Error(`Unknown process ${processId} on ${recipe.id}`);
      }
      const expectedKind = expectedRecipeKindForProcess(processId);
      if (expectedKind && expectedKind !== recipe.kind) {
        throw new Error(`Recipe kind mismatch for ${processId}`);
      }
      for (const typeKey of typeKeys) {
        for (const scope of scopes) {
          const key = `${processId}:${scope}:${typeKey}`;
          if (owned.has(key) || owned.has(`${processId}:${scope}:*`) || owned.has(`${processId}:*:*`)) {
            throw new Error(`Duplicate recipe ownership for ${key}`);
          }
          if (typeKey === "*" && [...owned].some((item) => item.startsWith(`${processId}:${scope}:`))) {
            throw new Error(`Duplicate recipe ownership for ${processId}:${scope}`);
          }
          owned.add(key);
        }
      }
    }
  }
}

assertCostRecipeRegistry();
