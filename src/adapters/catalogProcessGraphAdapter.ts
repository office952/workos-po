import { asBoolean, asNumber, asRecord, asString, asStringList } from "./record";

const SCHEMA_VERSION = "catalog-process-graph.v1";
const EVIDENCE_STATES = ["PRESENT", "PRESENT_NEEDS_VERIFICATION", "MISSING"] as const;
const READINESS = ["REQUIRED", "REQUIRED_INCOMPLETE", "REQUIRED_BLOCKED"] as const;

export type ProcessGraphEvidenceState = (typeof EVIDENCE_STATES)[number];
export type ProcessGraphNodeReadiness = (typeof READINESS)[number];

export type ProcessGraphRecipeView = {
  recipeLabel: string;
  recipeKindLabel: string;
  recipeLifecycleLabel: string;
  quantityBasisLabel: string;
  resourceLabel: string;
  unitLabel: string;
  evidenceState: ProcessGraphEvidenceState;
  evidenceSourceLabel: string | null;
  evidenceClassificationLabel: string | null;
  sharedWithLabels: string[];
  rate: number | null;
  currency: "EUR" | null;
  rateVisible: boolean;
  resourcesHref: string;
};

export type ProcessGraphNodeView = {
  id: string;
  processLabel: string;
  scopeLabel: string;
  typeLabel: string | null;
  conditionLabel: string | null;
  reason: string;
  dependsOnLabels: string[];
  successorLabels: string[];
  nodeReadiness: ProcessGraphNodeReadiness;
  nodeReadinessLabel: string;
  blockers: string[];
  technicalHref: string | null;
  formulaHref: string | null;
  recipe: ProcessGraphRecipeView | null;
};

export type ProcessGraphScenarioView = {
  id: string;
  label: string;
  summary: string;
};

export type ProcessGraphView = {
  status: "READY" | "NO_REFERENCE_SCENARIO";
  productLabel: string;
  canViewFinancialAmounts: boolean;
  scenario: (ProcessGraphScenarioView & { note: string }) | null;
  scenarios: ProcessGraphScenarioView[];
  hiddenEdgeCount: number;
  directEdgeIds: string[];
  simplifiedEdgeIds: string[];
  edges: { id: string; fromNodeId: string; toNodeId: string }[];
  topologicalOrder: string[];
  technologicalProcessCompletenessLabel: string;
  executionReadinessLabel: string;
  costCompletenessLabel: string;
  lightingCalculationReadinessLabel: string;
  completenessLabel: string;
  completenessReasons: string[];
  nodes: ProcessGraphNodeView[];
};

export function presentCatalogProcessGraph(payload: unknown): ProcessGraphView | null {
  const body = asRecord(payload);
  if (!body || body.schemaVersion !== SCHEMA_VERSION) return null;
  if (body.readOnly !== true || body.mutatesConfiguration !== false || body.writeState !== "NOT_IMPLEMENTED") return null;
  const productLabel = asString(body.productLabel);
  const canView = asBoolean(body.canViewFinancialAmounts);
  const scenarios = scenariosOf(body.scenarios);
  if (!productLabel || canView === null || !scenarios) return null;
  if (body.status === "NO_REFERENCE_SCENARIO") {
    if (body.scenario !== null || body.graph !== null) return null;
    return emptyView(productLabel, canView, scenarios);
  }
  if (body.status !== "READY") return null;
  const scenario = scenarioOf(body.scenario, true);
  const graph = asRecord(body.graph);
  if (!scenario || !graph) return null;
  const presented = graphOf(graph, canView);
  if (!presented) return null;
  return {
    status: "READY",
    productLabel,
    canViewFinancialAmounts: canView,
    scenario,
    scenarios,
    ...presented,
  };
}

function emptyView(
  productLabel: string,
  canViewFinancialAmounts: boolean,
  scenarios: ProcessGraphScenarioView[],
): ProcessGraphView {
  return {
    status: "NO_REFERENCE_SCENARIO",
    productLabel,
    canViewFinancialAmounts,
    scenario: null,
    scenarios,
    hiddenEdgeCount: 0,
    directEdgeIds: [],
    simplifiedEdgeIds: [],
    edges: [],
    topologicalOrder: [],
    technologicalProcessCompletenessLabel: "",
    executionReadinessLabel: "",
    costCompletenessLabel: "",
    lightingCalculationReadinessLabel: "",
    completenessLabel: "",
    completenessReasons: [],
    nodes: [],
  };
}

