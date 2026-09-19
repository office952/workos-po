import {
  liveResourceIdsForType,
  resolveResourcesForType,
  type ResourceResolution,
} from "../resources/resolve.js";
import type { ComponentRole, ComponentTypeId, DraftValues } from "./types.js";

export type { ResourceResolution };

export type { ComponentTypeId };

export const COMPONENT_TYPE_IDS = [
  "PLEXIGLAS_FACE",
  "ALUMINIUM_VOLUME",
  "FOREX_BACK",
  "LIGHTING_FRONT_LED",
  "ACM_CASSETTE_BODY",
  "STEEL_INTERNAL_FRAME",
] as const satisfies readonly ComponentTypeId[];

export const ATTRIBUTE_OWNERSHIPS = [
  "FIXED_BY_PRODUCT",
  "CONFIGURABLE_BY_ORDER",
  "TECHNICAL_SETTING",
  "MATERIAL_IDENTITY",
  "MEASUREMENT",
] as const;

export type AttributeOwnership = (typeof ATTRIBUTE_OWNERSHIPS)[number];

export type ComponentAttributeKind =
  | "material_family"
  | "thickness"
  | "optical"
  | "applied_finish"
  | "applied_color"
  | "depth"
  | "measurement"
  | "technology";

export type ComponentAttributeDefinition = {
  id: string;
  label: string;
  ownership: AttributeOwnership;
  kind: ComponentAttributeKind;
};

export type ComponentTypeDefinition = {
  id: ComponentTypeId;
  role: ComponentRole;
  label: string;
  description: string;
  attributes: readonly ComponentAttributeDefinition[];
};

export const componentTypes: readonly ComponentTypeDefinition[] = [
  {
    id: "PLEXIGLAS_FACE",
    role: "FACE",
    label: "Plexiglas",
    description: "Față din plexiglas. Grosimea și proprietatea optică sunt configurație, nu rolul.",
    attributes: [
      {
        id: "face.materialFamily",
        label: "Familie material",
        ownership: "FIXED_BY_PRODUCT",
        kind: "material_family",
      },
      {
        id: "face.thicknessMm",
        label: "Grosime",
        ownership: "FIXED_BY_PRODUCT",
        kind: "thickness",
      },
      {
        id: "face.opticalType",
        label: "Proprietate optică",
        ownership: "MATERIAL_IDENTITY",
        kind: "optical",
      },
      {
        id: "face.finish",
        label: "Finisaj aplicat",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "applied_finish",
      },
      {
        id: "face.color",
        label: "Culoare aplicată",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "applied_color",
      },
      {
        id: "face.confirmedAreaMm2",
        label: "Suprafață confirmată",
        ownership: "MEASUREMENT",
        kind: "measurement",
      },
    ],
  },
  {
    id: "ALUMINIUM_VOLUME",
    role: "VOLUME",
    label: "Aluminiu",
    description: "Volum din aluminiu. Adâncimea și finisajul variază fără un tip nou.",
    attributes: [
      {
        id: "volume.materialFamily",
        label: "Familie material",
        ownership: "FIXED_BY_PRODUCT",
        kind: "material_family",
      },
      {
        id: "volume.thicknessMm",
        label: "Grosime tablă",
        ownership: "FIXED_BY_PRODUCT",
        kind: "thickness",
      },
      {
        id: "volume.depthMm",
        label: "Adâncime",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "depth",
      },
      {
        id: "volume.finish",
        label: "Finisaj aplicat",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "applied_finish",
      },
      {
        id: "volume.color",
        label: "Culoare aplicată",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "applied_color",
      },
      {
        id: "volume.confirmedPerimeterMm",
        label: "Perimetru confirmat",
        ownership: "MEASUREMENT",
        kind: "measurement",
      },
    ],
  },
  {
    id: "FOREX_BACK",
    role: "BACK",
    label: "Forex",
    description: "Spate din Forex. Grosimea este configurație de produs, nu un calculator separat.",
    attributes: [
      {
        id: "back.materialFamily",
        label: "Familie material",
        ownership: "FIXED_BY_PRODUCT",
        kind: "material_family",
      },
      {
        id: "back.thicknessMm",
        label: "Grosime",
        ownership: "FIXED_BY_PRODUCT",
        kind: "thickness",
      },
    ],
  },
  {
    id: "LIGHTING_FRONT_LED",
    role: "LIGHTING",
    label: "Iluminare frontală cu module LED",
    description:
      "Tehnologie de iluminare. Pasul LED, puterea pe modul și rezerva sursei sunt setări tehnice de sistem, nu resurse și nu alegeri de comandă.",
    attributes: [
      {
        id: "lighting.mode",
        label: "Tehnologie",
        ownership: "FIXED_BY_PRODUCT",
        kind: "technology",
      },
      {
        id: "ledPitchMm",
        label: "Pas module LED",
        ownership: "TECHNICAL_SETTING",
        kind: "technology",
      },
      {
        id: "ledModulePowerW",
        label: "Putere modul LED",
        ownership: "TECHNICAL_SETTING",
        kind: "technology",
      },
      {
        id: "psuReservePercent",
        label: "Rezervă sursă de alimentare",
        ownership: "TECHNICAL_SETTING",
        kind: "technology",
      },
    ],
  },
  {
    id: "ACM_CASSETTE_BODY",
    role: "FACE",
    label: "Casetă ACM",
    description:
      "Corp casetat din foaie ACM. Lățimea, înălțimea, adâncimea și îndoiturile sunt configurație, nu un tip nou.",
    attributes: [
      {
        id: "face.materialFamily",
        label: "Familie material",
        ownership: "FIXED_BY_PRODUCT",
        kind: "material_family",
      },
      {
        id: "face.thicknessMm",
        label: "Grosime",
        ownership: "FIXED_BY_PRODUCT",
        kind: "thickness",
      },
      {
        id: "face.widthMm",
        label: "Lățime exterioară",
        ownership: "MEASUREMENT",
        kind: "measurement",
      },
      {
        id: "face.heightMm",
        label: "Înălțime exterioară",
        ownership: "MEASUREMENT",
        kind: "measurement",
      },
      {
        id: "face.cassetteDepthMm",
        label: "Adâncime casetă",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "depth",
      },
      {
        id: "face.foldCount",
        label: "Număr de îndoituri",
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "technology",
      },
      {
        id: "face.finish",
        label: "Finisaj aplicat",
        ownership: "FIXED_BY_PRODUCT",
        kind: "applied_finish",
      },
    ],
  },
  {
    id: "STEEL_INTERNAL_FRAME",
    role: "BACK",
    label: "Cadru intern oțel",
    description:
      "Cadru metalic intern. Dimensiunea vine din formula confirmată pe casetă, nu dintr-un al doilea calculator de produs.",
    attributes: [
      {
        id: "back.materialFamily",
        label: "Familie material",
        ownership: "FIXED_BY_PRODUCT",
        kind: "material_family",
      },
    ],
  },
];

