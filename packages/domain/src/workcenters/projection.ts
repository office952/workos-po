import {
  getProductionCapability,
  operationalProcesses,
  productionCapabilityClasses,
  productionCapabilityKindLabel,
  processesForCapability,
  type ProductionCapabilityClassId,
} from "../processes/catalog.js";
import {
  providerCoverageLabel,
  providerKindLabel,
  providerLifecycleLabel,
  workcenterRegistry,
  type CapabilityProvider,
  type Machine,
  type ProviderCoverageStatus,
  type Workcenter,
  type WorkcenterRegistry,
} from "./catalog.js";
import { lettersCapabilityCoverage } from "./coverage.js";
import type { CostEvidence } from "../resources/catalog.js";
import { coverageForCapability, providersForCapability } from "./providers.js";
import {
  recipeGapForProcess,
  recipeGapLabel,
  recipeGapsForCapability,
  type RecipeGapRow,
  type RecipeGapState,
} from "./recipeGap.js";
import { providerWhereUsed } from "./whereUsed.js";

export type ProviderSummary = {
  kind: CapabilityProvider["kind"];
  kindLabel: string;
  id: string;
  label: string;
  lifecycleLabel: string;
};

export type WorkcenterAdminRecord = Workcenter & {
  lifecycleLabel: string;
  capabilityLabels: readonly string[];
  processLabels: readonly string[];
  machineLabels: readonly string[];
  usedBy: readonly string[];
};

export type MachineAdminRecord = Machine & {
  lifecycleLabel: string;
  workcenterLabel: string | null;
  capabilityLabels: readonly string[];
  processLabels: readonly string[];
  recipeRows: readonly RecipeGapRow[];
  usedBy: readonly string[];
};

export type CapabilityProviderAdminRecord = {
  id: string;
  label: string;
  kindLabel: string;
  description: string;
  coverage: ProviderCoverageStatus;
  coverageLabel: string;
  providers: readonly ProviderSummary[];
  requiredByProcesses: readonly { id: string; label: string }[];
};

export type ProcessCoverageAdminRecord = {
  processId: string;
  processLabel: string;
  capabilityId: string;
  capabilityLabel: string;
  coverage: ProviderCoverageStatus;
  coverageLabel: string;
  recipeState: RecipeGapState;
  recipeStateLabel: string;
  providers: readonly ProviderSummary[];
};

export type ServiceMapRow = {
  providerKind: CapabilityProvider["kind"];
  providerKindLabel: string;
  providerId: string;
  providerLabel: string;
  workcenterLabel: string | null;
  capabilityId: ProductionCapabilityClassId;
  capabilityLabel: string;
  processId: string | null;
  processLabel: string | null;
  recipeState: RecipeGapState;
  recipeStateLabel: string;
};

export type WorkcentersAdminProjection = {
  overview: {
    workcenterCount: number;
    machineCount: number;
    coveredCapabilityCount: number;
    plannedCapabilityCount: number;
    missingCapabilityCount: number;
    canonicalCostExistsCount: number;
    serviceRecipeMissingCount: number;
    laborRecipeMissingCount: number;
    capacityPlanningState: "NOT_IMPLEMENTED";
    schedulingState: "NOT_IMPLEMENTED";
    executionState: "NOT_IMPLEMENTED";
    peopleState: "NOT_IMPLEMENTED";
    writeState: "NOT_IMPLEMENTED";
  };
  workcenters: readonly WorkcenterAdminRecord[];
  machines: readonly MachineAdminRecord[];
  capabilities: readonly CapabilityProviderAdminRecord[];
  processCoverage: readonly ProcessCoverageAdminRecord[];
  serviceMap: readonly ServiceMapRow[];
  lettersCoverage: {
    productCode: string;
    coveredCapabilityIds: readonly string[];
    plannedCapabilityIds: readonly string[];
    missingCapabilityIds: readonly string[];
    compositions: readonly {
      inspectionId: string;
      label: string;
      processes: readonly ProcessCoverageAdminRecord[];
    }[];
  };
  writeState: "NOT_IMPLEMENTED";
};

