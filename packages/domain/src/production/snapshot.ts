import {
  topologicalOrder,
  type ProductProcessComposition,
} from "../processes/composition.js";
import {
  APPLY_SURFACE_FINISH_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PLACE_LED_MODULES_ID,
  getOperationalProcess,
  getProductionCapability,
  processProviderRequirement,
  type ProviderRequirement,
} from "../processes/catalog.js";
import { listTypeTechnicalSettings } from "../product/technicalSettings.js";
import type {
  ProductAggregate,
  ProductTruth,
  TechnicalQuantity,
} from "../product/types.js";
import { getResource, MAT_LED_MODULE_ID, costEvidence, lookupCostEvidence, type CostEvidence } from "../resources/catalog.js";
import type { EicResult } from "../resources/eic.js";
import {
  quantityForRecipe,
  recipeForProcessScope,
} from "../resources/recipes.js";
import type { ResourceRequirement } from "../resources/requirement.js";
import { sha256Hex } from "./digest.js";

export const ACCEPTED_PRODUCTION_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const ACCEPTED_PRODUCTION_SNAPSHOT_STATUSES = ["ACCEPTED"] as const;
export type AcceptedProductionSnapshotStatus =
  (typeof ACCEPTED_PRODUCTION_SNAPSHOT_STATUSES)[number];

export type FrozenTechnicalSetting = {
  id: string;
  typeId: string;
  label: string;
  value: number;
  unit: string;
};

export type FrozenQuantity = {
  id: string;
  componentId: string;
  label: string;
  value: number;
  unit: string;
};

export type FrozenRequirement = {
  componentId: string;
  resourceId: string;
  quantity: number;
  unit: string;
  costQualifier?: { volumeDepthMm?: number };
};

export type FrozenOperationQuantity = {
  label: string;
  value: number;
  unit: string;
};

export type FrozenResourceDemand = {
  resourceId: string;
  label: string;
  quantity: number;
  unit: string;
};

export type FrozenProductionOperation = {
  id: string;
  processId: string;
  processLabel: string;
  scope: string;
  scopeLabel: string;
  typeId: string | null;
  dependsOn: readonly string[];
  requiredCapabilityId: string;
  requiredCapabilityLabel: string;
  providerRequirement?: ProviderRequirement;
  quantities: readonly FrozenOperationQuantity[];
  resourceDemands: readonly FrozenResourceDemand[];
};

export type FrozenRecipeTrace = {
  recipeId: string;
  processId: string;
  scope: string;
  costEvidenceId: string;
  resourceId: string;
  resourceLabel: string;
  quantity: number;
  unit: string;
  rate: number;
  currency: "EUR";
  cost: number;
};

export type FrozenEicLine = {
  resourceId: string;
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  currency: "EUR";
  cost: number;
};

export type FrozenEicReference = {
  total: number;
  currency: "EUR";
  completeness: EicResult["completeness"];
  lines: readonly FrozenEicLine[];
};

export const PRODUCTION_RELEASE_SOURCES = ["PILOT", "ORDER"] as const;
export type ProductionReleaseSource = (typeof PRODUCTION_RELEASE_SOURCES)[number];

export type AcceptedProductionSnapshot = {
  snapshotId: string;
  schemaVersion: typeof ACCEPTED_PRODUCTION_SNAPSHOT_SCHEMA_VERSION;
  status: AcceptedProductionSnapshotStatus;
  productCode: string;
  productLabel: string;
  inscription: string;
  sourceReviewId: string;
  sourceConfirmedAt: string;
  createdAt: string;
  contentHash: string;
  releaseSource?: ProductionReleaseSource;
  sourceOrderSnapshotId?: string;
  sourceOrderContentHash?: string;
  sourceProductionInputHash?: string;
  truth: {
    templateCode: string;
    templateVersion: string;
    familyId: string;
    selectedComponentIds: readonly string[];
    values: ProductTruth["values"];
    measurements: ProductTruth["measurements"];
  };
  quantities: readonly FrozenQuantity[];
  requirements: readonly FrozenRequirement[];
  operations: readonly FrozenProductionOperation[];
  usedTechnicalSettings: readonly FrozenTechnicalSetting[];
  usedRecipes: readonly FrozenRecipeTrace[];
  eic: FrozenEicReference;
};

