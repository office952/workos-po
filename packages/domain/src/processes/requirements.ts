import type { ComponentTypeId, DraftValues } from "../product/types.js";
import {
  APPLY_SURFACE_FINISH_ID,
  CUT_METAL_STOCK_ID,
  CUT_SHEET_CNC_ID,
  FORM_ALUMINIUM_PROFILE_ID,
  FORM_SHEET_CASSETTE_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PAINT_RAL_ID,
  PLACE_LED_MODULES_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
  getOperationalProcess,
} from "./catalog.js";

export type ProcessRequirementCondition =
  | { kind: "always" }
  | { kind: "fieldEquals"; fieldId: string; value: string };

export type ComponentProcessRequirement = {
  processId: string;
  condition: ProcessRequirementCondition;
  reason: string;
};

const FACE_REQUIREMENTS: readonly ComponentProcessRequirement[] = [
  {
    processId: CUT_SHEET_CNC_ID,
    condition: { kind: "always" },
    reason: "Fața din foaie trebuie debitată.",
  },
  {
    processId: APPLY_SURFACE_FINISH_ID,
    condition: { kind: "fieldEquals", fieldId: "face.finish", value: "vinyl" },
    reason: "Fața colantată cere aplicare de folie după debitare.",
  },
];

const VOLUME_REQUIREMENTS: readonly ComponentProcessRequirement[] = [
  {
    processId: FORM_ALUMINIUM_PROFILE_ID,
    condition: { kind: "always" },
    reason: "Volumul din profil trebuie format.",
  },
  {
    processId: APPLY_SURFACE_FINISH_ID,
    condition: { kind: "fieldEquals", fieldId: "volume.finish", value: "vinyl" },
    reason: "Volumul colantat cere aplicare de folie înainte de formare.",
  },
  {
    processId: PAINT_RAL_ID,
    condition: { kind: "fieldEquals", fieldId: "volume.finish", value: "painted" },
    reason: "Volumul vopsit cere vopsire RAL după asamblare, nu înainte de formare.",
  },
];

const BACK_REQUIREMENTS: readonly ComponentProcessRequirement[] = [
  {
    processId: CUT_SHEET_CNC_ID,
    condition: { kind: "always" },
    reason: "Spatele din foaie trebuie debitat. Același proces ca la față.",
  },
];

const ACM_CASSETTE_REQUIREMENTS: readonly ComponentProcessRequirement[] = [
  {
    processId: CUT_SHEET_CNC_ID,
    condition: { kind: "always" },
    reason: "Foaia ACM trebuie debitată.",
  },
  {
    processId: FORM_SHEET_CASSETTE_ID,
    condition: { kind: "always" },
    reason: "Caseta se formează manual după V-groove.",
  },
];

const STEEL_FRAME_REQUIREMENTS: readonly ComponentProcessRequirement[] = [
  {
    processId: CUT_METAL_STOCK_ID,
    condition: { kind: "always" },
    reason: "Profilul de cadru intern trebuie debitat.",
  },
];

const LIGHTING_REQUIREMENTS: readonly ComponentProcessRequirement[] = [
  {
    processId: PLACE_LED_MODULES_ID,
    condition: { kind: "always" },
    reason: "Produsul cu iluminare față cere montarea modulelor LED.",
  },
  {
    processId: WIRE_LIGHTING_ID,
    condition: { kind: "always" },
    reason: "Cablarea este o operație distinctă de montarea modulelor.",
  },
  {
    processId: INSTALL_OR_CONNECT_PSU_ID,
    condition: { kind: "always" },
    reason: "Sursa trebuie pregătită pentru probă și colet, fără dimensionare aici.",
  },
  {
    processId: TEST_LIGHTING_IGNITION_ID,
    condition: { kind: "always" },
    reason: "Proba de aprindere se face cu corpul încă deschis.",
  },
  {
    processId: TEST_ILLUMINATION_UNIFORMITY_ID,
    condition: { kind: "always" },
    reason: "Uniformitatea se verifică după închiderea corpului.",
  },
];

export function processRequirementsForType(
  typeId: ComponentTypeId,
): readonly ComponentProcessRequirement[] {
  switch (typeId) {
    case "PLEXIGLAS_FACE":
      return FACE_REQUIREMENTS;
    case "ALUMINIUM_VOLUME":
      return VOLUME_REQUIREMENTS;
    case "FOREX_BACK":
      return BACK_REQUIREMENTS;
    case "LIGHTING_FRONT_LED":
      return LIGHTING_REQUIREMENTS;
    case "ACM_CASSETTE_BODY":
      return ACM_CASSETTE_REQUIREMENTS;
    case "STEEL_INTERNAL_FRAME":
      return STEEL_FRAME_REQUIREMENTS;
    default: {
      const _exhaustive: never = typeId;
      return _exhaustive;
    }
  }
}

export function resolvedProcessRequirementsForType(
  typeId: ComponentTypeId,
  values: DraftValues,
): ComponentProcessRequirement[] {
  return processRequirementsForType(typeId).filter((item) =>
    matchesProcessCondition(item.condition, values),
  );
}

export function alwaysProcessIdsForType(typeId: ComponentTypeId): readonly string[] {
  return processRequirementsForType(typeId)
    .filter((item) => item.condition.kind === "always")
    .map((item) => item.processId);
}

export function matchesProcessCondition(
  condition: ProcessRequirementCondition,
  values: DraftValues,
): boolean {
  switch (condition.kind) {
    case "always":
      return true;
    case "fieldEquals":
      return values[condition.fieldId] === condition.value;
    default: {
      const _exhaustive: never = condition;
      return _exhaustive;
    }
  }
}

export function processConditionLabel(
  condition: ProcessRequirementCondition,
): string | null {
  switch (condition.kind) {
    case "always":
      return null;
    case "fieldEquals":
      return fieldEqualsLabel(condition.fieldId, condition.value);
    default: {
      const _exhaustive: never = condition;
      return _exhaustive;
    }
  }
}

export function processRequirementReferenceLabel(
  requirement: ComponentProcessRequirement,
): string {
  const process = getOperationalProcess(requirement.processId);
  const processLabel = process?.label ?? requirement.processId;
  const condition = processConditionLabel(requirement.condition);
  return condition ? `${processLabel} (${condition})` : processLabel;
}

function fieldEqualsLabel(fieldId: string, value: string): string {
  if (fieldId === "face.finish" && value === "vinyl") {
    return "Finisaj față: Colantat";
  }
  if (fieldId === "volume.finish" && value === "vinyl") {
    return "Finisaj volum: Colantat";
  }
  if (fieldId === "volume.finish" && value === "painted") {
    return "Finisaj volum: Vopsit";
  }
  return `${fieldId} = ${value}`;
}
