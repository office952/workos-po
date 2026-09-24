import { findPerson, type Person } from "../people/identity.js";
import type { ExecutionPlanRecord, ExecutionTask } from "./plan.js";

type MachineRunMutationError =
  | "not_found"
  | "machine_run_not_allowed"
  | "missing_executor"
  | "wrong_executor"
  | "machine_run_active"
  | "machine_run_not_found"
  | "machine_run_closed"
  | "unknown_person"
  | "retired_person"
  | "unavailable_person";

type MachineRunMutationResult =
  | { ok: true; record: ExecutionPlanRecord; alreadyApplied: boolean }
  | { ok: false; error: MachineRunMutationError };

export const MACHINE_RUN_SCHEMA_VERSION = 1 as const;

export type MachineRun = {
  machineRunId: string;
  executionPlanId: string;
  taskId: string;
  machineProviderId: string;
  machineProviderLabel: string;
  startedAt: string;
  completedAt: string | null;
  durationMinutes: number | null;
  startedByOperatorId: string;
  startedByOperatorLabel: string;
  completedByOperatorId: string | null;
  completedByOperatorLabel: string | null;
  createdAt: string;
  schemaVersion: typeof MACHINE_RUN_SCHEMA_VERSION;
};

export function machineRunDurationMinutes(
  startedAt: string,
  completedAt: string,
): number | null {
  const start = Date.parse(startedAt);
  const end = Date.parse(completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Math.round((end - start) / 60_000);
}

export function activeMachineRun(task: Pick<ExecutionTask, "machineRuns">): MachineRun | null {
  return task.machineRuns.find((run) => run.completedAt === null) ?? null;
}

export function closedMachineRunTotalMinutes(
  task: Pick<ExecutionTask, "machineRuns">,
): number | null {
  const closed = task.machineRuns.filter((run) => run.durationMinutes !== null);
  if (closed.length === 0) {
    return null;
  }
  return closed.reduce((sum, run) => sum + (run.durationMinutes ?? 0), 0);
}

export function startMachineRun(
  record: ExecutionPlanRecord,
  taskId: string,
  personId: string,
  startedAt: string,
  people: readonly Person[],
): MachineRunMutationResult {
  const task = findTask(record, taskId);
  if (!task) {
    return { ok: false, error: "not_found" };
  }
  if (task.status !== "IN_PROGRESS" || task.assignedProvider?.kind !== "MACHINE") {
    return { ok: false, error: "machine_run_not_allowed" };
  }
  if (!task.assignedExecutor) {
    return { ok: false, error: "missing_executor" };
  }
  if (task.assignedExecutor.id !== personId) {
    return { ok: false, error: "wrong_executor" };
  }
  if (activeMachineRun(task)) {
    return { ok: false, error: "machine_run_active" };
  }
  const operator = requireActiveOperator(people, personId);
  if (!operator.ok) {
    return operator;
  }
  const machineProviderId = task.assignedProvider.id.trim();
  const machineProviderLabel = task.assignedProvider.label.trim();
  if (machineProviderId.length === 0 || machineProviderLabel.length === 0) {
    return { ok: false, error: "machine_run_not_allowed" };
  }
  if (!Number.isFinite(Date.parse(startedAt))) {
    return { ok: false, error: "machine_run_not_allowed" };
  }
  const run: MachineRun = {
    machineRunId: `mrun:${task.taskId}:${task.machineRuns.length + 1}`,
    executionPlanId: task.executionPlanId,
    taskId: task.taskId,
    machineProviderId,
    machineProviderLabel,
    startedAt,
    completedAt: null,
    durationMinutes: null,
    startedByOperatorId: operator.person.personId,
    startedByOperatorLabel: operator.person.displayName,
    completedByOperatorId: null,
    completedByOperatorLabel: null,
    createdAt: startedAt,
    schemaVersion: MACHINE_RUN_SCHEMA_VERSION,
  };
  return {
    ok: true,
    alreadyApplied: false,
    record: replaceTask(record, {
      ...task,
      machineRuns: [...task.machineRuns, run],
    }),
  };
}

export function stopMachineRun(
  record: ExecutionPlanRecord,
  machineRunId: string,
  personId: string,
  completedAt: string,
  people: readonly Person[],
): MachineRunMutationResult {
  const located = findRun(record, machineRunId);
  if (!located) {
    return { ok: false, error: "machine_run_not_found" };
  }
  const { task, run } = located;
  if (run.completedAt !== null) {
    return { ok: false, error: "machine_run_closed" };
  }
  if (task.status !== "IN_PROGRESS" || !task.assignedExecutor) {
    return { ok: false, error: "machine_run_not_allowed" };
  }
  if (task.assignedExecutor.id !== personId) {
    return { ok: false, error: "wrong_executor" };
  }
  const operator = requireActiveOperator(people, personId);
  if (!operator.ok) {
    return operator;
  }
  const durationMinutes = machineRunDurationMinutes(run.startedAt, completedAt);
  if (durationMinutes === null) {
    return { ok: false, error: "machine_run_not_allowed" };
  }
  const closed: MachineRun = {
    ...run,
    completedAt,
    durationMinutes,
    completedByOperatorId: operator.person.personId,
    completedByOperatorLabel: operator.person.displayName,
  };
  return {
    ok: true,
    alreadyApplied: false,
    record: replaceTask(record, {
      ...task,
      machineRuns: task.machineRuns.map((item) =>
        item.machineRunId === run.machineRunId ? closed : item,
      ),
    }),
  };
}

function requireActiveOperator(
  people: readonly Person[],
  personId: string,
): { ok: true; person: Person } | { ok: false; error: MachineRunMutationError } {
  const person = findPerson(people, personId);
  if (!person) {
    return { ok: false, error: "unknown_person" };
  }
  if (person.status !== "ACTIVE") {
    return { ok: false, error: "retired_person" };
  }
  if (person.availability === "TEMPORARILY_UNAVAILABLE") {
    return { ok: false, error: "unavailable_person" };
  }
  return { ok: true, person };
}

function findTask(
  record: ExecutionPlanRecord,
  taskId: string,
): ExecutionTask | undefined {
  return record.tasks.find((task) => task.taskId === taskId);
}

function findRun(
  record: ExecutionPlanRecord,
  machineRunId: string,
): { task: ExecutionTask; run: MachineRun } | null {
  for (const task of record.tasks) {
    const run = task.machineRuns.find((item) => item.machineRunId === machineRunId);
    if (run) {
      return { task, run };
    }
  }
  return null;
}

function replaceTask(
  record: ExecutionPlanRecord,
  next: ExecutionTask,
): ExecutionPlanRecord {
  return {
    ...record,
    tasks: record.tasks.map((task) => (task.taskId === next.taskId ? next : task)),
  };
}
