import type { ComponentRole } from "../product/types.js";
import { getComponentType } from "../product/componentTypes.js";
import {
  costClassificationLabel,
  VOLUME_DEPTH_COST_EVIDENCE_QUALIFIER,
  costEvidence,
  costEvidenceQualifierFieldsFor,
  costEvidenceQualifierIdentity,
  costSourceLabel,
  getMaterialFamily,
  getResource,
  listCostEvidenceFrom,
  listLaborResources,
  listServiceResources,
  lookupCostEvidence,
  materialFamilies,
  resourceCatalog,
  resourceKindLabel,
  resourceUnitLabel,
  type CostEvidence,
  type CostEvidenceQualifierField,
  type MaterialFamily,
  type ResourceDefinition,
} from "./catalog.js";
import { getOperationalProcess } from "../processes/catalog.js";
import {
  expectedRecipeKindForProcess,
  getCostRecipe,
  processesMissingRecipe,
  recipeKindLabel,
  recipeLifecycleLabel,
  recipeQuantityBasisLabel,
  recipesOfKind,
  type CostRecipe,
  type RecipeKind,
} from "./recipes.js";
import { getProductTemplate } from "../product/productRegistry.js";
import {
  listProductTemplateResourceUsages,
  projectProductTemplateResourceUsage,
  type ProductTemplateResourceUsage,
} from "./productTemplateUsage.js";
import { resourceWhereUsed, type ResourceUse } from "./whereUsed.js";
import { calendarDateCoversAsOf } from "../calendarDate.js";

export type ResourceUseProjection = ResourceUse & {
  roleLabel: string;
  typeLabel: string;
  displayLine: string;
};

export type ResourceCostProjection = {
  amount: number;
  currency: CostEvidence["currency"];
  unitLabel: string;
  sourceLabel: string;
  classificationLabel: string;
  note: string;
  amountDisplay: string;
  supplierLabel?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  validityState?: "current" | "expired";
};

export type ResourceAdminRecord = {
  id: string;
  label: string;
  kind: ResourceDefinition["kind"];
  kindLabel: string;
  unit: ResourceDefinition["unit"];
  unitLabel: string;
  familyId: string | null;
  familyLabel: string | null;
  formLabel: string | null;
  thicknessLabel: string | null;
  opticalLabel: string | null;
  voltageLabel: string | null;
  capacityLabel: string | null;
  usedBy: readonly ResourceUseProjection[];
  cost: ResourceCostProjection | null;
  costEvidenceQualifiers: readonly CostEvidenceQualifierField[];
};

export type RecipeAdminRecord = {
  id: string;
  kind: RecipeKind;
  kindLabel: string;
  label: string;
  description: string;
  lifecycleLabel: string;
  completenessLabel: string;
  processLabels: readonly string[];
  quantityBasisLabel: string;
  unitLabel: string;
  costEvidenceId: string;
  costEvidenceLabel: string;
  cost: ResourceCostProjection | null;
};

export type MissingRecipeAdminRecord = {
  processId: string;
  processLabel: string;
  kind: RecipeKind;
  kindLabel: string;
  completenessLabel: string;
};

export type ResourcesAdminProjection = {
  families: readonly (MaterialFamily & {
    specifications: readonly ResourceAdminRecord[];
  })[];
  materials: readonly ResourceAdminRecord[];
  services: readonly ResourceAdminRecord[];
  labor: readonly ResourceAdminRecord[];
  serviceRecipes: readonly RecipeAdminRecord[];
  laborRecipes: readonly RecipeAdminRecord[];
  missingServiceRecipes: readonly MissingRecipeAdminRecord[];
  missingLaborRecipes: readonly MissingRecipeAdminRecord[];
  costEvidence: readonly (ResourceCostProjection & {
    resourceId: string;
    resourceLabel: string;
    kindLabel: string;
    evidenceRowId: string | null;
    lastChangedAt: string | null;
    qualifierIdentity: string;
    qualifierLabel: string | null;
    qualifier: {
      kind: CostEvidenceQualifierField["kind"];
      label: string;
      unitLabel: string;
      value: number;
    } | null;
    usedBy: readonly ResourceUseProjection[];
  })[];
  templateUsages: readonly ProductTemplateResourceUsage[];
  writeState: "READY" | "NOT_IMPLEMENTED";
};

