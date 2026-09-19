import type { ComponentCalculationResult } from "../product/componentContract.js";
import {
  collectComponentMeasurements,
  evaluateProductComponents,
  lightingEvaluationFrom,
  type ComponentEvaluation,
} from "../product/componentEvaluation.js";
import { selectedComponentIds } from "../product/compiler.js";
import { getComponentType } from "../product/componentTypes.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import {
  LIGHTING_MISSING_LED_GEOMETRY,
  LIGHTING_MISSING_LED_LOAD,
  LIGHTING_MISSING_PSU_CAPACITY,
  LIGHTING_MISSING_PSU_SELECTION,
} from "../product/lighting.js";
import type {
  ComponentRole,
  ComponentTypeId,
  DraftValues,
  ProductAggregate,
  ProductTemplate,
  ProductTruth,
  TechnicalMeasurement,
} from "../product/types.js";
import { compileEic, costCompletenessLabel, type EicResult } from "../resources/eic.js";
import type { CostEvidence } from "../resources/catalog.js";
import {
  APPLY_SURFACE_FINISH_ID,
  ATTACH_INTERNAL_FRAME_ID,
  FORM_SHEET_CASSETTE_ID,
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_METAL_STOCK_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PACK_PRODUCT_ID,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
  getOperationalProcess,
  type OperationalProcess,
} from "./catalog.js";
import {
  processConditionLabel,
  resolvedProcessRequirementsForType,
  type ProcessRequirementCondition,
} from "./requirements.js";

export const PROCESS_COMPOSITION_SCOPES = [
  "FACE",
  "VOLUME",
  "BACK",
  "LIGHTING",
  "BODY",
  "PRODUCT",
] as const;
export type ProcessCompositionScope = (typeof PROCESS_COMPOSITION_SCOPES)[number];

export const COMPOSITION_NODE_READINESS = [
  "REQUIRED",
  "REQUIRED_INCOMPLETE",
  "REQUIRED_BLOCKED",
] as const;
export type CompositionNodeReadiness = (typeof COMPOSITION_NODE_READINESS)[number];

export const COMPOSITION_COMPLETENESS = ["READY", "PARTIAL", "BLOCKED"] as const;
export type CompositionCompleteness = (typeof COMPOSITION_COMPLETENESS)[number];

export const LIGHTING_CALCULATION_READINESS = [
  "NOT_APPLICABLE",
  "BLOCKED",
  "PARTIAL",
  "CALCULATED",
] as const;
export type LightingCalculationReadiness =
  (typeof LIGHTING_CALCULATION_READINESS)[number];

export const MISSING_PROCESS_CLASSIFICATIONS = [
  "REQUIRED_FOR_V1",
  "LATER",
  "BLOCKED",
  "UNKNOWN_OWNER_DECISION",
] as const;
export type MissingProcessClassification =
  (typeof MISSING_PROCESS_CLASSIFICATIONS)[number];

export type ProcessCompositionNode = {
  id: string;
  processId: string;
  processLabel: string;
  scope: ProcessCompositionScope;
  scopeLabel: string;
  typeId: ComponentTypeId | null;
  typeLabel: string | null;
  required: true;
  condition: ProcessRequirementCondition;
  conditionLabel: string | null;
  dependsOn: readonly string[];
  nodeReadiness: CompositionNodeReadiness;
  nodeReadinessLabel: string;
  blockers: readonly string[];
  reason: string;
};

export type MissingProcessGap = {
  id: string;
  label: string;
  classification: MissingProcessClassification;
  classificationLabel: string;
  note: string;
};

export type ProductProcessComposition = {
  productCode: string;
  productLabel: string;
  completeness: CompositionCompleteness;
  completenessLabel: string;
  completenessReasons: readonly string[];
  technologicalProcessCompleteness: CompositionCompleteness;
  technologicalProcessCompletenessLabel: string;
  lightingCalculationReadiness: LightingCalculationReadiness;
  lightingCalculationReadinessLabel: string;
  costCompleteness: "PARTIAL" | "COMPLETE";
  costCompletenessLabel: string;
  executionReadiness: "NOT_IMPLEMENTED";
  executionReadinessLabel: string;
  nodes: readonly ProcessCompositionNode[];
  derivedOrder: readonly string[];
  missingProcesses: readonly MissingProcessGap[];
};

