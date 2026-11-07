import type { AssemblyMemberRole } from "../assembly/contract.js";
import { calendarDateFromUtcInstant } from "../calendarDate.js";
import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import {
  presentActiveExecutionLabel,
  type ExecutionPlanProgress,
  type ExecutionPlanView,
  type ExecutionTaskView,
} from "../execution/plan.js";
import type { AcceptedProductionSnapshot } from "../production/snapshot.js";
import { matchesSearchFields } from "../searchNormalize.js";
import { presentIssueAttention } from "../execution/taskDossier.js";
import {
  DEFAULT_OPERATIONAL_PRIORITY,
  OVERDUE_ATTENTION_LABEL,
  isOperationallyOverdue,
  jobKindLabel,
  operationalPriorityLabel,
  operationalTargetDateLabel,
  planningMetadataIsEditable,
  type JobKind,
  type OperationalPriority,
} from "./planning.js";

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

export const JOB_FILTERS = [
  "ALL",
  "NEEDS_ACTION",
  "URGENT",
  "OVERDUE",
  "IN_EXECUTION",
  "COMPLETED",
] as const;
export type JobFilter = (typeof JOB_FILTERS)[number];

export type JobOverviewItem = {
  jobId: string;
  kind: JobKind;
  kindLabel: string;
  organizationId: string;
  requestId: string | null;
  productCode: string;
  productLabel: string;
  inscription: string;
  memberLabels: readonly string[];
  customerId: string | null;
  customerDisplayName: string | null;
  createdAt: string;
  stage: JobStage;
  stageLabel: string;
  nextAction: JobNextAction;
  nextActionLabel: string;
  href: string;
  priority: OperationalPriority;
  priorityLabel: string;
  targetDate: string | null;
  targetDateLabel: string;
  planningEditable: boolean;
  overdue: boolean;
  needsAttention: boolean;
  attentionLabel: string | null;
  activeIssueCount: number;
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

function presentJobStageLabel(stage: JobStage, progress: ExecutionPlanProgress | null): string {
  if (stage === "EXECUTION_IN_PROGRESS" && progress?.status === "IN_PROGRESS") {
    return presentActiveExecutionLabel(progress);
  }
  return jobStageLabel(stage);
}

export function jobNextActionLabel(action: JobNextAction): string {
  switch (action) {
    case "RELEASE_TO_PRODUCTION":
      return "Trimite în producție";
    case "CREATE_EXECUTION_PLAN":
      return "Trimite în producție";
    case "OPEN_EXECUTION":
      return "Vezi operațiile";
    case "CONTINUE_EXECUTION":
      return "Urmărește producția";
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
    case "URGENT":
      return "Urgente";
    case "OVERDUE":
      return "Termen depășit";
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
  release: { snapshotId: string } | null;
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
  return planId ? `/atelier?plan=${encodeURIComponent(planId)}` : null;
}

export function deriveJobAttention(input: {
  stage: JobStage;
  progress: ExecutionPlanProgress | null;
  tasks: readonly ExecutionTaskView[];
  targetDate?: string | null;
  today?: string;
  activeIssueCount?: number;
}): { needsAttention: boolean; attentionLabel: string | null; overdue: boolean } {
  const overdue = isOperationallyOverdue({
    targetDate: input.targetDate ?? null,
    stage: input.stage,
    today: input.today ?? utcToday(),
  });
  const issueAttention = presentIssueAttention(input.activeIssueCount ?? 0);
  if (input.stage === "ORDER_CREATED") {
    return {
      needsAttention: true,
      attentionLabel: "Comanda așteaptă trimiterea în producție",
      overdue,
    };
  }
  if (input.stage === "RELEASED") {
    return {
      needsAttention: true,
      attentionLabel: "Pregătirea producției este incompletă",
      overdue,
    };
  }
  // Claim-on-Start: PLANNED + executor null is normal. IN_PROGRESS alone is normal progress.
  // Waiting dependencies are normal DAG flow — not job attention.
  // Provider attention uses the canonical binding projection for the current task only.
  // Unique auto-binding is not a missing machine. Occupancy stays a machine-run refusal.
  if (input.tasks.some(isCurrentExternalProviderBlocker)) {
    return { needsAttention: true, attentionLabel: "Lipsă furnizor extern", overdue };
  }
  const providerAttention = currentDedicatedProviderAttention(input.tasks);
  if (providerAttention) {
    return { needsAttention: true, attentionLabel: providerAttention, overdue };
  }
  if (overdue) {
    return { needsAttention: true, attentionLabel: OVERDUE_ATTENTION_LABEL, overdue: true };
  }
  if (issueAttention) {
    return { needsAttention: true, attentionLabel: issueAttention, overdue };
  }
  return { needsAttention: false, attentionLabel: null, overdue: false };
}

const DEDICATED_PROVIDER_ATTENTION = {
  NONE: "Lipsă utilaj dedicat",
  UNAVAILABLE: "Utilajul alocat nu mai este eligibil",
  CHOICE_REQUIRED: "Alegere utilaj necesară",
} as const;

function currentDedicatedProviderAttention(tasks: readonly ExecutionTaskView[]): string | null {
  let unavailable = false;
  let choice = false;
  for (const task of tasks) {
    const kind = dedicatedProviderAttentionKind(task);
    if (kind === "NONE") {
      return DEDICATED_PROVIDER_ATTENTION.NONE;
    }
    if (kind === "UNAVAILABLE") {
      unavailable = true;
    }
    if (kind === "CHOICE_REQUIRED") {
      choice = true;
    }
  }
  if (unavailable) {
    return DEDICATED_PROVIDER_ATTENTION.UNAVAILABLE;
  }
  if (choice) {
    return DEDICATED_PROVIDER_ATTENTION.CHOICE_REQUIRED;
  }
  return null;
}

function dedicatedProviderAttentionKind(
  task: ExecutionTaskView,
): "NONE" | "UNAVAILABLE" | "CHOICE_REQUIRED" | null {
  if (task.executionMode === "EXTERNAL" || task.status !== "PLANNED" || task.waitingFor.length > 0) {
    return null;
  }
  switch (task.providerBindingState) {
    case "NONE":
      return task.requiresProvider ? "NONE" : null;
    case "UNAVAILABLE":
      return "UNAVAILABLE";
    case "CHOICE_REQUIRED":
      return "CHOICE_REQUIRED";
    case "UNIQUE_PENDING":
    case "ASSIGNED":
    case "NOT_REQUIRED":
    case "EXTERNAL":
      return null;
    default: {
      const _exhaustive: never = task.providerBindingState;
      return _exhaustive;
    }
  }
}

function isCurrentExternalProviderBlocker(task: ExecutionTaskView): boolean {
  return (
    task.executionMode === "EXTERNAL" &&
    task.status === "PLANNED" &&
    task.waitingFor.length === 0 &&
    !task.externalProviderLabel
  );
}

export type OperationalJobPlanning = {
  priority: OperationalPriority;
  targetDate: string | null;
};

export function projectJobOverviewItem(input: {
  order: OrderSnapshot;
  release: AcceptedProductionSnapshot | null;
  planView: ExecutionPlanView | null;
  organizationId?: string;
  requestId?: string | null;
  planning?: OperationalJobPlanning | null;
  today?: string;
  activeIssueCount?: number;
}): JobOverviewItem {
  return projectOperationalJob({
    jobId: input.order.orderSnapshotId,
    kind: "PRODUCT",
    organizationId: input.organizationId ?? "single-plane",
    requestId: input.requestId ?? null,
    productCode: input.order.productCode,
    productLabel: input.order.productLabel,
    inscription: input.order.inscription,
    memberLabels: [],
    customerId: input.order.customer?.customerId ?? null,
    customerDisplayName: input.order.customer?.displayName ?? null,
    createdAt: input.order.createdAt,
    releaseSnapshotId: input.release?.snapshotId ?? null,
    planView: input.planView,
    planning: input.planning ?? null,
    today: input.today,
    activeIssueCount: input.activeIssueCount ?? 0,
  });
}

export function projectAssemblyJobOverviewItem(input: {
  orderSnapshotId: string;
  organizationId: string;
  requestId: string | null;
  label: string;
  createdAt: string;
  members: readonly { role: AssemblyMemberRole; inscription: string }[];
  customer: { customerId: string; displayName: string } | null;
  releaseSnapshotId: string | null;
  planView: ExecutionPlanView | null;
  planning?: OperationalJobPlanning | null;
  today?: string;
  activeIssueCount?: number;
}): JobOverviewItem {
  return projectOperationalJob({
    jobId: input.orderSnapshotId,
    kind: "ASSEMBLY",
    organizationId: input.organizationId,
    requestId: input.requestId,
    productCode: "ASSEMBLY",
    productLabel: input.label,
    inscription: assemblyInscription(orderedAssemblyMembers(input.members)),
    memberLabels: orderedAssemblyMembers(input.members).map((member) =>
      operationalMemberLabel(member.role),
    ),
    customerId: input.customer?.customerId ?? null,
    customerDisplayName: input.customer?.displayName ?? null,
    createdAt: input.createdAt,
    releaseSnapshotId: input.releaseSnapshotId,
    planView: input.planView,
    planning: input.planning ?? null,
    today: input.today,
    activeIssueCount: input.activeIssueCount ?? 0,
  });
}

function projectOperationalJob(input: {
  jobId: string;
  kind: JobKind;
  organizationId: string;
  requestId: string | null;
  productCode: string;
  productLabel: string;
  inscription: string;
  memberLabels: readonly string[];
  customerId: string | null;
  customerDisplayName: string | null;
  createdAt: string;
  releaseSnapshotId: string | null;
  planView: ExecutionPlanView | null;
  planning: OperationalJobPlanning | null;
  today?: string;
  activeIssueCount: number;
}): JobOverviewItem {
  const progress = input.planView?.progress ?? null;
  const stage = deriveJobStage({
    release: input.releaseSnapshotId ? { snapshotId: input.releaseSnapshotId } : null,
    progress,
  });
  const nextAction = deriveJobNextAction(stage);
  const priority = input.planning?.priority ?? DEFAULT_OPERATIONAL_PRIORITY;
  const targetDate = input.planning?.targetDate ?? null;
  const today = input.today ?? utcToday();
  const attention = deriveJobAttention({
    stage,
    progress,
    tasks: input.planView?.tasks ?? [],
    targetDate,
    today,
    activeIssueCount: input.activeIssueCount,
  });
  const planId = input.planView?.plan.planId ?? null;
  return {
    jobId: input.jobId,
    kind: input.kind,
    kindLabel: jobKindLabel(input.kind),
    organizationId: input.organizationId,
    requestId: input.requestId,
    productCode: input.productCode,
    productLabel: input.productLabel,
    inscription: input.inscription,
    memberLabels: input.memberLabels,
    customerId: input.customerId,
    customerDisplayName: input.customerDisplayName,
    createdAt: input.createdAt,
    stage,
    stageLabel: presentJobStageLabel(stage, progress),
    nextAction,
    nextActionLabel: jobNextActionLabel(nextAction),
    href: jobHref({
      productCode: input.productCode,
      orderSnapshotId: input.jobId,
      planId,
      nextAction,
    }),
    priority,
    priorityLabel: operationalPriorityLabel(priority),
    targetDate,
    targetDateLabel: operationalTargetDateLabel(targetDate),
    planningEditable: planningMetadataIsEditable(stage),
    overdue: attention.overdue,
    needsAttention: attention.needsAttention,
    attentionLabel: attention.attentionLabel,
    activeIssueCount: input.activeIssueCount,
    completedCount: progress?.completed ?? null,
    taskCount: progress?.total ?? null,
    inProgressCount: progress?.inProgress ?? null,
    progressLabel: progressLabel(progress),
    orderSnapshotId: input.jobId,
    releaseSnapshotId: input.releaseSnapshotId,
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
    [
      item.customerDisplayName,
      item.productLabel,
      item.inscription,
      item.priorityLabel,
      item.stageLabel,
      item.kindLabel,
      ...item.memberLabels,
    ],
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
        return overview.jobs.filter((job) => job.needsAttention);
      case "URGENT":
        return overview.jobs.filter((job) => job.priority === "URGENT");
      case "OVERDUE":
        return overview.jobs.filter((job) => job.overdue);
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

function orderedAssemblyMembers<T extends { role: AssemblyMemberRole }>(
  members: readonly T[],
): T[] {
  return [...members].sort(
    (left, right) => assemblyMemberDisplayRank(left.role) - assemblyMemberDisplayRank(right.role),
  );
}

function assemblyMemberDisplayRank(role: AssemblyMemberRole): number {
  switch (role) {
    case "SUPPORT_PANEL":
      return 0;
    case "SIGNAGE_LETTERS":
      return 1;
    case "SIGNAGE_LOGO":
      return 2;
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function operationalMemberLabel(role: AssemblyMemberRole): string {
  switch (role) {
    case "SUPPORT_PANEL":
      return "Panou ACM";
    case "SIGNAGE_LETTERS":
      return "Litere volumetrice";
    case "SIGNAGE_LOGO":
      return "Logo";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function assemblyInscription(
  members: readonly { inscription: string }[],
): string {
  return members
    .map((member) => member.inscription.trim())
    .filter((inscription) => inscription.length > 0)
    .join(" · ");
}

function utcToday(): string {
  const parsed = calendarDateFromUtcInstant(new Date().toISOString());
  return parsed.ok ? parsed.date : "1970-01-01";
}

function progressLabel(progress: ExecutionPlanProgress | null): string | null {
  if (!progress) {
    return null;
  }
  const parts = [`${progress.completed} / ${progress.total} finalizate`];
  if (progress.inProgress > 0) {
    parts.push(`${progress.inProgress} în lucru`);
  }
  if (progress.outside > 0) {
    parts.push(`${progress.outside} la furnizor extern`);
  }
  return parts.join(" · ");
}