export type FrozenProductionWork = {
  snapshotId: string;
  productCode: string;
  operations: readonly FrozenProductionOperation[];
  quantities: readonly FrozenQuantity[];
  requirements: readonly FrozenRequirement[];
  usedTechnicalSettings: readonly FrozenTechnicalSetting[];
  usedRecipes: readonly FrozenRecipeTrace[];
  eic: FrozenEicReference;
};

export const FROZEN_PRODUCTION_INPUT_SCHEMA_VERSION = 1 as const;

export type FrozenProductionInput = {
  schemaVersion: typeof FROZEN_PRODUCTION_INPUT_SCHEMA_VERSION;
  requirements: readonly FrozenRequirement[];
  operations: readonly FrozenProductionOperation[];
  usedTechnicalSettings: readonly FrozenTechnicalSetting[];
  usedRecipes: readonly FrozenRecipeTrace[];
  contentHash: string;
};

export function freezeAcceptedProductionSnapshot(
  truth: ProductTruth,
  aggregate: ProductAggregate,
  composition: ProductProcessComposition,
  eic: EicResult,
  options?: {
    createdAt?: string;
    technicalSettings?: readonly FrozenTechnicalSetting[];
    costEvidenceRows?: readonly CostEvidence[];
  },
): AcceptedProductionSnapshot {
  const productionInput = freezeProductionInput(aggregate, composition, options);
  const hashedContent = {
    schemaVersion: ACCEPTED_PRODUCTION_SNAPSHOT_SCHEMA_VERSION,
    status: "ACCEPTED" as const,
    productCode: truth.templateCode,
    productLabel: aggregate.productLabel,
    inscription: aggregate.inscription,
    sourceReviewId: truth.reviewId,
    truth: {
      templateCode: truth.templateCode,
      templateVersion: truth.templateVersion,
      familyId: truth.familyId,
      selectedComponentIds: [...truth.selectedComponentIds],
      values: { ...truth.values },
      measurements: truth.measurements.map((item) => ({ ...item })),
    },
    quantities: freezeQuantities(aggregate.quantities),
    requirements: productionInput.requirements,
    operations: productionInput.operations,
    usedTechnicalSettings: productionInput.usedTechnicalSettings,
    usedRecipes: productionInput.usedRecipes,
    eic: freezeEic(eic),
  };
  const contentHash = canonicalContentHash(hashedContent);
  return deepFreeze({
    snapshotId: `aps:${truth.templateCode}:${contentHash}`,
    ...hashedContent,
    sourceConfirmedAt: truth.confirmedAt,
    createdAt: options?.createdAt ?? new Date().toISOString(),
    contentHash,
  });
}

export function productionWorkFromSnapshot(
  snapshot: AcceptedProductionSnapshot,
): FrozenProductionWork {
  return {
    snapshotId: snapshot.snapshotId,
    productCode: snapshot.productCode,
    operations: snapshot.operations,
    quantities: snapshot.quantities,
    requirements: snapshot.requirements,
    usedTechnicalSettings: snapshot.usedTechnicalSettings,
    usedRecipes: snapshot.usedRecipes,
    eic: snapshot.eic,
  };
}

export function copyFrozenProductionInput(
  input: FrozenProductionInput,
): FrozenProductionInput {
  return deepFreeze({
    schemaVersion: input.schemaVersion,
    requirements: input.requirements.map((item) => ({ ...item })),
    operations: input.operations.map((item) => ({
      ...item,
      dependsOn: [...item.dependsOn],
      quantities: item.quantities.map((quantity) => ({ ...quantity })),
      resourceDemands: item.resourceDemands.map((demand) => ({ ...demand })),
    })),
    usedTechnicalSettings: input.usedTechnicalSettings.map((item) => ({ ...item })),
    usedRecipes: input.usedRecipes.map((item) => ({ ...item })),
    contentHash: input.contentHash,
  });
}

