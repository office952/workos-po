import type { FrozenSiteInstallationQuoteLineV2 } from "../commercial/quoteSnapshot.js";
import { INSTALL_AT_SITE_ID } from "../processes/catalog.js";
import type { FrozenProductionOperation, FrozenRecipeTrace } from "../production/snapshot.js";
import {
  isCostedOperationLine,
  verifiedOperationCostLines,
  type FrozenAssemblyOperationCost,
  type FrozenAssemblyOperationCostLine,
} from "./operationCostEvidence.js";
import type { AssemblyOrderChild } from "./snapshots.js";

export type AssemblyEicSupersededRecipe = {
  recipeId: string;
  resourceId: string;
  processIds: readonly string[];
  cost: number;
};

export type AssemblyEicChildReconciliation = {
  memberId: string;
  frozenEicTotal: number;
  frozenEicCompleteness: "COMPLETE" | "PARTIAL";
  supersededRecipes: readonly AssemblyEicSupersededRecipe[];
  unreconciledRecipeIds: readonly string[];
  reconciledEicTotal: number;
};

export type AssemblyEicUnpricedOperation = {
  operationId: string;
  processId: string;
};

export type AssemblyEicPricedOperation = AssemblyEicUnpricedOperation & { cost: number };

/** ABSENT: order frozen before operation evidence existed. INVALID: evidence failed verification. */
export type AssemblyOperationEvidenceStatus = "ABSENT" | "VALID" | "INVALID";

export type AssemblyEicReconciliation = {
  rawChildTotal: number;
  total: number;
  currency: "EUR";
  completeness: "COMPLETE" | "PARTIAL";
  children: readonly AssemblyEicChildReconciliation[];
  unpricedAssemblyOperations: readonly AssemblyEicUnpricedOperation[];
  pricedAssemblyOperations: readonly AssemblyEicPricedOperation[];
  includedAssemblyOperations: readonly AssemblyEicUnpricedOperation[];
  operationEvidence: AssemblyOperationEvidenceStatus;
  operationCostTotal: number;
  siteInstallationEicOutsideTotal: number | null;
};

export type AssemblyEicMemberInput = {
  child: AssemblyOrderChild;
  retainedOperations: readonly FrozenProductionOperation[];
};

// Frozen order evidence only; never current cost evidence. Assembly operations are priced only
// from the operation evidence frozen in the order; without it they stay unpriced (PARTIAL), never
// zero. Site-installation EIC stays on its frozen service line, outside production EIC, exactly as
// for standalone production releases.
export function reconcileAssemblyEic(input: {
  members: readonly AssemblyEicMemberInput[];
  assemblyOperations: readonly FrozenProductionOperation[];
  serviceLine?: FrozenSiteInstallationQuoteLineV2;
  operationCost?: FrozenAssemblyOperationCost;
}): AssemblyEicReconciliation {
  const children = input.members.map(reconcileChild);
  const assemblyOperations = input.assemblyOperations.filter(
    (operation) => !(operation.processId === INSTALL_AT_SITE_ID && input.serviceLine),
  );
  const lines = operationLines(input.operationCost, input.members, assemblyOperations);
  const operationEvidence: AssemblyOperationEvidenceStatus = !input.operationCost
    ? "ABSENT"
    : lines
      ? "VALID"
      : "INVALID";
  const unpricedAssemblyOperations: AssemblyEicUnpricedOperation[] = [];
  const pricedAssemblyOperations: AssemblyEicPricedOperation[] = [];
  const includedAssemblyOperations: AssemblyEicUnpricedOperation[] = [];
  for (const operation of assemblyOperations) {
    const ref = { operationId: operation.id, processId: operation.processId };
    const line = lines?.get(operation.processId);
    if (line && isCostedOperationLine(line)) {
      pricedAssemblyOperations.push({ ...ref, cost: line.cost });
    } else if (line?.outcome === "INCLUDED") {
      includedAssemblyOperations.push(ref);
    } else {
      unpricedAssemblyOperations.push(ref);
    }
  }
  const operationCostTotal = sum(pricedAssemblyOperations.map((operation) => operation.cost));
  const complete =
    children.every(
      (child) =>
        child.frozenEicCompleteness === "COMPLETE" && child.unreconciledRecipeIds.length === 0,
    ) &&
    unpricedAssemblyOperations.length === 0 &&
    operationEvidence !== "INVALID";
  return {
    rawChildTotal: roundMoney(sum(input.members.map((member) => member.child.eicTotal))),
    total: roundMoney(
      sum(children.map((child) => child.reconciledEicTotal)) + operationCostTotal,
    ),
    currency: "EUR",
    completeness: complete ? "COMPLETE" : "PARTIAL",
    children,
    unpricedAssemblyOperations,
    pricedAssemblyOperations,
    includedAssemblyOperations,
    operationEvidence,
    operationCostTotal: roundMoney(operationCostTotal),
    siteInstallationEicOutsideTotal: input.serviceLine ? input.serviceLine.eic.total : null,
  };
}