export function projectWorkcentersAdministration(
  registry: WorkcenterRegistry = workcenterRegistry,
  costEvidenceRows?: readonly CostEvidence[],
): WorkcentersAdminProjection {
  const capabilityRecords = productionCapabilityClasses.map((capability) =>
    toCapabilityRecord(capability.id, registry),
  );
  const processCoverage = operationalProcesses.map((process) =>
    toProcessCoverage(
      process.id,
      process.label,
      process.requiredCapabilityId,
      registry,
      costEvidenceRows,
    ),
  );
  const serviceMap = buildServiceMap(registry);
  const letters = lettersCapabilityCoverage(registry);
  return {
    overview: {
      workcenterCount: registry.workcenters.length,
      machineCount: registry.machines.length,
      coveredCapabilityCount: capabilityRecords.filter((item) => item.coverage === "COVERED")
        .length,
      plannedCapabilityCount: capabilityRecords.filter(
        (item) => item.coverage === "PROVIDER_PLANNED",
      ).length,
      missingCapabilityCount: capabilityRecords.filter((item) => item.coverage === "NO_PROVIDER")
        .length,
      canonicalCostExistsCount: processCoverage.filter(
        (item) => item.recipeState === "CANONICAL_COST_EXISTS",
      ).length,
      serviceRecipeMissingCount: processCoverage.filter(
        (item) => item.recipeState === "SERVICE_RECIPE_MISSING",
      ).length,
      laborRecipeMissingCount: processCoverage.filter(
        (item) => item.recipeState === "LABOR_RECIPE_MISSING",
      ).length,
      capacityPlanningState: "NOT_IMPLEMENTED",
      schedulingState: "NOT_IMPLEMENTED",
      executionState: "NOT_IMPLEMENTED",
      peopleState: "NOT_IMPLEMENTED",
      writeState: "NOT_IMPLEMENTED",
    },
    workcenters: registry.workcenters.map((item) => toWorkcenterRecord(item, registry)),
    machines: registry.machines.map((item) => toMachineRecord(item, registry)),
    capabilities: capabilityRecords,
    processCoverage,
    serviceMap,
    lettersCoverage: {
      productCode: letters.productCode,
      coveredCapabilityIds: letters.coveredCapabilityIds,
      plannedCapabilityIds: letters.plannedCapabilityIds,
      missingCapabilityIds: letters.missingCapabilityIds,
      compositions: letters.compositions.map((item) => ({
        inspectionId: item.inspectionId,
        label: item.label,
        processes: item.processes.map((process) =>
          toProcessCoverage(
            process.processId,
            process.processLabel,
            process.capabilityId,
            registry,
          ),
        ),
      })),
    },
    writeState: "NOT_IMPLEMENTED",
  };
}

export function processProviderCoverage(
  processId: string,
  registry: WorkcenterRegistry = workcenterRegistry,
): ProcessCoverageAdminRecord | undefined {
  const process = operationalProcesses.find((item) => item.id === processId);
  if (!process) {
    return undefined;
  }
  return toProcessCoverage(
    process.id,
    process.label,
    process.requiredCapabilityId,
    registry,
  );
}

function toWorkcenterRecord(
  workcenter: Workcenter,
  registry: WorkcenterRegistry,
): WorkcenterAdminRecord {
  return {
    ...workcenter,
    lifecycleLabel: providerLifecycleLabel(workcenter.lifecycle),
    capabilityLabels: workcenter.capabilityIds.map(capabilityLabel),
    processLabels: uniqueLines([
      ...workcenter.capabilityIds.flatMap((capabilityId) =>
        processesForCapability(capabilityId).map((item) => item.label),
      ),
      ...registry.machines
        .filter((item) => item.workcenterId === workcenter.id)
        .flatMap((machine) =>
          machine.capabilityIds.flatMap((capabilityId) =>
            processesForCapability(capabilityId).map((item) => item.label),
          ),
        ),
    ]),
    machineLabels: registry.machines
      .filter((item) => item.workcenterId === workcenter.id)
      .map((item) => item.label),
    usedBy: uniqueLines(
      providerWhereUsed("WORKCENTER", workcenter.id, registry).map((item) => item.displayLine),
    ),
  };
}

