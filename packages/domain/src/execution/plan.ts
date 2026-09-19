import { eligibleExecutorsForCapability } from "../people/projection.js";
import { activePeople, type Person } from "../people/identity.js";
import {
  diagnoseAssignedPerson,
  type PeopleEligibilityContext,
} from "../people/eligibility.js";
import {
  frozenProviderRequirement,
  getProductionCapability,
  providerRequirementLabel,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
  type ProductionCapabilityClassId,
  type ProviderRequirement,
} from "../processes/catalog.js";
import type { AcceptedProductionSnapshot } from "../production/snapshot.js";
import { productionWorkFromSnapshot } from "../production/snapshot.js";
import {
  workcenterRegistry,
  type ProviderKind,
  type WorkcenterRegistry,
} from "../workcenters/catalog.js";
import { providersForCapability } from "../workcenters/providers.js";
import {
  projectActualInternalCost,
  type ActualInternalCostProjection,
} from "./actualCost.js";
import type { ActualConsumptionEntry } from "./consumption.js";

export const EXECUTION_PLAN_SCHEMA_VERSION = 1 as const;
export const EXECUTION_PLAN_STATUSES = ["PLANNED"] as const;
export type ExecutionPlanStatus = (typeof EXECUTION_PLAN_STATUSES)[number];

export const EXECUTION_PROGRESS_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type ExecutionProgressStatus = (typeof EXECUTION_PROGRESS_STATUSES)[number];

export const EXECUTION_TASK_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type ExecutionTaskStatus = (typeof EXECUTION_TASK_STATUSES)[number];

export const COMPLETION_OUTCOMES = [
  "COMPLETED_AS_PLANNED",
  "COMPLETED_WITH_VARIANCE",
] as const;
export type CompletionOutcome = (typeof COMPLETION_OUTCOMES)[number];

export const COMPLETION_NOTE_MAX_LENGTH = 280;

export type TaskCompletionEvidence = {
  outcome: CompletionOutcome;
  completedQuantity: number | null;
  completedQuantityUnit: string | null;
  note: string | null;
};

export type MeasurablePlannedQuantity = {
  label: string;
  value: number;
  unit: string;
};

export type AssignedExecutionProvider = {
  id: string;
  kind: ProviderKind;
  label: string;
};

export type AssignedExecutionExecutor = {
  id: string;
  label: string;
};

export type ExecutionPlan = {
  planId: string;
  sourceSnapshotId: string;
  sourceSnapshotHash: string;
  productCode: string;
  productLabel: string;
  inscription: string;
  createdAt: string;
  status: ExecutionPlanStatus;
  taskCount: number;
  schemaVersion: typeof EXECUTION_PLAN_SCHEMA_VERSION;
  eicTotal: number;
  eicCurrency: "EUR";
  eicCompleteness: AcceptedProductionSnapshot["eic"]["completeness"];
};

export type ExecutionTask = {
  taskId: string;
  executionPlanId: string;
  sourceOperationId: string;
  processId: string;
  processLabel: string;
  scope: string;
  scopeLabel: string;
  seq: number;
  seqLabel: string;
  dependsOnTaskIds: readonly string[];
  requiredCapabilityId: string;
  requiredCapabilityLabel: string;
  providerRequirement: ProviderRequirement;
  status: ExecutionTaskStatus;
  quantities: AcceptedProductionSnapshot["operations"][number]["quantities"];
  resourceDemands: AcceptedProductionSnapshot["operations"][number]["resourceDemands"];
  assignedProvider: AssignedExecutionProvider | null;
  assignedExecutor: AssignedExecutionExecutor | null;
  startedAt: string | null;
  completedAt: string | null;
  completion: TaskCompletionEvidence | null;
  actualConsumption: readonly ActualConsumptionEntry[];
  createdAt: string;
};

export type ExecutionPlanRecord = {
  plan: ExecutionPlan;
  tasks: readonly ExecutionTask[];
};

export const PLANNED_START_BLOCK_REASONS = [
  "executor_unavailable",
  "unavailable_person",
  "ineligible_executor",
] as const;
export type PlannedStartBlockReason = (typeof PLANNED_START_BLOCK_REASONS)[number];

