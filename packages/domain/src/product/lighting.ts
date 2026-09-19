import { MAT_LED_MODULE_ID } from "../resources/catalog.js";
import type { ResourceRequirement } from "../resources/requirement.js";
import type {
  ComponentCalculationContract,
  ComponentCalculationInput,
  ComponentCalculationResult,
  ComponentInspectionLine,
} from "./componentContract.js";
import { selectPsuUnits, type SelectedPsuUnit } from "./psuSelection.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  resolvedSettingValue,
  unresolvedSettingReasons,
} from "./technicalSettings.js";
import type { TechnicalQuantity } from "./types.js";
import { VOLUME_PERIMETER_FIELD } from "./volume.js";

export const LIGHTING_COMPONENT_ID = "LIGHTING";

export const LIGHTING_REQUIRED_SETTING_IDS = [
  LED_PITCH_SETTING_ID,
  LED_MODULE_POWER_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
] as const;

export const LIGHTING_MISSING_LED_GEOMETRY =
  "Cantitatea de module LED nu poate fi calculată: lipsește perimetrul de volum confirmat";
export const LIGHTING_MISSING_LED_LOAD =
  "Sarcina LED nu poate fi calculată: lipsesc cantitatea de module și puterea pe modul";
export const LIGHTING_MISSING_PSU_CAPACITY =
  "Capacitatea minimă a sursei nu poate fi calculată: sarcina LED nu este cunoscută";
export const LIGHTING_MISSING_PSU_SELECTION =
  "Selecția fizică a sursei nu este disponibilă: catalogul de PSU nu a produs o combinație";

export const LIGHTING_CALCULATION_INPUTS: readonly ComponentInspectionLine[] = [
  {
    label: "Bază geometrică module LED",
    value: "Perimetrul de volum confirmat. Pasul LED se aplică pe acest traseu.",
  },
  {
    label: "Putere pe modul LED",
    value: "Setare tehnică configurabilă. Default de dezvoltare, de calibrat ulterior.",
  },
  {
    label: "Sarcină LED totală",
    value: "Cantitate module × putere pe modul.",
  },
];

export const LIGHTING_CALCULATION_RESULTS: readonly ComponentInspectionLine[] = [
  { label: "Cantitate module LED", value: "ceil(perimetru mm / pas LED)" },
  { label: "Sarcină LED", value: "module × putere pe modul" },
  {
    label: "Capacitate minimă sursă",
    value: "Sarcină LED × (1 + rezervă tehnică).",
  },
  {
    label: "Selecție fizică sursă",
    value: "Combinație deterministă din catalogul 60/100/160/200 W.",
  },
];

export function requiredPsuCapacityW(
  totalLedLoadW: number,
  psuReservePercent: number,
): number {
  if (!Number.isFinite(totalLedLoadW) || totalLedLoadW < 0) {
    throw new Error("totalLedLoadW must be a finite non-negative number");
  }
  if (!Number.isFinite(psuReservePercent) || psuReservePercent < 0) {
    throw new Error("psuReservePercent must be a finite non-negative number");
  }
  return totalLedLoadW * (1 + psuReservePercent / 100);
}

export function ledModuleQuantityFromPerimeter(
  perimeterMm: number,
  ledPitchMm: number,
): number {
  if (!Number.isFinite(perimeterMm) || perimeterMm <= 0) {
    throw new Error("perimeterMm must be a finite positive number");
  }
  if (!Number.isFinite(ledPitchMm) || ledPitchMm <= 0) {
    throw new Error("ledPitchMm must be a finite positive number");
  }
  return Math.ceil(perimeterMm / ledPitchMm);
}

function lightingSettingGaps(
  settings: ComponentCalculationInput["technicalSettings"],
): string[] {
  return unresolvedSettingReasons(settings, LIGHTING_REQUIRED_SETTING_IDS);
}

function lightingResult(
  status: ComponentCalculationResult["status"],
  quantities: ComponentCalculationResult["quantities"],
  requirements: readonly ResourceRequirement[],
  unavailable: readonly string[],
): ComponentCalculationResult {
  return {
    typeId: "LIGHTING_FRONT_LED",
    role: "LIGHTING",
    status,
    quantities,
    requirements,
    unavailable: [...unavailable],
  };
}

