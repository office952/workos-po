import type { TaskMutationResult } from "./lifecycle.js";
import { dependenciesCompleted, type ExecutionPlanRecord, type ExecutionTask } from "./plan.js";
import { isQualityControlExecutionProcess } from "./qualityControl.js";

export const EXTERNAL_PRODUCTION_HANDOFF_MODES = ["DISABLED", "ENABLED"] as const;
export type ExternalProductionHandoffMode = (typeof EXTERNAL_PRODUCTION_HANDOFF_MODES)[number];

export const EXTERNAL_PROVIDER_NAME_MAX_LENGTH = 80;

export const EXTERNAL_PROVIDER_MUTATION_ERRORS = [
  "invalid_name",
  "not_found",
  "duplicate_name",
] as const;
export type ExternalProviderMutationError = (typeof EXTERNAL_PROVIDER_MUTATION_ERRORS)[number];

export type ExternalProductionProvider = {
  providerId: string;
  name: string;
  active: boolean;
  createdAt: string;
  createdBy: string;
};

export type StoredExternalProductionHandoffMode = {
  version: number;
  mode: ExternalProductionHandoffMode;
  updatedAt: string;
  updatedBy: string;
};

export type ExternalProductionHandoffModeRecord = StoredExternalProductionHandoffMode & {
  source: "STORED" | "CODE_DEFAULT";
};

export type ExternalProviderMutationResult =
  | { ok: true; provider: ExternalProductionProvider; alreadyApplied: boolean }
  | { ok: false; error: ExternalProviderMutationError };

const CODE_DEFAULT_MODE: ExternalProductionHandoffModeRecord = {
  version: 0,
  mode: "DISABLED",
  updatedAt: "",
  updatedBy: "",
  source: "CODE_DEFAULT",
};

export function parseExternalProductionHandoffMode(
  value: string,
): ExternalProductionHandoffMode | null {
  switch (value) {
    case "DISABLED":
    case "ENABLED":
      return value;
    default:
      return null;
  }
}

export function externalProductionHandoffModeLabel(
  mode: ExternalProductionHandoffMode,
): string {
  switch (mode) {
    case "DISABLED":
      return "Oprit";
    case "ENABLED":
      return "Activ";
    default: {
      const exhaustive: never = mode;
      return exhaustive;
    }
  }
}

export function resolveExternalProductionHandoffMode(
  versions: readonly StoredExternalProductionHandoffMode[],
): ExternalProductionHandoffModeRecord {
  if (versions.length === 0) {
    return CODE_DEFAULT_MODE;
  }
  const latest = [...versions].sort((left, right) => right.version - left.version)[0];
  if (!latest) {
    return CODE_DEFAULT_MODE;
  }
  return { ...latest, source: "STORED" };
}

export function nextExternalProductionHandoffVersion(
  current: ExternalProductionHandoffModeRecord,
  mode: ExternalProductionHandoffMode,
  updatedAt: string,
  updatedBy: string,
): StoredExternalProductionHandoffMode | null {
  if (current.source === "CODE_DEFAULT" && mode === "DISABLED") {
    return null;
  }
  if (current.source === "STORED" && current.mode === mode) {
    return null;
  }
  return {
    version: current.version + 1,
    mode,
    updatedAt,
    updatedBy,
  };
}

export function parseExternalProviderName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const name = value.trim();
  if (name.length === 0 || name.length > EXTERNAL_PROVIDER_NAME_MAX_LENGTH) {
    return null;
  }
  return name;
}

export function externalProviderNameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function externalProviderNamesCollide(left: string, right: string): boolean {
  return externalProviderNameKey(left) === externalProviderNameKey(right);
}

