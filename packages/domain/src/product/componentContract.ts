import type { ResourceRequirement } from "../resources/requirement.js";
import type { ComponentTechnicalSettingDefinition } from "./technicalSettings.js";
import type { ComponentTypeId } from "./componentTypes.js";
import type {
  ComponentCalculationStatus,
  ComponentRole,
  DraftValues,
  TechnicalMeasurement,
  TechnicalQuantity,
} from "./types.js";

export type ComponentInspectionLine = {
  readonly label: string;
  readonly value: string;
};

export type SharedCalculationContext = {
  confirmedAreaMm2?: number;
};

export type ComponentCalculationInput = {
  values: DraftValues;
  measurements: readonly TechnicalMeasurement[];
  shared: SharedCalculationContext;
  technicalSettings: readonly ComponentTechnicalSettingDefinition[];
};

export type ComponentCalculationResult = {
  typeId: ComponentTypeId;
  role: ComponentRole;
  status: ComponentCalculationStatus;
  quantities: readonly TechnicalQuantity[];
  requirements: readonly ResourceRequirement[];
  unavailable: readonly string[];
};

export type ComponentMeasurementKind =
  | "confirmed_area_mm2"
  | "confirmed_perimeter_mm"
  | "confirmed_outer_dimensions_mm"
  | "supplied_area_mm2"
  | "none";

export type ComponentEicReadiness = "material" | "material_and_operation" | "unavailable";

export type ComponentContractProfile = {
  measurement: ComponentMeasurementKind;
  quantityUnit: "m" | "m2" | "buc" | null;
  independentCalculation: boolean;
  eic: ComponentEicReadiness;
  structuralGaps: readonly string[];
  calculationInputs?: readonly ComponentInspectionLine[];
  calculationResults?: readonly ComponentInspectionLine[];
};

export type ComponentCalculationContract = {
  typeId: ComponentTypeId;
  role: ComponentRole;
  profile: ComponentContractProfile;
  collectMeasurements(values: DraftValues): TechnicalMeasurement[];
  calculate(input: ComponentCalculationInput): ComponentCalculationResult;
};
