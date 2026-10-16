import type { ProductionCapabilityClassId } from "../processes/catalog.js";
import type { WorkcenterRegistry } from "../workcenters/catalog.js";
import {
  assignedProviderStillValid,
  executionModeOf,
  liveEligibleProviders,
  taskRequiresProvider,
  type AssignedExecutionProvider,
  type ExecutionEligibleProvider,
  type ExecutionTask,
} from "./plan.js";

export const PROVIDER_BINDING_SOURCES = ["MANUAL", "AUTO_UNIQUE"] as const;
export type ProviderBindingSource = (typeof PROVIDER_BINDING_SOURCES)[number];

export type ProviderBindingStamp = {
  source: ProviderBindingSource;
  boundAt: string;
  accountId: string | null;
  operatorId: string | null;
};

export const PROVIDER_BINDING_STATES = [
  "NOT_REQUIRED",
  "EXTERNAL",
  "ASSIGNED",
  "UNIQUE_PENDING",
  "NONE",
  "CHOICE_REQUIRED",
  "UNAVAILABLE",
] as const;
export type ProviderBindingState = (typeof PROVIDER_BINDING_STATES)[number];

export type ProviderBindingProjection = {
  state: ProviderBindingState;
  source: ProviderBindingSource | null;
  provider: ExecutionEligibleProvider | AssignedExecutionProvider | null;
  choices: readonly ExecutionEligibleProvider[];
  label: string | null;
};

type PhysicalResolution =
  | { ok: true; providers: ExecutionEligibleProvider[] }
  | { ok: false; reason: "ambiguous_representation"; providers: ExecutionEligibleProvider[] };

/**
 * ACTIVE machines are physical providers. A workcenter is a separate choice only
 * when it is not merely the zone that hosts those same active machines.
 * A mixed zone/machine representation that cannot be collapsed is ambiguous:
 * auto-binding must not guess.
 */
export function physicalEligibleProviders(
  capabilityId: string,
  registry: WorkcenterRegistry,
): PhysicalResolution {
  const live = liveEligibleProviders(capabilityId, registry);
  const machines = live.filter((item) => item.kind === "MACHINE");
  const workcenters = live.filter((item) => item.kind === "WORKCENTER");
  const physical: ExecutionEligibleProvider[] = [...machines];
  let ambiguous = false;
  for (const workcenter of workcenters) {
    const hostedActive = registry.machines.filter(
      (machine) =>
        machine.workcenterId === workcenter.id &&
        machine.lifecycle === "ACTIVE" &&
        machine.capabilityIds.includes(capabilityId as ProductionCapabilityClassId),
    );
    if (hostedActive.length === 0) {
      physical.push(workcenter);
      continue;
    }
    const hostedLive = hostedActive.filter((machine) =>
      machines.some((item) => item.id === machine.id),
    );
    if (hostedLive.length !== hostedActive.length) {
      ambiguous = true;
      continue;
    }
  }
  if (ambiguous) {
    return { ok: false, reason: "ambiguous_representation", providers: live };
  }
  return { ok: true, providers: physical };
}

export function resolveProviderBinding(
  task: Pick<
    ExecutionTask,
    | "providerRequirement"
    | "requiredCapabilityId"
    | "assignedProvider"
    | "status"
    | "executionMode"
    | "providerBindingSource"
  >,
  registry: WorkcenterRegistry,
): ProviderBindingProjection {
  if (executionModeOf(task) === "EXTERNAL") {
    return emptyBinding("EXTERNAL");
  }
  if (!taskRequiresProvider(task)) {
    return emptyBinding("NOT_REQUIRED");
  }
  if (task.assignedProvider) {
    const stillValid = assignedProviderStillValid(
      task.requiredCapabilityId,
      task.assignedProvider,
      registry,
    );
    return {
      state: stillValid ? "ASSIGNED" : "UNAVAILABLE",
      source: task.providerBindingSource ?? null,
      provider: task.assignedProvider,
      choices: [],
      label: stillValid
        ? task.providerBindingSource === "AUTO_UNIQUE"
          ? `Asociat automat: ${task.assignedProvider.label}`
          : task.assignedProvider.label
        : "Utilajul alocat nu mai este eligibil",
    };
  }
  if (task.status !== "PLANNED") {
    return emptyBinding("NONE");
  }
  const physical = physicalEligibleProviders(task.requiredCapabilityId, registry);
  if (!physical.ok || physical.providers.length > 1) {
    return {
      state: "CHOICE_REQUIRED",
      source: null,
      provider: null,
      choices: physical.providers,
      label: null,
    };
  }
  if (physical.providers.length === 0) {
    return emptyBinding("NONE");
  }
  const provider = physical.providers[0] ?? null;
  return {
    state: "UNIQUE_PENDING",
    source: null,
    provider,
    choices: provider ? [provider] : [],
    label: provider ? `Se asociază automat: ${provider.label}` : null,
  };
}

function emptyBinding(state: ProviderBindingState): ProviderBindingProjection {
  return { state, source: null, provider: null, choices: [], label: null };
}
