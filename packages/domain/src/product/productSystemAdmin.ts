import {
  processRequirementReferenceLabel,
  processRequirementsForType,
} from "../processes/requirements.js";
import { getResource } from "../resources/catalog.js";
import { categoryHasCycle } from "./catalog.js";
import { listComponentContracts } from "./componentRegistry.js";
import {
  projectComponentArchitecture,
  type ComponentProductConfiguration,
} from "./componentProjection.js";
import { type ComponentTypeId } from "./componentTypes.js";
import {
  presentedCategories,
  presentedFamilies,
  presentedTemplates,
  type DisplayLabelCatalog,
} from "./displayMetadata.js";
import { getFormSchema } from "./productRegistry.js";
import type { ComponentRole, ProductCategory } from "./types.js";
import type { ComponentInspectionLine } from "./componentContract.js";
import type { ComponentTechnicalSettingProjection } from "./technicalSettings.js";

export const ADMIN_LIFECYCLE_STATES = ["DRAFT", "ACTIVE", "RETIRED"] as const;
export type AdminLifecycleState = (typeof ADMIN_LIFECYCLE_STATES)[number];

export const ADMIN_EDIT_CLASSES = [
  "DISPLAY_EDITABLE",
  "STRUCTURE_EDITABLE",
  "TECHNICAL_SETTING_EDITABLE",
  "PRODUCT_CONFIGURATION",
  "MATERIAL_CONFIGURATION",
  "LIFECYCLE_MANAGED",
  "CODE_CONTRACT_ONLY",
] as const;
export type AdminEditClass = (typeof ADMIN_EDIT_CLASSES)[number];

export type AdminReadiness = {
  lifecycle: AdminLifecycleState;
  lifecycleLabel: string;
  canRetire: boolean;
  canDelete: boolean;
  retireBlockers: readonly string[];
  deleteBlockers: readonly string[];
  futureTransitions: readonly string[];
  editClasses: readonly AdminEditClass[];
};

export type AdminFamilyRecord = {
  id: string;
  label: string;
  description: string;
  displayRevision: number;
  categoryIds: readonly string[];
  productCodes: readonly string[];
  readiness: AdminReadiness;
};

export type AdminCategoryRecord = {
  id: string;
  label: string;
  displayRevision: number;
  familyId: string;
  familyLabel: string;
  parentId: string | null;
  parentLabel: string | null;
  childCategoryIds: readonly string[];
  productCodes: readonly string[];
  depth: number;
  readiness: AdminReadiness;
};

export type AdminCompositionLine = {
  role: ComponentRole;
  roleLabel: string;
  typeId: ComponentTypeId;
  typeLabel: string;
};

export type AdminProductRecord = {
  code: string;
  label: string;
  displayRevision: number;
  description: string;
  familyId: string;
  familyLabel: string;
  categoryId: string;
  categoryLabel: string;
  version: string;
  templateStatus: string;
  formSchemaId: string;
  formBound: boolean;
  componentCount: number;
  composition: readonly AdminCompositionLine[];
  unresolvedAreas: readonly string[];
  readiness: AdminReadiness;
};

export type AdminTypeRecord = {
  typeId: ComponentTypeId;
  label: string;
  displayRevision: number;
  description: string;
  role: ComponentRole;
  roleLabel: string;
  usedByProductCodes: readonly string[];
  usedByLabels: readonly string[];
  independentCalculation: boolean;
  measurement: string;
  quantity: string;
  configurations: readonly ComponentProductConfiguration[];
  technicalSettings: readonly ComponentTechnicalSettingProjection[];
  calculationInputs: readonly ComponentInspectionLine[];
  calculationResults: readonly ComponentInspectionLine[];
  resourceReadiness: string;
  resourceReferences: readonly { id: string; label: string }[];
  processReferences: readonly { id: string; label: string }[];
  gaps: readonly string[];
  readiness: AdminReadiness;
};

export type ProductSystemAdminProjection = {
  families: readonly AdminFamilyRecord[];
  categories: readonly AdminCategoryRecord[];
  products: readonly AdminProductRecord[];
  types: readonly AdminTypeRecord[];
};