export type ProcessCompositionInspection = {
  id: string;
  label: string;
  summary: string;
  values: DraftValues;
  composition: ProductProcessComposition;
};

export type ProcessCompositionOptions = {
  readonly measurements?: readonly TechnicalMeasurement[];
  readonly evaluations?: readonly ComponentEvaluation[];
  readonly costEvidenceRows?: readonly CostEvidence[];
};

export function compositionNodeId(
  scope: ProcessCompositionScope,
  processId: string,
): string {
  return `${scope}:${processId}`;
}

export function composeTypeProcessNodes(
  scope: ComponentRole,
  typeId: ComponentTypeId,
  values: DraftValues,
  lightingResult?: ComponentCalculationResult,
): ProcessCompositionNode[] {
  return resolvedProcessRequirementsForType(typeId, values).map((requirement) =>
    toNode({
      scope,
      typeId,
      processId: requirement.processId,
      condition: requirement.condition,
      reason: requirement.reason,
      dependsOn: [],
      lightingResult,
    }),
  );
}

export function composeProductProcessTopology(
  template: ProductTemplate,
  values: DraftValues,
  options: ProcessCompositionOptions = {},
): ProductProcessComposition {
  const resolved = resolveProcessCompositionInputs(template, values, options);
  return composeProductProcessTopologyFromResolved(template, resolved);
}

export function applyCompositionCostCompleteness(
  composition: ProductProcessComposition,
  eic: Pick<EicResult, "completeness">,
): ProductProcessComposition {
  return {
    ...composition,
    costCompleteness: eic.completeness,
    costCompletenessLabel: costCompletenessLabel(eic.completeness),
  };
}

export function composeProductProcesses(
  template: ProductTemplate,
  values: DraftValues,
  options: ProcessCompositionOptions = {},
): ProductProcessComposition {
  const resolved = resolveProcessCompositionInputs(template, values, options);
  const topology = composeProductProcessTopologyFromResolved(template, resolved);
  const eic = compileEic(
    costAggregateFromEvaluations(template, resolved.merged, resolved.evaluations),
    topology,
    options.costEvidenceRows,
  );
  return applyCompositionCostCompleteness(topology, eic);
}

export function composeProductProcessesFromTruth(
  truth: ProductTruth,
  template: ProductTemplate,
  costEvidenceRows?: readonly CostEvidence[],
): ProductProcessComposition {
  if (truth.templateCode !== template.code) {
    throw new Error(`process_composition_template_mismatch:${truth.templateCode}`);
  }
  const evaluations = evaluateProductComponents({
    template,
    selectedComponentIds: truth.selectedComponentIds,
    values: truth.values,
    measurements: truth.measurements,
  });
  return composeProductProcesses(template, truth.values, {
    measurements: truth.measurements,
    evaluations,
    costEvidenceRows,
  });
}

type ResolvedProcessCompositionInputs = {
  merged: DraftValues;
  selectedIds: readonly string[];
  evaluations: readonly ComponentEvaluation[];
};

function resolveProcessCompositionInputs(
  template: ProductTemplate,
  values: DraftValues,
  options: ProcessCompositionOptions,
): ResolvedProcessCompositionInputs {
  const merged: DraftValues = { ...template.fixedValues, ...values };
  const selectedIds = selectedComponentIds(template, merged);
  const measurements =
    options.measurements ??
    collectComponentMeasurements(template, selectedIds, merged);
  const evaluations =
    options.evaluations ??
    evaluateProductComponents({
      template,
      selectedComponentIds: selectedIds,
      values: merged,
      measurements,
    });
  return { merged, selectedIds, evaluations };
}

