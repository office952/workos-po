import type { ExecutionPlanTransport, ExecutionTaskTransport } from "../api/types";
import { asNumber, asRecord, asString, asStringList } from "./record";

export function presentExecutionPlan(payload: unknown): ExecutionPlanTransport | null {
  const record = asRecord(payload);
  const planView = asRecord(record?.executionPlan) ?? record;
  if (!planView) {
    return null;
  }
  const plan = asRecord(planView.plan) ?? planView;
  const planId = asString(plan.planId);
  if (!planId) {
    return null;
  }
  const progress = asRecord(planView.progress);
  const tasks = Array.isArray(planView.tasks) ? planView.tasks : [];
  return {
    planId,
    productLabel: asString(plan.productLabel) ?? "",
    inscription: asString(plan.inscription) ?? "",
    statusLabel: asString(planView.statusLabel) ?? asString(plan.status) ?? "—",
    progressLabel: progressLabel(progress, planView),
    sourceSnapshotId: asString(plan.sourceSnapshotId) ?? "",
    tasks: tasks.flatMap((item) => {
      const presented = presentExecutionTask(item);
      return presented ? [presented] : [];
    }),
  };
}

export function presentExecutionTask(value: unknown): ExecutionTaskTransport | null {
  const row = asRecord(value);
  if (!row || typeof row.taskId !== "string") {
    return null;
  }
  const measurable = asRecord(row.measurableQuantity);
  const providers = Array.isArray(row.eligibleProviders) ? row.eligibleProviders : [];
  const providerIds: string[] = [];
  const providerLabels: string[] = [];
  for (const provider of providers) {
    const item = asRecord(provider);
    if (item && typeof item.id === "string") {
      providerIds.push(item.id);
      providerLabels.push(asString(item.label) ?? item.id);
    }
  }
  return {
    taskId: row.taskId,
    processLabel: asString(row.processLabel) ?? "",
    scopeLabel: asString(row.scopeLabel) ?? "",
    seqLabel: asString(row.seqLabel) ?? "",
    status: asString(row.status) ?? "",
    statusLabel: asString(row.statusLabel) ?? asString(row.status) ?? "—",
    assignmentLabel: asString(row.assignmentLabel) ?? "Nealocat",
    requiresProvider: row.requiresProvider === true,
    canAssign: row.canAssign === true,
    canClaimStart: row.canClaimStart === true || row.canStart === true,
    canComplete: row.canComplete === true,
    requiresCompletedQuantity: row.requiresCompletedQuantity === true,
    plannedQuantity: asNumber(measurable?.value),
    plannedQuantityLabel: measurable
      ? [asString(measurable.label), asNumber(measurable.value), asString(measurable.unit)]
          .filter((part) => part !== null)
          .join(" ")
      : null,
    completedQuantityLabel: asString(row.completedQuantityLabel),
    varianceLabel: asString(row.varianceLabel),
    waitingFor: asStringList(row.waitingFor),
    eligibleProviderIds: providerIds,
    eligibleProviderLabels: providerLabels,
    startBlockReason: asString(row.startBlockReason),
    operatorRelation: asString(row.operatorRelation),
  };
}

function progressLabel(
  progress: Record<string, unknown> | null,
  planView: Record<string, unknown>,
): string {
  if (typeof progress?.completed === "number" && typeof progress.total === "number") {
    return `${progress.completed} / ${progress.total}`;
  }
  return asString(planView.statusLabel) ?? "—";
}
