import type { ProductTemplate } from "../product/types.js";
import {
  costEvidence,
  costSourceLabel,
  getResource,
  lookupCostEvidence,
  resourceUnitLabel,
  type CostEvidence,
} from "../resources/catalog.js";
import { costEvidenceNeedsVerification } from "../resources/eic.js";
import {
  recipeForProcessScope,
  recipeKindLabel,
  recipeLifecycleLabel,
  recipeQuantityBasisLabel,
} from "../resources/recipes.js";
import {
  getOperationalProcess,
  getProductionCapability,
} from "./catalog.js";
import {
  acmProcessCompositionInspections,
  lettersProcessCompositionInspections,
  logoProcessCompositionInspections,
  topologicalOrder,
  type CompositionCompleteness,
  type CompositionNodeReadiness,
  type ExecutionReadiness,
  type LightingCalculationReadiness,
  type ProcessCompositionNode,
  type ProcessCompositionOptions,
  type ProductProcessComposition,
} from "./composition.js";

export const CATALOG_PROCESS_GRAPH_SCHEMA_VERSION = "catalog-process-graph.v1" as const;

export const CATALOG_PROCESS_GRAPH_ILLUSTRATIVE_NOTE =
  "Scenariu ilustrativ al definiției. Nu este un deviz, o cerere sau măsurătoarea unei lucrări.";

export const PROCESS_GRAPH_EVIDENCE_STATES = [
  "PRESENT",
  "PRESENT_NEEDS_VERIFICATION",
  "MISSING",
] as const;

export type ProcessGraphEvidenceState = (typeof PROCESS_GRAPH_EVIDENCE_STATES)[number];

export type ProcessGraphEdge = {
  readonly id: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
};

export type ProcessGraphRecipeContext = {
  readonly recipeId: string;
  readonly recipeLabel: string;
  readonly recipeKindLabel: string;
  readonly recipeLifecycleLabel: string;
  readonly quantityBasisLabel: string;
  readonly resourceId: string;
  readonly resourceLabel: string;
  readonly unitLabel: string;
  readonly evidenceState: ProcessGraphEvidenceState;
  readonly evidenceSourceLabel: string | null;
  readonly evidenceClassificationLabel: string | null;
  readonly sharedWithNodeIds: readonly string[];
  /** Absent evidence stays null. It is never stored as zero. */
  readonly rate: number | null;
  readonly currency: "EUR" | null;
};

export type CatalogProcessGraphNode = {
  readonly id: string;
  readonly processId: string;
  readonly processLabel: string;
  readonly scope: ProcessCompositionNode["scope"];
  readonly scopeLabel: string;
  readonly typeId: string | null;
  readonly typeLabel: string | null;
  readonly conditionLabel: string | null;
  readonly reason: string;
  readonly dependsOn: readonly string[];
  readonly successors: readonly string[];
  readonly nodeReadiness: CompositionNodeReadiness;
  readonly nodeReadinessLabel: string;
  readonly blockers: readonly string[];
  /** Capability class required by the process definition. Not an assigned machine or person. */
  readonly capabilityLabel: string | null;
  readonly recipe: ProcessGraphRecipeContext | null;
};

export type CatalogProcessGraph = {
  readonly schemaVersion: typeof CATALOG_PROCESS_GRAPH_SCHEMA_VERSION;
  readonly directEdgeIds: readonly string[];
  readonly simplifiedEdgeIds: readonly string[];
  readonly hiddenEdgeIds: readonly string[];
  readonly hiddenEdgeCount: number;
  readonly topologicalOrder: readonly string[];
  readonly technologicalProcessCompleteness: CompositionCompleteness;
  readonly technologicalProcessCompletenessLabel: string;
  readonly executionReadiness: ExecutionReadiness;
  readonly executionReadinessLabel: string;
  readonly costCompleteness: ProductProcessComposition["costCompleteness"];
  readonly costCompletenessLabel: string;
  readonly lightingCalculationReadiness: LightingCalculationReadiness;
  readonly lightingCalculationReadinessLabel: string;
  readonly completeness: CompositionCompleteness;
  readonly completenessLabel: string;
  readonly completenessReasons: readonly string[];
  readonly nodes: readonly CatalogProcessGraphNode[];
  readonly edges: readonly ProcessGraphEdge[];
};

export type CatalogProcessGraphScenario = {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  readonly illustrative: true;
  readonly note: string;
  readonly composition: ProductProcessComposition;
};

export function processGraphEdgeId(fromNodeId: string, toNodeId: string): string {
  return `${fromNodeId}>${toNodeId}`;
}

