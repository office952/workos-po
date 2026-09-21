import {
  PRODUCTION_CAPABILITY_CLASS_IDS,
  type ProductionCapabilityClassId,
} from "../processes/catalog.js";
import {
  PROVIDER_LIFECYCLES,
  type Machine,
  type ProviderLifecycle,
  type Workcenter,
} from "./catalog.js";

export const PROVIDER_LABEL_MAX_LENGTH = 80;
export const PROVIDER_DESCRIPTION_MAX_LENGTH = 400;

export const PROVIDER_MUTATION_ERRORS = [
  "invalid_label",
  "invalid_description",
  "invalid_capability",
  "invalid_lifecycle",
  "invalid_workcenter",
  "not_found",
  "already_retired",
  "provider_referenced",
  "has_open_assignment",
  "has_active_machines",
] as const;
export type ProviderMutationError = (typeof PROVIDER_MUTATION_ERRORS)[number];

export type ProviderMutationResult<T> =
  | { ok: true; value: T; alreadyApplied: boolean }
  | { ok: false; error: ProviderMutationError };

export type ProviderHistoryContext = {
  referencedByHistory: boolean;
  hasOpenAssignment: boolean;
};

export type WorkcenterCreateInput = {
  label: string;
  description?: string | null;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: readonly string[];
  workcenterId?: string;
};

export type MachineCreateInput = {
  label: string;
  description?: string | null;
  workcenterId: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: readonly string[];
  machineId?: string;
};

export type WorkcenterPatch = {
  label?: string;
  description?: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: readonly string[];
};

export type MachinePatch = {
  label?: string;
  description?: string;
  workcenterId?: string;
  lifecycle?: ProviderLifecycle;
  capabilityIds?: readonly string[];
};

export function generateWorkcenterId(): string {
  return `wc:${crypto.randomUUID()}`;
}

export function generateMachineId(): string {
  return `mch:${crypto.randomUUID()}`;
}

