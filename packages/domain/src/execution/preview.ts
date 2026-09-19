import {
  composeProductProcessesFromTruth,
  topologicalOrder,
  type ProcessCompositionNode,
  type ProductProcessComposition,
} from "../processes/composition.js";
import {
  APPLY_SURFACE_FINISH_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PLACE_LED_MODULES_ID,
  getOperationalProcess,
  getProductionCapability,
  processCategoryLabel,
  processProviderRequirement,
  type ProviderRequirement,
} from "../processes/catalog.js";
import type { ProductAggregate, ProductTemplate, ProductTruth } from "../product/types.js";
import { compileEic, type EicResult } from "../resources/eic.js";
import { getResource, MAT_LED_MODULE_ID } from "../resources/catalog.js";
import {
  quantityForRecipe,
  recipeForProcessScope,
} from "../resources/recipes.js";
import { providersForProcess } from "../workcenters/providers.js";

export const EXECUTION_PREVIEW_STATUSES = ["PREVIEW"] as const;
export type ExecutionPreviewStatus = (typeof EXECUTION_PREVIEW_STATUSES)[number];

export const EXECUTION_OPERATION_READINESS = [
  "READY",
  "INCOMPLETE",
  "NO_PROVIDER",
] as const;
export type ExecutionOperationReadiness =
  (typeof EXECUTION_OPERATION_READINESS)[number];

export type ExecutionPreviewQuantity = {
  label: string;
  value: number;
  unit: string;
};

export type ExecutionPreviewResource = {
  label: string;
  quantity: number;
  unit: string;
};

export type ExecutionPreviewProvider = {
  label: string;
};

export type ExecutionPlanPreviewOperation = {
  id: string;
  seq: number;
  seqLabel: string;
  processId: string;
  processLabel: string;
  categoryLabel: string;
  scope: string;
  scopeLabel: string;
  typeLabel: string | null;
  dependsOn: readonly string[];
  dependsOnLabels: readonly string[];
  requiredCapabilityLabel: string;
  providerRequirement: ProviderRequirement;
  eligibleProviders: readonly ExecutionPreviewProvider[];
  readiness: ExecutionOperationReadiness;
  readinessLabel: string;
  canStart: boolean;
  parallelEligible: boolean;
  quantities: readonly ExecutionPreviewQuantity[];
  resources: readonly ExecutionPreviewResource[];
};

export type ExecutionPlanPreviewSummary = {
  productLabel: string;
  inscription: string;
  operationCount: number;
  readyCount: number;
  incompleteCount: number;
  noProviderCount: number;
  internalCostTotal: number;
  internalCostCurrency: "EUR";
  internalCostCompleteness: EicResult["completeness"];
  analyzerNote: string;
};

export type ExecutionPlanPreview = {
  previewId: string;
  productCode: string;
  productLabel: string;
  truthReviewId: string;
  status: ExecutionPreviewStatus;
  readiness: "READY" | "INCOMPLETE";
  operationCount: number;
  operations: readonly ExecutionPlanPreviewOperation[];
  summary: ExecutionPlanPreviewSummary;
};

export function compileExecutionPlanPreview(
  truth: ProductTruth,
  aggregate: ProductAggregate,
  template: ProductTemplate,
  eic?: EicResult,
): ExecutionPlanPreview {
  const composition = composeProductProcessesFromTruth(truth, template);
  const eicResult = eic ?? compileEic(aggregate, composition);
  return projectExecutionPlanPreview(truth, aggregate, composition, eicResult);
}