export type ExecutionEligibleProvider = {
  id: string;
  kind: ProviderKind;
  label: string;
};

export type OperatorTaskRelation =
  | "identify_required"
  | "can_claim"
  | "not_eligible"
  | "unavailable"
  | "missing_provider"
  | "waiting_dependencies"
  | "reserved_other"
  | "owned"
  | "owned_by_other"
  | "idle";

export type ExecutionTaskView = ExecutionTask & {
  statusLabel: string;
  assignmentLabel: string;
  dependsOnLabels: readonly string[];
  waitingFor: readonly string[];
  eligibleProviders: readonly ExecutionEligibleProvider[];
  eligibleExecutors: readonly AssignedExecutionExecutor[];
  measurableQuantity: MeasurablePlannedQuantity | null;
  requiresCompletedQuantity: boolean;
  completionOutcomeLabel: string | null;
  completedQuantityLabel: string | null;
  varianceLabel: string | null;
  requiresProvider: boolean;
  providerRequirementLabel: string;
  canAssign: boolean;
  canAssignExecutor: boolean;
  canStart: boolean;
  canClaimStart: boolean;
  startBlockReason: PlannedStartBlockReason | null;
  operatorRelation: OperatorTaskRelation;
  startedByLabel: string | null;
  canComplete: boolean;
  hasPlannedResources: boolean;
  canRecordActualConsumption: boolean;
};

export type ExecutionPlanProgress = {
  total: number;
  completed: number;
  inProgress: number;
  planned: number;
  waitingDependencies: number;
  noProvider: number;
  noExecutor: number;
  varianceCount: number;
  status: ExecutionProgressStatus;
};

export const EXECUTION_SOURCE_KINDS = ["ORDER", "PILOT"] as const;
export type ExecutionSourceKind = (typeof EXECUTION_SOURCE_KINDS)[number];

export type ExecutionPlanView = {
  plan: ExecutionPlan;
  progress: ExecutionPlanProgress;
  progressStatus: ExecutionProgressStatus;
  statusLabel: string;
  sourceKind: ExecutionSourceKind;
  sourceKindLabel: string;
  jobHref: string | null;
  tasks: readonly ExecutionTaskView[];
  actualInternalCost: ActualInternalCostProjection;
};

export function executionPlanIdFromSnapshot(
  snapshotId: string,
): string {
  return `exp:${snapshotId}`;
}

export function executionTaskId(planId: string, sourceOperationId: string): string {
  return `task:${planId}:${sourceOperationId}`;
}

export function materializeExecutionPlanFromSnapshot(
  snapshot: AcceptedProductionSnapshot,
  options?: { createdAt?: string },
): ExecutionPlanRecord {
  const work = productionWorkFromSnapshot(snapshot);
  const createdAt = options?.createdAt ?? new Date().toISOString();
  const planId = executionPlanIdFromSnapshot(snapshot.snapshotId);
  const tasks = work.operations.map((operation, index) => {
    const seq = index + 1;
    return {
      taskId: executionTaskId(planId, operation.id),
      executionPlanId: planId,
      sourceOperationId: operation.id,
      processId: operation.processId,
      processLabel: operation.processLabel,
      scope: operation.scope,
      scopeLabel: operation.scopeLabel,
      seq,
      seqLabel: String(seq).padStart(2, "0"),
      dependsOnTaskIds: operation.dependsOn.map((operationId) =>
        executionTaskId(planId, operationId),
      ),
      requiredCapabilityId: operation.requiredCapabilityId,
      requiredCapabilityLabel: operation.requiredCapabilityLabel,
      providerRequirement: frozenProviderRequirement(operation.providerRequirement),
      status: "PLANNED" as const,
      quantities: operation.quantities,
      resourceDemands: operation.resourceDemands,
      assignedProvider: null,
      assignedExecutor: null,
      startedAt: null,
      completedAt: null,
      completion: null,
      actualConsumption: [],
      createdAt,
    };
  });

  return {
    plan: {
      planId,
      sourceSnapshotId: snapshot.snapshotId,
      sourceSnapshotHash: snapshot.contentHash,
      productCode: snapshot.productCode,
      productLabel: snapshot.productLabel,
      inscription: snapshot.inscription,
      createdAt,
      status: "PLANNED",
      taskCount: tasks.length,
      schemaVersion: EXECUTION_PLAN_SCHEMA_VERSION,
      eicTotal: work.eic.total,
      eicCurrency: work.eic.currency,
      eicCompleteness: work.eic.completeness,
    },
    tasks,
  };
}

