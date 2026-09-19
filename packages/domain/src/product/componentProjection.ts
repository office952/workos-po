import {
  alwaysProcessIdsForType,
  processRequirementReferenceLabel,
  processRequirementsForType,
} from "../processes/requirements.js";
import { listComponentContracts } from "./componentRegistry.js";
import type {
  ComponentEicReadiness,
  ComponentInspectionLine,
  ComponentMeasurementKind,
} from "./componentContract.js";
import {
  attributeKindLabel,
  attributeOwnershipLabel,
  getComponentType,
  liveResourceIdsForType,
  type AttributeOwnership,
  type ComponentTypeId,
} from "./componentTypes.js";
import {
  presentedTemplates,
  presentedTypes,
  type DisplayLabelCatalog,
} from "./displayMetadata.js";
import {
  projectTechnicalSettings,
  type ComponentTechnicalSettingProjection,
} from "./technicalSettings.js";
import type { ComponentRole, DraftValues, ProductTemplate } from "./types.js";

export const COMPONENT_ROLES: readonly ComponentRole[] = [
  "FACE",
  "VOLUME",
  "BACK",
  "LIGHTING",
];

export type ComponentProductUse = {
  productCode: string;
  productLabel: string;
  inputNote: string | null;
};

export type ComponentConfigurationAttribute = {
  id: string;
  label: string;
  valueDisplay: string;
  ownership: AttributeOwnership;
  ownershipLabel: string;
  kindLabel: string;
};

export type ComponentProductConfiguration = {
  productCode: string;
  productLabel: string;
  attributes: readonly ComponentConfigurationAttribute[];
};

export type ComponentTypeProjection = {
  typeId: ComponentTypeId;
  label: string;
  description: string;
  independentCalculation: boolean;
  measurement: string;
  quantity: string;
  eic: string;
  gaps: readonly string[];
  usedBy: readonly ComponentProductUse[];
  configurations: readonly ComponentProductConfiguration[];
  technicalSettings: readonly ComponentTechnicalSettingProjection[];
  calculationInputs: readonly ComponentInspectionLine[];
  calculationResults: readonly ComponentInspectionLine[];
  resourceIds: readonly string[];
  processIds: readonly string[];
  processRequirements: readonly { processId: string; label: string }[];
};

export type ComponentRoleProjection = {
  role: ComponentRole;
  label: string;
  owns: readonly string[];
  types: readonly ComponentTypeProjection[];
};