export function projectResourcesAdministration(
  evidenceRows: readonly CostEvidence[] = costEvidence,
  asOf = new Date().toISOString(),
): ResourcesAdminProjection {
  const materials = resourceCatalog
    .filter((item) => item.kind === "MATERIAL")
    .map((item) => toAdminRecord(item, evidenceRows, asOf));
  const services = listServiceResources().map((item) => toAdminRecord(item, evidenceRows, asOf));
  const labor = listLaborResources().map((item) => toAdminRecord(item, evidenceRows, asOf));
  const writable = evidenceRows.every((item) => Boolean(item.evidenceRowId));
  return {
    families: materialFamilies.map((family) => ({
      ...family,
      specifications: materials.filter((item) => item.familyId === family.id),
    })),
    materials,
    services,
    labor,
    serviceRecipes: recipesOfKind("SERVICE").map((recipe) =>
      toRecipeRecord(recipe, evidenceRows, asOf),
    ),
    laborRecipes: recipesOfKind("LABOR").map((recipe) => toRecipeRecord(recipe, evidenceRows, asOf)),
    missingServiceRecipes: processesMissingRecipe("SERVICE").map(toMissingRecipe),
    missingLaborRecipes: processesMissingRecipe("LABOR").map(toMissingRecipe),
    costEvidence: evidenceRows.map((item) => projectCostEvidenceAdminRow(item, asOf)),
    templateUsages: listProductTemplateResourceUsages(evidenceRows, asOf),
    writeState: writable && evidenceRows.length > 0 ? "READY" : "NOT_IMPLEMENTED",
  };
}

export type ResourcesAdministrationWriteStats = {
  costEvidenceRowsRebuilt: number;
  resourceRecordsRebuilt: number;
  recipeRecordsRebuilt: number;
  templateUsagesRebuilt: number;
};

export function applyResourcesAdministrationWrite(
  current: ResourcesAdminProjection,
  nextEvidenceRows: readonly CostEvidence[],
  mutated: CostEvidence,
  asOf: string,
): { admin: ResourcesAdminProjection; stats: ResourcesAdministrationWriteStats } {
  const resource = getResource(mutated.resourceId);
  const slot = costEvidenceQualifierIdentity(mutated.when);
  let costEvidenceRowsRebuilt = 0;
  const costEvidenceRows = nextEvidenceRows.map((item) => {
    const identity = costEvidenceQualifierIdentity(item.when);
    if (item.resourceId === mutated.resourceId && identity === slot) {
      costEvidenceRowsRebuilt += 1;
      return projectCostEvidenceAdminRow(item, asOf);
    }
    const kept = current.costEvidence.find(
      (row) => row.resourceId === item.resourceId && row.qualifierIdentity === identity,
    );
    return kept ?? projectCostEvidenceAdminRow(item, asOf);
  });

  let resourceRecordsRebuilt = 0;
  const rebuildResource = (record: ResourceAdminRecord): ResourceAdminRecord => {
    if (record.id !== mutated.resourceId || !resource) {
      return record;
    }
    resourceRecordsRebuilt += 1;
    return toAdminRecord(resource, nextEvidenceRows, asOf);
  };
  const materials = current.materials.map(rebuildResource);
  const services = current.services.map(rebuildResource);
  const labor = current.labor.map(rebuildResource);
  const rebuiltResource =
    materials.find((item) => item.id === mutated.resourceId) ??
    services.find((item) => item.id === mutated.resourceId) ??
    labor.find((item) => item.id === mutated.resourceId);

  let recipeRecordsRebuilt = 0;
  const rebuildRecipe = (record: RecipeAdminRecord): RecipeAdminRecord => {
    if (record.costEvidenceId !== mutated.resourceId) {
      return record;
    }
    const recipe = getCostRecipe(record.id);
    if (!recipe) {
      return record;
    }
    recipeRecordsRebuilt += 1;
    return toRecipeRecord(recipe, nextEvidenceRows, asOf);
  };

  let templateUsagesRebuilt = 0;
  const templateUsages = current.templateUsages.map((usage) => {
    if (!usage.resourceIds.includes(mutated.resourceId)) {
      return usage;
    }
    const template = getProductTemplate(usage.templateCode);
    if (!template) {
      return usage;
    }
    templateUsagesRebuilt += 1;
    return projectProductTemplateResourceUsage(template, nextEvidenceRows, asOf);
  });

  return {
    admin: {
      families: current.families.map((family) => {
        if (!family.specifications.some((item) => item.id === mutated.resourceId)) {
          return family;
        }
        return {
          ...family,
          specifications: family.specifications.map((item) =>
            item.id === mutated.resourceId ? (rebuiltResource ?? item) : item,
          ),
        };
      }),
      materials,
      services,
      labor,
      serviceRecipes: current.serviceRecipes.map(rebuildRecipe),
      laborRecipes: current.laborRecipes.map(rebuildRecipe),
      missingServiceRecipes: current.missingServiceRecipes,
      missingLaborRecipes: current.missingLaborRecipes,
      costEvidence: costEvidenceRows,
      templateUsages,
      writeState:
        nextEvidenceRows.length > 0 &&
        nextEvidenceRows.every((item) => Boolean(item.evidenceRowId))
          ? "READY"
          : "NOT_IMPLEMENTED",
    },
    stats: {
      costEvidenceRowsRebuilt,
      resourceRecordsRebuilt,
      recipeRecordsRebuilt,
      templateUsagesRebuilt,
    },
  };
}

