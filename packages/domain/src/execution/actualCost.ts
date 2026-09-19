import { eicLineGroup, eicLineGroupLabel, type EicLineGroup } from "../resources/eic.js";
import { getResource, type ResourceKind } from "../resources/catalog.js";
import type { AcceptedProductionSnapshot, FrozenEicLine } from "../production/snapshot.js";
import type { ExecutionPlanRecord, ExecutionTask } from "./plan.js";

export const ACTUAL_INTERNAL_COST_STATUSES = [
  "UNAVAILABLE",
  "PARTIAL",
  "COMPLETE",
] as const;
export type ActualInternalCostStatus = (typeof ACTUAL_INTERNAL_COST_STATUSES)[number];

export const ACTUAL_INTERNAL_COST_LINE_STATUSES = ["CALCULABLE", "UNAVAILABLE"] as const;
export type ActualInternalCostLineStatus =
  (typeof ACTUAL_INTERNAL_COST_LINE_STATUSES)[number];

export type ActualInternalCostLine = {
  resourceId: string;
  label: string;
  kind: ResourceKind | null;
  group: EicLineGroup | null;
  groupLabel: string | null;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  unit: string;
  rate: number | null;
  currency: "EUR";
  plannedCost: number | null;
  actualCost: number | null;
  difference: number | null;
  status: ActualInternalCostLineStatus;
  statusLabel: string;
  unavailableReason: string | null;
  quantitySourceLabel: string;
  costSourceLabel: string;
  sourceTaskLabels: readonly string[];
};

export type ActualInternalCostProjection = {
  status: ActualInternalCostStatus;
  statusLabel: string;
  currency: "EUR";
  calculableTotal: number | null;
  plannedComparableTotal: number | null;
  availableDifference: number | null;
  lines: readonly ActualInternalCostLine[];
  calculableCount: number;
  unavailableCount: number;
};

type ActualQuantityBucket = {
  quantity: number;
  unit: string;
  sourceTaskLabels: string[];
};

export function projectActualInternalCost(
  record: ExecutionPlanRecord,
  snapshot: AcceptedProductionSnapshot | null,
): ActualInternalCostProjection {
  const plannedByResource = new Map(
    (snapshot?.eic.lines ?? []).map((line) => [line.resourceId, line]),
  );
  const actualByResource = collectActualQuantities(record.tasks);
  const resourceIds = uniqueIds([
    ...plannedByResource.keys(),
    ...actualByResource.keys(),
  ]);
  const lines = resourceIds.map((resourceId) =>
    projectLine(
      resourceId,
      plannedByResource.get(resourceId) ?? null,
      actualByResource.get(resourceId) ?? null,
    ),
  );
  const calculable = lines.filter((line) => line.status === "CALCULABLE");
  const unavailable = lines.filter((line) => line.status === "UNAVAILABLE");
  const plannedContributorCount = snapshot?.eic.lines.length ?? 0;
  const allPlannedPriced =
    plannedContributorCount > 0 &&
    (snapshot?.eic.lines ?? []).every((line) =>
      calculable.some((item) => item.resourceId === line.resourceId),
    );
  const status = actualCostStatus(calculable.length, allPlannedPriced, unavailable.length);
  const calculableTotal =
    calculable.length > 0
      ? roundMoney(calculable.reduce((sum, line) => sum + (line.actualCost ?? 0), 0))
      : null;
  const plannedComparableTotal =
    calculable.length > 0
      ? roundMoney(calculable.reduce((sum, line) => sum + (line.plannedCost ?? 0), 0))
      : null;
  return {
    status,
    statusLabel: actualInternalCostStatusLabel(status),
    currency: "EUR",
    calculableTotal,
    plannedComparableTotal,
    availableDifference:
      calculableTotal !== null && plannedComparableTotal !== null
        ? roundMoney(calculableTotal - plannedComparableTotal)
        : null,
    lines,
    calculableCount: calculable.length,
    unavailableCount: unavailable.length,
  };
}

