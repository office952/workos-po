import { CANONICAL_PRODUCT_CODE } from "../product/frontlitPlexiAl06.js";
import { getProductTemplate } from "../product/productRegistry.js";
import { getResource, type CostEvidence, costEvidence } from "../resources/catalog.js";
import {
  recipeForProcess,
  recipeKindLabel,
  recipeLifecycleLabel,
} from "../resources/recipes.js";
import { recipeGapForProcess, recipeGapLabel } from "../workcenters/recipeGap.js";
import {
  lettersProcessCompositionInspections,
  type ProcessCompositionInspection,
} from "./composition.js";
import {
  getProductionCapability,
  operationalProcesses,
  processProviderRequirement,
  providerRequirementLabel,
  processCategoryLabel,
  processLifecycleLabel,
  processReadinessLabel,
  processesForCapability,
  processesForCategory,
  productionCapabilityClasses,
  productionCapabilityKindLabel,
  PROCESS_CATEGORIES,
  type OperationalProcess,
  type ProcessCategory,
  type ProductionCapabilityClass,
} from "./catalog.js";
import {
  providerCoverageLabel,
  providerKindLabel,
  providerLifecycleLabel,
  type ProviderCoverageStatus,
  workcenterRegistry,
  type WorkcenterRegistry,
} from "../workcenters/catalog.js";
import { processProviderCoverage } from "../workcenters/projection.js";
import { coverageForCapability, providersForCapability } from "../workcenters/providers.js";
import { processWhereUsed, type ProcessUse } from "./whereUsed.js";

export type ProcessAdminRecord = {
  id: string;
  label: string;
  description: string;
  category: ProcessCategory;
  categoryLabel: string;
  requiredCapabilityId: string;
  requiredCapabilityLabel: string;
  requiredCapabilityKindLabel: string;
  providerRequirement: ReturnType<typeof processProviderRequirement>;
  providerRequirementLabel: string;
  outcome: string;
  lifecycleLabel: string;
  readinessLabel: string;
  readinessNote: string;
  resourceLinks: readonly { id: string; label: string }[];
  recipeId: string | null;
  recipeLabel: string | null;
  recipeKindLabel: string | null;
  recipeLifecycleLabel: string | null;
  recipeState: ReturnType<typeof recipeGapForProcess>;
  recipeStateLabel: string;
  usedBy: readonly ProcessUse[];
  providerCoverage: ProviderCoverageStatus;
  providerCoverageLabel: string;
  providers: NonNullable<ReturnType<typeof processProviderCoverage>>["providers"];
};

export type CapabilityAdminRecord = ProductionCapabilityClass & {
  kindLabel: string;
  processes: readonly ProcessAdminRecord[];
  providerCoverage: ProviderCoverageStatus;
  providerCoverageLabel: string;
  providers: NonNullable<ReturnType<typeof processProviderCoverage>>["providers"];
};

export type OperationalProcessesAdminProjection = {
  categories: readonly {
    id: ProcessCategory;
    label: string;
    processes: readonly ProcessAdminRecord[];
  }[];
  processes: readonly ProcessAdminRecord[];
  capabilities: readonly CapabilityAdminRecord[];
  compositions: readonly ProcessCompositionInspection[];
  writeState: "NOT_IMPLEMENTED";
};

export function projectOperationalProcessesAdministration(
  costEvidenceRows: readonly CostEvidence[] = costEvidence,
  registry: WorkcenterRegistry = workcenterRegistry,
): OperationalProcessesAdminProjection {
  const processes = operationalProcesses.map((process) =>
    toAdminRecord(process, costEvidenceRows, registry),
  );
  return {
    categories: PROCESS_CATEGORIES.map((category) => ({
      id: category,
      label: processCategoryLabel(category),
      processes: processesForCategory(category).map((process) =>
        toAdminRecord(process, costEvidenceRows, registry),
      ),
    })).filter((item) => item.processes.length > 0),
    processes,
    capabilities: productionCapabilityClasses.map((capability) => {
      const coverage = coverageForCapability(capability.id, registry);
      return {
        ...capability,
        kindLabel: productionCapabilityKindLabel(capability.kind),
        processes: processesForCapability(capability.id).map((process) =>
          toAdminRecord(process, costEvidenceRows, registry),
        ),
        providerCoverage: coverage,
        providerCoverageLabel: providerCoverageLabel(coverage),
        providers: providersForCapability(capability.id, registry).map((item) => ({
          kind: item.kind,
          kindLabel: providerKindLabel(item.kind),
          id: item.id,
          label: item.label,
          lifecycleLabel: providerLifecycleLabel(item.lifecycle),
        })),
      };
    }),
    compositions: lettersCompositions(),
    writeState: "NOT_IMPLEMENTED",
  };
}

function lettersCompositions(): ProcessCompositionInspection[] {
  const template = getProductTemplate(CANONICAL_PRODUCT_CODE);
  return template ? lettersProcessCompositionInspections(template) : [];
}

function toAdminRecord(
  process: OperationalProcess,
  evidenceRows: readonly CostEvidence[] = costEvidence,
  registry: WorkcenterRegistry = workcenterRegistry,
): ProcessAdminRecord {
  const capability = getProductionCapability(process.requiredCapabilityId);
  const coverage = processProviderCoverage(process.id, registry);
  const recipe = recipeForProcess(process.id);
  const recipeState = recipeGapForProcess(process.id, evidenceRows);
  return {
    id: process.id,
    label: process.label,
    description: process.description,
    category: process.category,
    categoryLabel: processCategoryLabel(process.category),
    requiredCapabilityId: process.requiredCapabilityId,
    requiredCapabilityLabel: capability?.label ?? process.requiredCapabilityId,
    requiredCapabilityKindLabel: capability
      ? productionCapabilityKindLabel(capability.kind)
      : process.requiredCapabilityId,
    providerRequirement: processProviderRequirement(process),
    providerRequirementLabel: providerRequirementLabel(processProviderRequirement(process)),
    outcome: process.outcome,
    lifecycleLabel: processLifecycleLabel(process.lifecycle),
    readinessLabel: processReadinessLabel(process.readiness),
    readinessNote: process.readinessNote,
    resourceLinks: process.resourceIds.map((id) => ({
      id,
      label: getResource(id)?.label ?? id,
    })),
    recipeId: recipe?.id ?? null,
    recipeLabel: recipe?.label ?? null,
    recipeKindLabel: recipe ? recipeKindLabel(recipe.kind) : null,
    recipeLifecycleLabel: recipe ? recipeLifecycleLabel(recipe.lifecycle) : null,
    recipeState,
    recipeStateLabel: recipeGapLabel(recipeState),
    usedBy: processWhereUsed(process.id),
    providerCoverage: coverage?.coverage ?? "NO_PROVIDER",
    providerCoverageLabel: coverage?.coverageLabel ?? providerCoverageLabel("NO_PROVIDER"),
    providers: coverage?.providers ?? [],
  };
}
