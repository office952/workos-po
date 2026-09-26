import { providerKindLabel, type ProviderKind } from "@workos-final/domain";
import { isOwner, type ApiContext } from "../cloud/context.js";

export function viewerCanAssignProvider(c: ApiContext): boolean {
  return isOwner(c);
}

export function presentExecutionPlanForViewer(
  scopedPlan: Record<string, unknown>,
  canAssignProvider: boolean,
): Record<string, unknown> {
  const tasks = Array.isArray(scopedPlan.tasks) ? scopedPlan.tasks : [];
  const presented: Record<string, unknown> = {
    ...scopedPlan,
    tasks: tasks.map((task) => presentExecutionTaskForViewer(task, canAssignProvider)),
  };
  if (!canAssignProvider) {
    delete presented.externalProviderChoices;
  }
  return presented;
}

function presentExecutionTaskForViewer(
  task: unknown,
  viewerMayAssign: boolean,
): unknown {
  if (typeof task !== "object" || task === null) {
    return task;
  }
  const row = task as Record<string, unknown>;
  return {
    ...row,
    canAssignProvider: row.canAssign === true && viewerMayAssign,
    canExternalize: row.canExternalize === true && viewerMayAssign,
    canAssignExternalProvider: row.canAssignExternalProvider === true && viewerMayAssign,
    canHandOffExternal: row.canHandOffExternal === true && viewerMayAssign,
    canRecordExternalReturn: row.canRecordExternalReturn === true && viewerMayAssign,
    eligibleProviders: presentEligibleProviders(row.eligibleProviders),
  };
}

function presentEligibleProviders(value: unknown): Array<{
  id: string;
  kind: string;
  kindLabel: string;
  label: string;
}> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }
    const row = item as { id?: unknown; kind?: unknown; label?: unknown };
    if (typeof row.id !== "string" || typeof row.label !== "string") {
      return [];
    }
    const kind = isProviderKind(row.kind) ? row.kind : null;
    return [
      {
        id: row.id,
        kind: kind ?? (typeof row.kind === "string" ? row.kind : ""),
        kindLabel: kind ? providerKindLabel(kind) : "",
        label: row.label,
      },
    ];
  });
}

function isProviderKind(value: unknown): value is ProviderKind {
  return value === "WORKCENTER" || value === "MACHINE";
}