export function projectExecutionPlanPreview(
  truth: ProductTruth,
  aggregate: ProductAggregate,
  composition: ProductProcessComposition,
  eic: EicResult,
): ExecutionPlanPreview {
  const order = topologicalOrder(composition.nodes);
  const byId = new Map(composition.nodes.map((node) => [node.id, node]));
  const depths = dependencyDepths(composition.nodes);
  const depthCounts = new Map<number, number>();
  for (const id of order) {
    const depth = depths.get(id) ?? 0;
    depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);
  }

  const operations = order.map((id, index) => {
    const node = byId.get(id);
    if (!node) {
      throw new Error(`unknown_preview_node:${id}`);
    }
    return toOperation(node, index + 1, byId, aggregate, depths, depthCounts);
  });

  const readyCount = operations.filter((item) => item.readiness === "READY").length;
  const incompleteCount = operations.filter(
    (item) => item.readiness === "INCOMPLETE",
  ).length;
  const noProviderCount = operations.filter(
    (item) => item.readiness === "NO_PROVIDER",
  ).length;

  return {
    previewId: `preview:${truth.templateCode}:${truth.reviewId}`,
    productCode: truth.templateCode,
    productLabel: aggregate.productLabel,
    truthReviewId: truth.reviewId,
    status: "PREVIEW",
    readiness: incompleteCount === 0 ? "READY" : "INCOMPLETE",
    operationCount: operations.length,
    operations,
    summary: {
      productLabel: aggregate.productLabel,
      inscription: aggregate.inscription,
      operationCount: operations.length,
      readyCount,
      incompleteCount,
      noProviderCount,
      internalCostTotal: eic.total,
      internalCostCurrency: eic.currency,
      internalCostCompleteness: eic.completeness,
      analyzerNote: "",
    },
  };
}

