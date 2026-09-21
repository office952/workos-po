import type {
  EligibleProviderTransport,
  ExecutionPlanTransport,
  ExecutionTaskTransport,
} from "../api/types";
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
  const job = asRecord(record?.job);
  return {
    planId,
    productLabel: asString(plan.productLabel) ?? "",
    inscription: asString(plan.inscription) ?? "",
    statusLabel: asString(planView.statusLabel) ?? asString(plan.status) ?? "—",
    progressLabel: progressLabel(progress, planView),
    sourceSnapshotId: asString(plan.sourceSnapshotId) ?? "",
    jobId: asString(job?.jobId) ?? asString(plan.jobId),
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
  return {
    taskId: row.taskId,
    processLabel: asString(row.processLabel) ?? "",
    scopeLabel: asString(row.scopeLabel) ?? "",
    seqLabel: asString(row.seqLabel) ?? "",
    status: asString(row.status) ?? "",
    statusLabel: asString(row.statusLabel) ?? asString(row.status) ?? "—",
    assignmentLabel: asString(row.assignmentLabel) ?? "Nealocat",
    requiresProvider: row.requiresProvider === true,
    requiredCapabilityId: asString(row.requiredCapabilityId),
    canAssign: row.canAssign === true,
    canAssignProvider: row.canAssignProvider === true,
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
    eligibleProviders: presentEligibleProviders(row.eligibleProviders),
    startBlockReason: asString(row.startBlockReason),
    operatorRelation: asString(row.operatorRelation),
  };
}

function presentEligibleProviders(value: unknown): EligibleProviderTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((provider) => {
    const item = asRecord(provider);
    if (!item || typeof item.id !== "string" || typeof item.label !== "string") {
      return [];
    }
    return [
      {
        id: item.id,
        kind: asString(item.kind) ?? "",
        kindLabel: asString(item.kindLabel) ?? "",
        label: item.label,
      },
    ];
  });
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