export function actualInternalCostStatusLabel(status: ActualInternalCostStatus): string {
  switch (status) {
    case "UNAVAILABLE":
      return "Indisponibil";
    case "PARTIAL":
      return "Parțial";
    case "COMPLETE":
      return "Complet";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function projectLine(
  resourceId: string,
  planned: FrozenEicLine | null,
  actual: ActualQuantityBucket | null,
): ActualInternalCostLine {
  const resource = getResource(resourceId);
  const kind = resource?.kind ?? null;
  const group = kind ? eicLineGroup(kind, resource?.familyId) : null;
  const unit = actual?.unit ?? planned?.unit ?? resource?.unit ?? "";
  const rate = planned?.rate ?? null;
  const unitsAlign =
    actual !== null &&
    planned !== null &&
    actual.unit === planned.unit &&
    rate !== null;
  if (actual !== null && unitsAlign) {
    const actualCost = roundMoney(actual.quantity * rate);
    return {
      resourceId,
      label: planned.label,
      kind,
      group,
      groupLabel: group ? eicLineGroupLabel(group) : null,
      plannedQuantity: planned.quantity,
      actualQuantity: actual.quantity,
      unit,
      rate,
      currency: "EUR",
      plannedCost: planned.cost,
      actualCost,
      difference: roundMoney(actualCost - planned.cost),
      status: "CALCULABLE",
      statusLabel: "Cost calculabil",
      unavailableReason: null,
      quantitySourceLabel: "Consum real înregistrat",
      costSourceLabel: "Tarif înghețat din snapshot",
      sourceTaskLabels: actual.sourceTaskLabels,
    };
  }
  return {
    resourceId,
    label: planned?.label ?? resource?.label ?? resourceId,
    kind,
    group,
    groupLabel: group ? eicLineGroupLabel(group) : null,
    plannedQuantity: planned?.quantity ?? null,
    actualQuantity: actual?.quantity ?? null,
    unit,
    rate,
    currency: "EUR",
    plannedCost: planned?.cost ?? null,
    actualCost: null,
    difference: null,
    status: "UNAVAILABLE",
    statusLabel: "Cost indisponibil",
    unavailableReason: unavailableReason(actual, planned, unitsAlign),
    quantitySourceLabel:
      actual !== null ? "Consum real înregistrat" : "Fără consum înregistrat",
    costSourceLabel: planned !== null ? "Tarif înghețat din snapshot" : "Fără tarif înghețat",
    sourceTaskLabels: actual?.sourceTaskLabels ?? [],
  };
}

function unavailableReason(
  actual: ActualQuantityBucket | null,
  planned: FrozenEicLine | null,
  unitsAlign: boolean,
): string {
  if (actual === null) {
    return "Fără consum înregistrat";
  }
  if (planned === null) {
    return "Fără tarif înghețat";
  }
  if (!unitsAlign) {
    return "Unitate incompatibilă";
  }
  return "Fără consum înregistrat";
}

function collectActualQuantities(
  tasks: readonly ExecutionTask[],
): Map<string, ActualQuantityBucket> {
  const byResource = new Map<string, ActualQuantityBucket>();
  for (const task of tasks) {
    const taskLabel = `${task.processLabel} — ${task.scopeLabel}`;
    for (const entry of task.actualConsumption) {
      const current = byResource.get(entry.resourceId);
      if (!current) {
        byResource.set(entry.resourceId, {
          quantity: entry.actualQuantity,
          unit: entry.unit,
          sourceTaskLabels: [taskLabel],
        });
        continue;
      }
      if (current.unit !== entry.unit) {
        continue;
      }
      current.quantity += entry.actualQuantity;
      if (!current.sourceTaskLabels.includes(taskLabel)) {
        current.sourceTaskLabels.push(taskLabel);
      }
    }
  }
  return byResource;
}

function actualCostStatus(
  calculableCount: number,
  allPlannedPriced: boolean,
  unavailableCount: number,
): ActualInternalCostStatus {
  if (calculableCount === 0) {
    return "UNAVAILABLE";
  }
  if (allPlannedPriced && unavailableCount === 0) {
    return "COMPLETE";
  }
  return "PARTIAL";
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