export function directProcessGraphEdges(
  nodes: readonly ProcessCompositionNode[],
): ProcessGraphEdge[] {
  const known = new Set(nodes.map((node) => node.id));
  const edges: ProcessGraphEdge[] = [];
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!known.has(dependency)) {
        throw new Error(`unknown_process_dependency:${node.id}->${dependency}`);
      }
      edges.push({
        id: processGraphEdgeId(dependency, node.id),
        fromNodeId: dependency,
        toNodeId: node.id,
      });
    }
  }
  return edges;
}

export function simplifyProcessGraphEdges(edges: readonly ProcessGraphEdge[]): {
  simplified: ProcessGraphEdge[];
  hidden: ProcessGraphEdge[];
} {
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    const next = outgoing.get(edge.fromNodeId) ?? [];
    next.push(edge.toNodeId);
    outgoing.set(edge.fromNodeId, next);
  }
  const simplified: ProcessGraphEdge[] = [];
  const hidden: ProcessGraphEdge[] = [];
  for (const edge of edges) {
    if (reachesByAnotherPath(edge.fromNodeId, edge.toNodeId, outgoing)) {
      hidden.push(edge);
    } else {
      simplified.push(edge);
    }
  }
  return { simplified, hidden };
}

export function catalogProcessGraphScenarios(
  template: ProductTemplate,
  options: ProcessCompositionOptions = {},
): CatalogProcessGraphScenario[] {
  return [
    ...lettersProcessCompositionInspections(template, options),
    ...logoProcessCompositionInspections(template, options),
    ...acmProcessCompositionInspections(template, options),
  ].map((inspection) => ({
    id: inspection.id,
    label: inspection.label,
    summary: inspection.summary,
    illustrative: true,
    note: CATALOG_PROCESS_GRAPH_ILLUSTRATIVE_NOTE,
    composition: inspection.composition,
  }));
}

export function projectCatalogProcessGraph(
  composition: ProductProcessComposition,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): CatalogProcessGraph {
  const ids = composition.nodes.map((node) => node.id);
  if (new Set(ids).size !== ids.length) {
    throw new Error("process_graph_duplicate_node");
  }
  const order = topologicalOrder(composition.nodes);
  if (order.join("\n") !== composition.derivedOrder.join("\n")) {
    throw new Error("process_graph_order_drift");
  }
  const edges = directProcessGraphEdges(composition.nodes);
  const { simplified, hidden } = simplifyProcessGraphEdges(edges);
  const successors = successorsByNode(edges, order);
  const recipes = composition.nodes.map((node) => recipeContext(node, evidenceRows));
  const shared = sharedNodeIds(composition.nodes, recipes);
  const nodes = composition.nodes.map((node, index) =>
    toGraphNode(node, successors.get(node.id) ?? [], recipes[index] ?? null, shared.get(node.id) ?? []),
  );
  return {
    schemaVersion: CATALOG_PROCESS_GRAPH_SCHEMA_VERSION,
    directEdgeIds: edges.map((edge) => edge.id),
    simplifiedEdgeIds: simplified.map((edge) => edge.id),
    hiddenEdgeIds: hidden.map((edge) => edge.id),
    hiddenEdgeCount: hidden.length,
    topologicalOrder: composition.derivedOrder,
    technologicalProcessCompleteness: composition.technologicalProcessCompleteness,
    technologicalProcessCompletenessLabel: composition.technologicalProcessCompletenessLabel,
    executionReadiness: composition.executionReadiness,
    executionReadinessLabel: composition.executionReadinessLabel,
    costCompleteness: composition.costCompleteness,
    costCompletenessLabel: composition.costCompletenessLabel,
    lightingCalculationReadiness: composition.lightingCalculationReadiness,
    lightingCalculationReadinessLabel: composition.lightingCalculationReadinessLabel,
    completeness: composition.completeness,
    completenessLabel: composition.completenessLabel,
    completenessReasons: composition.completenessReasons,
    nodes,
    edges,
  };
}

function reachesByAnotherPath(
  fromNodeId: string,
  toNodeId: string,
  outgoing: ReadonlyMap<string, readonly string[]>,
): boolean {
  const seen = new Set<string>([fromNodeId]);
  const stack = (outgoing.get(fromNodeId) ?? []).filter((next) => next !== toNodeId);
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) {
      continue;
    }
    if (current === toNodeId) {
      return true;
    }
    seen.add(current);
    for (const next of outgoing.get(current) ?? []) {
      if (!seen.has(next)) {
        stack.push(next);
      }
    }
  }
  return false;
}

function successorsByNode(
  edges: readonly ProcessGraphEdge[],
  order: readonly string[],
): Map<string, string[]> {
  const index = new Map(order.map((id, position) => [id, position]));
  const grouped = new Map<string, string[]>();
  for (const edge of edges) {
    const next = grouped.get(edge.fromNodeId) ?? [];
    next.push(edge.toNodeId);
    grouped.set(edge.fromNodeId, next);
  }
  for (const [id, targets] of grouped) {
    grouped.set(
      id,
      [...targets].sort((left, right) => (index.get(left) ?? 0) - (index.get(right) ?? 0)),
    );
  }
  return grouped;
}