export function createExternalProductionProvider(input: {
  providerId: string;
  name: unknown;
  createdAt: string;
  createdBy: string;
  existing: readonly ExternalProductionProvider[];
}): ExternalProviderMutationResult {
  const name = parseExternalProviderName(input.name);
  if (!name || input.providerId.trim().length === 0) {
    return { ok: false, error: "invalid_name" };
  }
  if (input.existing.some((item) => externalProviderNamesCollide(item.name, name))) {
    return { ok: false, error: "duplicate_name" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    provider: {
      providerId: input.providerId.trim(),
      name,
      active: true,
      createdAt: input.createdAt,
      createdBy: input.createdBy,
    },
  };
}

export function renameExternalProductionProvider(
  providers: readonly ExternalProductionProvider[],
  providerId: string,
  name: unknown,
): ExternalProviderMutationResult {
  const provider = providers.find((item) => item.providerId === providerId);
  if (!provider) {
    return { ok: false, error: "not_found" };
  }
  const nextName = parseExternalProviderName(name);
  if (!nextName) {
    return { ok: false, error: "invalid_name" };
  }
  if (
    providers.some(
      (item) =>
        item.providerId !== providerId && externalProviderNamesCollide(item.name, nextName),
    )
  ) {
    return { ok: false, error: "duplicate_name" };
  }
  if (provider.name === nextName) {
    return { ok: true, provider, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    provider: { ...provider, name: nextName },
  };
}

export function setExternalProductionProviderActive(
  providers: readonly ExternalProductionProvider[],
  providerId: string,
  active: boolean,
): ExternalProviderMutationResult {
  const provider = providers.find((item) => item.providerId === providerId);
  if (!provider) {
    return { ok: false, error: "not_found" };
  }
  if (provider.active === active) {
    return { ok: true, provider, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    provider: { ...provider, active },
  };
}

export function markTaskExternal(
  record: ExecutionPlanRecord,
  taskId: string,
  mode: ExternalProductionHandoffMode,
  actorId: string,
  markedAt: string,
): TaskMutationResult {
  const task = findTask(record, taskId);
  if (!task) {
    return { ok: false, error: "not_found" };
  }
  if (isQualityControlExecutionProcess(task.processId)) {
    return { ok: false, error: "quality_control_not_externalizable" };
  }
  if (task.executionMode === "EXTERNAL") {
    return { ok: true, record, alreadyApplied: true };
  }
  if (task.status !== "PLANNED") {
    return { ok: false, error: "task_not_planned" };
  }
  if (mode !== "ENABLED") {
    return { ok: false, error: "external_production_disabled" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    record: replaceTask(record, {
      ...task,
      executionMode: "EXTERNAL",
      externalizedAt: markedAt,
      externalizedBy: actorId,
    }),
  };
}

export function assignExternalProviderToTask(
  record: ExecutionPlanRecord,
  taskId: string,
  provider: ExternalProductionProvider | null,
): TaskMutationResult {
  const task = findTask(record, taskId);
  if (!task) {
    return { ok: false, error: "not_found" };
  }
  if (task.executionMode !== "EXTERNAL") {
    return { ok: false, error: "task_not_external" };
  }
  if (task.status !== "PLANNED") {
    return { ok: false, error: "task_not_planned" };
  }
  if (!provider) {
    return { ok: false, error: "external_provider_not_found" };
  }
  if (!provider.active) {
    return { ok: false, error: "external_provider_inactive" };
  }
  if (task.externalProviderId === provider.providerId) {
    return { ok: true, record, alreadyApplied: true };
  }
  return {
    ok: true,
    alreadyApplied: false,
    record: replaceTask(record, {
      ...task,
      externalProviderId: provider.providerId,
      externalProviderLabel: provider.name,
    }),
  };
}

export function handOffExternalTask(
  record: ExecutionPlanRecord,
  taskId: string,
  actorId: string,
  handedOffAt: string,
  providerNameAtHandoff: string | null,
): TaskMutationResult {
  const task = findTask(record, taskId);
  if (!task) {
    return { ok: false, error: "not_found" };
  }
  if (task.executionMode !== "EXTERNAL") {
    return { ok: false, error: "task_not_external" };
  }
  if (task.status === "OUTSIDE") {
    return { ok: true, record, alreadyApplied: true };
  }
  if (task.status !== "PLANNED") {
    return { ok: false, error: "task_not_planned" };
  }
  if (!task.externalProviderId) {
    return { ok: false, error: "external_provider_required" };
  }
  if (!dependenciesCompleted(task, taskIndex(record))) {
    return { ok: false, error: "dependencies_incomplete" };
  }
  const frozenLabel = providerNameAtHandoff?.trim() || task.externalProviderLabel;
  if (!frozenLabel) {
    return { ok: false, error: "external_provider_required" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    record: replaceTask(record, {
      ...task,
      status: "OUTSIDE",
      externalProviderLabel: frozenLabel,
      handedOffAt,
      handedOffBy: actorId,
    }),
  };
}

export function recordExternalReturn(
  record: ExecutionPlanRecord,
  taskId: string,
  actorId: string,
  returnedAt: string,
): TaskMutationResult {
  const task = findTask(record, taskId);
  if (!task) {
    return { ok: false, error: "not_found" };
  }
  if (task.executionMode !== "EXTERNAL") {
    return { ok: false, error: "task_not_external" };
  }
  if (task.status === "COMPLETED" && task.returnedAt) {
    return { ok: true, record, alreadyApplied: true };
  }
  if (task.status !== "OUTSIDE") {
    return { ok: false, error: "task_not_outside" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    record: replaceTask(record, {
      ...task,
      status: "COMPLETED",
      completedAt: returnedAt,
      returnedAt,
      returnedBy: actorId,
    }),
  };
}

function findTask(record: ExecutionPlanRecord, taskId: string): ExecutionTask | undefined {
  return record.tasks.find((task) => task.taskId === taskId);
}

function taskIndex(record: ExecutionPlanRecord): ReadonlyMap<string, ExecutionTask> {
  return new Map(record.tasks.map((task) => [task.taskId, task]));
}

function replaceTask(record: ExecutionPlanRecord, task: ExecutionTask): ExecutionPlanRecord {
  return {
    ...record,
    tasks: record.tasks.map((item) => (item.taskId === task.taskId ? task : item)),
  };
}