function composeProductProcessTopologyFromResolved(
  template: ProductTemplate,
  resolved: ResolvedProcessCompositionInputs,
): ProductProcessComposition {
  const lightingResult = lightingEvaluationFrom(resolved.evaluations);
  const selectedComponents = template.components.filter((component) =>
    resolved.selectedIds.includes(component.id),
  );
  const nodes = selectedComponents.flatMap((component) =>
    composeTypeProcessNodes(
      component.id as ComponentRole,
      component.typeId,
      resolved.merged,
      lightingResult,
    ),
  );
  const withProduct = addProductComposition(
    nodes,
    selectedComponents.map((item) => item.typeId),
    lightingResult,
  );
  const connected = applyProductDependencies(withProduct);
  const derivedOrder = topologicalOrder(connected);
  const missingProcesses = missingProcessesFor();
  const { completeness, completenessReasons, technological } =
    compositionCompleteness(connected, missingProcesses);
  return {
    productCode: template.code,
    productLabel: template.label,
    completeness,
    completenessLabel: completenessLabel(completeness),
    completenessReasons,
    technologicalProcessCompleteness: technological,
    technologicalProcessCompletenessLabel: completenessLabel(technological),
    lightingCalculationReadiness: lightingReadinessFrom(lightingResult),
    lightingCalculationReadinessLabel: lightingReadinessLabel(
      lightingReadinessFrom(lightingResult),
    ),
    costCompleteness: "PARTIAL",
    costCompletenessLabel: costCompletenessLabel("PARTIAL"),
    executionReadiness: "NOT_IMPLEMENTED",
    executionReadinessLabel: "Neimplementat",
    nodes: sortNodes(connected),
    derivedOrder,
    missingProcesses,
  };
}

function costAggregateFromEvaluations(
  template: ProductTemplate,
  values: DraftValues,
  evaluations: readonly ComponentEvaluation[],
): ProductAggregate {
  return {
    derivedFrom: "ProductTruth",
    productLabel: template.label,
    familyLabel: "",
    inscription: typeof values["root.inscription"] === "string" ? values["root.inscription"] : "",
    components: [],
    quantities: evaluations.flatMap((item) => item.result.quantities),
    requirements: evaluations.flatMap((item) => item.result.requirements),
    componentStatuses: evaluations.map(({ component, result }) => ({
      id: component.id,
      label: component.label,
      typeId: result.typeId,
      status: result.status,
      unavailable: result.unavailable,
    })),
    unavailable: [...new Set(evaluations.flatMap((item) => item.result.unavailable))],
  };
}

export function lettersProcessCompositionInspections(
  template: ProductTemplate,
): ProcessCompositionInspection[] {
  if (template.code !== CANONICAL_PRODUCT_CODE) {
    return [];
  }
  return [
    {
      id: "letters-finish-none",
      label: "Fără finisaj",
      summary: "Față și volum fără finisaj aplicat.",
      values: { "face.finish": "none", "volume.finish": "none" },
    },
    {
      id: "letters-finish-vinyl",
      label: "Colantat față și volum",
      summary: "Folie pe față după debitare. Folie pe volum înainte de formare.",
      values: { "face.finish": "vinyl", "volume.finish": "vinyl" },
    },
    {
      id: "letters-volume-painted",
      label: "Volum vopsit",
      summary: "Vopsire RAL după asamblare. Nu este aplicare de folie.",
      values: { "face.finish": "none", "volume.finish": "painted" },
    },
  ].map((branch) => ({
    ...branch,
    composition: composeProductProcesses(template, {
      ...branch.values,
      "face.confirmedAreaMm2": 250000,
      "volume.depthMm": "60",
      "volume.confirmedPerimeterMm": 12500,
    }),
  }));
}