function recipeContext(
  node: ProcessCompositionNode,
  evidenceRows: readonly CostEvidence[],
): Omit<ProcessGraphRecipeContext, "sharedWithNodeIds"> | null {
  const recipe = recipeForProcessScope(node.processId, node.scope, node.typeId);
  if (!recipe) {
    return null;
  }
  const resource = getResource(recipe.costEvidenceId);
  const evidence = lookupCostEvidence(evidenceRows, recipe.costEvidenceId);
  if (!resource || !evidence) {
    return {
      recipeId: recipe.id,
      recipeLabel: recipe.label,
      recipeKindLabel: recipeKindLabel(recipe.kind),
      recipeLifecycleLabel: recipeLifecycleLabel(recipe.lifecycle),
      quantityBasisLabel: recipeQuantityBasisLabel(recipe.quantityBasis),
      resourceId: recipe.costEvidenceId,
      resourceLabel: resource?.label ?? recipe.costEvidenceId,
      unitLabel: resource ? resourceUnitLabel(resource.unit) : recipe.unit,
      evidenceState: "MISSING",
      evidenceSourceLabel: null,
      evidenceClassificationLabel: null,
      rate: null,
      currency: null,
    };
  }
  return {
    recipeId: recipe.id,
    recipeLabel: recipe.label,
    recipeKindLabel: recipeKindLabel(recipe.kind),
    recipeLifecycleLabel: recipeLifecycleLabel(recipe.lifecycle),
    quantityBasisLabel: recipeQuantityBasisLabel(recipe.quantityBasis),
    resourceId: resource.id,
    resourceLabel: resource.label,
    unitLabel: resourceUnitLabel(resource.unit),
    evidenceState: costEvidenceNeedsVerification(evidence)
      ? "PRESENT_NEEDS_VERIFICATION"
      : "PRESENT",
    evidenceSourceLabel: costSourceLabel(evidence.source),
    evidenceClassificationLabel: classificationLabel(evidence.classification),
    rate: evidence.amount,
    currency: evidence.currency,
  };
}

function sharedNodeIds(
  nodes: readonly ProcessCompositionNode[],
  recipes: readonly (Omit<ProcessGraphRecipeContext, "sharedWithNodeIds"> | null)[],
): Map<string, string[]> {
  const owners = new Map<string, string[]>();
  nodes.forEach((node, index) => {
    const resourceId = recipes[index]?.resourceId;
    if (!resourceId) {
      return;
    }
    const list = owners.get(resourceId) ?? [];
    list.push(node.id);
    owners.set(resourceId, list);
  });
  const shared = new Map<string, string[]>();
  nodes.forEach((node, index) => {
    const resourceId = recipes[index]?.resourceId;
    const group = resourceId ? owners.get(resourceId) ?? [] : [];
    shared.set(
      node.id,
      group.filter((id) => id !== node.id),
    );
  });
  return shared;
}

function toGraphNode(
  node: ProcessCompositionNode,
  successors: readonly string[],
  recipe: Omit<ProcessGraphRecipeContext, "sharedWithNodeIds"> | null,
  sharedWithNodeIds: readonly string[],
): CatalogProcessGraphNode {
  return {
    id: node.id,
    processId: node.processId,
    processLabel: node.processLabel,
    scope: node.scope,
    scopeLabel: node.scopeLabel,
    typeId: node.typeId,
    typeLabel: node.typeLabel,
    conditionLabel: node.conditionLabel,
    reason: node.reason,
    dependsOn: node.dependsOn,
    successors,
    nodeReadiness: node.nodeReadiness,
    nodeReadinessLabel: node.nodeReadinessLabel,
    blockers: node.blockers,
    capabilityLabel: capabilityLabelFor(node.processId),
    recipe: recipe ? { ...recipe, sharedWithNodeIds } : null,
  };
}

function capabilityLabelFor(processId: string): string | null {
  const process = getOperationalProcess(processId);
  if (!process) return null;
  return getProductionCapability(process.requiredCapabilityId)?.label ?? null;
}

function classificationLabel(
  classification: CostEvidence["classification"],
): string {
  switch (classification) {
    case "AI_DECISION":
      return "Decizie de dezvoltare";
    case "OWNER_CONFIRMED":
      return "Confirmată";
    case "DEVELOPMENT_DEFAULT":
      return "Valoare de dezvoltare";
    default: {
      const exhaustive: never = classification;
      return exhaustive;
    }
  }
}