function scenariosOf(value: unknown): ProcessGraphScenarioView[] | null {
  if (!Array.isArray(value)) return null;
  const scenarios: ProcessGraphScenarioView[] = [];
  for (const item of value) {
    const scenario = scenarioOf(item, false);
    if (!scenario) return null;
    scenarios.push(scenario);
  }
  return scenarios;
}

function scenarioOf(value: unknown, withNote: boolean): (ProcessGraphScenarioView & { note: string }) | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const label = asString(record.label);
  const summary = asString(record.summary);
  if (!id || !label || !summary) return null;
  if (withNote) {
    if (record.illustrative !== true) return null;
    const note = asString(record.note);
    if (!note) return null;
    return { id, label, summary, note };
  }
  return { id, label, summary, note: "" };
}

function graphOf(graph: Record<string, unknown>, canView: boolean): Omit<
  ProcessGraphView,
  "status" | "productLabel" | "canViewFinancialAmounts" | "scenario" | "scenarios"
> | null {
  const directEdgeIds = asStringList(graph.directEdgeIds);
  const simplifiedEdgeIds = asStringList(graph.simplifiedEdgeIds);
  const hiddenEdgeIds = asStringList(graph.hiddenEdgeIds);
  const hiddenEdgeCount = asNumber(graph.hiddenEdgeCount);
  const topologicalOrder = asStringList(graph.topologicalOrder);
  const technologicalProcessCompletenessLabel = asString(graph.technologicalProcessCompletenessLabel);
  const executionReadinessLabel = asString(graph.executionReadinessLabel);
  const costCompletenessLabel = asString(graph.costCompletenessLabel);
  const lightingCalculationReadinessLabel = asString(graph.lightingCalculationReadinessLabel);
  const completenessLabel = asString(graph.completenessLabel);
  const completenessReasons = asStringList(graph.completenessReasons);
  if (
    hiddenEdgeCount === null ||
    hiddenEdgeCount !== hiddenEdgeIds.length ||
    !technologicalProcessCompletenessLabel ||
    !executionReadinessLabel ||
    !costCompletenessLabel ||
    !lightingCalculationReadinessLabel ||
    !completenessLabel ||
    !subset(simplifiedEdgeIds, directEdgeIds) ||
    !subset(hiddenEdgeIds, directEdgeIds)
  ) {
    return null;
  }
  const edges = edgesOf(graph.edges, directEdgeIds);
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : null;
  if (!edges || !rawNodes) return null;
  const labels = new Map<string, string>();
  for (const item of rawNodes) {
    const record = asRecord(item);
    const id = record ? asString(record.id) : null;
    const label = record ? asString(record.processLabel) : null;
    if (!id || !label || labels.has(id)) return null;
    labels.set(id, label);
  }
  if (topologicalOrder.some((id) => !labels.has(id)) || topologicalOrder.length !== labels.size) return null;
  const nodes: ProcessGraphNodeView[] = [];
  for (const item of rawNodes) {
    const node = nodeOf(item, labels, canView);
    if (!node) return null;
    nodes.push(node);
  }
  return {
    hiddenEdgeCount,
    directEdgeIds,
    simplifiedEdgeIds,
    edges,
    topologicalOrder,
    technologicalProcessCompletenessLabel,
    executionReadinessLabel,
    costCompletenessLabel,
    lightingCalculationReadinessLabel,
    completenessLabel,
    completenessReasons,
    nodes,
  };
}

function edgesOf(value: unknown, directEdgeIds: readonly string[]): ProcessGraphView["edges"] | null {
  if (!Array.isArray(value) || value.length !== directEdgeIds.length) return null;
  const edges: ProcessGraphView["edges"] = [];
  for (const item of value) {
    const record = asRecord(item);
    const id = record ? asString(record.id) : null;
    const fromNodeId = record ? asString(record.fromNodeId) : null;
    const toNodeId = record ? asString(record.toNodeId) : null;
    if (!id || !fromNodeId || !toNodeId || !directEdgeIds.includes(id)) return null;
    edges.push({ id, fromNodeId, toNodeId });
  }
  return edges;
}

