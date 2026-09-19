import type { ComponentTypeId } from "./componentTypes.js";

export const LED_PITCH_SETTING_ID = "ledPitchMm";
export const LED_MODULE_POWER_SETTING_ID = "ledModulePowerW";
export const PSU_RESERVE_SETTING_ID = "psuReservePercent";

export const TECHNICAL_SETTING_VALUE_TYPES = ["number"] as const;
export const TECHNICAL_SETTING_UNITS = ["mm", "percent", "W"] as const;
export const TECHNICAL_SETTING_CLASSIFICATIONS = [
  "OWNER_CONFIRMED",
  "OWNER_DECISION_REQUIRED",
] as const;

export type TechnicalSettingValueType = (typeof TECHNICAL_SETTING_VALUE_TYPES)[number];
export type TechnicalSettingUnit = (typeof TECHNICAL_SETTING_UNITS)[number];
export type TechnicalSettingClassification =
  (typeof TECHNICAL_SETTING_CLASSIFICATIONS)[number];

export type TechnicalSettingResolution =
  | { readonly status: "RESOLVED"; readonly value: number }
  | { readonly status: "UNRESOLVED"; readonly reason: "OWNER_DECISION_REQUIRED" };

export type ComponentTechnicalSettingDefinition = {
  readonly id: string;
  readonly typeId: ComponentTypeId;
  readonly label: string;
  readonly description: string;
  readonly valueType: TechnicalSettingValueType;
  readonly unit: TechnicalSettingUnit;
  readonly resolution: TechnicalSettingResolution;
  readonly source: string;
  readonly classification: TechnicalSettingClassification;
  readonly configurable: boolean;
  readonly unresolvedReason: string;
  readonly note?: string;
  readonly constraints?: {
    readonly min?: number;
    readonly max?: number;
  };
};

export type ComponentTechnicalSettingProjection = {
  readonly id: string;
  readonly label: string;
  readonly valueDisplay: string;
  readonly statusLabel: string;
  readonly sourceLabel: string;
  readonly administrationLabel: string;
};

export type TechnicalSettingsRegistry = {
  readonly definitions: readonly ComponentTechnicalSettingDefinition[];
  get(
    typeId: ComponentTypeId,
    id: string,
  ): ComponentTechnicalSettingDefinition | undefined;
  listByType(typeId: ComponentTypeId): readonly ComponentTechnicalSettingDefinition[];
};

export function createTechnicalSettingsRegistry(
  definitions: readonly ComponentTechnicalSettingDefinition[],
): TechnicalSettingsRegistry {
  const seen = new Set<string>();
  for (const setting of definitions) {
    validateSetting(setting);
    const key = settingKey(setting.typeId, setting.id);
    if (seen.has(key)) {
      throw new Error(`Duplicate technical setting: ${key}`);
    }
    seen.add(key);
  }

  return {
    definitions,
    get(typeId, id) {
      return definitions.find((item) => item.typeId === typeId && item.id === id);
    },
    listByType(typeId) {
      return definitions.filter((item) => item.typeId === typeId);
    },
  };
}

export const lightingFrontLedTechnicalSettings: readonly ComponentTechnicalSettingDefinition[] =
  [
    {
      id: LED_PITCH_SETTING_ID,
      typeId: "LIGHTING_FRONT_LED",
      label: "Pas module LED",
      description:
        "Distanța aproximativă curentă între modulele LED. Parametru tehnic configurabil, nu o lege fizică imuabilă.",
      valueType: "number",
      unit: "mm",
      resolution: { status: "RESOLVED", value: 100 },
      source: "OWNER_CONFIRMED",
      classification: "OWNER_CONFIRMED",
      configurable: true,
      unresolvedReason: "Regula de pas LED nu este stabilită",
      note: "Valoare activă canonică. Documentația explică; calculul consumă.",
    },
    {
      id: LED_MODULE_POWER_SETTING_ID,
      typeId: "LIGHTING_FRONT_LED",
      label: "Putere modul LED",
      description:
        "Puterea electrică pe modul LED. Default de dezvoltare, configurabil, de calibrat ulterior pe specificația reală de atelier.",
      valueType: "number",
      unit: "W",
      resolution: { status: "RESOLVED", value: 0.75 },
      source: "OWNER_CONFIRMED_DEVELOPMENT_DEFAULT",
      classification: "OWNER_CONFIRMED",
      configurable: true,
      unresolvedReason: "Puterea pe modul LED nu este stabilită",
      note: "0,75 W este default-ul de producție V4/V6. Nu este adevăr etern. Calculatorul consumă setarea.",
      constraints: { min: 0 },
    },
    {
      id: PSU_RESERVE_SETTING_ID,
      typeId: "LIGHTING_FRONT_LED",
      label: "Rezervă sursă de alimentare",
      description:
        "Rezerva de dimensionare a sursei pentru iluminarea frontală. Setare tehnică de sistem, nu alegere de comandă.",
      valueType: "number",
      unit: "percent",
      resolution: { status: "RESOLVED", value: 25 },
      source: "OWNER_CONFIRMED",
      classification: "OWNER_CONFIRMED",
      configurable: true,
      unresolvedReason: "Regula de rezervă PSU nu este stabilită",
      note: "Valoare activă canonică. Calculatorul consumă setarea; nu o hardcodează.",
      constraints: { min: 0, max: 100 },
    },
  ];

