import { calendarDateCoversAsOf } from "../calendarDate.js";
import { operationalProcesses } from "../processes/catalog.js";
import { composeProductProcesses } from "../processes/composition.js";
import { processWhereUsed } from "../processes/whereUsed.js";
import { productTemplates } from "../product/productRegistry.js";
import type { ProductTemplate } from "../product/types.js";
import {
  costEvidence,
  listCostEvidenceFrom,
  type CostEvidence,
} from "./catalog.js";
import { costRecipes, recipeForProcessScope } from "./recipes.js";
import { liveResourceIdsForType } from "./resolve.js";

export type ProductTemplateResourceUsage = {
  templateCode: string;
  templateLabel: string;
  detail: string;
  resourceIds: readonly string[];
  recipeIds: readonly string[];
  processIds: readonly string[];
  resourceCount: number;
  confirmedTariffCount: number;
  resourcesWithoutConfirmedTariffCount: number;
};

export function projectProductTemplateResourceUsage(
  template: ProductTemplate,
  evidenceRows: readonly CostEvidence[] = costEvidence,
  asOf = new Date().toISOString(),
): ProductTemplateResourceUsage {
  const typeIds = new Set(template.components.map((component) => component.typeId));
  const roles = new Set(template.components.map((component) => component.id));
  const resourceIds = new Set<string>();
  const recipeIds = new Set<string>();
  const processIds = new Set<string>();

  for (const component of template.components) {
    for (const resourceId of liveResourceIdsForType(component.typeId)) {
      resourceIds.add(resourceId);
    }
  }

  for (const process of operationalProcesses) {
    if (processWhereUsed(process.id).some((use) => use.productCode === template.code)) {
      processIds.add(process.id);
    }
  }

  const composition = composeProductProcesses(template, {});
  for (const node of composition.nodes) {
    processIds.add(node.processId);
    const recipe = recipeForProcessScope(node.processId, node.scope, node.typeId);
    if (!recipe) {
      continue;
    }
    recipeIds.add(recipe.id);
    resourceIds.add(recipe.costEvidenceId);
  }

  for (const recipe of costRecipes) {
    if (!recipe.processIds.some((processId) => processIds.has(processId))) {
      continue;
    }
    if (
      recipe.applicableTypeIds &&
      recipe.applicableTypeIds.length > 0 &&
      !recipe.applicableTypeIds.some((typeId) => typeIds.has(typeId))
    ) {
      continue;
    }
    if (
      recipe.scopes &&
      recipe.scopes.length > 0 &&
      !recipe.scopes.some(
        (scope) => scope === "BODY" || scope === "PRODUCT" || roles.has(scope),
      )
    ) {
      continue;
    }
    recipeIds.add(recipe.id);
    resourceIds.add(recipe.costEvidenceId);
  }

  const sortedResourceIds = [...resourceIds].sort();
  const currentRows = sortedResourceIds.flatMap((resourceId) =>
    listCostEvidenceFrom(evidenceRows, resourceId).filter((row) =>
      calendarDateCoversAsOf({
        validFrom: row.validFrom,
        validUntil: row.validUntil,
        asOf,
      }),
    ),
  );
  const confirmedRows = currentRows.filter((row) => row.classification === "OWNER_CONFIRMED");
  const confirmedResourceIds = new Set(confirmedRows.map((row) => row.resourceId));

  return {
    templateCode: template.code,
    templateLabel: template.label,
    detail: template.identityFacts.map((fact) => fact.value).join(" · "),
    resourceIds: sortedResourceIds,
    recipeIds: [...recipeIds].sort(),
    processIds: [...processIds].sort(),
    resourceCount: sortedResourceIds.length,
    confirmedTariffCount: confirmedRows.length,
    resourcesWithoutConfirmedTariffCount: sortedResourceIds.filter(
      (resourceId) => !confirmedResourceIds.has(resourceId),
    ).length,
  };
}

export function listProductTemplateResourceUsages(
  evidenceRows: readonly CostEvidence[] = costEvidence,
  asOf = new Date().toISOString(),
): readonly ProductTemplateResourceUsage[] {
  return productTemplates.map((template) =>
    projectProductTemplateResourceUsage(template, evidenceRows, asOf),
  );
}

export function usageForProductTemplate(
  usages: readonly ProductTemplateResourceUsage[],
  templateCode: string | null,
): ProductTemplateResourceUsage | null {
  if (!templateCode) {
    return null;
  }
  return usages.find((item) => item.templateCode === templateCode) ?? null;
}
