import type { FrozenSiteInstallationQuoteLineV2 } from "../commercial/quoteSnapshot.js";
import { INSTALL_AT_SITE_ID } from "../processes/catalog.js";
import type { FrozenProductionOperation, FrozenRecipeTrace } from "../production/snapshot.js";
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

export type AssemblyEicReconciliation = {
  rawChildTotal: number;
  total: number;
  currency: "EUR";
  completeness: "COMPLETE" | "PARTIAL";
  children: readonly AssemblyEicChildReconciliation[];
  unpricedAssemblyOperations: readonly AssemblyEicUnpricedOperation[];
  siteInstallationEicOutsideTotal: number | null;
};

export type AssemblyEicMemberInput = {
  child: AssemblyOrderChild;
  retainedOperations: readonly FrozenProductionOperation[];
};

// Frozen order evidence only; never current cost evidence. Assembly operations have no frozen
// cost evidence, so they stay unpriced (PARTIAL), never zero. Site-installation EIC stays on its
// frozen service line, outside production EIC, exactly as for standalone production releases.
export function reconcileAssemblyEic(input: {
  members: readonly AssemblyEicMemberInput[];
  assemblyOperations: readonly FrozenProductionOperation[];
  serviceLine?: FrozenSiteInstallationQuoteLineV2;
}): AssemblyEicReconciliation {
  const children = input.members.map(reconcileChild);
  const unpricedAssemblyOperations = input.assemblyOperations
    .filter((operation) => !(operation.processId === INSTALL_AT_SITE_ID && input.serviceLine))
    .map((operation) => ({ operationId: operation.id, processId: operation.processId }));
  const complete =
    children.every(
      (child) =>
        child.frozenEicCompleteness === "COMPLETE" && child.unreconciledRecipeIds.length === 0,
    ) && unpricedAssemblyOperations.length === 0;
  return {
    rawChildTotal: roundMoney(sum(input.members.map((member) => member.child.eicTotal))),
    total: roundMoney(sum(children.map((child) => child.reconciledEicTotal))),
    currency: "EUR",
    completeness: complete ? "COMPLETE" : "PARTIAL",
    children,
    unpricedAssemblyOperations,
    siteInstallationEicOutsideTotal: input.serviceLine ? input.serviceLine.eic.total : null,
  };
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