export function executionOperationReadinessLabel(
  readiness: ExecutionOperationReadiness,
): string {
  switch (readiness) {
    case "READY":
      return "Pregătit";
    case "INCOMPLETE":
      return "Incomplet";
    case "NO_PROVIDER":
      return "Fără furnizor";
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

function toOperation(
  node: ProcessCompositionNode,
  seq: number,
  byId: ReadonlyMap<string, ProcessCompositionNode>,
  aggregate: ProductAggregate,
  depths: ReadonlyMap<string, number>,
  depthCounts: ReadonlyMap<number, number>,
): ExecutionPlanPreviewOperation {
  const process = getOperationalProcess(node.processId);
  const capability = process
    ? getProductionCapability(process.requiredCapabilityId)
    : undefined;
  const recipe = recipeForProcessScope(node.processId, node.scope);
  const recipeQuantity = recipe ? quantityForRecipe(recipe, aggregate) : undefined;
  const providers = providersForProcess(node.processId)
    .filter((item) => item.lifecycle === "ACTIVE")
    .map((item) => ({ label: item.label }))
    .sort((left, right) => left.label.localeCompare(right.label, "ro"));
  const quantities = operationQuantities(node, aggregate, recipeQuantity);
  const resources = operationResources(node, aggregate, recipeQuantity);
  const providerRequirement = processProviderRequirement(process);
  const readiness = operationReadiness({
    processExists: Boolean(process),
    capabilityExists: Boolean(capability),
    dependenciesValid: node.dependsOn.every((id) => byId.has(id)),
    quantityReady: recipe ? recipeQuantity !== undefined : true,
    hasProvider: providers.length > 0,
    providerRequired: providerRequirement === "REQUIRED",
  });
  const depth = depths.get(node.id) ?? 0;

  return {
    id: node.id,
    seq,
    seqLabel: String(seq).padStart(2, "0"),
    processId: node.processId,
    processLabel: node.processLabel,
    categoryLabel: process ? processCategoryLabel(process.category) : node.scopeLabel,
    scope: node.scope,
    scopeLabel: node.scopeLabel,
    typeLabel: node.typeLabel,
    dependsOn: [...node.dependsOn],
    dependsOnLabels: node.dependsOn.flatMap((id) => {
      const dep = byId.get(id);
      return dep ? [`${dep.processLabel} — ${dep.scopeLabel}`] : [];
    }),
    requiredCapabilityLabel: capability?.label ?? "Capabilitate necunoscută",
    providerRequirement,
    eligibleProviders: providers,
    readiness,
    readinessLabel: executionOperationReadinessLabel(readiness),
    canStart: node.dependsOn.length === 0,
    parallelEligible: (depthCounts.get(depth) ?? 0) > 1,
    quantities,
    resources,
  };
}

function operationReadiness(input: {
  processExists: boolean;
  capabilityExists: boolean;
  dependenciesValid: boolean;
  quantityReady: boolean;
  hasProvider: boolean;
  providerRequired: boolean;
}): ExecutionOperationReadiness {
  if (
    !input.processExists ||
    !input.capabilityExists ||
    !input.dependenciesValid ||
    !input.quantityReady
  ) {
    return "INCOMPLETE";
  }
  if (input.providerRequired && !input.hasProvider) {
    return "NO_PROVIDER";
  }
  return "READY";
}

function operationQuantities(
  node: ProcessCompositionNode,
  aggregate: ProductAggregate,
  recipeQuantity: number | undefined,
): ExecutionPreviewQuantity[] {
  if (recipeQuantity !== undefined) {
    const recipe = recipeForProcessScope(node.processId, node.scope);
    if (recipe) {
      return [
        {
          label: quantityLabelForUnit(recipe.unit),
          value: recipeQuantity,
          unit: recipe.unit,
        },
      ];
    }
  }
  if (node.processId === PLACE_LED_MODULES_ID) {
    return quantitiesByIds(aggregate, ["ledModuleQuantity"]);
  }
  if (node.processId === INSTALL_OR_CONNECT_PSU_ID) {
    return quantitiesByIds(aggregate, ["selectedPsu:MAT-LED-PSU-12V-160W"]).map(
      (item) => ({ ...item, label: "Sursă selectată 160 W" }),
    );
  }
  return [];
}

function operationResources(
  node: ProcessCompositionNode,
  aggregate: ProductAggregate,
  recipeQuantity: number | undefined,
): ExecutionPreviewResource[] {
  const resources: ExecutionPreviewResource[] = [];
  const recipe = recipeForProcessScope(node.processId, node.scope);
  if (recipe && recipeQuantity !== undefined) {
    const resource = getResource(recipe.costEvidenceId);
    if (resource) {
      resources.push({
        label: resource.label,
        quantity: recipeQuantity,
        unit: recipe.unit,
      });
    }
  }
  if (node.processId === PLACE_LED_MODULES_ID) {
    pushAggregateResource(resources, aggregate, MAT_LED_MODULE_ID);
  }
  if (node.processId === INSTALL_OR_CONNECT_PSU_ID) {
    for (const requirement of aggregate.requirements) {
      if (requirement.resourceId.startsWith("MAT-LED-PSU-")) {
        const resource = getResource(requirement.resourceId);
        if (resource) {
          resources.push({
            label: resource.label,
            quantity: requirement.quantity,
            unit: requirement.unit,
          });
        }
      }
    }
  }
  if (node.processId === APPLY_SURFACE_FINISH_ID) {
    pushAggregateResource(resources, aggregate, "MAT-VINYL-ORACAL-651", node.scope);
  }
  return resources;
}

function pushAggregateResource(
  resources: ExecutionPreviewResource[],
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
    resources.push({
      label: resource.label,
      quantity: requirement.quantity,
      unit: requirement.unit,
    });
  }
}

function quantitiesByIds(
  aggregate: ProductAggregate,
  ids: readonly string[],
): ExecutionPreviewQuantity[] {
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

function dependencyDepths(
  nodes: readonly ProcessCompositionNode[],
): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();

  function depthOf(id: string, stack: Set<string>): number {
    const cached = depths.get(id);
    if (cached !== undefined) {
      return cached;
    }
    if (stack.has(id)) {
      throw new Error(`cyclic_preview_dependency:${id}`);
    }
    const node = byId.get(id);
    if (!node || node.dependsOn.length === 0) {
      depths.set(id, 0);
      return 0;
    }
    stack.add(id);
    const depth = 1 + Math.max(...node.dependsOn.map((dep) => depthOf(dep, stack)));
    stack.delete(id);
    depths.set(id, depth);
    return depth;
  }

  for (const node of nodes) {
    depthOf(node.id, new Set());
  }
  return depths;
}
