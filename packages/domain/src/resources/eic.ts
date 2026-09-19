import type { ProductProcessComposition } from "../processes/composition.js";
import { noteCompileEic } from "../product/evaluationTrace.js";
import type { ProductAggregate } from "../product/types.js";
import {
  ALUMINIUM_RETURN_PROFILE_ID,
  costEvidence,
  lookupCostEvidence,
  getResource,
  type CostEvidence,
  type CostEvidenceWhen,
  type ResourceKind,
  type ResourceUnit,
} from "./catalog.js";
import type { ResourceRequirement } from "./requirement.js";
import { collectRecipeRequirements } from "./recipes.js";

export type { ResourceRequirement };

export type EicLineGroup = "materials" | "services" | "labor" | "lighting";

export type EicLine = {
  resourceId: string;
  label: string;
  quantity: number;
  unit: ResourceUnit;
  rate: number;
  currency: "EUR";
  cost: number;
  kind: ResourceKind;
  group: EicLineGroup;
};

export const EIC_CALIBRATION_REASON = "Costuri încă în calibrare";
export const EIC_GEOMETRY_CONFIRMED_LABEL = "Geometrie confirmată";

export type EicResult = {
  completeness: "PARTIAL" | "COMPLETE";
  completenessReasons: readonly string[];
  geometryLabel: string | null;
  currency: "EUR";
  lines: readonly EicLine[];
  total: number;
  excludedComponentLabels: readonly string[];
};

export function resourceRequirements(
  aggregate: ProductAggregate,
  composition?: ProductProcessComposition,
): ResourceRequirement[] {
  const recipeRequirements = composition
    ? collectRecipeRequirements(aggregate, composition)
    : [];
  return [...aggregate.requirements, ...recipeRequirements];
}

export function missingCostEvidenceReason(
  resourceId: string,
  when?: CostEvidenceWhen,
): string {
  if (resourceId === ALUMINIUM_RETURN_PROFILE_ID) {
    return when?.volumeDepthMm !== undefined
      ? `Tarif profil aluminiu neconfirmat pentru adâncimea ${when.volumeDepthMm} mm`
      : "Tarif profil aluminiu neconfirmat pentru această adâncime";
  }
  return "Evidență de cost indisponibilă";
}

export function applyRequirement(
  requirement: ResourceRequirement,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): EicLine {
  const resource = getResource(requirement.resourceId);
  if (!resource) {
    throw new Error(`Unknown resource ${requirement.resourceId}`);
  }
  const evidence = lookupCostEvidence(
    evidenceRows,
    requirement.resourceId,
    requirement.costQualifier,
  );
  if (!evidence) {
    throw new Error(`Cost evidence unavailable for ${requirement.resourceId}`);
  }
  if (requirement.unit !== resource.unit || requirement.unit !== evidence.perUnit) {
    throw new Error(`Unit mismatch for ${requirement.resourceId}`);
  }
  return {
    resourceId: requirement.resourceId,
    label: resource.label,
    quantity: requirement.quantity,
    unit: requirement.unit,
    rate: evidence.amount,
    currency: evidence.currency,
    cost: requirement.quantity * evidence.amount,
    kind: resource.kind,
    group: eicLineGroup(resource.kind, resource.familyId),
  };
}

export function compileEic(
  aggregate: ProductAggregate,
  composition?: ProductProcessComposition,
  evidenceRows: readonly CostEvidence[] = costEvidence,
): EicResult {
  noteCompileEic();
  const requirements = resourceRequirements(aggregate, composition);
  const missingEvidenceReasons: string[] = [];
  const lines: EicLine[] = [];
  for (const requirement of requirements) {
    const resource = getResource(requirement.resourceId);
    if (!resource) {
      throw new Error(`Unknown resource ${requirement.resourceId}`);
    }
    const evidence = lookupCostEvidence(
      evidenceRows,
      requirement.resourceId,
      requirement.costQualifier,
    );
    if (!evidence) {
      missingEvidenceReasons.push(
        missingCostEvidenceReason(requirement.resourceId, requirement.costQualifier),
      );
      continue;
    }
    lines.push(applyRequirement(requirement, evidenceRows));
  }
  const excludedComponentLabels = aggregate.componentStatuses
    .filter((item) => item.status !== "CALCULATED")
    .map((item) => item.label);
  const measurementGaps = uniqueReasons(
    aggregate.componentStatuses.flatMap((item) => item.unavailable),
  );
  const hasProvisionalCost = requirements.some((requirement) => {
    const evidence = lookupCostEvidence(
      evidenceRows,
      requirement.resourceId,
      requirement.costQualifier,
    );
    return evidence !== undefined && costEvidenceKeepsEicPartial(evidence);
  });
  const completenessReasons = uniqueReasons([
    ...measurementGaps,
    ...missingEvidenceReasons,
    ...(hasProvisionalCost ? [EIC_CALIBRATION_REASON] : []),
  ]);
  const geometryMissing = aggregate.componentStatuses.some(
    (item) => item.status === "MISSING_MEASUREMENT",
  );

  return {
    completeness:
      completenessReasons.length === 0 && excludedComponentLabels.length === 0
        ? "COMPLETE"
        : "PARTIAL",
    completenessReasons,
    geometryLabel: geometryMissing ? null : EIC_GEOMETRY_CONFIRMED_LABEL,
    currency: "EUR",
    lines,
    total: lines.reduce((sum, line) => sum + line.cost, 0),
    excludedComponentLabels,
  };
}

export function costCompletenessLabel(
  completeness: EicResult["completeness"],
): string {
  switch (completeness) {
    case "COMPLETE":
      return "Complete pentru configurația curentă";
    case "PARTIAL":
      return "Necesită calibrare";
    default: {
      const _exhaustive: never = completeness;
      return _exhaustive;
    }
  }
}

export function costEvidenceKeepsEicPartial(evidence: CostEvidence): boolean {
  if (evidence.source === "PILOT_INTERNAL_EVIDENCE" || evidence.source === "LEGACY_EVIDENCE") {
    return true;
  }
  return (
    evidence.classification !== "OWNER_CONFIRMED" && evidence.classification !== "AI_DECISION"
  );
}

function uniqueReasons(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function eicLineGroup(
  kind: ResourceKind,
  familyId?: string,
): EicLineGroup {
  if (familyId === "LED") {
    return "lighting";
  }
  switch (kind) {
    case "MATERIAL":
      return "materials";
    case "SERVICE":
      return "services";
    case "LABOR":
      return "labor";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function eicLineGroupLabel(group: EicLineGroup): string {
  switch (group) {
    case "materials":
      return "Materiale";
    case "services":
      return "Servicii";
    case "labor":
      return "Manoperă";
    case "lighting":
      return "Iluminare";
    default: {
      const _exhaustive: never = group;
      return _exhaustive;
    }
  }
}
