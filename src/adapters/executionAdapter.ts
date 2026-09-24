import type {
  ActualConsumptionTransport,
  EligibleProviderTransport,
  ExecutionPlanProgressTransport,
  ExecutionPlanTransport,
  ExecutionTaskTransport,
  PlannedResourceTransport,
  SiteInstallationOperationalTransport,
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
    priorityLabel: asString(job?.priorityLabel),
    targetDateLabel: asString(job?.targetDateLabel),
    statusLabel: asString(planView.statusLabel) ?? asString(plan.status) ?? "—",
    progressLabel: progressLabel(progress, planView),
    progress: presentExecutionProgress(progress),
    sourceSnapshotId: asString(plan.sourceSnapshotId) ?? "",
    jobId: asString(job?.jobId) ?? asString(plan.jobId),
    siteInstallation: presentSiteInstallation(record?.siteInstallation),
    tasks: tasks.flatMap((item) => {
      const presented = presentExecutionTask(item);
      return presented ? [presented] : [];
    }),
  };
}

export function presentSiteInstallation(value: unknown): SiteInstallationOperationalTransport | null {
  const row = asRecord(value);
  const street = asString(row?.street);
  const city = asString(row?.city);
  const providerModeLabel = asString(row?.providerModeLabel);
  if (!row || !street || !city || !providerModeLabel) {
    return null;
  }
  return {
    providerModeLabel,
    siteName: asString(row.siteName),
    street,
    city,
    surfaceTypeLabel: asString(row.surfaceTypeLabel) ?? "—",
    surfaceOtherNote: asString(row.surfaceOtherNote),
    mountingSurfaceWidthMm: asNumber(row.mountingSurfaceWidthMm),
    mountingSurfaceHeightMm: asNumber(row.mountingSurfaceHeightMm),
    fixingMethodLabel: asString(row.fixingMethodLabel) ?? "—",
    fixingOtherNote: asString(row.fixingOtherNote),
    installationElevationMm: asNumber(row.installationElevationMm),
    siteElectricalLabel: asString(row.siteElectricalLabel) ?? "—",
    accessNotes: asString(row.accessNotes),
    contactName: asString(row.contactName),
    contactPhone: asString(row.contactPhone),
    crewSize: asNumber(row.crewSize),
    plannedDurationHours: asNumber(row.plannedDurationHours),
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
    dependsOnLabels: asStringList(row.dependsOnLabels),
    eligibleProviders: presentEligibleProviders(row.eligibleProviders),
    startBlockReason: asString(row.startBlockReason),
    operatorRelation: asString(row.operatorRelation),
    startedByLabel: asString(row.startedByLabel),
    executorLabel: presentExecutorLabel(row),
    canRecordActualConsumption: row.canRecordActualConsumption === true,
    plannedResources: presentPlannedResources(row.resourceDemands ?? row.plannedResources),
    actualConsumption: presentActualConsumption(row.actualConsumption),
  };
}

function presentExecutorLabel(row: Record<string, unknown>): string | null {
  const assigned = asRecord(row.assignedExecutor);
  return asString(assigned?.label) ?? asString(row.startedByLabel);
}

function presentExecutionProgress(
  progress: Record<string, unknown> | null,
): ExecutionPlanProgressTransport | null {
  if (!progress) {
    return null;
  }
  const total = asNumber(progress.total);
  const completed = asNumber(progress.completed);
  const inProgress = asNumber(progress.inProgress);
  const planned = asNumber(progress.planned);
  const waitingDependencies = asNumber(progress.waitingDependencies);
  const noProvider = asNumber(progress.noProvider);
  const varianceCount = asNumber(progress.varianceCount);
  if (
    total === null ||
    completed === null ||
    inProgress === null ||
    planned === null ||
    waitingDependencies === null ||
    noProvider === null ||
    varianceCount === null
  ) {
    return null;
  }
  return {
    total,
    completed,
    inProgress,
    planned,
    waitingDependencies,
    noProvider,
    varianceCount,
  };
}

function presentPlannedResources(value: unknown): PlannedResourceTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) {
      return [];
    }
    const resourceId = asString(row.resourceId);
    const label = asString(row.label);
    const plannedQuantity = asNumber(row.plannedQuantity ?? row.quantity);
    const unit = asString(row.unit);
    if (!resourceId || !label || plannedQuantity === null || !unit) {
      return [];
    }
    return [{ resourceId, label, plannedQuantity, unit }];
  });
}

function presentActualConsumption(value: unknown): ActualConsumptionTransport[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const row = asRecord(item);
    if (!row) {
      return [];
    }
    const resourceId = asString(row.resourceId);
    const label = asString(row.resourceLabel) ?? asString(row.label);
    const actualQuantity = asNumber(row.actualQuantity);
    const unit = asString(row.unit);
    if (!resourceId || !label || actualQuantity === null || !unit) {
      return [];
    }
    return [
      {
        resourceId,
        label,
        actualQuantity,
        unit,
        note: typeof row.note === "string" && row.note.trim() !== "" ? row.note : null,
      },
    ];
  });
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