export function adminLifecycleLabel(state: AdminLifecycleState): string {
  switch (state) {
    case "DRAFT":
      return "Ciornă";
    case "ACTIVE":
      return "Activ";
    case "RETIRED":
      return "Retras";
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function adminEditClassLabel(kind: AdminEditClass): string {
  switch (kind) {
    case "DISPLAY_EDITABLE":
      return "Etichetă / metadate de afișare";
    case "STRUCTURE_EDITABLE":
      return "Structură (plasare / compoziție)";
    case "TECHNICAL_SETTING_EDITABLE":
      return "Setare tehnică";
    case "PRODUCT_CONFIGURATION":
      return "Configurație de produs";
    case "MATERIAL_CONFIGURATION":
      return "Identitate / proprietate material";
    case "LIFECYCLE_MANAGED":
      return "Lifecycle (retragere)";
    case "CODE_CONTRACT_ONLY":
      return "Doar contract de cod";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function projectProductSystemAdministration(
  labels: DisplayLabelCatalog,
): ProductSystemAdminProjection {
  const roles = projectComponentArchitecture(labels);
  const contracts = listComponentContracts();
  const productFamilies = presentedFamilies(labels);
  const productCategories = presentedCategories(labels);
  const productTemplates = presentedTemplates(labels);

  const families = productFamilies.map((family) => {
    const categoryIds = productCategories
      .filter((item) => item.familyId === family.id)
      .map((item) => item.id);
    const productCodes = productTemplates
      .filter((item) => item.familyId === family.id)
      .map((item) => item.code);
    return {
      id: family.id,
      label: family.label,
      displayRevision: labels.revision("PRODUCT_FAMILY", family.id),
      description: family.description,
      categoryIds,
      productCodes,
      readiness: readiness({
        retireBlockers: blockers([
          categoryIds.length > 0
            ? `Familia are ${countLabel(categoryIds.length, "categorie", "categorii")}.`
            : null,
          productCodes.length > 0
            ? `Familia are ${countLabel(productCodes.length, "produs", "produse")}.`
            : null,
        ]),
        deleteBlockers: blockers([
          categoryIds.length > 0
            ? `Familia are ${countLabel(categoryIds.length, "categorie", "categorii")}.`
            : null,
          productCodes.length > 0
            ? `Familia are ${countLabel(productCodes.length, "produs", "produse")}.`
            : null,
        ]),
        editClasses: ["DISPLAY_EDITABLE", "LIFECYCLE_MANAGED"],
      }),
    };
  });

  const categories = productCategories.map((category) => {
    const family = productFamilies.find((item) => item.id === category.familyId);
    const parent = category.parentId
      ? productCategories.find((item) => item.id === category.parentId)
      : undefined;
    const childCategoryIds = collectChildCategoryIds(productCategories, category.id);
    const productCodes = productTemplates
      .filter((item) => item.categoryId === category.id)
      .map((item) => item.code);
    const referenced = childCategoryIds.length > 0 || productCodes.length > 0;
    return {
      id: category.id,
      label: category.label,
      displayRevision: labels.revision("PRODUCT_CATEGORY", category.id),
      familyId: category.familyId,
      familyLabel: family?.label ?? category.familyId,
      parentId: category.parentId,
      parentLabel: parent?.label ?? null,
      childCategoryIds,
      productCodes,
      depth: computeCategoryDepth(productCategories, category.id),
      readiness: readiness({
        retireBlockers: blockers([
          productCodes.length > 0
            ? `Categoria este utilizată de ${countLabel(productCodes.length, "produs", "produse")}.`
            : null,
          childCategoryIds.length > 0
            ? `Categoria are ${countLabel(childCategoryIds.length, "subcategorie", "subcategorii")}.`
            : null,
        ]),
        deleteBlockers: blockers([
          productCodes.length > 0
            ? `Categoria este utilizată de ${countLabel(productCodes.length, "produs", "produse")}.`
            : null,
          childCategoryIds.length > 0
            ? `Categoria are ${countLabel(childCategoryIds.length, "subcategorie", "subcategorii")}.`
            : null,
        ]),
        canRetire: !referenced,
        canDelete: !referenced,
        editClasses: ["DISPLAY_EDITABLE", "STRUCTURE_EDITABLE", "LIFECYCLE_MANAGED"],
      }),
    };
  });

  const products = productTemplates.map((template) => {
    const family = productFamilies.find((item) => item.id === template.familyId);
    const category = productCategories.find((item) => item.id === template.categoryId);
    const form = getFormSchema(template.formSchemaId);
    const composition = template.components.map((component) => {
      const role = roles.find((item) => item.role === component.id);
      const type = role?.types.find((item) => item.typeId === component.typeId);
      return {
        role: component.id as ComponentRole,
        roleLabel: component.label,
        typeId: component.typeId,
        typeLabel: type?.label ?? component.typeId,
      };
    });
    const unresolvedAreas = unique(
      composition.flatMap((line) => {
        const role = roles.find((item) => item.role === line.role);
        return role?.types.find((item) => item.typeId === line.typeId)?.gaps ?? [];
      }),
    );
    return {
      code: template.code,
      label: template.label,
      displayRevision: labels.revision("PRODUCT_TEMPLATE", template.code),
      description: template.description,
      familyId: template.familyId,
      familyLabel: family?.label ?? template.familyId,
      categoryId: template.categoryId,
      categoryLabel: category?.label ?? template.categoryId,
      version: template.version,
      templateStatus: template.status,
      formSchemaId: template.formSchemaId,
      formBound: Boolean(form),
      componentCount: template.components.length,
      composition,
      unresolvedAreas,
      readiness: readiness({
        retireBlockers: [],
        deleteBlockers: blockers([
          "Produsul este plasat în catalogul operator.",
          form ? "Produsul are o schemă de formular legată." : null,
          template.components.length > 0
            ? `Produsul compune ${countLabel(template.components.length, "tip constructiv", "tipuri constructive")}.`
            : null,
        ]),
        canRetire: true,
        canDelete: false,
        editClasses: ["DISPLAY_EDITABLE", "STRUCTURE_EDITABLE", "LIFECYCLE_MANAGED"],
      }),
    };
  });

  const types = contracts.map((contract) => {
    const role = roles.find((item) => item.role === contract.role);
    const type = role?.types.find((item) => item.typeId === contract.typeId);
    const usedByProductCodes = (type?.usedBy ?? []).map((item) => item.productCode);
    const used = usedByProductCodes.length > 0;
    const hasSettings = (type?.technicalSettings.length ?? 0) > 0;
    return {
      typeId: contract.typeId,
      label: type?.label ?? contract.typeId,
      displayRevision: labels.revision("COMPONENT_TYPE", contract.typeId),
      description: type?.description ?? "",
      role: contract.role,
      roleLabel: role?.label ?? contract.role,
      usedByProductCodes,
      usedByLabels: (type?.usedBy ?? []).map((item) =>
        item.inputNote ? `${item.productLabel} (${item.inputNote})` : item.productLabel,
      ),
      independentCalculation: type?.independentCalculation ?? false,
      measurement: type?.measurement ?? "",
      quantity: type?.quantity ?? "",
      configurations: type?.configurations ?? [],
      technicalSettings: type?.technicalSettings ?? [],
      calculationInputs: type?.calculationInputs ?? [],
      calculationResults: type?.calculationResults ?? [],
      resourceReadiness: type?.eic ?? "",
      resourceReferences: (type?.resourceIds ?? []).map((id) => ({
        id,
        label: getResource(id)?.label ?? id,
      })),
      processReferences: processRequirementsForType(contract.typeId).map(
        (requirement) => ({
          id: requirement.processId,
          label: processRequirementReferenceLabel(requirement),
        }),
      ),
      gaps: type?.gaps ?? contract.profile.structuralGaps,
      readiness: readiness({
        retireBlockers: blockers([
          used
            ? `Tipul este folosit de ${countLabel(usedByProductCodes.length, "produs", "produse")}.`
            : null,
        ]),
        deleteBlockers: blockers([
          used
            ? `Tipul este folosit de ${countLabel(usedByProductCodes.length, "produs", "produse")}.`
            : null,
        ]),
        editClasses: hasSettings
          ? [
              "DISPLAY_EDITABLE",
              "PRODUCT_CONFIGURATION",
              "MATERIAL_CONFIGURATION",
              "TECHNICAL_SETTING_EDITABLE",
              "CODE_CONTRACT_ONLY",
            ]
          : [
              "DISPLAY_EDITABLE",
              "PRODUCT_CONFIGURATION",
              "MATERIAL_CONFIGURATION",
              "CODE_CONTRACT_ONLY",
            ],
      }),
    };
  });

  return { families, categories, products, types };
}

function readiness(input: {
  retireBlockers: readonly string[];
  deleteBlockers: readonly string[];
  editClasses: readonly AdminEditClass[];
  canRetire?: boolean;
  canDelete?: boolean;
}): AdminReadiness {
  return {
    lifecycle: "ACTIVE",
    lifecycleLabel: adminLifecycleLabel("ACTIVE"),
    canRetire: input.canRetire ?? input.retireBlockers.length === 0,
    canDelete: input.canDelete ?? input.deleteBlockers.length === 0,
    retireBlockers: input.retireBlockers,
    deleteBlockers: input.deleteBlockers,
    futureTransitions: [
      "ACTIVE → RETIRED când nu mai este referențiată de adevăr activ.",
      "Ștergerea rămâne excepțională și doar pentru înregistrări nefolosite.",
    ],
    editClasses: input.editClasses,
  };
}

export function collectChildCategoryIds(
  categories: readonly ProductCategory[],
  parentId: string,
): string[] {
  return categories.filter((item) => item.parentId === parentId).map((item) => item.id);
}

export function computeCategoryDepth(
  categories: readonly ProductCategory[],
  categoryId: string,
): number {
  if (categoryHasCycle(categories, categoryId)) {
    return 0;
  }
  let depth = 0;
  let current = categories.find((item) => item.id === categoryId);
  while (current?.parentId) {
    depth += 1;
    current = categories.find((item) => item.id === current?.parentId);
  }
  return depth;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function blockers(values: readonly (string | null)[]): string[] {
  return values.filter((item): item is string => item !== null);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