export function projectExecutionPlanView(
  record: ExecutionPlanRecord,
  people: readonly Person[] = [],
  snapshot: AcceptedProductionSnapshot | null = null,
  eligibility: PeopleEligibilityContext | null = null,
  currentOperatorId: string | null = null,
  providerRegistry: WorkcenterRegistry = workcenterRegistry,
): ExecutionPlanView {
  const byId = new Map(record.tasks.map((task) => [task.taskId, task]));
  const availablePeople = activePeople(people).filter(
    (person) => person.availability === "AVAILABLE",
  );
  const tasks = record.tasks.map((task) => {
    const eligibleExecutors = eligibility
      ? eligibleExecutorsForCapability({
          capabilityId: task.requiredCapabilityId as ProductionCapabilityClassId,
          people,
          skills: eligibility.skills,
          assignments: eligibility.assignments,
          requirements: eligibility.requirements,
        })
      : availablePeople.map((person) => ({
          id: person.personId,
          label: person.displayName,
        }));
    const eligibleProviders = liveEligibleProviders(
      task.requiredCapabilityId,
      providerRegistry,
    );
    const dependsOnLabels = task.dependsOnTaskIds.flatMap((id) => {
      const dependency = byId.get(id);
      return dependency ? [taskDependencyLabel(dependency)] : [];
    });
    const waitingFor = incompleteDependencyLabels(task, byId);
    const measurableQuantity = measurablePlannedQuantity(task);
    const assignedExecutor = projectAssignedExecutor(task, people);
    const canClaimStart = canClaimStartTask(
      task,
      byId,
      people,
      eligibility,
      currentOperatorId,
      providerRegistry,
    );
    const operatorRelation = projectOperatorRelation({
      task,
      assignedExecutor,
      waitingFor,
      people,
      eligibility,
      currentOperatorId,
      canClaimStart,
      providerRegistry,
    });
    const ownedByCurrent =
      task.status === "IN_PROGRESS" &&
      assignedExecutor !== null &&
      currentOperatorId !== null &&
      assignedExecutor.id === currentOperatorId;
    return {
      ...task,
      assignedExecutor,
      statusLabel: executionTaskStatusLabel(task.status),
      assignmentLabel: task.assignedProvider?.label ?? "Nealocat",
      dependsOnLabels,
      waitingFor,
      eligibleProviders,
      eligibleExecutors,
      measurableQuantity,
      requiresCompletedQuantity: measurableQuantity !== null,
      completionOutcomeLabel: task.completion
        ? completionOutcomeLabel(task.completion.outcome)
        : null,
      completedQuantityLabel: completedQuantityLabel(task.completion),
      varianceLabel: varianceLabel(measurableQuantity, task.completion),
      requiresProvider: taskRequiresProvider(task),
      providerRequirementLabel: providerRequirementLabel(
        frozenProviderRequirement(task.providerRequirement),
      ),
      canAssign:
        task.status === "PLANNED" &&
        taskRequiresProvider(task) &&
        !task.assignedProvider &&
        eligibleProviders.length > 0,
      canAssignExecutor: false,
      canStart: canClaimStart,
      canClaimStart,
      startBlockReason: plannedStartBlockReason(
        task,
        byId,
        people,
        eligibility,
        providerRegistry,
      ),
      operatorRelation,
      startedByLabel:
        task.status === "IN_PROGRESS" || task.status === "COMPLETED"
          ? assignedExecutor?.label ?? null
          : null,
      canComplete: ownedByCurrent,
      hasPlannedResources: task.resourceDemands.length > 0,
      canRecordActualConsumption:
        task.status === "IN_PROGRESS" &&
        task.resourceDemands.length > 0 &&
        (currentOperatorId === null || ownedByCurrent),
    };
  });
  const progress = summarizeExecutionProgress(tasks);
  const sourceKind = executionSourceKind(snapshot);
  return {
    plan: record.plan,
    progress,
    progressStatus: progress.status,
    statusLabel: executionProgressStatusLabel(progress.status),
    sourceKind,
    sourceKindLabel: executionSourceKindLabel(sourceKind),
    jobHref: executionJobHref(snapshot),
    tasks,
    actualInternalCost: projectActualInternalCost(record, snapshot),
  };
}

