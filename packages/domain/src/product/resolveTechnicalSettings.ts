import type { ComponentTypeId } from "./componentTypes.js";
import {
  actorIsValid,
  isTechnicalSettingVersionRecord,
  isTechnicalSettingVersionSource,
  type PersistedTechnicalSettingVersion,
  type TechnicalSettingVersionRecord,
} from "./technicalSettingVersion.js";
import {
  applyResolvedTechnicalSettingValue,
  findTechnicalSettingDefinition,
  listTypeTechnicalSettings,
  requiredTechnicalSettingDefinitions,
  technicalSettingDefinitionId,
  validateTechnicalSettingValue,
  type ComponentTechnicalSettingDefinition,
  type TechnicalSettingUnit,
} from "./technicalSettings.js";

export const TECHNICAL_SETTINGS_INACTIVE = "TECHNICAL_SETTINGS_INACTIVE";
export const TECHNICAL_SETTINGS_INVALID = "TECHNICAL_SETTINGS_INVALID";

export const TECHNICAL_SETTINGS_EMPTY_REASON =
  "Setările tehnice ale organizației lipsesc. Organizația trebuie inițializată înainte de calcul.";

export const TECHNICAL_SETTINGS_INACTIVE_REASON =
  "Setările tehnice nu au o versiune activă validă. Configurează setările înainte de calcule noi.";

export const TECHNICAL_SETTINGS_INVALID_REASON =
  "Istoricul setărilor tehnice este invalid. Calculele noi sunt blocate până la corectare.";

export type ResolvedTechnicalSetting = {
  readonly definitionId: string;
  readonly typeId: ComponentTypeId;
  readonly settingId: string;
  readonly version: number;
  readonly status: "ACTIVE";
  readonly value: number;
  readonly valueType: "number";
  readonly unit: TechnicalSettingUnit;
  readonly scope: "ORGANIZATION";
  readonly source: TechnicalSettingVersionRecord["source"];
  readonly effectiveFrom: string;
  readonly createdAt: string;
};

export type TechnicalSettingResolution =
  | { readonly ok: true; readonly settings: readonly ResolvedTechnicalSetting[] }
  | {
      readonly ok: false;
      readonly error: typeof TECHNICAL_SETTINGS_INACTIVE | typeof TECHNICAL_SETTINGS_INVALID;
      readonly reason: string;
      readonly history: readonly PersistedTechnicalSettingVersion[];
    };

export function resolveOrganizationTechnicalSettings(
  versions: readonly PersistedTechnicalSettingVersion[],
  options: {
    readonly requiredDefinitions?: readonly ComponentTechnicalSettingDefinition[];
  } = {},
): TechnicalSettingResolution {
  const required = options.requiredDefinitions ?? requiredTechnicalSettingDefinitions();
  if (versions.length === 0) {
    return {
      ok: false,
      error: TECHNICAL_SETTINGS_INACTIVE,
      reason: TECHNICAL_SETTINGS_EMPTY_REASON,
      history: versions,
    };
  }

  const records: TechnicalSettingVersionRecord[] = [];
  for (const row of versions) {
    if (!isTechnicalSettingVersionRecord(row)) {
      return {
        ok: false,
        error: TECHNICAL_SETTINGS_INVALID,
        reason: TECHNICAL_SETTINGS_INVALID_REASON,
        history: versions,
      };
    }
    records.push(row);
  }

  const requiredIds = new Set(
    required.map((definition) => technicalSettingDefinitionId(definition.typeId, definition.id)),
  );
  const active = records.filter((row) => row.status === "ACTIVE");
  for (const row of active) {
    if (!requiredIds.has(row.definitionId) || !findTechnicalSettingDefinition(row.definitionId)) {
      return {
        ok: false,
        error: TECHNICAL_SETTINGS_INVALID,
        reason: TECHNICAL_SETTINGS_INVALID_REASON,
        history: versions,
      };
    }
  }

  const resolved: ResolvedTechnicalSetting[] = [];
  for (const definition of required) {
    const definitionId = technicalSettingDefinitionId(definition.typeId, definition.id);
    const definitionActive = active.filter((row) => row.definitionId === definitionId);
    if (definitionActive.length !== 1) {
      return {
        ok: false,
        error: TECHNICAL_SETTINGS_INACTIVE,
        reason: TECHNICAL_SETTINGS_INACTIVE_REASON,
        history: versions,
      };
    }
    const row = definitionActive[0];
    if (
      !row ||
      !isTechnicalSettingVersionSource(row.source) ||
      !actorIsValid(row) ||
      row.unit !== definition.unit ||
      row.valueType !== "number" ||
      row.scope !== "ORGANIZATION" ||
      row.typeId !== definition.typeId ||
      row.settingId !== definition.id
    ) {
      return {
        ok: false,
        error: TECHNICAL_SETTINGS_INVALID,
        reason: TECHNICAL_SETTINGS_INVALID_REASON,
        history: versions,
      };
    }
    if (validateTechnicalSettingValue(definition, row.value, row.unit).length > 0) {
      return {
        ok: false,
        error: TECHNICAL_SETTINGS_INVALID,
        reason: TECHNICAL_SETTINGS_INVALID_REASON,
        history: versions,
      };
    }
    resolved.push({
      definitionId,
      typeId: row.typeId,
      settingId: row.settingId,
      version: row.version,
      status: "ACTIVE",
      value: row.value,
      valueType: "number",
      unit: row.unit,
      scope: "ORGANIZATION",
      source: row.source,
      effectiveFrom: row.effectiveFrom,
      createdAt: row.createdAt,
    });
  }

  return { ok: true, settings: resolved };
}

export function technicalSettingsForTypeFromResolved(
  typeId: ComponentTypeId,
  resolved: readonly ResolvedTechnicalSetting[],
): ComponentTechnicalSettingDefinition[] {
  const definitions = listTypeTechnicalSettings(typeId);
  if (definitions.length === 0) {
    return [];
  }
  return definitions.map((definition) => {
    const match = resolved.find(
      (item) => item.typeId === typeId && item.settingId === definition.id,
    );
    if (!match) {
      throw new Error(
        `resolved_setting_missing:${technicalSettingDefinitionId(typeId, definition.id)}`,
      );
    }
    return applyResolvedTechnicalSettingValue(definition, match.value);
  });
}

export function technicalSettingsLookupFromResolved(
  resolved: readonly ResolvedTechnicalSetting[],
): (typeId: ComponentTypeId) => readonly ComponentTechnicalSettingDefinition[] {
  return (typeId) => technicalSettingsForTypeFromResolved(typeId, resolved);
}
