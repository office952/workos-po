import {
  assemblyOperationCostProcessLabel,
} from "../assembly/operationCost.js";
import {
  isCostedOperationLine,
  type FrozenAssemblyOperationCost,
} from "../assembly/operationCostEvidence.js";
import type { FrozenEicLine } from "../production/snapshot.js";
import {
  actualInternalCostStatusLabel,
  projectActualInternalCostForLines,
  type ActualInternalCostLine,
  type ActualInternalCostProjection,
} from "./actualCost.js";
import type { ExecutionTask } from "./plan.js";

/**
 * Planned vs operational cost of an assembly job (Owner only), from frozen evidence.
 *
 * - Each part is compared on its own: its frozen cost lines against the consumption recorded on
 *   the operations of that part. The same resource used by two parts stays two lines, one per
 *   part; quantities and costs are never merged across parts, so nothing is counted twice.
 * - Assembly operations (mounting, final inspection, packing) carry the cost frozen with the
 *   quote. Their recorded time is not converted into money, so their operational cost is unknown.
 * - Missing evidence is `null` (unknown), never 0. Nothing is recalculated from current rates.
 */
export const ASSEMBLY_OPERATION_TIME_NOT_COSTED_REASON =
  "Timpul lucrat este înregistrat, dar nu se transformă în cost.";
export const ASSEMBLY_ECONOMICS_LINES_NOT_RETAINED_REASON =
  "Comanda a fost acceptată înainte ca liniile de cost ale părților să fie păstrate. Comparația planificat vs realizat nu este disponibilă pentru această lucrare.";

export type AssemblyEconomicsPart = {
  /** Stable key of the part inside the order (member id). */
  key: string;
  /** Operator-facing name of the part, e.g. „Litere · SHOWROOM”. */
  label: string;
  plannedLines: readonly FrozenEicLine[];
  tasks: readonly ExecutionTask[];
};

export function projectAssemblyActualInternalCost(input: {
  parts: readonly AssemblyEconomicsPart[];
  operationCost: FrozenAssemblyOperationCost | null;
  assemblyGroupLabel?: string;
}): ActualInternalCostProjection {
  const lines: ActualInternalCostLine[] = [];
  for (const part of input.parts) {
    const projection = projectActualInternalCostForLines(part.tasks, part.plannedLines);
    for (const line of projection.lines) {
      lines.push({ ...line, resourceId: `${part.key}/${line.resourceId}`, groupLabel: part.label });
    }
  }
  const assemblyGroupLabel = input.assemblyGroupLabel ?? "Ansamblare";
  for (const line of input.operationCost?.lines ?? []) {
    if (line.outcome === "INCLUDED") continue;
    const label = assemblyOperationCostProcessLabel(line.processId);
    if (isCostedOperationLine(line)) {
      lines.push({
        resourceId: `assembly/${line.operationId}`,
        label,
        kind: null,
        group: null,
        groupLabel: assemblyGroupLabel,
        plannedQuantity: line.quantity,
        actualQuantity: null,
        unit: line.unit === "person_hour" ? "ore-persoană" : "m2",
        rate: line.rate,
        currency: "EUR",
        plannedCost: line.cost,
        actualCost: null,
        difference: null,
        status: "UNAVAILABLE",
        statusLabel: "Cost indisponibil",
        unavailableReason: ASSEMBLY_OPERATION_TIME_NOT_COSTED_REASON,
        quantitySourceLabel: "Estimare înghețată în ofertă",
        costSourceLabel: "Tarif înghețat în ofertă",
        sourceTaskLabels: [],
      });
      continue;
    }
    lines.push({
      resourceId: `assembly/${line.operationId}`,
      label,
      kind: null,
      group: null,
      groupLabel: assemblyGroupLabel,
      plannedQuantity: null,
      actualQuantity: null,
      unit: "",
      rate: null,
      currency: "EUR",
      plannedCost: null,
      actualCost: null,
      difference: null,
      status: "UNAVAILABLE",
      statusLabel: "Cost indisponibil",
      unavailableReason: line.reason,
      quantitySourceLabel: "Fără estimare înghețată",
      costSourceLabel: "Fără cost înghețat",
      sourceTaskLabels: [],
    });
  }
  const calculable = lines.filter((line) => line.status === "CALCULABLE");
  const unavailable = lines.filter((line) => line.status === "UNAVAILABLE");
  const status =
    calculable.length === 0 ? "UNAVAILABLE" : unavailable.length === 0 ? "COMPLETE" : "PARTIAL";
  const calculableTotal =
    calculable.length > 0 ? roundMoney(calculable.reduce((sum, line) => sum + (line.actualCost ?? 0), 0)) : null;
  const plannedComparableTotal =
    calculable.length > 0 ? roundMoney(calculable.reduce((sum, line) => sum + (line.plannedCost ?? 0), 0)) : null;
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

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