function projectCostEvidenceAdminRow(
  item: CostEvidence,
  asOf: string,
): ResourcesAdminProjection["costEvidence"][number] {
  const resource = resourceCatalog.find((entry) => entry.id === item.resourceId);
  const projected = toCostProjection(item, asOf);
  return {
    resourceId: item.resourceId,
    resourceLabel: resource?.label ?? item.resourceId,
    kindLabel: resource ? resourceKindLabel(resource.kind) : item.resourceId,
    evidenceRowId: item.evidenceRowId ?? null,
    lastChangedAt: item.createdAt ?? null,
    qualifierIdentity: costEvidenceQualifierIdentity(item.when),
    qualifierLabel: qualifierLabelFor(item.when),
    qualifier: qualifierProjection(item.when),
    usedBy: projectUses(item.resourceId),
    ...projected,
  };
}

function toRecipeRecord(
  recipe: CostRecipe,
  evidenceRows: readonly CostEvidence[],
  asOf: string,
): RecipeAdminRecord {
  const evidence = lookupCostEvidence(evidenceRows, recipe.costEvidenceId);
  const resource = getResource(recipe.costEvidenceId);
  return {
    id: recipe.id,
    kind: recipe.kind,
    kindLabel: recipeKindLabel(recipe.kind),
    label: recipe.label,
    description: recipe.description,
    lifecycleLabel: recipeLifecycleLabel(recipe.lifecycle),
    completenessLabel: evidence ? "Configurată" : "Parțială",
    processLabels: recipe.processIds.map(
      (processId) => getOperationalProcess(processId)?.label ?? processId,
    ),
    quantityBasisLabel: recipeQuantityBasisLabel(recipe.quantityBasis),
    unitLabel: resourceUnitLabel(recipe.unit),
    costEvidenceId: recipe.costEvidenceId,
    costEvidenceLabel: resource?.label ?? recipe.costEvidenceId,
    cost: evidence ? toCostProjection(evidence, asOf) : null,
  };
}

function toMissingRecipe(processId: string): MissingRecipeAdminRecord {
  const kind = expectedRecipeKindForProcess(processId) ?? "SERVICE";
  return {
    processId,
    processLabel: getOperationalProcess(processId)?.label ?? processId,
    kind,
    kindLabel: recipeKindLabel(kind),
    completenessLabel: "Lipsă",
  };
}