function executionJobHref(snapshot: AcceptedProductionSnapshot | null): string | null {
  const orderSnapshotId = snapshot?.sourceOrderSnapshotId?.trim();
  if (!orderSnapshotId) {
    return null;
  }
  return `/jobs/${encodeURIComponent(orderSnapshotId)}`;
}

function executionSourceKind(
  snapshot: AcceptedProductionSnapshot | null,
): ExecutionSourceKind {
  if (snapshot?.releaseSource === "ORDER" || Boolean(snapshot?.sourceOrderSnapshotId)) {
    return "ORDER";
  }
  return "PILOT";
}

function executionSourceKindLabel(kind: ExecutionSourceKind): string {
  switch (kind) {
    case "ORDER":
      return "Eliberată din comandă";
    case "PILOT":
      return "Atelier / test tehnic";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function summarizeExecutionProgress(
  tasks: readonly Pick<
    ExecutionTaskView,
    | "status"
    | "waitingFor"
    | "eligibleProviders"
    | "completion"
    | "assignedExecutor"
    | "requiresProvider"
  >[],
): ExecutionPlanProgress {
  return {
    total: tasks.length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length,
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    planned: tasks.filter((task) => task.status === "PLANNED").length,
    waitingDependencies: tasks.filter((task) => task.waitingFor.length > 0).length,
    noProvider: tasks.filter(
      (task) => task.requiresProvider && task.eligibleProviders.length === 0,
    ).length,
    noExecutor: tasks.filter((task) => task.assignedExecutor === null).length,
    varianceCount: tasks.filter(
      (task) => task.completion?.outcome === "COMPLETED_WITH_VARIANCE",
    ).length,
    status: deriveExecutionProgress(tasks),
  };
}

const QUALITATIVE_COMPLETION_PROCESS_IDS = new Set([
  WIRE_LIGHTING_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  TEST_LIGHTING_IGNITION_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  INSPECT_FINISHED_LETTER_ID,
]);

export function measurablePlannedQuantity(
  task: Pick<ExecutionTask, "processId" | "quantities">,
): MeasurablePlannedQuantity | null {
  if (QUALITATIVE_COMPLETION_PROCESS_IDS.has(task.processId)) {
    return null;
  }
  if (task.quantities.length !== 1) {
    return null;
  }
  const quantity = task.quantities[0];
  if (!quantity) {
    return null;
  }
  return {
    label: quantity.label,
    value: quantity.value,
    unit: quantity.unit,
  };
}

export function completionOutcomeLabel(outcome: CompletionOutcome): string {
  switch (outcome) {
    case "COMPLETED_AS_PLANNED":
      return "Conform planului";
    case "COMPLETED_WITH_VARIANCE":
      return "Cu diferență față de plan";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

function completedQuantityLabel(
  completion: TaskCompletionEvidence | null,
): string | null {
  if (!completion || completion.completedQuantity === null || !completion.completedQuantityUnit) {
    return null;
  }
  return `Realizat: ${formatExecutionQuantity(completion.completedQuantity)} ${formatExecutionUnit(completion.completedQuantityUnit)}`;
}

function varianceLabel(
  planned: MeasurablePlannedQuantity | null,
  completion: TaskCompletionEvidence | null,
): string | null {
  if (!completion) {
    return null;
  }
  if (completion.outcome === "COMPLETED_AS_PLANNED") {
    return "Conform planului";
  }
  if (
    !planned ||
    completion.completedQuantity === null ||
    !completion.completedQuantityUnit
  ) {
    return "Cu diferență față de plan";
  }
  const delta = completion.completedQuantity - planned.value;
  const signed = `${delta > 0 ? "+" : ""}${formatExecutionQuantity(delta)}`;
  return `Diferență față de plan: ${signed} ${formatExecutionUnit(completion.completedQuantityUnit)}`;
}

function formatExecutionQuantity(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("ro-RO", { maximumFractionDigits: 4 });
}

function formatExecutionUnit(unit: string): string {
  return unit === "m2" ? "m²" : unit;
}

export function deriveExecutionProgress(
  tasks: readonly { status: ExecutionTaskStatus }[],
): ExecutionProgressStatus {
  if (tasks.length === 0 || tasks.every((task) => task.status === "PLANNED")) {
    return "PLANNED";
  }
  if (tasks.every((task) => task.status === "COMPLETED")) {
    return "COMPLETED";
  }
  return "IN_PROGRESS";
}

export function executionPlanStatusLabel(status: ExecutionPlanStatus): string {
  switch (status) {
    case "PLANNED":
      return "Planificat";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function executionProgressStatusLabel(
  status: ExecutionProgressStatus,
): string {
  switch (status) {
    case "PLANNED":
      return "Planificat";
    case "IN_PROGRESS":
      return "În lucru";
    case "COMPLETED":
      return "Finalizat";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function executionTaskStatusLabel(status: ExecutionTaskStatus): string {
  switch (status) {
    case "PLANNED":
      return "Planificat";
    case "IN_PROGRESS":
      return "În lucru";
    case "COMPLETED":
      return "Finalizat";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function liveEligibleProviders(
  capabilityId: string,
  registry: WorkcenterRegistry = workcenterRegistry,
): ExecutionEligibleProvider[] {
  const capability = getProductionCapability(capabilityId);
  if (!capability) {
    return [];
  }
  return providersForCapability(capability.id, registry)
    .filter((item) => item.lifecycle === "ACTIVE")
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "ro"));
}

export function assignedProviderStillValid(
  capabilityId: string,
  assigned: AssignedExecutionProvider,
  registry: WorkcenterRegistry = workcenterRegistry,
): boolean {
  return liveEligibleProviders(capabilityId, registry).some(
    (item) => item.id === assigned.id && item.kind === assigned.kind,
  );
}

export function incompleteDependencyLabels(
  task: ExecutionTask,
  byId: ReadonlyMap<string, ExecutionTask>,
): string[] {
  return task.dependsOnTaskIds.flatMap((id) => {
    const dependency = byId.get(id);
    if (!dependency || dependency.status === "COMPLETED") {
      return [];
    }
    return [taskDependencyLabel(dependency)];
  });
}

export function dependenciesCompleted(
  task: ExecutionTask,
  byId: ReadonlyMap<string, ExecutionTask>,
): boolean {
  return task.dependsOnTaskIds.every((id) => byId.get(id)?.status === "COMPLETED");
}

export function taskRequiresProvider(
  task: Pick<ExecutionTask, "providerRequirement">,
): boolean {
  return frozenProviderRequirement(task.providerRequirement) === "REQUIRED";
}

function providerReadyForStart(
  task: ExecutionTask,
  registry: WorkcenterRegistry,
): boolean {
  if (!taskRequiresProvider(task)) {
    return true;
  }
  return (
    task.assignedProvider !== null &&
    assignedProviderStillValid(
      task.requiredCapabilityId,
      task.assignedProvider,
      registry,
    )
  );
}

function canClaimStartTask(
  task: ExecutionTask,
  byId: ReadonlyMap<string, ExecutionTask>,
  people: readonly Person[],
  eligibility: PeopleEligibilityContext | null,
  currentOperatorId: string | null,
  providerRegistry: WorkcenterRegistry,
): boolean {
  if (
    task.status !== "PLANNED" ||
    !currentOperatorId ||
    !providerReadyForStart(task, providerRegistry) ||
    !dependenciesCompleted(task, byId)
  ) {
    return false;
  }
  if (task.assignedExecutor && task.assignedExecutor.id !== currentOperatorId) {
    return false;
  }
  return (
    plannedExecutorStartError(
      currentOperatorId,
      task.requiredCapabilityId as ProductionCapabilityClassId,
      people,
      eligibility,
    ) === null
  );
}

function projectOperatorRelation(input: {
  task: ExecutionTask;
  assignedExecutor: AssignedExecutionExecutor | null;
  waitingFor: readonly string[];
  people: readonly Person[];
  eligibility: PeopleEligibilityContext | null;
  currentOperatorId: string | null;
  canClaimStart: boolean;
  providerRegistry: WorkcenterRegistry;
}): OperatorTaskRelation {
  const { task, assignedExecutor, waitingFor, currentOperatorId, canClaimStart } = input;
  if (task.status === "IN_PROGRESS" || task.status === "COMPLETED") {
    if (!currentOperatorId || !assignedExecutor) {
      return "owned_by_other";
    }
    return assignedExecutor.id === currentOperatorId ? "owned" : "owned_by_other";
  }
  if (task.status !== "PLANNED") {
    return "idle";
  }
  if (!currentOperatorId) {
    return "identify_required";
  }
  if (waitingFor.length > 0) {
    return "waiting_dependencies";
  }
  if (!providerReadyForStart(task, input.providerRegistry)) {
    return "missing_provider";
  }
  if (task.assignedExecutor && task.assignedExecutor.id !== currentOperatorId) {
    return "reserved_other";
  }
  if (canClaimStart) {
    return "can_claim";
  }
  const diagnosis = diagnoseAssignedPerson({
    personId: currentOperatorId,
    capabilityId: task.requiredCapabilityId as ProductionCapabilityClassId,
    people: input.people,
    eligibility: input.eligibility,
  });
  if (diagnosis?.reason === "TEMPORARILY_UNAVAILABLE") {
    return "unavailable";
  }
  return "not_eligible";
}

function plannedStartBlockReason(
  task: ExecutionTask,
  byId: ReadonlyMap<string, ExecutionTask>,
  people: readonly Person[],
  eligibility: PeopleEligibilityContext | null,
  providerRegistry: WorkcenterRegistry,
): PlannedStartBlockReason | null {
  if (
    task.status !== "PLANNED" ||
    !task.assignedExecutor ||
    !providerReadyForStart(task, providerRegistry) ||
    !dependenciesCompleted(task, byId)
  ) {
    return null;
  }
  return plannedExecutorStartError(
    task.assignedExecutor.id,
    task.requiredCapabilityId as ProductionCapabilityClassId,
    people,
    eligibility,
  );
}

export function plannedExecutorStartError(
  personId: string,
  capabilityId: ProductionCapabilityClassId,
  people: readonly Person[],
  eligibility: PeopleEligibilityContext | null,
): PlannedStartBlockReason | null {
  const diagnosis = diagnoseAssignedPerson({
    personId,
    capabilityId,
    people,
    eligibility,
  });
  if (!diagnosis) {
    return "executor_unavailable";
  }
  if (diagnosis.eligible) {
    return null;
  }
  switch (diagnosis.reason) {
    case "RETIRED":
      return "executor_unavailable";
    case "TEMPORARILY_UNAVAILABLE":
      return "unavailable_person";
    case "MISSING_SKILL":
    case "RETIRED_SKILL":
    case "CAPABILITY_UNMAPPED":
      return "ineligible_executor";
    case null:
      return "ineligible_executor";
    default: {
      const _exhaustive: never = diagnosis.reason;
      return _exhaustive;
    }
  }
}

export function assignedExecutorStillActive(
  assigned: AssignedExecutionExecutor,
  people: readonly Person[],
): boolean {
  return people.some(
    (person) => person.personId === assigned.id && person.status === "ACTIVE",
  );
}

function projectAssignedExecutor(
  task: ExecutionTask,
  people: readonly Person[],
): AssignedExecutionExecutor | null {
  if (!task.assignedExecutor) {
    return null;
  }
  if (task.status === "PLANNED") {
    const live = people.find((person) => person.personId === task.assignedExecutor?.id);
    if (live) {
      return { id: live.personId, label: live.displayName };
    }
  }
  return task.assignedExecutor;
}

function taskDependencyLabel(task: ExecutionTask): string {
  return `${task.processLabel} — ${task.scopeLabel}`;
}
