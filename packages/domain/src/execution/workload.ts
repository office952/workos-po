import { taskRequiresProvider, type AssignedExecutionProvider, type ExecutionPlanRecord, type ExecutionTask, type ExecutionTaskStatus } from "./plan.js";
import { plannedEffortIsUnknown } from "./plannedEffort.js";
import {
  workcenterRegistry,
  type ProviderKind,
  type WorkcenterRegistry,
} from "../workcenters/catalog.js";

export type WorkloadTaskItem = {
  taskId: string;
  executionPlanId: string;
  status: ExecutionTaskStatus;
  processLabel: string;
  requiredCapabilityLabel: string;
  productLabel: string;
  inscription: string;
  jobId: string | null;
  jobHref: string | null;
  assignedProvider: AssignedExecutionProvider | null;
  plannedEffortMinutes: number | null;
  requiresProvider: boolean;
  createdAt: string;
  seq: number;
};

export type ProviderWorkloadGroup = {
  provider: {
    kind: ProviderKind;
    id: string;
    label: string;
  };
  knownQueuedMinutes: number;
  unknownEffortCount: number;
  tasks: readonly WorkloadTaskItem[];
};

export type WorkloadPlanSource = {
  record: ExecutionPlanRecord;
  jobId?: string | null;
  jobHref?: string | null;
};

export type PlanningWorkloadProjection = {
  providers: readonly ProviderWorkloadGroup[];
  unassigned: readonly WorkloadTaskItem[];
};

export function isOpenWorkloadStatus(status: ExecutionTaskStatus): boolean {
  return status === "PLANNED" || status === "IN_PROGRESS";
}

export function compareWorkloadDisplayOrder(
  left: Pick<WorkloadTaskItem, "status" | "createdAt" | "executionPlanId" | "seq" | "taskId">,
  right: Pick<WorkloadTaskItem, "status" | "createdAt" | "executionPlanId" | "seq" | "taskId">,
): number {
  const leftRank = left.status === "IN_PROGRESS" ? 0 : 1;
  const rightRank = right.status === "IN_PROGRESS" ? 0 : 1;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }
  const byCreated = left.createdAt.localeCompare(right.createdAt);
  if (byCreated !== 0) {
    return byCreated;
  }
  const byPlan = left.executionPlanId.localeCompare(right.executionPlanId);
  if (byPlan !== 0) {
    return byPlan;
  }
  if (left.seq !== right.seq) {
    return left.seq - right.seq;
  }
  return left.taskId.localeCompare(right.taskId);
}

export function projectPlanningWorkload(
  sources: readonly WorkloadPlanSource[],
  registry: WorkcenterRegistry = workcenterRegistry,
): PlanningWorkloadProjection {
  const items: WorkloadTaskItem[] = [];
  for (const source of sources) {
    for (const task of source.record.tasks) {
      if (!isOpenWorkloadStatus(task.status)) {
        continue;
      }
      items.push(toWorkloadItem(task, source));
    }
  }

  const groups = new Map<string, ProviderWorkloadGroup>();
  for (const provider of assignableProviders(registry)) {
    groups.set(providerKey(provider.kind, provider.id), {
      provider,
      knownQueuedMinutes: 0,
      unknownEffortCount: 0,
      tasks: [],
    });
  }

  const unassigned: WorkloadTaskItem[] = [];
  for (const item of items) {
    if (!item.assignedProvider) {
      if (item.requiresProvider) {
        unassigned.push(item);
      }
      continue;
    }
    const key = providerKey(item.assignedProvider.kind, item.assignedProvider.id);
    const existing = groups.get(key);
    const group = existing ?? {
      provider: item.assignedProvider,
      knownQueuedMinutes: 0,
      unknownEffortCount: 0,
      tasks: [],
    };
    const nextTasks = [...group.tasks, item];
    groups.set(key, {
      provider: group.provider,
      knownQueuedMinutes: plannedEffortIsUnknown(item.plannedEffortMinutes)
        ? group.knownQueuedMinutes
        : group.knownQueuedMinutes + (item.plannedEffortMinutes ?? 0),
      unknownEffortCount: plannedEffortIsUnknown(item.plannedEffortMinutes)
        ? group.unknownEffortCount + 1
        : group.unknownEffortCount,
      tasks: nextTasks,
    });
  }

  return {
    providers: [...groups.values()]
      .map((group) => ({
        ...group,
        tasks: [...group.tasks].sort(compareWorkloadDisplayOrder),
      }))
      .sort(compareProviderGroups),
    unassigned: [...unassigned].sort(compareWorkloadDisplayOrder),
  };
}

function toWorkloadItem(task: ExecutionTask, source: WorkloadPlanSource): WorkloadTaskItem {
  return {
    taskId: task.taskId,
    executionPlanId: task.executionPlanId,
    status: task.status,
    processLabel: task.processLabel,
    requiredCapabilityLabel: task.requiredCapabilityLabel,
    productLabel: source.record.plan.productLabel,
    inscription: source.record.plan.inscription,
    jobId: source.jobId ?? null,
    jobHref: source.jobHref ?? null,
    assignedProvider: task.assignedProvider,
    plannedEffortMinutes: task.plannedEffortMinutes,
    requiresProvider: taskRequiresProvider(task),
    createdAt: task.createdAt,
    seq: task.seq,
  };
}

function assignableProviders(
  registry: WorkcenterRegistry,
): Array<{ kind: ProviderKind; id: string; label: string }> {
  const workcenters = registry.workcenters
    .filter((item) => item.lifecycle === "ACTIVE" && item.capabilityIds.length > 0)
    .map((item) => ({ kind: "WORKCENTER" as const, id: item.id, label: item.label }));
  const machines = registry.machines
    .filter((item) => item.lifecycle === "ACTIVE" && item.capabilityIds.length > 0)
    .map((item) => ({ kind: "MACHINE" as const, id: item.id, label: item.label }));
  return [...workcenters, ...machines];
}

function providerKey(kind: ProviderKind, id: string): string {
  return `${kind}:${id}`;
}

function compareProviderGroups(
  left: ProviderWorkloadGroup,
  right: ProviderWorkloadGroup,
): number {
  const byLabel = left.provider.label.localeCompare(right.provider.label, "ro");
  if (byLabel !== 0) {
    return byLabel;
  }
  const byKind = left.provider.kind.localeCompare(right.provider.kind);
  if (byKind !== 0) {
    return byKind;
  }
  return left.provider.id.localeCompare(right.provider.id);
}