function nodeOf(
  value: unknown,
  labels: ReadonlyMap<string, string>,
  canView: boolean,
): ProcessGraphNodeView | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = asString(record.id);
  const processLabel = asString(record.processLabel);
  const scopeLabel = asString(record.scopeLabel);
  const reason = asString(record.reason);
  const nodeReadinessLabel = asString(record.nodeReadinessLabel);
  const readiness = asString(record.nodeReadiness);
  const dependsOn = asStringList(record.dependsOn);
  const successors = asStringList(record.successors);
  const blockers = asStringList(record.blockers);
  if (!id || !processLabel || !scopeLabel || !reason || !nodeReadinessLabel || !isReadiness(readiness)) return null;
  if (dependsOn.some((item) => !labels.has(item)) || successors.some((item) => !labels.has(item))) return null;
  const typeId = record.typeId === null ? null : asString(record.typeId);
  if (record.typeId !== null && !typeId) return null;
  const typeLabel = record.typeLabel === null ? null : asString(record.typeLabel);
  const conditionLabel = record.conditionLabel === null ? null : asString(record.conditionLabel);
  if ((record.typeLabel !== null && !typeLabel) || (record.conditionLabel !== null && !conditionLabel)) return null;
  const recipe = recipeOf(record.recipe, labels, canView);
  if (recipe === undefined) return null;
  return {
    id,
    processLabel,
    scopeLabel,
    typeLabel,
    conditionLabel,
    reason,
    dependsOnLabels: dependsOn.map((item) => labels.get(item) ?? item),
    successorLabels: successors.map((item) => labels.get(item) ?? item),
    nodeReadiness: readiness,
    nodeReadinessLabel,
    blockers,
    technicalHref: typeId ? `/admin/technical?component=${encodeURIComponent(typeId)}` : null,
    formulaHref: typeId ? `/admin/formulas?component=${encodeURIComponent(typeId)}` : null,
    recipe,
  };
}

function recipeOf(
  value: unknown,
  labels: ReadonlyMap<string, string>,
  canView: boolean,
): ProcessGraphRecipeView | null | undefined {
  if (value === null) return null;
  const record = asRecord(value);
  if (!record) return undefined;
  const evidenceState = asString(record.evidenceState);
  if (!isEvidence(evidenceState)) return undefined;
  const recipeLabel = asString(record.recipeLabel);
  const recipeKindLabel = asString(record.recipeKindLabel);
  const recipeLifecycleLabel = asString(record.recipeLifecycleLabel);
  const quantityBasisLabel = asString(record.quantityBasisLabel);
  const resourceLabel = asString(record.resourceLabel);
  const unitLabel = asString(record.unitLabel);
  const sharedIds = asStringList(record.sharedWithNodeIds);
  if (!recipeLabel || !recipeKindLabel || !recipeLifecycleLabel || !quantityBasisLabel || !resourceLabel || !unitLabel) {
    return undefined;
  }
  if (sharedIds.some((item) => !labels.has(item))) return undefined;
  const hasRate = Object.prototype.hasOwnProperty.call(record, "rate");
  const hasCurrency = Object.prototype.hasOwnProperty.call(record, "currency");
  if (!canView && (hasRate || hasCurrency)) return undefined;
  let rate: number | null = null;
  let currency: "EUR" | null = null;
  if (canView) {
    if (!hasRate || !hasCurrency) return undefined;
    if (record.rate !== null && asNumber(record.rate) === null) return undefined;
    if (record.currency !== null && record.currency !== "EUR") return undefined;
    rate = record.rate === null ? null : asNumber(record.rate);
    currency = record.currency === null ? null : "EUR";
    if (evidenceState === "MISSING" && rate !== null) return undefined;
  }
  return {
    recipeLabel,
    recipeKindLabel,
    recipeLifecycleLabel,
    quantityBasisLabel,
    resourceLabel,
    unitLabel,
    evidenceState,
    evidenceSourceLabel: record.evidenceSourceLabel === null ? null : asString(record.evidenceSourceLabel),
    evidenceClassificationLabel: record.evidenceClassificationLabel === null ? null : asString(record.evidenceClassificationLabel),
    sharedWithLabels: sharedIds.map((item) => labels.get(item) ?? item),
    rate,
    currency,
    rateVisible: canView,
    resourcesHref: "/admin/resources",
  };
}

function subset(values: readonly string[], allowed: readonly string[]): boolean {
  return values.every((item) => allowed.includes(item));
}

function isReadiness(value: string | null): value is ProcessGraphNodeReadiness {
  return READINESS.some((item) => item === value);
}

function isEvidence(value: string | null): value is ProcessGraphEvidenceState {
  return EVIDENCE_STATES.some((item) => item === value);
}