function measurementCopy(kind: ComponentMeasurementKind): string {
  switch (kind) {
    case "confirmed_area_mm2":
      return "Suprafață confirmată de operator (mm²)";
    case "confirmed_perimeter_mm":
      return "Perimetru confirmat de operator (mm)";
    case "confirmed_outer_dimensions_mm":
      return "Dimensiuni exterioare confirmate de operator (mm)";
    case "supplied_area_mm2":
      return "Suprafață primită din compoziția produsului (mm²)";
    case "none":
      return "Nicio măsurătoare calculabilă acum";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function quantityCopy(unit: "m" | "m2" | "buc" | null): string {
  switch (unit) {
    case "m":
      return "m";
    case "m2":
      return "m²";
    case "buc":
      return "buc";
    case null:
      return "Nicio cantitate tehnică";
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

function eicCopy(readiness: ComponentEicReadiness): string {
  switch (readiness) {
    case "material":
      return "Disponibil: material";
    case "material_and_operation":
      return "Disponibil: material și serviciu";
    case "unavailable":
      return "Indisponibil";
    default: {
      const _exhaustive: never = readiness;
      return _exhaustive;
    }
  }
}

function ownsCopy(role: ComponentRole): readonly string[] {
  switch (role) {
    case "FACE":
      return [
        "Măsurătoarea de suprafață",
        "Cantitatea tehnică",
        "Cererea de material",
      ];
    case "VOLUME":
      return [
        "Măsurătoarea de perimetru",
        "Cantitatea tehnică",
        "Cererea de profil și formare",
      ];
    case "BACK":
      return [
        "Transformarea suprafeței primite în cantitate",
        "Cererea de material",
      ];
    case "LIGHTING":
      return [
        "Cantitatea de module din perimetrul de volum",
        "Sarcina electrică și selecția sursei",
        "Cererea de resurse LED / PSU",
      ];
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

function roleLabel(
  role: ComponentRole,
  templates: readonly ProductTemplate[],
): string {
  for (const template of templates) {
    const component = template.components.find((item) => item.id === role);
    if (component) {
      return component.label;
    }
  }
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

function inputNote(template: ProductTemplate, role: ComponentRole): string | null {
  const component = template.components.find((item) => item.id === role);
  const source = component?.inputMapping?.confirmedAreaMm2FromComponentId;
  if (!source) {
    return null;
  }
  const sourceLabel =
    template.components.find((item) => item.id === source)?.label ?? source;
  return `Primește suprafața de la ${sourceLabel} în acest produs`;
}

function productsUsing(
  typeId: ComponentTypeId,
  role: ComponentRole,
  templates: readonly ProductTemplate[],
): ComponentProductUse[] {
  return templates
    .filter((template) => template.components.some((item) => item.typeId === typeId))
    .map((template) => ({
      productCode: template.code,
      productLabel: template.label,
      inputNote: inputNote(template, role),
    }));
}

function displayAttributeValue(
  id: string,
  values: DraftValues,
  ownership: AttributeOwnership,
): string {
  const value = values[id];
  if (value === undefined || value === null || value === "") {
    if (ownership === "CONFIGURABLE_BY_ORDER") {
      return "ales pe comandă";
    }
    if (ownership === "MEASUREMENT") {
      return "confirmată de operator";
    }
    return "nerezolvat în produsul curent";
  }
  if (id.endsWith("thicknessMm") || id.endsWith("depthMm")) {
    return `${value} mm`;
  }
  if (id === "face.opticalType" && value === "opal") {
    return "Opal";
  }
  if (id === "face.materialFamily" && value === "plexiglas") {
    return "Plexiglas";
  }
  if (id === "volume.materialFamily" && value === "aluminium") {
    return "Aluminiu";
  }
  if (id === "back.materialFamily" && value === "forex") {
    return "Forex";
  }
  if (id === "lighting.mode" && value === "front_lit") {
    return "Iluminare frontală";
  }
  return String(value);
}

function configurationsFor(
  typeId: ComponentTypeId,
  templates: readonly ProductTemplate[],
): ComponentProductConfiguration[] {
  const type = getComponentType(typeId);
  return templates
    .filter((template) => template.components.some((item) => item.typeId === typeId))
    .map((template) => ({
      productCode: template.code,
      productLabel: template.label,
      attributes: type.attributes
        .filter((attribute) => attribute.ownership !== "TECHNICAL_SETTING")
        .map((attribute) => ({
          id: attribute.id,
          label: attribute.label,
          valueDisplay: displayAttributeValue(
            attribute.id,
            template.fixedValues,
            attribute.ownership,
          ),
          ownership: attribute.ownership,
          ownershipLabel: attributeOwnershipLabel(attribute.ownership),
          kindLabel: attributeKindLabel(attribute.kind),
        })),
    }));
}

export function projectComponentArchitecture(
  labels: DisplayLabelCatalog,
): ComponentRoleProjection[] {
  const contracts = listComponentContracts();
  const templates = presentedTemplates(labels);
  const types = presentedTypes(labels);
  return COMPONENT_ROLES.map((role) => ({
    role,
    label: roleLabel(role, templates),
    owns: ownsCopy(role),
    types: contracts
      .filter((contract) => contract.role === role)
      .map((contract) => {
        const type = types.find((item) => item.id === contract.typeId);
        if (!type) {
          throw new Error(`unknown_component_type:${contract.typeId}`);
        }
        return {
          typeId: contract.typeId,
          label: type.label,
          description: type.description,
          independentCalculation: contract.profile.independentCalculation,
          measurement: measurementCopy(contract.profile.measurement),
          quantity: quantityCopy(contract.profile.quantityUnit),
          eic: eicCopy(contract.profile.eic),
          gaps: contract.profile.structuralGaps,
          usedBy: productsUsing(contract.typeId, role, templates),
          configurations: configurationsFor(contract.typeId, templates),
          technicalSettings: projectTechnicalSettings(contract.typeId),
          calculationInputs: contract.profile.calculationInputs ?? [],
          calculationResults: contract.profile.calculationResults ?? [],
          resourceIds: liveResourceIdsForType(contract.typeId),
          processIds: alwaysProcessIdsForType(contract.typeId),
          processRequirements: processRequirementsForType(contract.typeId).map(
            (requirement) => ({
              processId: requirement.processId,
              label: processRequirementReferenceLabel(requirement),
            }),
          ),
        };
      }),
  }));
}
