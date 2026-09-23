import type {
  PlanningWorkloadProviderTransport,
  PlanningWorkloadTaskTransport,
  PlanningWorkloadTransport,
} from "../api/types";
import { asNumber, asRecord, asString } from "./record";

export function presentPlanningWorkload(payload: unknown): PlanningWorkloadTransport | null {
  const record = asRecord(payload);
  const workload = asRecord(record?.workload) ?? record;
  if (!workload) {
    return null;
  }
  return {
    canEditEffort: workload.canEditEffort === true,
    providers: presentProviders(workload.providers),
    unassigned: presentTasks(workload.unassigned),
  };
}

function presentProviders(value: unknown): PlanningWorkloadProviderTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const presented = presentProvider(item);
    return presented ? [presented] : [];
  });
}

function presentProvider(value: unknown): PlanningWorkloadProviderTransport | null {
  const row = asRecord(value);
  const provider = asRecord(row?.provider);
  const id = asString(provider?.id);
  const label = asString(provider?.label);
  if (!row || !id || !label) {
    return null;
  }
  const knownQueuedMinutes = asNumber(row.knownQueuedMinutes);
  const unknownEffortCount = asNumber(row.unknownEffortCount);
  if (knownQueuedMinutes === null || unknownEffortCount === null) {
    return null;
  }
  return {
    provider: {
      kind: asString(provider?.kind) ?? "",
      kindLabel: asString(provider?.kindLabel) ?? "",
      id,
      label,
    },
    knownQueuedMinutes,
    unknownEffortCount,
    tasks: presentTasks(row.tasks),
  };
}

function presentTasks(value: unknown): PlanningWorkloadTaskTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const presented = presentTask(item);
    return presented ? [presented] : [];
  });
}

function presentTask(value: unknown): PlanningWorkloadTaskTransport | null {
  const row = asRecord(value);
  const taskId = asString(row?.taskId);
  const executionPlanId = asString(row?.executionPlanId);
  const executionHref = asString(row?.executionHref);
  if (!row || !taskId || !executionPlanId || !executionHref) {
    return null;
  }
  const assigned = asRecord(row.assignedProvider);
  return {
    taskId,
    executionPlanId,
    status: asString(row.status) ?? "",
    statusLabel: asString(row.statusLabel) ?? asString(row.status) ?? "—",
    processLabel: asString(row.processLabel) ?? "",
    requiredCapabilityLabel: asString(row.requiredCapabilityLabel) ?? "",
    productLabel: asString(row.productLabel) ?? "",
    inscription: asString(row.inscription) ?? "",
    scopeLabel: asString(row.scopeLabel) ?? "",
    customerDisplayName: asString(row.customerDisplayName),
    priorityLabel: asString(row.priorityLabel) ?? "Standard",
    targetDateLabel: asString(row.targetDateLabel) ?? "Fără termen",
    jobId: asString(row.jobId),
    jobHref: asString(row.jobHref),
    executionHref,
    assignedProvider:
      assigned && asString(assigned.id) && asString(assigned.label)
        ? {
            id: asString(assigned.id) ?? "",
            kind: asString(assigned.kind) ?? "",
            label: asString(assigned.label) ?? "",
          }
        : null,
    plannedEffortMinutes: presentEffortMinutes(row.plannedEffortMinutes),
    requiresProvider: row.requiresProvider === true,
    canEditEffort: row.canEditEffort === true,
  };
}

function presentEffortMinutes(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asNumber(value);
}