function toMachineRecord(
  machine: Machine,
  registry: WorkcenterRegistry,
): MachineAdminRecord {
  return {
    ...machine,
    lifecycleLabel: providerLifecycleLabel(machine.lifecycle),
    workcenterLabel: machine.workcenterId
      ? (registry.getWorkcenter(machine.workcenterId)?.label ?? machine.workcenterId)
      : null,
    capabilityLabels: machine.capabilityIds.map(capabilityLabel),
    processLabels: uniqueLines(
      machine.capabilityIds.flatMap((capabilityId) =>
        processesForCapability(capabilityId).map((item) => item.label),
      ),
    ),
    recipeRows: machine.capabilityIds.flatMap((capabilityId) =>
      recipeGapsForCapability(capabilityId),
    ),
    usedBy: uniqueLines(
      providerWhereUsed("MACHINE", machine.id, registry).map((item) => item.displayLine),
    ),
  };
}

function toCapabilityRecord(
  capabilityId: ProductionCapabilityClassId,
  registry: WorkcenterRegistry,
): CapabilityProviderAdminRecord {
  const capability = getProductionCapability(capabilityId);
  const coverage = coverageForCapability(capabilityId, registry);
  return {
    id: capabilityId,
    label: capability?.label ?? capabilityId,
    kindLabel: capability ? productionCapabilityKindLabel(capability.kind) : capabilityId,
    description: capability?.description ?? "",
    coverage,
    coverageLabel: providerCoverageLabel(coverage),
    providers: providersForCapability(capabilityId, registry).map(toProviderSummary),
    requiredByProcesses: processesForCapability(capabilityId).map((item) => ({
      id: item.id,
      label: item.label,
    })),
  };
}

function toProcessCoverage(
  processId: string,
  processLabel: string,
  capabilityId: ProductionCapabilityClassId,
  registry: WorkcenterRegistry,
  costEvidenceRows?: readonly CostEvidence[],
): ProcessCoverageAdminRecord {
  const coverage = coverageForCapability(capabilityId, registry);
  const recipeState = recipeGapForProcess(processId, costEvidenceRows);
  return {
    processId,
    processLabel,
    capabilityId,
    capabilityLabel: capabilityLabel(capabilityId),
    coverage,
    coverageLabel: providerCoverageLabel(coverage),
    recipeState,
    recipeStateLabel: recipeGapLabel(recipeState),
    providers: providersForCapability(capabilityId, registry).map(toProviderSummary),
  };
}

function buildServiceMap(registry: WorkcenterRegistry): ServiceMapRow[] {
  const rows: ServiceMapRow[] = [];
  for (const workcenter of registry.workcenters) {
    for (const capabilityId of workcenter.capabilityIds) {
      for (const gap of recipeGapsForCapability(capabilityId)) {
        rows.push({
          providerKind: "WORKCENTER",
          providerKindLabel: providerKindLabel("WORKCENTER"),
          providerId: workcenter.id,
          providerLabel: workcenter.label,
          workcenterLabel: workcenter.label,
          capabilityId,
          capabilityLabel: gap.capabilityLabel,
          processId: gap.processId,
          processLabel: gap.processLabel,
          recipeState: gap.state,
          recipeStateLabel: gap.stateLabel,
        });
      }
    }
  }
  for (const machine of registry.machines) {
    const workcenterLabel = machine.workcenterId
      ? (registry.getWorkcenter(machine.workcenterId)?.label ?? machine.workcenterId)
      : null;
    for (const capabilityId of machine.capabilityIds) {
      for (const gap of recipeGapsForCapability(capabilityId)) {
        rows.push({
          providerKind: "MACHINE",
          providerKindLabel: providerKindLabel("MACHINE"),
          providerId: machine.id,
          providerLabel: machine.label,
          workcenterLabel,
          capabilityId,
          capabilityLabel: gap.capabilityLabel,
          processId: gap.processId,
          processLabel: gap.processLabel,
          recipeState: gap.state,
          recipeStateLabel: gap.stateLabel,
        });
      }
    }
  }
  return rows;
}

function toProviderSummary(provider: CapabilityProvider): ProviderSummary {
  return {
    kind: provider.kind,
    kindLabel: providerKindLabel(provider.kind),
    id: provider.id,
    label: provider.label,
    lifecycleLabel: providerLifecycleLabel(provider.lifecycle),
  };
}

function capabilityLabel(capabilityId: ProductionCapabilityClassId): string {
  return getProductionCapability(capabilityId)?.label ?? capabilityId;
}

function uniqueLines(lines: readonly string[]): string[] {
  return [...new Set(lines)];
}