export function getComponentType(id: ComponentTypeId): ComponentTypeDefinition {
  const type = componentTypes.find((item) => item.id === id);
  if (!type) {
    throw new Error(`Unknown component type: ${id}`);
  }
  return type;
}

export function listComponentTypesForRole(
  role: ComponentRole,
): ComponentTypeDefinition[] {
  return componentTypes.filter((item) => item.role === role);
}

export function attributeOwnershipLabel(ownership: AttributeOwnership): string {
  switch (ownership) {
    case "FIXED_BY_PRODUCT":
      return "Fixat de produs";
    case "CONFIGURABLE_BY_ORDER":
      return "Configurabil pe comandă";
    case "TECHNICAL_SETTING":
      return "Setare tehnică";
    case "MATERIAL_IDENTITY":
      return "Identitate / proprietate material";
    case "MEASUREMENT":
      return "Măsurătoare";
    default: {
      const _exhaustive: never = ownership;
      return _exhaustive;
    }
  }
}

export function attributeKindLabel(kind: ComponentAttributeKind): string {
  switch (kind) {
    case "material_family":
      return "Familie material";
    case "thickness":
      return "Grosime";
    case "optical":
      return "Proprietate optică a materialului";
    case "applied_finish":
      return "Finisaj aplicat";
    case "applied_color":
      return "Culoare de finisaj, nu culoarea în masă";
    case "depth":
      return "Adâncime";
    case "measurement":
      return "Măsurătoare confirmată";
    case "technology":
      return "Tehnologie";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function resolveTypeResources(
  typeId: ComponentTypeId,
  values: DraftValues,
): ResourceResolution[] {
  return resolveResourcesForType(typeId, values);
}

export { liveResourceIdsForType };