function addProductComposition(
  nodes: ProcessCompositionNode[],
  selectedTypeIds: readonly ComponentTypeId[],
  lightingResult?: ComponentCalculationResult,
): ProcessCompositionNode[] {
  const types = new Set(selectedTypeIds);
  const extra: ProcessCompositionNode[] = [];
  if (types.has("PLEXIGLAS_FACE") && types.has("ALUMINIUM_VOLUME")) {
    extra.push(
      toNode({
        scope: "BODY",
        typeId: null,
        processId: BOND_LETTER_BODY_ID,
        condition: { kind: "always" },
        reason: "Corpul se lipește după fața pregătită și volumul format.",
        dependsOn: [],
        lightingResult,
      }),
    );
  }
  if (
    types.has("PLEXIGLAS_FACE") &&
    types.has("ALUMINIUM_VOLUME") &&
    types.has("FOREX_BACK")
  ) {
    extra.push(
      toNode({
        scope: "BODY",
        typeId: null,
        processId: CLOSE_LETTER_BODY_ID,
        condition: { kind: "always" },
        reason: "Spatele se prinde mecanic după lucrul intern din corp.",
        dependsOn: [],
        lightingResult,
      }),
    );
  }
  if (types.has("PLEXIGLAS_FACE") && types.has("ALUMINIUM_VOLUME")) {
    extra.push(
      toNode({
        scope: "PRODUCT",
        typeId: null,
        processId: INSPECT_FINISHED_LETTER_ID,
        condition: { kind: "always" },
        reason: "Controlul final verifică corpul, finisajul și închiderea.",
        dependsOn: [],
        lightingResult,
      }),
    );
  }
  if (types.has("ACM_CASSETTE_BODY") && types.has("STEEL_INTERNAL_FRAME")) {
    extra.push(
      toNode({
        scope: "BODY",
        typeId: null,
        processId: ATTACH_INTERNAL_FRAME_ID,
        condition: { kind: "always" },
        reason: "Cadrul intern se prinde de corpul ACM după debitare.",
        dependsOn: [],
        lightingResult,
      }),
    );
  }
  extra.push(
    toNode({
      scope: "PRODUCT",
      typeId: null,
      processId: PACK_PRODUCT_ID,
      condition: { kind: "always" },
      reason: "Ambalarea închide traseul de produs.",
      dependsOn: [],
      lightingResult,
    }),
  );
  return [...nodes, ...extra];
}

function applyProductDependencies(
  nodes: ProcessCompositionNode[],
): ProcessCompositionNode[] {
  const ids = new Set(nodes.map((item) => item.id));
  return nodes.map((node) => {
    const dependsOn = explicitDependencies(node, ids);
    return { ...node, dependsOn };
  });
}