export function freezeProductionInput(
  aggregate: ProductAggregate,
  composition: ProductProcessComposition,
  options?: {
    technicalSettings?: readonly FrozenTechnicalSetting[];
    costEvidenceRows?: readonly CostEvidence[];
  },
): FrozenProductionInput {
  const hashedContent = {
    schemaVersion: FROZEN_PRODUCTION_INPUT_SCHEMA_VERSION,
    requirements: freezeRequirements(aggregate.requirements),
    operations: freezeOperations(composition, aggregate),
    usedTechnicalSettings:
      options?.technicalSettings ?? usedTechnicalSettingsFromAggregate(aggregate),
    usedRecipes: freezeRecipeTraces(
      composition,
      aggregate,
      options?.costEvidenceRows ?? costEvidence,
    ),
  };
  return deepFreeze({
    ...hashedContent,
    contentHash: canonicalContentHash(hashedContent),
  });
}

export function usedTechnicalSettingsFromAggregate(
  aggregate: ProductAggregate,
): FrozenTechnicalSetting[] {
  const typeIds = [...new Set(aggregate.componentStatuses.map((item) => item.typeId))].sort();
  return typeIds.flatMap((typeId) =>
    listTypeTechnicalSettings(typeId).flatMap((setting) => {
      if (setting.resolution.status !== "RESOLVED") {
        return [];
      }
      return [
        {
          id: setting.id,
          typeId,
          label: setting.label,
          value: setting.resolution.value,
          unit: setting.unit,
        },
      ];
    }),
  );
}

function freezeOperations(
  composition: ProductProcessComposition,
  aggregate: ProductAggregate,
): FrozenProductionOperation[] {
  const byId = new Map(composition.nodes.map((node) => [node.id, node]));
  return topologicalOrder(composition.nodes).map((id) => {
    const node = byId.get(id);
    if (!node) {
      throw new Error(`unknown_snapshot_node:${id}`);
    }
    const process = getOperationalProcess(node.processId);
    const capability = process
      ? getProductionCapability(process.requiredCapabilityId)
      : undefined;
    const recipe = recipeForProcessScope(node.processId, node.scope);
    const recipeQuantity = recipe ? quantityForRecipe(recipe, aggregate) : undefined;
    return {
      id: node.id,
      processId: node.processId,
      processLabel: node.processLabel,
      scope: node.scope,
      scopeLabel: node.scopeLabel,
      typeId: node.typeId,
      dependsOn: [...node.dependsOn],
      requiredCapabilityId: process?.requiredCapabilityId ?? "",
      requiredCapabilityLabel: capability?.label ?? "Capabilitate necunoscută",
      providerRequirement: processProviderRequirement(process),
      quantities: operationQuantities(node.processId, aggregate, recipeQuantity, recipe?.unit),
      resourceDemands: operationResourceDemands(
        node.processId,
        node.scope,
        aggregate,
        recipeQuantity,
        recipe?.costEvidenceId,
        recipe?.unit,
      ),
    };
  });
}

function freezeRecipeTraces(
  composition: ProductProcessComposition,
  aggregate: ProductAggregate,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): FrozenRecipeTrace[] {
  const traces: FrozenRecipeTrace[] = [];
  for (const node of composition.nodes) {
    const recipe = recipeForProcessScope(node.processId, node.scope);
    if (!recipe) {
      continue;
    }
    const quantity = quantityForRecipe(recipe, aggregate);
    const evidence = lookupCostEvidence(evidenceRows, recipe.costEvidenceId);
    const resource = getResource(recipe.costEvidenceId);
    if (quantity === undefined || !evidence || !resource) {
      continue;
    }
    traces.push({
      recipeId: recipe.id,
      processId: node.processId,
      scope: node.scope,
      costEvidenceId: recipe.costEvidenceId,
      resourceId: recipe.costEvidenceId,
      resourceLabel: resource.label,
      quantity,
      unit: recipe.unit,
      rate: evidence.amount,
      currency: evidence.currency,
      cost: quantity * evidence.amount,
    });
  }
  return traces.sort((left, right) =>
    `${left.processId}:${left.scope}`.localeCompare(`${right.processId}:${right.scope}`),
  );
}

function freezeQuantities(quantities: readonly TechnicalQuantity[]): FrozenQuantity[] {
  return quantities.map((item) => ({
    id: item.id,
    componentId: item.componentId,
    label: item.label,
    value: item.value,
    unit: item.unit,
  }));
}