export const lightingFrontLedContract: ComponentCalculationContract = {
  typeId: "LIGHTING_FRONT_LED",
  role: "LIGHTING",
  profile: {
    measurement: "none",
    quantityUnit: "buc",
    independentCalculation: true,
    eic: "material",
    structuralGaps: [],
    calculationInputs: LIGHTING_CALCULATION_INPUTS,
    calculationResults: LIGHTING_CALCULATION_RESULTS,
  },
  collectMeasurements() {
    return [];
  },
  calculate(input: ComponentCalculationInput): ComponentCalculationResult {
    const settingGaps = lightingSettingGaps(input.technicalSettings);
    if (settingGaps.length > 0) {
      return lightingResult("UNAVAILABLE", [], [], settingGaps);
    }

    const pitchMm = resolvedSettingValue(input.technicalSettings, LED_PITCH_SETTING_ID);
    const modulePowerW = resolvedSettingValue(
      input.technicalSettings,
      LED_MODULE_POWER_SETTING_ID,
    );
    const reservePercent = resolvedSettingValue(
      input.technicalSettings,
      PSU_RESERVE_SETTING_ID,
    );
    if (
      pitchMm === undefined ||
      modulePowerW === undefined ||
      reservePercent === undefined
    ) {
      throw new Error("lighting settings passed gap check without resolved values");
    }

    const perimeter = input.measurements.find(
      (item) => item.fieldId === VOLUME_PERIMETER_FIELD && item.confirmed,
    );
    if (!perimeter || perimeter.value <= 0) {
      return lightingResult("PARTIAL", [], [], [LIGHTING_MISSING_LED_GEOMETRY]);
    }

    const moduleQuantity = ledModuleQuantityFromPerimeter(perimeter.value, pitchMm);
    const totalLedLoadW = moduleQuantity * modulePowerW;
    const requiredCapacityW = requiredPsuCapacityW(totalLedLoadW, reservePercent);
    const selected = selectPsuUnits(requiredCapacityW);
    const quantities = lightingQuantities(
      moduleQuantity,
      totalLedLoadW,
      requiredCapacityW,
      selected,
    );
    const moduleRequirement: ResourceRequirement = {
      componentId: LIGHTING_COMPONENT_ID,
      resourceId: MAT_LED_MODULE_ID,
      quantity: moduleQuantity,
      unit: "buc",
    };
    if (selected.length === 0) {
      return lightingResult("PARTIAL", quantities, [moduleRequirement], [
        LIGHTING_MISSING_PSU_SELECTION,
      ]);
    }

    return lightingResult(
      "CALCULATED",
      quantities,
      [
        moduleRequirement,
        ...selected.map((item) => ({
          componentId: LIGHTING_COMPONENT_ID,
          resourceId: item.resourceId,
          quantity: item.quantity,
          unit: "buc" as const,
        })),
      ],
      [],
    );
  },
};

function lightingQuantities(
  moduleQuantity: number,
  totalLedLoadW: number,
  requiredCapacityW: number,
  selected: readonly SelectedPsuUnit[],
): TechnicalQuantity[] {
  return [
    {
      componentId: LIGHTING_COMPONENT_ID,
      id: "ledModuleQuantity",
      label: "Module LED",
      value: moduleQuantity,
      unit: "buc",
      basis: "confirmed_perimeter",
    },
    {
      componentId: LIGHTING_COMPONENT_ID,
      id: "totalLedLoadW",
      label: "Putere totală LED",
      value: totalLedLoadW,
      unit: "W",
      basis: "calculated_from_settings",
    },
    {
      componentId: LIGHTING_COMPONENT_ID,
      id: "requiredPsuCapacityW",
      label: "Necesar sursă cu rezervă",
      value: requiredCapacityW,
      unit: "W",
      basis: "calculated_from_settings",
    },
    ...selected.map((item) => ({
      componentId: LIGHTING_COMPONENT_ID,
      id: `selectedPsu:${item.resourceId}`,
      label: `Sursă selectată ${item.capacityW} W`,
      value: item.quantity,
      unit: "buc" as const,
      basis: "calculated_from_settings" as const,
    })),
  ];
}
