import {
  executionTaskStatusLabel,
  operationalPriorityLabel,
  operationalTargetDateLabel,
  projectPlanningWorkload,
  providerKindLabel,
  type PlanningWorkloadProjection,
  type ProviderWorkloadGroup,
  type WorkloadPlanSource,
  type WorkloadTaskItem,
} from "@workos-final/domain";
import { isOwner, type ApiContext } from "../cloud/context.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";

export type PlanningWorkloadTaskTransport = {
  taskId: string;
  executionPlanId: string;
  status: WorkloadTaskItem["status"];
  statusLabel: string;
  processLabel: string;
  requiredCapabilityLabel: string;
  productLabel: string;
  inscription: string;
  scopeLabel: string;
  customerDisplayName: string | null;
  priorityLabel: string;
  targetDateLabel: string;
  jobId: string | null;
  jobHref: string | null;
  executionHref: string;
  assignedProvider: WorkloadTaskItem["assignedProvider"];
  plannedEffortMinutes: number | null;
  requiresProvider: boolean;
  canEditEffort: boolean;
};

export type PlanningWorkloadProviderTransport = {
  provider: {
    kind: ProviderWorkloadGroup["provider"]["kind"];
    kindLabel: string;
    id: string;
    label: string;
  };
  knownQueuedMinutes: number;
  unknownEffortCount: number;
  tasks: readonly PlanningWorkloadTaskTransport[];
};

export type PlanningWorkloadTransport = {
  canEditEffort: boolean;
  providers: readonly PlanningWorkloadProviderTransport[];
  unassigned: readonly PlanningWorkloadTaskTransport[];
};

export function presentPlanningWorkload(
  runtime: ProductSystemRuntime,
  c: ApiContext,
): PlanningWorkloadTransport {
  const owner = isOwner(c);
  const jobs = runtime.listJobOverview().jobs;
  const jobByPlan = new Map(
    jobs.flatMap((job) => (job.planId ? [[job.planId, job] as const] : [])),
  );
  const sources: WorkloadPlanSource[] = runtime.listOpenExecutionPlans().map((record) => {
    const job = jobByPlan.get(record.plan.planId);
    return {
      record,
      jobId: job?.jobId ?? null,
      jobHref: job ? `/lucrari/${encodeURIComponent(job.jobId)}` : null,
      customerDisplayName: job?.customerDisplayName ?? null,
      priority: job?.priority,
      targetDate: job?.targetDate ?? null,
    };
  });
  const projection = projectPlanningWorkload(sources, runtime.providerRegistry);
  return presentWorkloadProjection(projection, owner);
}

export function presentWorkloadProjection(
  projection: PlanningWorkloadProjection,
  canEditEffort: boolean,
): PlanningWorkloadTransport {
  return {
    canEditEffort,
    providers: projection.providers.map((group) => presentProviderGroup(group, canEditEffort)),
    unassigned: projection.unassigned.map((task) => presentWorkloadTask(task, canEditEffort)),
  };
}

function presentProviderGroup(
  group: ProviderWorkloadGroup,
  canEditEffort: boolean,
): PlanningWorkloadProviderTransport {
  return {
    provider: {
      kind: group.provider.kind,
      kindLabel: providerKindLabel(group.provider.kind),
      id: group.provider.id,
      label: group.provider.label,
    },
    knownQueuedMinutes: group.knownQueuedMinutes,
    unknownEffortCount: group.unknownEffortCount,
    tasks: group.tasks.map((task) => presentWorkloadTask(task, canEditEffort)),
  };
}

function presentWorkloadTask(
  task: WorkloadTaskItem,
  canEditEffort: boolean,
): PlanningWorkloadTaskTransport {
  return {
    taskId: task.taskId,
    executionPlanId: task.executionPlanId,
    status: task.status,
    statusLabel: executionTaskStatusLabel(task.status),
    processLabel: task.processLabel,
    requiredCapabilityLabel: task.requiredCapabilityLabel,
    productLabel: task.productLabel,
    inscription: task.inscription,
    scopeLabel: task.scopeLabel,
    customerDisplayName: task.customerDisplayName,
    priorityLabel: operationalPriorityLabel(task.priority),
    targetDateLabel: operationalTargetDateLabel(task.targetDate),
    jobId: task.jobId,
    jobHref: task.jobId ? `/lucrari/${encodeURIComponent(task.jobId)}` : task.jobHref,
    executionHref: plannerExecutionHref(task),
    assignedProvider: task.assignedProvider,
    plannedEffortMinutes: task.plannedEffortMinutes,
    requiresProvider: task.requiresProvider,
    canEditEffort: canEditEffort && task.status === "PLANNED",
  };
}

function plannerExecutionHref(task: WorkloadTaskItem): string {
  const params = new URLSearchParams();
  params.set("task", task.taskId);
  if (task.jobId) {
    params.set("job", task.jobId);
  }
  return `/executie/${encodeURIComponent(task.executionPlanId)}?${params.toString()}`;
}