function freezeRequirements(
  requirements: readonly ResourceRequirement[],
): FrozenRequirement[] {
  return requirements.map((item) => ({
    componentId: item.componentId,
    resourceId: item.resourceId,
    quantity: item.quantity,
    unit: item.unit,
    ...(item.costQualifier ? { costQualifier: item.costQualifier } : {}),
  }));
}

function freezeEic(eic: EicResult): FrozenEicReference {
  return {
    total: eic.total,
    currency: eic.currency,
    completeness: eic.completeness,
    lines: eic.lines.map((line) => ({
      resourceId: line.resourceId,
      label: line.label,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      currency: line.currency,
      cost: line.cost,
    })),
  };
}

function operationQuantities(
  processId: string,
  aggregate: ProductAggregate,
  recipeQuantity: number | undefined,
  recipeUnit: string | undefined,
): FrozenOperationQuantity[] {
  if (recipeQuantity !== undefined && recipeUnit) {
    return [{ label: quantityLabelForUnit(recipeUnit), value: recipeQuantity, unit: recipeUnit }];
  }
  if (processId === PLACE_LED_MODULES_ID) {
    return quantitiesByIds(aggregate, ["ledModuleQuantity"]);
  }
  if (processId === INSTALL_OR_CONNECT_PSU_ID) {
    return quantitiesByIds(aggregate, ["selectedPsu:MAT-LED-PSU-12V-160W"]);
  }
  return [];
}

function operationResourceDemands(
  processId: string,
  scope: string,
  aggregate: ProductAggregate,
  recipeQuantity: number | undefined,
  costEvidenceId: string | undefined,
  recipeUnit: string | undefined,
): FrozenResourceDemand[] {
  const demands: FrozenResourceDemand[] = [];
  if (costEvidenceId && recipeQuantity !== undefined && recipeUnit) {
    const resource = getResource(costEvidenceId);
    if (resource) {
      demands.push({
        resourceId: costEvidenceId,
        label: resource.label,
        quantity: recipeQuantity,
        unit: recipeUnit,
      });
    }
  }
  if (processId === PLACE_LED_MODULES_ID) {
    pushAggregateDemand(demands, aggregate, MAT_LED_MODULE_ID);
  }
  if (processId === INSTALL_OR_CONNECT_PSU_ID) {
    for (const requirement of aggregate.requirements) {
      if (requirement.resourceId.startsWith("MAT-LED-PSU-")) {
        const resource = getResource(requirement.resourceId);
        if (resource) {
          demands.push({
            resourceId: requirement.resourceId,
            label: resource.label,
            quantity: requirement.quantity,
            unit: requirement.unit,
          });
        }
      }
    }
  }
  if (processId === APPLY_SURFACE_FINISH_ID) {
    pushAggregateDemand(demands, aggregate, "MAT-VINYL-ORACAL-651", scope);
  }
  return demands;
}

function pushAggregateDemand(
  demands: FrozenResourceDemand[],
  aggregate: ProductAggregate,
  resourceId: string,
  scope?: string,
): void {
  for (const requirement of aggregate.requirements) {
    if (requirement.resourceId !== resourceId) {
      continue;
    }
    if (scope && requirement.componentId !== scope) {
      continue;
    }
    const resource = getResource(requirement.resourceId);
    if (!resource) {
      continue;
    }
    demands.push({
      resourceId: requirement.resourceId,
      label: resource.label,
      quantity: requirement.quantity,
      unit: requirement.unit,
    });
  }
}

function quantitiesByIds(
  aggregate: ProductAggregate,
  ids: readonly string[],
): FrozenOperationQuantity[] {
  return aggregate.quantities
    .filter((item) => ids.includes(item.id))
    .map((item) => ({
      label: item.label,
      value: item.value,
      unit: item.unit,
    }));
}

function quantityLabelForUnit(unit: string): string {
  switch (unit) {
    case "m":
      return "Lungime";
    case "m2":
      return "Suprafață";
    case "buc":
      return "Cantitate";
    default:
      return "Cantitate";
  }
}

export function canonicalContentHash(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