export const componentTechnicalSettingsRegistry = createTechnicalSettingsRegistry(
  lightingFrontLedTechnicalSettings,
);

export function listTypeTechnicalSettings(
  typeId: ComponentTypeId,
): readonly ComponentTechnicalSettingDefinition[] {
  return componentTechnicalSettingsRegistry.listByType(typeId);
}

export function resolvedSettingValue(
  settings: readonly ComponentTechnicalSettingDefinition[],
  id: string,
): number | undefined {
  const setting = settings.find((item) => item.id === id);
  if (setting?.resolution.status !== "RESOLVED") {
    return undefined;
  }
  return setting.resolution.value;
}

export function unresolvedSettingReasons(
  settings: readonly ComponentTechnicalSettingDefinition[],
  requiredIds: readonly string[],
): string[] {
  return requiredIds.flatMap((id) => {
    const setting = settings.find((item) => item.id === id);
    if (setting?.resolution.status === "RESOLVED") {
      return [];
    }
    return [setting?.unresolvedReason ?? `Setarea tehnică ${id} nu este stabilită`];
  });
}

export function projectTechnicalSettings(
  typeId: ComponentTypeId,
): readonly ComponentTechnicalSettingProjection[] {
  return listTypeTechnicalSettings(typeId).map(projectTechnicalSetting);
}

export function projectTechnicalSetting(
  setting: ComponentTechnicalSettingDefinition,
): ComponentTechnicalSettingProjection {
  const resolved = setting.resolution.status === "RESOLVED";
  return {
    id: setting.id,
    label: setting.label,
    valueDisplay: resolved
      ? formatSettingValue(setting.resolution.value, setting.unit)
      : "Nesetat",
    statusLabel: resolved ? "Setat" : "Necesită decizie owner",
    sourceLabel: sourceLabel(setting.classification),
    administrationLabel: setting.configurable ? "Configurabil" : "Fix",
  };
}

function settingKey(typeId: ComponentTypeId, id: string): string {
  return `${typeId}:${id}`;
}

function validateSetting(setting: ComponentTechnicalSettingDefinition): void {
  if (setting.id.trim().length === 0) {
    throw new Error("Technical setting id is required");
  }
  if (setting.classification === "OWNER_CONFIRMED") {
    if (setting.resolution.status !== "RESOLVED") {
      throw new Error(`${setting.id} is owner-confirmed but not resolved`);
    }
  }
  if (setting.classification === "OWNER_DECISION_REQUIRED") {
    if (setting.resolution.status !== "UNRESOLVED") {
      throw new Error(`${setting.id} requires an owner decision but is resolved`);
    }
  }
  if (setting.resolution.status === "RESOLVED") {
    if (!Number.isFinite(setting.resolution.value)) {
      throw new Error(`${setting.id} resolved value must be a finite number`);
    }
    const { min, max } = setting.constraints ?? {};
    if (min !== undefined && setting.resolution.value < min) {
      throw new Error(`${setting.id} is below minimum ${min}`);
    }
    if (max !== undefined && setting.resolution.value > max) {
      throw new Error(`${setting.id} is above maximum ${max}`);
    }
  }
}

function formatSettingValue(value: number, unit: TechnicalSettingUnit): string {
  switch (unit) {
    case "mm":
      return `${value} mm`;
    case "percent":
      return `${value} %`;
    case "W":
      return `${value} W`;
    default: {
      const _exhaustive: never = unit;
      return _exhaustive;
    }
  }
}

function sourceLabel(classification: TechnicalSettingClassification): string {
  switch (classification) {
    case "OWNER_CONFIRMED":
      return "Confirmat de owner";
    case "OWNER_DECISION_REQUIRED":
      return "Necesită decizie owner";
    default: {
      const _exhaustive: never = classification;
      return _exhaustive;
    }
  }
}
