import {
  getProductionCapability,
  operationalProcesses,
  processesForCapability,
  type ProductionCapabilityClassId,
} from "../processes/catalog.js";
import {
  workcenterRegistry,
  type CapabilityProvider,
  type ProviderCoverageStatus,
  type WorkcenterRegistry,
} from "./catalog.js";

export function providersForCapability(
  capabilityId: ProductionCapabilityClassId,
  registry: WorkcenterRegistry = workcenterRegistry,
): readonly CapabilityProvider[] {
  const fromWorkcenters = registry.workcenters
    .filter((item) => item.capabilityIds.includes(capabilityId))
    .map((item) => toProvider("WORKCENTER", item));
  const fromMachines = registry.machines
    .filter((item) => item.capabilityIds.includes(capabilityId))
    .map((item) => toProvider("MACHINE", item));
  return [...fromWorkcenters, ...fromMachines];
}

export function coverageForCapability(
  capabilityId: ProductionCapabilityClassId,
  registry: WorkcenterRegistry = workcenterRegistry,
): ProviderCoverageStatus {
  const providers = providersForCapability(capabilityId, registry);
  if (providers.some((item) => item.lifecycle === "ACTIVE")) {
    return "COVERED";
  }
  if (providers.some((item) => item.lifecycle === "PLANNED")) {
    return "PROVIDER_PLANNED";
  }
  return "NO_PROVIDER";
}

export function processesForProvider(
  kind: CapabilityProvider["kind"],
  id: string,
  registry: WorkcenterRegistry = workcenterRegistry,
): readonly string[] {
  const provider =
    kind === "WORKCENTER" ? registry.getWorkcenter(id) : registry.getMachine(id);
  if (!provider) {
    return [];
  }
  return provider.capabilityIds.flatMap((capabilityId) =>
    processesForCapability(capabilityId).map((process) => process.id),
  );
}

export function providersForProcess(
  processId: string,
  registry: WorkcenterRegistry = workcenterRegistry,
): readonly CapabilityProvider[] {
  const process = operationalProcesses.find((item) => item.id === processId);
  if (!process) {
    return [];
  }
  return providersForCapability(process.requiredCapabilityId, registry);
}

export function knownCapability(capabilityId: ProductionCapabilityClassId): boolean {
  return Boolean(getProductionCapability(capabilityId));
}

function toProvider(
  kind: CapabilityProvider["kind"],
  item: {
    id: string;
    label: string;
    lifecycle: CapabilityProvider["lifecycle"];
    capabilityIds: readonly ProductionCapabilityClassId[];
  },
): CapabilityProvider {
  return {
    kind,
    id: item.id,
    label: item.label,
    lifecycle: item.lifecycle,
    capabilityIds: item.capabilityIds,
  };
}
