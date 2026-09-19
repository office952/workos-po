import type { ProductionCapabilityClassId } from "../processes/catalog.js";
import type { PeopleEligibilityContext } from "../people/eligibility.js";
import type { Person } from "../people/identity.js";
import {
  assignedProviderStillValid,
  dependenciesCompleted,
  plannedExecutorStartError,
  projectExecutionPlanView,
  taskRequiresProvider,
  type ExecutionPlanRecord,
  type ExecutionPlanView,
  type ExecutionTaskView,
} from "./plan.js";
import type { AcceptedProductionSnapshot } from "../production/snapshot.js";
import {
  workcenterRegistry,
  type WorkcenterRegistry,
} from "../workcenters/catalog.js";

export type OperatorInboxLaneKind =
  | "in_progress_mine"
  | "available_ready"
  | "available_needs_provider"
  | "waiting_dependencies";

export type OperatorInboxTaskItem = {
  taskId: string;
  planId: string;
  productLabel: string;
  inscription: string;
  customerDisplayName: string | null;
  processLabel: string;
  scopeLabel: string;
  seqLabel: string;
  requiredCapabilityLabel: string;
  statusLabel: string;
  providerLabel: string | null;
  requiresProvider: boolean;
  waitingForLabels: readonly string[];
  reservedForLabel: string | null;
  canClaimStart: boolean;
  workspaceHref: string;
  lane: OperatorInboxLaneKind;
  planCreatedAt: string;
  seq: number;
};

export type OperatorTaskInboxProjection = {
  operator: {
    personId: string;
    displayName: string;
    availability: Person["availability"];
  };
  summary: {
    inProgressMine: number;
    availableReady: number;
    availableNeedsProvider: number;
    waitingDependencies: number;
  };
  inProgressMine: readonly OperatorInboxTaskItem[];
  availableReady: readonly OperatorInboxTaskItem[];
  availableNeedsProvider: readonly OperatorInboxTaskItem[];
  waitingDependencies: readonly OperatorInboxTaskItem[];
  displayOrderNote: string;
};

export const OPERATOR_INBOX_DISPLAY_ORDER_NOTE =
  "Ordinea de afișare nu reprezintă programare sau prioritate de producție.";

export type OperatorInboxPlanSource = {
  record: ExecutionPlanRecord;
  snapshot: AcceptedProductionSnapshot | null;
  customerDisplayName: string | null;
};

export function projectOperatorTaskInbox(input: {
  currentOperator: Person;
  people: readonly Person[];
  eligibility: PeopleEligibilityContext | null;
  plans: readonly OperatorInboxPlanSource[];
  providerRegistry?: WorkcenterRegistry;
}): OperatorTaskInboxProjection {
  const { currentOperator, people, eligibility, plans } = input;
  const providerRegistry = input.providerRegistry ?? workcenterRegistry;
  const items: OperatorInboxTaskItem[] = [];

  for (const plan of plans) {
    const view = projectExecutionPlanView(
      plan.record,
      people,
      plan.snapshot,
      eligibility,
      currentOperator.personId,
      providerRegistry,
    );
    const byId = new Map(view.tasks.map((task) => [task.taskId, task]));
    for (const task of view.tasks) {
      const item = classifyInboxTask({
        task,
        view,
        byId,
        currentOperatorId: currentOperator.personId,
        people,
        eligibility,
        customerDisplayName: plan.customerDisplayName,
        planCreatedAt: view.plan.createdAt,
        providerRegistry,
      });
      if (item) {
        items.push(item);
      }
    }
  }

  const sorted = [...items].sort(compareInboxItems);
  const inProgressMine = sorted.filter((item) => item.lane === "in_progress_mine");
  const availableReady = sorted.filter((item) => item.lane === "available_ready");
  const availableNeedsProvider = sorted.filter(
    (item) => item.lane === "available_needs_provider",
  );
  const waitingDependencies = sorted.filter(
    (item) => item.lane === "waiting_dependencies",
  );

  return {
    operator: {
      personId: currentOperator.personId,
      displayName: currentOperator.displayName,
      availability: currentOperator.availability,
    },
    summary: {
      inProgressMine: inProgressMine.length,
      availableReady: availableReady.length,
      availableNeedsProvider: availableNeedsProvider.length,
      waitingDependencies: waitingDependencies.length,
    },
    inProgressMine,
    availableReady,
    availableNeedsProvider,
    waitingDependencies,
    displayOrderNote: OPERATOR_INBOX_DISPLAY_ORDER_NOTE,
  };
}