/**
 * Returns the frozen lines only when the evidence verifies and matches this order: each line maps to
 * one projected assembly operation and any panel-area quantity points at the frozen support input.
 */
function operationLines(
  evidence: FrozenAssemblyOperationCost | undefined,
  members: readonly AssemblyEicMemberInput[],
  assemblyOperations: readonly FrozenProductionOperation[],
): ReadonlyMap<string, FrozenAssemblyOperationCostLine> | null {
  const lines = verifiedOperationCostLines(evidence);
  if (!lines) {
    return null;
  }
  const processIds = new Set(assemblyOperations.map((operation) => operation.processId));
  for (const line of lines.values()) {
    if (!processIds.has(line.processId)) {
      return null;
    }
    if (isCostedOperationLine(line) && line.quantityProvenance.kind === "SUPPORT_PANEL_FACE_AREA") {
      const provenance = line.quantityProvenance;
      const support = members.find((member) => member.child.memberId === provenance.memberId);
      const trace = support?.child.productionInput.usedRecipes.find(
        (item) => item.recipeId === provenance.recipeId,
      );
      if (
        !support ||
        support.child.role !== "SUPPORT_PANEL" ||
        support.child.productionInput.contentHash !== provenance.productionInputHash ||
        trace?.quantity !== line.quantity
      ) {
        return null;
      }
    }
  }
  return lines;
}

function reconcileChild(member: AssemblyEicMemberInput): AssemblyEicChildReconciliation {
  const { child, retainedOperations } = member;
  const retainedIds = new Set(retainedOperations.map((operation) => operation.id));
  const retainedKeys = new Set(retainedOperations.map(operationKey));
  const removedKeys = new Set(
    child.productionInput.operations
      .filter((operation) => !retainedIds.has(operation.id))
      .map(operationKey),
  );
  const materialResourceIds = new Set(
    child.productionInput.requirements.map((requirement) => requirement.resourceId),
  );
  const supersededRecipes: AssemblyEicSupersededRecipe[] = [];
  const unreconciledRecipeIds: string[] = [];
  for (const [recipeId, traces] of tracesByRecipe(child.productionInput.usedRecipes)) {
    const onlyRemovedWork = traces.every(
      (trace) => removedKeys.has(operationKey(trace)) && !retainedKeys.has(operationKey(trace)),
    );
    const first = traces[0];
    if (!onlyRemovedWork || !first || materialResourceIds.has(first.costEvidenceId)) {
      continue;
    }
    const consistent = traces.every(
      (trace) => trace.cost === first.cost && trace.costEvidenceId === first.costEvidenceId,
    );
    if (!consistent) {
      unreconciledRecipeIds.push(recipeId);
      continue;
    }
    supersededRecipes.push({
      recipeId,
      resourceId: first.costEvidenceId,
      processIds: [...new Set(traces.map((trace) => trace.processId))],
      cost: first.cost,
    });
  }
  return {
    memberId: child.memberId,
    frozenEicTotal: child.eicTotal,
    frozenEicCompleteness: child.eicCompleteness,
    supersededRecipes,
    unreconciledRecipeIds,
    reconciledEicTotal: child.eicTotal - sum(supersededRecipes.map((recipe) => recipe.cost)),
  };
}

function tracesByRecipe(
  traces: readonly FrozenRecipeTrace[],
): Map<string, FrozenRecipeTrace[]> {
  const grouped = new Map<string, FrozenRecipeTrace[]>();
  for (const trace of traces) {
    grouped.set(trace.recipeId, [...(grouped.get(trace.recipeId) ?? []), trace]);
  }
  return grouped;
}

function operationKey(item: { processId: string; scope: string }): string {
  return `${item.processId}\u0000${item.scope}`;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