export function createWorkcenter(
  input: WorkcenterCreateInput,
): ProviderMutationResult<Workcenter> {
  const label = readLabel(input.label);
  if (!label) {
    return { ok: false, error: "invalid_label" };
  }
  const description = readDescription(input.description);
  if (description === null) {
    return { ok: false, error: "invalid_description" };
  }
  const lifecycle = input.lifecycle ?? "PLANNED";
  if (!isLifecycle(lifecycle) || lifecycle === "RETIRED") {
    return { ok: false, error: "invalid_lifecycle" };
  }
  const capabilityIds = readCapabilityIds(input.capabilityIds ?? []);
  if (!capabilityIds) {
    return { ok: false, error: "invalid_capability" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    value: {
      id: input.workcenterId ?? generateWorkcenterId(),
      label,
      description,
      lifecycle,
      capabilityIds,
    },
  };
}

export function createMachine(
  input: MachineCreateInput,
  workcenters: readonly Workcenter[],
): ProviderMutationResult<Machine> {
  const label = readLabel(input.label);
  if (!label) {
    return { ok: false, error: "invalid_label" };
  }
  const description = readDescription(input.description);
  if (description === null) {
    return { ok: false, error: "invalid_description" };
  }
  const lifecycle = input.lifecycle ?? "PLANNED";
  if (!isLifecycle(lifecycle) || lifecycle === "RETIRED") {
    return { ok: false, error: "invalid_lifecycle" };
  }
  const capabilityIds = readCapabilityIds(input.capabilityIds ?? []);
  if (!capabilityIds) {
    return { ok: false, error: "invalid_capability" };
  }
  const workcenter = workcenters.find((item) => item.id === input.workcenterId);
  if (!workcenter || workcenter.lifecycle === "RETIRED") {
    return { ok: false, error: "invalid_workcenter" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    value: {
      id: input.machineId ?? generateMachineId(),
      label,
      description,
      workcenterId: workcenter.id,
      lifecycle,
      capabilityIds,
    },
  };
}

export function updateWorkcenter(
  current: Workcenter,
  patch: WorkcenterPatch,
  history: ProviderHistoryContext,
  machines: readonly Machine[],
): ProviderMutationResult<Workcenter> {
  if (current.lifecycle === "RETIRED") {
    if (isRetireOnly(patch, current)) {
      return { ok: true, alreadyApplied: true, value: current };
    }
    return { ok: false, error: "already_retired" };
  }
  const next = applySharedPatch(current, patch, history);
  if (!next.ok) {
    return next;
  }
  if (next.value.lifecycle === "RETIRED") {
    if (history.hasOpenAssignment) {
      return { ok: false, error: "has_open_assignment" };
    }
    if (machines.some((item) => item.workcenterId === current.id && item.lifecycle !== "RETIRED")) {
      return { ok: false, error: "has_active_machines" };
    }
  }
  if (sameWorkcenter(current, next.value)) {
    return { ok: true, alreadyApplied: true, value: current };
  }
  return next;
}

export function updateMachine(
  current: Machine,
  patch: MachinePatch,
  history: ProviderHistoryContext,
  workcenters: readonly Workcenter[],
): ProviderMutationResult<Machine> {
  if (current.lifecycle === "RETIRED") {
    if (isRetireOnly(patch, current) && patch.workcenterId === undefined) {
      return { ok: true, alreadyApplied: true, value: current };
    }
    return { ok: false, error: "already_retired" };
  }
  const workcenterId = patch.workcenterId ?? current.workcenterId;
  if (!workcenterId) {
    return { ok: false, error: "invalid_workcenter" };
  }
  if (workcenterId !== current.workcenterId) {
    if (history.referencedByHistory) {
      return { ok: false, error: "provider_referenced" };
    }
    const workcenter = workcenters.find((item) => item.id === workcenterId);
    if (!workcenter || workcenter.lifecycle === "RETIRED") {
      return { ok: false, error: "invalid_workcenter" };
    }
  }
  const next = applySharedPatch(current, patch, history);
  if (!next.ok) {
    return next;
  }
  if (next.value.lifecycle === "RETIRED" && history.hasOpenAssignment) {
    return { ok: false, error: "has_open_assignment" };
  }
  const moved: Machine = { ...next.value, workcenterId };
  if (sameMachine(current, moved)) {
    return { ok: true, alreadyApplied: true, value: current };
  }
  return { ok: true, alreadyApplied: false, value: moved };
}

function applySharedPatch<T extends { label: string; description: string; lifecycle: ProviderLifecycle; capabilityIds: readonly ProductionCapabilityClassId[] }>(
  current: T,
  patch: { label?: string; description?: string; lifecycle?: ProviderLifecycle; capabilityIds?: readonly string[] },
  history: ProviderHistoryContext,
): ProviderMutationResult<T> {
  const label = patch.label === undefined ? current.label : readLabel(patch.label);
  if (!label) {
    return { ok: false, error: "invalid_label" };
  }
  const description =
    patch.description === undefined ? current.description : readDescription(patch.description);
  if (description === null) {
    return { ok: false, error: "invalid_description" };
  }
  const lifecycle = patch.lifecycle ?? current.lifecycle;
  if (!isLifecycle(lifecycle)) {
    return { ok: false, error: "invalid_lifecycle" };
  }
  const capabilityIds =
    patch.capabilityIds === undefined
      ? [...current.capabilityIds]
      : readCapabilityIds(patch.capabilityIds);
  if (!capabilityIds) {
    return { ok: false, error: "invalid_capability" };
  }
  if (
    history.referencedByHistory &&
    capabilitiesChanged(current.capabilityIds, capabilityIds)
  ) {
    return { ok: false, error: "provider_referenced" };
  }
  if (lifecycle === "RETIRED" && history.hasOpenAssignment) {
    return { ok: false, error: "has_open_assignment" };
  }
  return {
    ok: true,
    alreadyApplied: false,
    value: {
      ...current,
      label,
      description,
      lifecycle,
      capabilityIds,
    },
  };
}

function isRetireOnly(
  patch: { label?: string; description?: string; lifecycle?: ProviderLifecycle; capabilityIds?: readonly string[] },
  current: { label: string; description: string; capabilityIds: readonly ProductionCapabilityClassId[] },
): boolean {
  if (patch.lifecycle !== undefined && patch.lifecycle !== "RETIRED") {
    return false;
  }
  if (patch.label !== undefined && readLabel(patch.label) !== current.label) {
    return false;
  }
  if (
    patch.description !== undefined &&
    readDescription(patch.description) !== current.description
  ) {
    return false;
  }
  if (
    patch.capabilityIds !== undefined &&
    capabilitiesChanged(current.capabilityIds, patch.capabilityIds)
  ) {
    return false;
  }
  return true;
}

function readLabel(value: string): string | null {
  const label = value.trim();
  if (label.length === 0 || label.length > PROVIDER_LABEL_MAX_LENGTH) {
    return null;
  }
  return label;
}

function readDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return "";
  }
  if (value.length > PROVIDER_DESCRIPTION_MAX_LENGTH) {
    return null;
  }
  return value;
}

function readCapabilityIds(
  value: readonly string[],
): ProductionCapabilityClassId[] | null {
  const ids: ProductionCapabilityClassId[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!isCapabilityId(item) || seen.has(item)) {
      return null;
    }
    seen.add(item);
    ids.push(item);
  }
  return ids;
}

function isCapabilityId(value: string): value is ProductionCapabilityClassId {
  return (PRODUCTION_CAPABILITY_CLASS_IDS as readonly string[]).includes(value);
}

function isLifecycle(value: string): value is ProviderLifecycle {
  return (PROVIDER_LIFECYCLES as readonly string[]).includes(value);
}

function capabilitiesChanged(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return true;
  }
  const rightSet = new Set(right);
  return left.some((item) => !rightSet.has(item));
}

function sameWorkcenter(left: Workcenter, right: Workcenter): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.description === right.description &&
    left.lifecycle === right.lifecycle &&
    !capabilitiesChanged(left.capabilityIds, right.capabilityIds)
  );
}

function sameMachine(left: Machine, right: Machine): boolean {
  return (
    sameWorkcenter(left, right) && left.workcenterId === right.workcenterId
  );
}