function toAdminRecord(
  resource: ResourceDefinition,
  evidenceRows: readonly CostEvidence[],
  asOf: string,
): ResourceAdminRecord {
  const family = resource.familyId ? getMaterialFamily(resource.familyId) : undefined;
  const spec = resource.specification;
  const evidence =
    lookupCostEvidence(evidenceRows, resource.id) ??
    listCostEvidenceFrom(evidenceRows, resource.id)[0];
  return {
    id: resource.id,
    label: resource.label,
    kind: resource.kind,
    kindLabel: resourceKindLabel(resource.kind),
    unit: resource.unit,
    unitLabel: resourceUnitLabel(resource.unit),
    familyId: resource.familyId ?? null,
    familyLabel: family?.label ?? null,
    formLabel: spec ? formLabel(spec.form) : null,
    thicknessLabel:
      spec?.thicknessMm !== undefined ? `${spec.thicknessMm} mm` : null,
    opticalLabel: spec?.opticalType === "opal" ? "Opal" : null,
    voltageLabel:
      resource.electrical?.voltageV !== undefined
        ? `${resource.electrical.voltageV} V`
        : null,
    capacityLabel:
      resource.electrical?.capacityW !== undefined
        ? `${resource.electrical.capacityW} W`
        : null,
    usedBy: projectUses(resource.id),
    cost: evidence ? toCostProjection(evidence, asOf) : null,
    costEvidenceQualifiers: costEvidenceQualifierFieldsFor(resource.costEvidenceQualifiers),
  };
}

function toCostProjection(evidence: CostEvidence, asOf: string): ResourceCostProjection {
  const unitLabel = resourceUnitLabel(evidence.perUnit);
  const qualifier = qualifierLabelFor(evidence.when);
  return {
    amount: evidence.amount,
    currency: evidence.currency,
    unitLabel,
    sourceLabel: costSourceLabel(evidence.source),
    classificationLabel: costClassificationLabel(evidence.classification),
    note: evidence.note,
    supplierLabel: evidence.supplierLabel ?? null,
    validFrom: evidence.validFrom ?? null,
    validUntil: evidence.validUntil ?? null,
    ...(evidence.validUntil
      ? {
          validityState: calendarDateCoversAsOf({
            validFrom: evidence.validFrom,
            validUntil: evidence.validUntil,
            asOf,
          })
            ? ("current" as const)
            : ("expired" as const),
        }
      : {}),
    amountDisplay: qualifier
      ? `${formatAmount(evidence.amount)} ${evidence.currency} / ${unitLabel} · ${qualifier}`
      : `${formatAmount(evidence.amount)} ${evidence.currency} / ${unitLabel}`,
  };
}

function projectUses(resourceId: string): ResourceUseProjection[] {
  return resourceWhereUsed(resourceId).map((use) => {
    const roleLabel = componentRoleLabel(use.role);
    const typeLabel = getComponentType(use.typeId).label;
    return {
      ...use,
      roleLabel,
      typeLabel,
      displayLine: `${use.productLabel} — ${roleLabel} / ${typeLabel}`,
    };
  });
}

function componentRoleLabel(role: ComponentRole): string {
  switch (role) {
    case "FACE":
      return "Față";
    case "VOLUME":
      return "Volum";
    case "BACK":
      return "Spate";
    case "LIGHTING":
      return "Iluminare";
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function formLabel(form: "sheet" | "profile"): string {
  switch (form) {
    case "sheet":
      return "Foaie";
    case "profile":
      return "Profil";
    default: {
      const _exhaustive: never = form;
      return _exhaustive;
    }
  }
}

function qualifierProjection(when: CostEvidence["when"]): {
  kind: CostEvidenceQualifierField["kind"];
  label: string;
  unitLabel: string;
  value: number;
} | null {
  if (when?.volumeDepthMm === undefined) {
    return null;
  }
  return {
    kind: VOLUME_DEPTH_COST_EVIDENCE_QUALIFIER.kind,
    label: VOLUME_DEPTH_COST_EVIDENCE_QUALIFIER.label,
    unitLabel: VOLUME_DEPTH_COST_EVIDENCE_QUALIFIER.unitLabel,
    value: when.volumeDepthMm,
  };
}

function qualifierLabelFor(when: CostEvidence["when"]): string | null {
  const qualifier = qualifierProjection(when);
  if (!qualifier) {
    return null;
  }
  return `${qualifier.label}: ${qualifier.value} ${qualifier.unitLabel}`;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2).replace(".", ",");
}
