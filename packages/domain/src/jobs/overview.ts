import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import {
  type ExecutionPlanProgress,
  type ExecutionPlanView,
  type ExecutionTaskView,
} from "../execution/plan.js";
import type { AcceptedProductionSnapshot } from "../production/snapshot.js";
import { matchesSearchFields } from "../searchNormalize.js";

export const JOB_STAGES = [
  "ORDER_CREATED",
  "RELEASED",
  "EXECUTION_PLANNED",
  "EXECUTION_IN_PROGRESS",
  "EXECUTION_COMPLETED",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const JOB_NEXT_ACTIONS = [
  "RELEASE_TO_PRODUCTION",
  "CREATE_EXECUTION_PLAN",
  "OPEN_EXECUTION",
  "CONTINUE_EXECUTION",
  "VIEW_COMPLETED",
] as const;
export type JobNextAction = (typeof JOB_NEXT_ACTIONS)[number];

export const JOB_FILTERS = ["ALL", "NEEDS_ACTION", "IN_EXECUTION", "COMPLETED"] as const;
export type JobFilter = (typeof JOB_FILTERS)[number];

export type JobOverviewItem = {
  jobId: string;
  productCode: string;
  productLabel: string;
  inscription: string;
  customerId: string | null;
  customerDisplayName: string | null;
  createdAt: string;
  stage: JobStage;
  stageLabel: string;
  nextAction: JobNextAction;
  nextActionLabel: string;
  href: string;
  needsAttention: boolean;
  attentionLabel: string | null;
  completedCount: number | null;
  taskCount: number | null;
  inProgressCount: number | null;
  progressLabel: string | null;
  orderSnapshotId: string;
  releaseSnapshotId: string | null;
  planId: string | null;
};

export type JobOverviewSummary = {
  total: number;
  active: number;
  inExecution: number;
  needsAttention: number;
  completed: number;
};

export type JobOverviewProjection = {
  summary: JobOverviewSummary;
  jobs: readonly JobOverviewItem[];
};

export function jobStageLabel(stage: JobStage): string {
  switch (stage) {
    case "ORDER_CREATED":
      return "Comandă creată";
    case "RELEASED":
      return "Eliberată pentru producție";
    case "EXECUTION_PLANNED":
      return "Plan de execuție";
    case "EXECUTION_IN_PROGRESS":
      return "În lucru";
    case "EXECUTION_COMPLETED":
      return "Finalizată";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function jobNextActionLabel(action: JobNextAction): string {
  switch (action) {
    case "RELEASE_TO_PRODUCTION":
      return "Eliberează pentru producție";
    case "CREATE_EXECUTION_PLAN":
      return "Creează planul de execuție";
    case "OPEN_EXECUTION":
      return "Deschide execuția";
    case "CONTINUE_EXECUTION":
      return "Continuă execuția";
    case "VIEW_COMPLETED":
      return "Lucrare finalizată";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function jobFilterLabel(filter: JobFilter): string {
  switch (filter) {
    case "ALL":
      return "Toate";
    case "NEEDS_ACTION":
      return "Necesită acțiune";
    case "IN_EXECUTION":
      return "În execuție";
    case "COMPLETED":
      return "Finalizate";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

export function deriveJobStage(input: {
  release: AcceptedProductionSnapshot | null;
  progress: ExecutionPlanProgress | null;
}): JobStage {
  if (!input.release) {
    return "ORDER_CREATED";
  }
  if (!input.progress) {
    return "RELEASED";
  }
  switch (input.progress.status) {
    case "PLANNED":
      return "EXECUTION_PLANNED";
    case "IN_PROGRESS":
      return "EXECUTION_IN_PROGRESS";
    case "COMPLETED":
      return "EXECUTION_COMPLETED";
    default: {
      const _exhaustive: never = input.progress.status;
      return _exhaustive;
    }
  }
}

export function deriveJobNextAction(stage: JobStage): JobNextAction {
  switch (stage) {
    case "ORDER_CREATED":
      return "RELEASE_TO_PRODUCTION";
    case "RELEASED":
      return "CREATE_EXECUTION_PLAN";
    case "EXECUTION_PLANNED":
      return "OPEN_EXECUTION";
    case "EXECUTION_IN_PROGRESS":
      return "CONTINUE_EXECUTION";
    case "EXECUTION_COMPLETED":
      return "VIEW_COMPLETED";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function jobHref(item: {
  orderSnapshotId: string;
  productCode?: string;
  planId?: string | null;
  nextAction?: JobNextAction;
}): string {
  return `/jobs/${encodeURIComponent(item.orderSnapshotId)}`;
}

export function jobConfiguratorHref(item: {
  productCode: string;
  orderSnapshotId: string;
}): string {
  return `/products/${item.productCode}?order=${encodeURIComponent(item.orderSnapshotId)}`;
}

export function jobExecutionHref(planId: string | null): string | null {
  return planId ? `/execution/${planId}` : null;
}

export function deriveJobAttention(input: {
  stage: JobStage;
  progress: ExecutionPlanProgress | null;
  tasks: readonly ExecutionTaskView[];
}): { needsAttention: boolean; attentionLabel: string | null } {
  if (input.stage === "ORDER_CREATED") {
    return { needsAttention: true, attentionLabel: "Urmează eliberarea pentru producție" };
  }
  if (input.stage === "RELEASED") {
    return { needsAttention: true, attentionLabel: "Urmează planul de execuție" };
  }
  // Claim-on-Start: PLANNED + executor null is normal. IN_PROGRESS alone is normal progress.
  // Waiting dependencies are normal DAG flow — not job attention.
  // Provider attention only when absence is a CURRENT blocker (deps done).
  if (input.tasks.some(isCurrentProviderBlocker)) {
    return { needsAttention: true, attentionLabel: "Lipsă utilaj dedicat" };
  }
  return { needsAttention: false, attentionLabel: null };
}

function isCurrentProviderBlocker(task: ExecutionTaskView): boolean {
  if (task.status !== "PLANNED") {
    return false;
  }
  if (task.waitingFor.length > 0) {
    return false;
  }
  if (!task.requiresProvider) {
    return false;
  }
  if (task.assignedProvider === null) {
    return true;
  }
  return !task.eligibleProviders.some(
    (item) =>
      item.id === task.assignedProvider?.id && item.kind === task.assignedProvider.kind,
  );
}

export function projectJobOverviewItem(input: {
  order: OrderSnapshot;
  release: AcceptedProductionSnapshot | null;
  planView: ExecutionPlanView | null;
}): JobOverviewItem {
  const progress = input.planView?.progress ?? null;
  const stage = deriveJobStage({ release: input.release, progress });
  const nextAction = deriveJobNextAction(stage);
  const attention = deriveJobAttention({
    stage,
    progress,
    tasks: input.planView?.tasks ?? [],
  });
  const planId = input.planView?.plan.planId ?? null;
  return {
    jobId: input.order.orderSnapshotId,
    productCode: input.order.productCode,
    productLabel: input.order.productLabel,
    inscription: input.order.inscription,
    customerId: input.order.customer?.customerId ?? null,
    customerDisplayName: input.order.customer?.displayName ?? null,
    createdAt: input.order.createdAt,
    stage,
    stageLabel: jobStageLabel(stage),
    nextAction,
    nextActionLabel: jobNextActionLabel(nextAction),
    href: jobHref({
      productCode: input.order.productCode,
      orderSnapshotId: input.order.orderSnapshotId,
      planId,
      nextAction,
    }),
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    completedCount: progress?.completed ?? null,
    taskCount: progress?.total ?? null,
    inProgressCount: progress?.inProgress ?? null,
    progressLabel: progressLabel(progress),
    orderSnapshotId: input.order.orderSnapshotId,
    releaseSnapshotId: input.release?.snapshotId ?? null,
    planId,
  };
}

export function projectJobOverview(
  jobs: readonly JobOverviewItem[],
): JobOverviewProjection {
  const sorted = [...jobs].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  return {
    summary: {
      total: sorted.length,
      active: sorted.filter((job) => job.stage !== "EXECUTION_COMPLETED").length,
      inExecution: sorted.filter((job) => job.stage === "EXECUTION_IN_PROGRESS").length,
      needsAttention: sorted.filter((job) => job.needsAttention).length,
      completed: sorted.filter((job) => job.stage === "EXECUTION_COMPLETED").length,
    },
    jobs: sorted,
  };
}

export function matchesJobSearch(item: JobOverviewItem, query: string): boolean {
  return matchesSearchFields(
    [item.customerDisplayName, item.productLabel, item.productCode, item.inscription],
    query,
  );
}

export function filterJobOverview(
  overview: JobOverviewProjection,
  filter: JobFilter,
  query = "",
): readonly JobOverviewItem[] {
  const byStage = ((): readonly JobOverviewItem[] => {
    switch (filter) {
      case "ALL":
        return overview.jobs;
      case "NEEDS_ACTION":
        return overview.jobs.filter(
          (job) => job.needsAttention && job.stage !== "EXECUTION_COMPLETED",
        );
      case "IN_EXECUTION":
        return overview.jobs.filter((job) => job.stage === "EXECUTION_IN_PROGRESS");
      case "COMPLETED":
        return overview.jobs.filter((job) => job.stage === "EXECUTION_COMPLETED");
      default: {
        const _exhaustive: never = filter;
        return _exhaustive;
      }
    }
  })();
  return byStage.filter((item) => matchesJobSearch(item, query));
}

function progressLabel(progress: ExecutionPlanProgress | null): string | null {
  if (!progress) {
    return null;
  }
  const base = `${progress.completed} / ${progress.total} finalizate`;
  if (progress.inProgress > 0) {
    return `${base} · ${progress.inProgress} în lucru`;
  }
  return base;
}
