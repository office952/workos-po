import type { ActualInternalCostLine, ActualInternalCostProjection } from "./actualCost.js";

/**
 * Commercial & Financial V1 · planned vs operational economic result of one job (Owner only).
 *
 * Separates, without inventing values:
 * - estimated cost: internal cost frozen at acceptance (EIC), with its completeness;
 * - operational cost: recorded actual consumption × frozen rate (`projectActualInternalCost`);
 * - confirmed accounting cost: not modelled in WorkOS (always reported as such);
 * - unknown values: `null`, never 0;
 * - estimated margin: order net price − estimated cost, only when the estimate is COMPLETE;
 * - operational margin: order net price − operational cost, only when the operational cost is
 *   COMPLETE. It is an operational indicator, not net profit.
 *
 * Recorded duration and machine time are shown as time; they are never converted to money here
 * because the engine has no configured rule for it. Scope is the product line of the order: an
 * installation service, when present, is excluded from both revenue and cost and is reported.
 */
export const JOB_ECONOMICS_SCHEMA = "JOB_ECONOMIC_RESULT_V1" as const;

export type EconomicCompleteness = "COMPLETE" | "PARTIAL" | "UNAVAILABLE";

export type JobEconomicLine = {
  resourceId: string;
  label: string;
  groupLabel: string | null;
  unit: string;
  plannedQuantity: number | null;
  actualQuantity: number | null;
  rate: number | null;
  plannedCost: number | null;
  operationalCost: number | null;
  difference: number | null;
  statusLabel: string;
  unknownReason: string | null;
};

export type JobEconomicResult = {
  schema: typeof JOB_ECONOMICS_SCHEMA;
  currency: "EUR";
  scopeLabel: string;
  excludedScopeLabel: string | null;
  revenue: { netPrice: number | null; label: string };
  estimatedCost: {
    total: number | null;
    completeness: EconomicCompleteness;
    completenessLabel: string;
    acceptedIncomplete: boolean;
  };
  operationalCost: {
    calculableTotal: number | null;
    plannedComparableTotal: number | null;
    differenceFromEstimate: number | null;
    completeness: EconomicCompleteness;
    completenessLabel: string;
    calculableCount: number;
    unavailableCount: number;
  };
  confirmedCost: { status: "NOT_MODELLED"; label: string };
  estimatedMargin: { value: number | null; unavailableReason: string | null };
  operationalMargin: { value: number | null; unavailableReason: string | null };
  executionLabel: string;
  lines: readonly JobEconomicLine[];
  notes: readonly string[];
};

export const CONFIRMED_COST_NOT_MODELLED_LABEL =
  "Costurile efective confirmate contabil (facturi, achiziții) nu sunt înregistrate în WorkOS.";
export const DURATION_NOT_COSTED_NOTE =
  "Timpul lucrat și timpul utilajelor sunt înregistrate, dar nu sunt transformate în cost: nu există o regulă configurată pentru asta.";
export const OPERATIONAL_COST_NOTE =
  "Costul operațional este calculat din consumul înregistrat în execuție și tarifele înghețate la acceptare. Nu este cheltuială contabilă.";
export const OPERATIONAL_MARGIN_NOTE =
  "Marja operațională este un indicator operațional, nu profit net.";

export function economicCompletenessLabel(value: EconomicCompleteness): string {
  switch (value) {
    case "COMPLETE":
      return "Complet";
    case "PARTIAL":
      return "Parțial";
    case "UNAVAILABLE":
      return "Necunoscut";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

export function projectJobEconomicResult(input: {
  productLabel: string;
  orderNetPrice: number | null;
  estimatedCostTotal: number | null;
  estimatedCostCompleteness: "COMPLETE" | "PARTIAL";
  acceptedIncompleteCost: boolean;
  operational: ActualInternalCostProjection | null;
  executionLabel: string;
  hasExcludedInstallation: boolean;
}): JobEconomicResult {
  const estimateComplete = input.estimatedCostCompleteness === "COMPLETE" && input.estimatedCostTotal !== null;
  const operational = input.operational;
  const operationalCompleteness: EconomicCompleteness = operational
    ? operational.status
    : "UNAVAILABLE";
  const revenue = input.orderNetPrice;
  const estimatedMargin =
    revenue === null
      ? { value: null, unavailableReason: "Prețul net al comenzii nu este disponibil." }
      : estimateComplete
        ? { value: roundMoney(revenue - (input.estimatedCostTotal as number)), unavailableReason: null }
        : {
            value: null,
            unavailableReason: "Costul estimat nu este complet; marja estimată nu se poate calcula.",
          };
  const operationalMargin =
    revenue === null
      ? { value: null, unavailableReason: "Prețul net al comenzii nu este disponibil." }
      : operational && operational.status === "COMPLETE" && operational.calculableTotal !== null
        ? { value: roundMoney(revenue - operational.calculableTotal), unavailableReason: null }
        : {
            value: null,
            unavailableReason:
              operationalCompleteness === "UNAVAILABLE"
                ? "Nu există încă consum înregistrat în execuție."
                : "Costul operațional este parțial; marja operațională apare când toate resursele au consum înregistrat.",
          };
  const notes = [OPERATIONAL_COST_NOTE, DURATION_NOT_COSTED_NOTE, OPERATIONAL_MARGIN_NOTE];
  if (input.acceptedIncompleteCost) {
    notes.unshift("Oferta a fost acceptată de Proprietar cu cost intern incomplet.");
  }
  return {
    schema: JOB_ECONOMICS_SCHEMA,
    currency: "EUR",
    scopeLabel: input.productLabel,
    excludedScopeLabel: input.hasExcludedInstallation
      ? "Montajul la client nu este inclus în această comparație (preț și cost separate)."
      : null,
    revenue: { netPrice: revenue, label: "Preț net din comanda acceptată (fără TVA)" },
    estimatedCost: {
      total: input.estimatedCostTotal,
      completeness: estimateComplete ? "COMPLETE" : "PARTIAL",
      completenessLabel: economicCompletenessLabel(estimateComplete ? "COMPLETE" : "PARTIAL"),
      acceptedIncomplete: input.acceptedIncompleteCost,
    },
    operationalCost: {
      calculableTotal: operational?.calculableTotal ?? null,
      plannedComparableTotal: operational?.plannedComparableTotal ?? null,
      differenceFromEstimate: operational?.availableDifference ?? null,
      completeness: operationalCompleteness,
      completenessLabel: economicCompletenessLabel(operationalCompleteness),
      calculableCount: operational?.calculableCount ?? 0,
      unavailableCount: operational?.unavailableCount ?? 0,
    },
    confirmedCost: { status: "NOT_MODELLED", label: CONFIRMED_COST_NOT_MODELLED_LABEL },
    estimatedMargin,
    operationalMargin,
    executionLabel: input.executionLabel,
    lines: (operational?.lines ?? []).map(presentLine),
    notes,
  };
}

function presentLine(line: ActualInternalCostLine): JobEconomicLine {
  return {
    resourceId: line.resourceId,
    label: line.label,
    groupLabel: line.groupLabel,
    unit: line.unit,
    plannedQuantity: line.plannedQuantity,
    actualQuantity: line.actualQuantity,
    rate: line.rate,
    plannedCost: line.plannedCost,
    operationalCost: line.actualCost,
    difference: line.difference,
    statusLabel: line.statusLabel,
    unknownReason: line.unavailableReason,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
