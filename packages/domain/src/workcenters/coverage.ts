import {
  getOperationalProcess,
  PRODUCTION_CAPABILITY_CLASS_IDS,
  type ProductionCapabilityClassId,
} from "../processes/catalog.js";
import { lettersProcessCompositionInspections } from "../processes/composition.js";
import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import { getProductTemplate } from "../product/productRegistry.js";
import {
  workcenterRegistry,
  type ProviderCoverageStatus,
  type WorkcenterRegistry,
} from "./catalog.js";
import { coverageForCapability, providersForCapability } from "./providers.js";

export type CapabilityCoverageRecord = {
  capabilityId: ProductionCapabilityClassId;
  status: ProviderCoverageStatus;
  providerIds: readonly string[];
};

export type ProcessProviderCoverage = {
  processId: string;
  processLabel: string;
  capabilityId: ProductionCapabilityClassId;
  status: ProviderCoverageStatus;
  providerIds: readonly string[];
};

export type LettersCompositionCoverage = {
  inspectionId: string;
  label: string;
  processes: readonly ProcessProviderCoverage[];
};

export type LettersCapabilityCoverage = {
  productCode: string;
  requiredCapabilityIds: readonly ProductionCapabilityClassId[];
  coveredCapabilityIds: readonly ProductionCapabilityClassId[];
  plannedCapabilityIds: readonly ProductionCapabilityClassId[];
  missingCapabilityIds: readonly ProductionCapabilityClassId[];
  compositions: readonly LettersCompositionCoverage[];
};

export function catalogCapabilityCoverage(
  registry: WorkcenterRegistry = workcenterRegistry,
): readonly CapabilityCoverageRecord[] {
  return PRODUCTION_CAPABILITY_CLASS_IDS.map((capabilityId) => ({
    capabilityId,
    status: coverageForCapability(capabilityId, registry),
    providerIds: providersForCapability(capabilityId, registry).map((item) => item.id),
  }));
}

export function lettersCapabilityCoverage(
  registry: WorkcenterRegistry = workcenterRegistry,
): LettersCapabilityCoverage {
  const template = getProductTemplate(CANONICAL_PRODUCT_CODE);
  const inspections = template ? lettersProcessCompositionInspections(template) : [];
  const compositions = inspections.map((inspection) => ({
    inspectionId: inspection.id,
    label: inspection.label,
    processes: uniqueProcessCoverage(inspection.composition.nodes.map((node) => node.processId), registry),
  }));
  const required = uniqueCapabilityIds(
    compositions.flatMap((item) => item.processes.map((process) => process.capabilityId)),
  );
  return {
    productCode: CANONICAL_PRODUCT_CODE,
    requiredCapabilityIds: required,
    coveredCapabilityIds: required.filter(
      (id) => coverageForCapability(id, registry) === "COVERED",
    ),
    plannedCapabilityIds: required.filter(
      (id) => coverageForCapability(id, registry) === "PROVIDER_PLANNED",
    ),
    missingCapabilityIds: required.filter(
      (id) => coverageForCapability(id, registry) === "NO_PROVIDER",
    ),
    compositions,
  };
}

function uniqueProcessCoverage(
  processIds: readonly string[],
  registry: WorkcenterRegistry,
): ProcessProviderCoverage[] {
  const seen = new Set<string>();
  const records: ProcessProviderCoverage[] = [];
  for (const processId of processIds) {
    if (seen.has(processId)) {
      continue;
    }
    seen.add(processId);
    const process = getOperationalProcess(processId);
    if (!process) {
      continue;
    }
    records.push({
      processId: process.id,
      processLabel: process.label,
      capabilityId: process.requiredCapabilityId,
      status: coverageForCapability(process.requiredCapabilityId, registry),
      providerIds: providersForCapability(process.requiredCapabilityId, registry).map(
        (item) => item.id,
      ),
    });
  }
  return records;
}

function uniqueCapabilityIds(
  ids: readonly ProductionCapabilityClassId[],
): ProductionCapabilityClassId[] {
  return PRODUCTION_CAPABILITY_CLASS_IDS.filter((id) => ids.includes(id));
}