function classifyInboxTask(input: {
  task: ExecutionTaskView;
  view: ExecutionPlanView;
  byId: ReadonlyMap<string, ExecutionTaskView>;
  currentOperatorId: string;
  people: readonly Person[];
  eligibility: PeopleEligibilityContext | null;
  customerDisplayName: string | null;
  planCreatedAt: string;
  providerRegistry: WorkcenterRegistry;
}): OperatorInboxTaskItem | null {
  const { task, byId, currentOperatorId, people, eligibility } = input;

  if (task.status === "IN_PROGRESS" && task.assignedExecutor?.id === currentOperatorId) {
    return toInboxItem(input, "in_progress_mine");
  }

  if (task.status !== "PLANNED") {
    return null;
  }

  if (task.assignedExecutor && task.assignedExecutor.id !== currentOperatorId) {
    return null;
  }

  const eligibilityBlock = plannedExecutorStartError(
    currentOperatorId,
    task.requiredCapabilityId as ProductionCapabilityClassId,
    people,
    eligibility,
  );
  if (eligibilityBlock !== null) {
    return null;
  }

  if (task.canClaimStart) {
    return toInboxItem(input, "available_ready");
  }

  const depsDone = dependenciesCompleted(task, byId);
  if (!depsDone) {
    return toInboxItem(input, "waiting_dependencies");
  }

  if (taskRequiresProvider(task)) {
    const providerOk =
      task.assignedProvider !== null &&
      assignedProviderStillValid(
        task.requiredCapabilityId,
        task.assignedProvider,
        input.providerRegistry,
      );
    if (!providerOk) {
      return toInboxItem(input, "available_needs_provider");
    }
  }

  return null;
}

function toInboxItem(
  input: {
    task: ExecutionTaskView;
    view: ExecutionPlanView;
    customerDisplayName: string | null;
    planCreatedAt: string;
  },
  lane: OperatorInboxLaneKind,
): OperatorInboxTaskItem {
  const { task, view, customerDisplayName, planCreatedAt } = input;
  return {
    taskId: task.taskId,
    planId: view.plan.planId,
    productLabel: view.plan.productLabel,
    inscription: view.plan.inscription,
    customerDisplayName,
    processLabel: task.processLabel,
    scopeLabel: task.scopeLabel,
    seqLabel: task.seqLabel,
    requiredCapabilityLabel: task.requiredCapabilityLabel,
    statusLabel: task.statusLabel,
    providerLabel: task.assignedProvider?.label ?? null,
    requiresProvider: task.requiresProvider,
    waitingForLabels: task.waitingFor,
    reservedForLabel:
      task.assignedExecutor && lane !== "in_progress_mine"
        ? task.assignedExecutor.label
        : null,
    canClaimStart: lane === "available_ready",
    workspaceHref: `/execution/${view.plan.planId}?task=${encodeURIComponent(task.taskId)}`,
    lane,
    planCreatedAt,
    seq: task.seq,
  };
}

function compareInboxItems(left: OperatorInboxTaskItem, right: OperatorInboxTaskItem): number {
  const byCreated = left.planCreatedAt.localeCompare(right.planCreatedAt);
  if (byCreated !== 0) {
    return byCreated;
  }
  if (left.seq !== right.seq) {
    return left.seq - right.seq;
  }
  return left.taskId.localeCompare(right.taskId);
}