function explicitDependencies(
  node: ProcessCompositionNode,
  ids: ReadonlySet<string>,
): string[] {
  const deps: string[] = [];
  const faceCut = compositionNodeId("FACE", CUT_SHEET_CNC_ID);
  const faceVinyl = compositionNodeId("FACE", APPLY_SURFACE_FINISH_ID);
  const volumeVinyl = compositionNodeId("VOLUME", APPLY_SURFACE_FINISH_ID);
  const volumeForm = compositionNodeId("VOLUME", FORM_ALUMINIUM_PROFILE_ID);
  const volumePaint = compositionNodeId("VOLUME", PAINT_RAL_ID);
  const backCut = compositionNodeId("BACK", CUT_SHEET_CNC_ID);
  const bond = compositionNodeId("BODY", BOND_LETTER_BODY_ID);
  const close = compositionNodeId("BODY", CLOSE_LETTER_BODY_ID);
  const placeLed = compositionNodeId("LIGHTING", PLACE_LED_MODULES_ID);
  const wire = compositionNodeId("LIGHTING", WIRE_LIGHTING_ID);
  const psu = compositionNodeId("LIGHTING", INSTALL_OR_CONNECT_PSU_ID);
  const testIgnition = compositionNodeId("LIGHTING", TEST_LIGHTING_IGNITION_ID);
  const testUniformity = compositionNodeId(
    "LIGHTING",
    TEST_ILLUMINATION_UNIFORMITY_ID,
  );
  const metalCut = compositionNodeId("BACK", CUT_METAL_STOCK_ID);
  const formCassette = compositionNodeId("FACE", FORM_SHEET_CASSETTE_ID);
  const attach = compositionNodeId("BODY", ATTACH_INTERNAL_FRAME_ID);
  const inspect = compositionNodeId("PRODUCT", INSPECT_FINISHED_LETTER_ID);
  const pack = compositionNodeId("PRODUCT", PACK_PRODUCT_ID);

  if (node.id === faceVinyl && ids.has(faceCut)) {
    deps.push(faceCut);
  }
  if (node.id === volumeForm && ids.has(volumeVinyl)) {
    deps.push(volumeVinyl);
  }
  if (node.id === bond) {
    pushIfPresent(deps, ids, faceCut, faceVinyl, volumeForm);
  }
  if (node.id === placeLed) {
    pushIfPresent(deps, ids, backCut);
  }
  if (node.id === wire) {
    pushIfPresent(deps, ids, placeLed);
  }
  if (node.id === psu) {
    pushIfPresent(deps, ids, wire);
  }
  if (node.id === testIgnition) {
    pushIfPresent(deps, ids, wire, psu);
  }
  if (node.id === close) {
    pushIfPresent(deps, ids, bond, backCut, testIgnition);
  }
  if (node.id === volumePaint) {
    pushIfPresent(deps, ids, close);
  }
  if (node.id === testUniformity) {
    pushIfPresent(deps, ids, close, volumePaint);
  }
  if (node.id === formCassette && ids.has(faceCut)) {
    deps.push(faceCut);
  }
  if (node.id === attach) {
    pushIfPresent(deps, ids, faceCut, formCassette, metalCut);
  }
  if (node.id === inspect) {
    pushIfPresent(deps, ids, testUniformity, volumePaint, close);
  }
  if (node.id === pack) {
    pushIfPresent(deps, ids, inspect, attach);
  }
  return deps;
}

function pushIfPresent(
  deps: string[],
  ids: ReadonlySet<string>,
  ...candidates: string[]
): void {
  for (const id of candidates) {
    if (ids.has(id)) {
      deps.push(id);
    }
  }
}

function lightingReadinessFrom(
  result?: ComponentCalculationResult,
): LightingCalculationReadiness {
  if (!result) {
    return "NOT_APPLICABLE";
  }
  switch (result.status) {
    case "CALCULATED":
      return "CALCULATED";
    case "PARTIAL":
      return "PARTIAL";
    case "UNAVAILABLE":
    case "MISSING_MEASUREMENT":
      return "BLOCKED";
    default: {
      const _exhaustive: never = result.status;
      return _exhaustive;
    }
  }
}

