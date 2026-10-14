import { INSPECT_FINISHED_ASSEMBLY_ID } from "../processes/catalog.js";
import { resourceUnitLabel } from "../resources/catalog.js";
import type { AssemblyKind, AssemblyMemberRole } from "./contract.js";
import { assemblyOperationCostProcessLabel } from "./operationCost.js";
import {
  assemblyCostedProcessIds,
  isAssemblyEstimableProcessId,
  isCostedOperationLine,
  type AssemblyEstimableProcessId,
  type AssemblyOperationEstimate,
  type FrozenAssemblyOperationCost,
  type FrozenAssemblyOperationCostLine,
} from "./operationCostEvidence.js";

export type AssemblyOperationCostSource = "FROZEN" | "PREVIEW" | "FROZEN_WITHOUT_EVIDENCE";

export type AssemblyOperationCostLineView = {
  processId: string;
  label: string;
  outcome: FrozenAssemblyOperationCostLine["outcome"];
  statusLabel: string;
  basisLabel: string | null;
  quantity: number | null;
  unitLabel: string | null;
  rate: number | null;
  cost: number | null;
  currency: "EUR";
  reason: string | null;
};

/** Owner-only internal cost view; never a selling price, and unknown cost is never shown as zero. */
export type AssemblyOperationCostView = {
  source: AssemblyOperationCostSource;
  sourceLabel: string;
  editable: boolean;
  policyLabel: string;
  estimates: readonly { processId: AssemblyEstimableProcessId; label: string; personHours: number | null }[];
  lines: readonly AssemblyOperationCostLineView[];
  knownTotal: number | null;
  currency: "EUR";
  completeness: "COMPLETE" | "PARTIAL";
  completenessLabel: string;
  verificationLabel: string | null;
  notice: string;
};

const SOURCE_LABELS: Record<AssemblyOperationCostSource, string> = {
  FROZEN: "Înghețat în oferta curentă",
  PREVIEW: "Estimare pentru oferta următoare",
  FROZEN_WITHOUT_EVIDENCE: "Oferta curentă a fost înghețată fără costuri de ansamblare",
};

export function presentAssemblyOperationCost(input: {
  kind: AssemblyKind;
  roles: readonly AssemblyMemberRole[];
  source: AssemblyOperationCostSource;
  evidence: FrozenAssemblyOperationCost | null;
  estimates: readonly AssemblyOperationEstimate[];
  editable: boolean;
}): AssemblyOperationCostView {
  const evidence = input.evidence;
  const separateInspection = evidence?.policy.finalInspectionMode === "SEPARATE_LABOR";
  const estimates = assemblyCostedProcessIds(input.kind, input.roles)
    .filter(isAssemblyEstimableProcessId)
    .filter(
      (processId) =>
        processId !== INSPECT_FINISHED_ASSEMBLY_ID ||
        separateInspection ||
        input.estimates.some((item) => item.processId === processId),
    )
    .map((processId) => ({
      processId,
      label: assemblyOperationCostProcessLabel(processId),
      personHours: input.estimates.find((item) => item.processId === processId)?.personHours ?? null,
    }));
  const completeness = evidence?.completeness ?? "PARTIAL";
  return {
    source: input.source,
    sourceLabel: SOURCE_LABELS[input.source],
    editable: input.editable,
    policyLabel:
      evidence?.policy.version != null
        ? `Politica organizației, versiunea ${evidence.policy.version}`
        : "Politica organizației pentru ansamblare nu este configurată",
    estimates,
    lines: (evidence?.lines ?? []).map(presentLine),
    knownTotal: evidence ? evidence.knownTotal : null,
    currency: "EUR",
    completeness,
    completenessLabel:
      completeness === "COMPLETE" ? "Cost estimat complet" : "Cost estimat incomplet",
    verificationLabel:
      evidence?.verification === "NEEDS_VERIFICATION" ? "Conține tarife neconfirmate" : null,
    notice:
      input.source === "PREVIEW"
        ? "Costul se fixează la înghețarea ofertei. Nu modifică prețul pentru client."
        : "Cost intern înghețat. Nu modifică prețul pentru client.",
  };
}

function presentLine(line: FrozenAssemblyOperationCostLine): AssemblyOperationCostLineView {
  const base = {
    processId: line.processId,
    label: assemblyOperationCostProcessLabel(line.processId),
    outcome: line.outcome,
    statusLabel: outcomeLabel(line.outcome),
    currency: "EUR" as const,
  };
  if (isCostedOperationLine(line)) {
    return {
      ...base,
      basisLabel:
        line.quantityProvenance.kind === "OPERATOR_ESTIMATE" ? "Timp estimat" : "Suprafața panoului",
      quantity: line.quantity,
      unitLabel: resourceUnitLabel(line.unit),
      rate: line.rate,
      cost: line.cost,
      reason: null,
    };
  }
  return {
    ...base,
    basisLabel: null,
    quantity: null,
    unitLabel: null,
    rate: null,
    cost: line.outcome === "INCLUDED" ? 0 : null,
    reason: line.outcome === "INCLUDED" ? null : line.reason,
  };
}

function outcomeLabel(outcome: FrozenAssemblyOperationCostLine["outcome"]): string {
  switch (outcome) {
    case "COSTED":
      return "Cost calculat";
    case "UNCONFIRMED_RATE":
      return "Tarif neconfirmat";
    case "INCLUDED":
      return "Cost inclus în alte operații";
    case "MISSING_POLICY":
      return "Politică neconfigurată";
    case "MISSING_QUANTITY":
      return "Cantitate lipsă";
    case "MISSING_RATE":
      return "Tarif lipsă";
    case "INCOMPATIBLE_UNIT":
      return "Unitate incompatibilă";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}