function lightingReadinessLabel(readiness: LightingCalculationReadiness): string {
  switch (readiness) {
    case "NOT_APPLICABLE":
      return "Nu se aplică";
    case "CALCULATED":
      return "Calculată";
    case "PARTIAL":
      return "Parțială";
    case "BLOCKED":
      return "Blocat";
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

function toNode(input: {
  scope: ProcessCompositionScope;
  typeId: ComponentTypeId | null;
  processId: string;
  condition: ProcessRequirementCondition;
  reason: string;
  dependsOn: readonly string[];
  lightingResult?: ComponentCalculationResult;
}): ProcessCompositionNode {
  const process = getOperationalProcess(input.processId);
  if (!process) {
    throw new Error(`unknown_process:${input.processId}`);
  }
  const nodeReadiness = nodeReadinessFor(process, input.lightingResult);
  return {
    id: compositionNodeId(input.scope, input.processId),
    processId: process.id,
    processLabel: process.label,
    scope: input.scope,
    scopeLabel: scopeLabel(input.scope),
    typeId: input.typeId,
    typeLabel: input.typeId ? getComponentType(input.typeId).label : null,
    required: true,
    condition: input.condition,
    conditionLabel: processConditionLabel(input.condition),
    dependsOn: input.dependsOn,
    nodeReadiness,
    nodeReadinessLabel: nodeReadinessLabel(nodeReadiness),
    blockers: nodeBlockers(process, nodeReadiness, input.lightingResult),
    reason: input.reason,
  };
}

function nodeReadinessFor(
  process: OperationalProcess,
  lightingResult?: ComponentCalculationResult,
): CompositionNodeReadiness {
  if (process.id === PLACE_LED_MODULES_ID) {
    return lightingResult?.unavailable.includes(LIGHTING_MISSING_LED_GEOMETRY)
      ? "REQUIRED_BLOCKED"
      : lightingHasModuleQuantity(lightingResult)
        ? "REQUIRED_INCOMPLETE"
        : "REQUIRED_BLOCKED";
  }
  if (process.id === INSTALL_OR_CONNECT_PSU_ID) {
    return lightingHasPsuSelection(lightingResult)
      ? "REQUIRED_INCOMPLETE"
      : "REQUIRED_BLOCKED";
  }
  switch (process.readiness) {
    case "BLOCKED":
      return "REQUIRED_BLOCKED";
    case "IMPLEMENTED_PROCESS_FOUNDATION":
      return "REQUIRED";
    case "KNOWN_PROCESS":
    case "PLANNED":
      return "REQUIRED_INCOMPLETE";
    default: {
      const _exhaustive: never = process.readiness;
      return _exhaustive;
    }
  }
}

function lightingHasModuleQuantity(
  lightingResult?: ComponentCalculationResult,
): boolean {
  return Boolean(
    lightingResult?.quantities.some((item) => item.id === "ledModuleQuantity"),
  );
}

function lightingHasPsuSelection(
  lightingResult?: ComponentCalculationResult,
): boolean {
  return Boolean(
    lightingResult?.requirements.some((item) =>
      item.resourceId.startsWith("MAT-LED-PSU-"),
    ),
  );
}

function nodeBlockers(
  process: OperationalProcess,
  readiness: CompositionNodeReadiness,
  lightingResult?: ComponentCalculationResult,
): string[] {
  if (readiness === "REQUIRED") {
    return [];
  }
  if (process.id === CUT_SHEET_CNC_ID) {
    return [
      "Geometria de debitare CNC nu este disponibilă.",
      "Prețul CNC nu este modelat.",
    ];
  }
  if (process.id === PLACE_LED_MODULES_ID) {
    if (!lightingResult || lightingResult.unavailable.includes(LIGHTING_MISSING_LED_GEOMETRY)) {
      return [LIGHTING_MISSING_LED_GEOMETRY];
    }
    return lightingResult.unavailable.length > 0
      ? [...lightingResult.unavailable]
      : [process.readinessNote];
  }
  if (process.id === INSTALL_OR_CONNECT_PSU_ID) {
    if (!lightingResult) {
      return [LIGHTING_MISSING_PSU_CAPACITY, LIGHTING_MISSING_PSU_SELECTION];
    }
    const capacityKnown = lightingResult.quantities.some(
      (item) => item.id === "requiredPsuCapacityW",
    );
    const blockers: string[] = [];
    if (capacityKnown && lightingResult.unavailable.includes(LIGHTING_MISSING_PSU_SELECTION)) {
      blockers.push(
        "Capacitatea minimă a sursei este cunoscută. Selecția fizică a sursei rămâne indisponibilă.",
      );
    } else if (
      lightingResult.unavailable.includes(LIGHTING_MISSING_LED_GEOMETRY) ||
      lightingResult.unavailable.includes(LIGHTING_MISSING_LED_LOAD) ||
      lightingResult.unavailable.includes(LIGHTING_MISSING_PSU_CAPACITY)
    ) {
      blockers.push(LIGHTING_MISSING_PSU_CAPACITY);
    }
    if (lightingResult.unavailable.includes(LIGHTING_MISSING_PSU_SELECTION)) {
      blockers.push(LIGHTING_MISSING_PSU_SELECTION);
    }
    return blockers.length > 0 ? blockers : [process.readinessNote];
  }
  return [process.readinessNote];
}

function missingProcessesFor(): MissingProcessGap[] {
  return [];
}

function compositionCompleteness(
  nodes: readonly ProcessCompositionNode[],
  missing: readonly MissingProcessGap[],
): {
  completeness: CompositionCompleteness;
  completenessReasons: string[];
  technological: CompositionCompleteness;
} {
  const reasons: string[] = [];
  if (nodes.some((item) => item.nodeReadiness === "REQUIRED_BLOCKED")) {
    reasons.push("Cel puțin un proces necesar este blocat.");
  }
  if (nodes.some((item) => item.nodeReadiness === "REQUIRED_INCOMPLETE")) {
    reasons.push("Cel puțin un proces necesar este incomplet (fără geometrie, cost sau rețetă).");
  }
  if (missing.some((item) => item.classification === "UNKNOWN_OWNER_DECISION")) {
    reasons.push("Există o ramură tehnologică fără proces compus.");
  }
  if (missing.some((item) => item.classification === "BLOCKED")) {
    reasons.push("Există procese lipsă blocate.");
  }
  const technological: CompositionCompleteness = missing.some(
    (item) => item.classification === "UNKNOWN_OWNER_DECISION",
  )
    ? "PARTIAL"
    : nodes.some((item) => item.nodeReadiness === "REQUIRED_INCOMPLETE")
      ? "PARTIAL"
      : "READY";
  if (reasons.some((item) => item.includes("blocat") || item.includes("blocate"))) {
    return { completeness: "BLOCKED", completenessReasons: reasons, technological };
  }
  if (reasons.length > 0) {
    return { completeness: "PARTIAL", completenessReasons: reasons, technological };
  }
  return {
    completeness: "READY",
    completenessReasons: ["Toate procesele necesare sunt pregătite."],
    technological,
  };
}

export function topologicalOrder(nodes: readonly ProcessCompositionNode[]): string[] {
  const ids = [...new Set(nodes.map((item) => item.id))].sort();
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  for (const node of nodes) {
    for (const dep of node.dependsOn) {
      if (!incoming.has(dep)) {
        throw new Error(`unknown_process_dependency:${node.id}->${dep}`);
      }
      incoming.set(node.id, (incoming.get(node.id) ?? 0) + 1);
      outgoing.get(dep)?.push(node.id);
    }
  }
  for (const [id, targets] of outgoing) {
    outgoing.set(id, [...targets].sort());
  }
  const ready = ids.filter((id) => incoming.get(id) === 0);
  const ordered: string[] = [];
  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) {
      break;
    }
    ordered.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const remaining = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, remaining);
      if (remaining === 0) {
        ready.push(next);
        ready.sort();
      }
    }
  }
  if (ordered.length !== ids.length) {
    throw new Error("cyclic_process_composition");
  }
  return ordered;
}

function sortNodes(
  nodes: readonly ProcessCompositionNode[],
): ProcessCompositionNode[] {
  return [...nodes].sort((left, right) => left.id.localeCompare(right.id));
}

function scopeLabel(scope: ProcessCompositionScope): string {
  switch (scope) {
    case "FACE":
      return "Față";
    case "VOLUME":
      return "Volum";
    case "BACK":
      return "Spate";
    case "LIGHTING":
      return "Iluminare";
    case "BODY":
      return "Corp";
    case "PRODUCT":
      return "Produs";
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

function nodeReadinessLabel(readiness: CompositionNodeReadiness): string {
  switch (readiness) {
    case "REQUIRED":
      return "Necesar";
    case "REQUIRED_INCOMPLETE":
      return "Necesar, incomplet";
    case "REQUIRED_BLOCKED":
      return "Necesar, blocat";
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

function completenessLabel(completeness: CompositionCompleteness): string {
  switch (completeness) {
    case "READY":
      return "Pregătită";
    case "PARTIAL":
      return "Parțială";
    case "BLOCKED":
      return "Blocat";
    default: {
      const _exhaustive: never = completeness;
      return _exhaustive;
    }
  }
}
