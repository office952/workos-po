import type { ComponentTypeId } from "./componentTypes.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  findTechnicalSettingDefinition,
  findTechnicalSettingDefinitionBySettingId,
  lightingFrontLedTechnicalSettings,
  technicalSettingDefinitionId,
  validateTechnicalSettingValue,
  type TechnicalSettingIssue,
  type TechnicalSettingUnit,
} from "./technicalSettings.js";

export const TECHNICAL_SETTING_VERSION_SOURCES = [
  "PLATFORM_STARTER",
  "ORGANIZATION",
] as const;
export type TechnicalSettingVersionSource =
  (typeof TECHNICAL_SETTING_VERSION_SOURCES)[number];

export const TECHNICAL_SETTING_VERSION_STATUSES = ["ACTIVE", "RETIRED"] as const;
export type TechnicalSettingVersionStatus =
  (typeof TECHNICAL_SETTING_VERSION_STATUSES)[number];

export const TECHNICAL_SETTING_ACTOR_KINDS = ["SYSTEM", "USER"] as const;
export type TechnicalSettingActorKind = (typeof TECHNICAL_SETTING_ACTOR_KINDS)[number];

export const TECHNICAL_SETTING_SCOPE = "ORGANIZATION" as const;

export const TECHNICAL_SETTING_STARTER_SYSTEM_ID = "TECHNICAL_SETTING_STARTER_V1";

export const SUPPORTED_TECHNICAL_SETTING_IDS = [
  LED_PITCH_SETTING_ID,
  LED_MODULE_POWER_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
] as const;

export type SupportedTechnicalSettingId = (typeof SUPPORTED_TECHNICAL_SETTING_IDS)[number];

export type TechnicalSettingActor =
  | { readonly kind: "SYSTEM"; readonly systemId: string }
  | { readonly kind: "USER"; readonly userId: string };

export type TechnicalSettingVersionRecord = {
  readonly technicalSettingVersionRowId: string;
  readonly definitionId: string;
  readonly typeId: ComponentTypeId;
  readonly settingId: string;
  readonly version: number;
  readonly status: TechnicalSettingVersionStatus;
  readonly value: number;
  readonly valueType: "number";
  readonly unit: TechnicalSettingUnit;
  readonly scope: typeof TECHNICAL_SETTING_SCOPE;
  readonly source: TechnicalSettingVersionSource;
  readonly effectiveFrom: string;
  readonly createdAt: string;
  readonly actorKind: TechnicalSettingActorKind;
  readonly actorUserId: string | null;
  readonly actorSystemId: string | null;
  readonly supersedesVersion: number | null;
};

export type TechnicalSettingDraftValue = {
  readonly settingId: string;
  readonly value: number;
};

export type TechnicalSettingSavePlan =
  | {
      readonly ok: true;
      readonly alreadyApplied: boolean;
      readonly next: readonly TechnicalSettingVersionRecord[];
      readonly retire: readonly { definitionId: string; version: number }[];
    }
  | { readonly ok: false; readonly issues: readonly TechnicalSettingIssue[] };

export function isTechnicalSettingVersionSource(
  value: string,
): value is TechnicalSettingVersionSource {
  return (TECHNICAL_SETTING_VERSION_SOURCES as readonly string[]).includes(value);
}

export function isTechnicalSettingVersionStatus(
  value: string,
): value is TechnicalSettingVersionStatus {
  return (TECHNICAL_SETTING_VERSION_STATUSES as readonly string[]).includes(value);
}

export function isTechnicalSettingActorKind(
  value: string,
): value is TechnicalSettingActorKind {
  return (TECHNICAL_SETTING_ACTOR_KINDS as readonly string[]).includes(value);
}

export function isSupportedTechnicalSettingId(
  value: string,
): value is SupportedTechnicalSettingId {
  return (SUPPORTED_TECHNICAL_SETTING_IDS as readonly string[]).includes(value);
}

export function technicalSettingSourceLabel(
  source: TechnicalSettingVersionSource,
): string {
  switch (source) {
    case "PLATFORM_STARTER":
      return "Valoare de pornire";
    case "ORGANIZATION":
      return "Valoare a organizației";
    default: {
      const _exhaustive: never = source;
      return _exhaustive;
    }
  }
}

export function technicalSettingStatusLabel(
  status: TechnicalSettingVersionStatus,
): string {
  switch (status) {
    case "ACTIVE":
      return "Activă";
    case "RETIRED":
      return "Retrasă";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function actorFieldsFrom(
  actor: TechnicalSettingActor,
): Pick<
  TechnicalSettingVersionRecord,
  "actorKind" | "actorUserId" | "actorSystemId"
> {
  switch (actor.kind) {
    case "SYSTEM":
      return {
        actorKind: "SYSTEM",
        actorUserId: null,
        actorSystemId: actor.systemId,
      };
    case "USER":
      return {
        actorKind: "USER",
        actorUserId: actor.userId,
        actorSystemId: null,
      };
    default: {
      const _exhaustive: never = actor;
      return _exhaustive;
    }
  }
}

export function actorIsValid(record: TechnicalSettingVersionRecord): boolean {
  switch (record.actorKind) {
    case "SYSTEM":
      return (
        typeof record.actorSystemId === "string" &&
        record.actorSystemId.trim().length > 0 &&
        record.actorUserId === null
      );
    case "USER":
      return (
        typeof record.actorUserId === "string" &&
        record.actorUserId.trim().length > 0 &&
        record.actorSystemId === null
      );
    default: {
      const _exhaustive: never = record.actorKind;
      return _exhaustive;
    }
  }
}

export function createPlatformStarterTechnicalSettingVersions(input: {
  readonly now: string;
  readonly rowIdFor: (definitionId: string) => string;
}): TechnicalSettingVersionRecord[] {
  return lightingFrontLedTechnicalSettings.map((definition) => {
    const definitionId = technicalSettingDefinitionId(definition.typeId, definition.id);
    if (definition.resolution.status !== "RESOLVED") {
      throw new Error(`starter_requires_resolved:${definitionId}`);
    }
    const issues = validateTechnicalSettingValue(
      definition,
      definition.resolution.value,
      definition.unit,
    );
    if (issues.length > 0) {
      throw new Error(`starter_invalid:${definitionId}:${issues[0]?.reason ?? "invalid"}`);
    }
    return {
      technicalSettingVersionRowId: input.rowIdFor(definitionId),
      definitionId,
      typeId: definition.typeId,
      settingId: definition.id,
      version: 1,
      status: "ACTIVE",
      value: definition.resolution.value,
      valueType: "number",
      unit: definition.unit,
      scope: TECHNICAL_SETTING_SCOPE,
      source: "PLATFORM_STARTER",
      effectiveFrom: input.now,
      createdAt: input.now,
      ...actorFieldsFrom({
        kind: "SYSTEM",
        systemId: TECHNICAL_SETTING_STARTER_SYSTEM_ID,
      }),
      supersedesVersion: null,
    };
  });
}

export function planTechnicalSettingsSave(
  existing: readonly TechnicalSettingVersionRecord[],
  drafts: readonly TechnicalSettingDraftValue[],
  actor: TechnicalSettingActor,
  input: { readonly rowIdFor: (definitionId: string) => string; readonly now: string },
): TechnicalSettingSavePlan {
  if (actor.kind === "USER" && actor.userId.trim().length === 0) {
    return {
      ok: false,
      issues: [{ field: "actor", reason: "Salvarea cere un utilizator autentificat." }],
    };
  }
  if (actor.kind === "SYSTEM" && actor.systemId.trim().length === 0) {
    return {
      ok: false,
      issues: [{ field: "actor", reason: "Salvarea de sistem cere un identificator valid." }],
    };
  }

  const issues: TechnicalSettingIssue[] = [];
  const next: TechnicalSettingVersionRecord[] = [];
  const retire: { definitionId: string; version: number }[] = [];

  for (const draft of drafts) {
    const definition = findTechnicalSettingDefinitionBySettingId(draft.settingId);
    if (!definition || !isSupportedTechnicalSettingId(draft.settingId)) {
      issues.push({
        field: draft.settingId,
        reason: "Setarea tehnică nu este administrabilă în această versiune.",
      });
      continue;
    }
    const valueIssues = validateTechnicalSettingValue(definition, draft.value, definition.unit);
    if (valueIssues.length > 0) {
      issues.push(...valueIssues);
      continue;
    }

    const definitionId = technicalSettingDefinitionId(definition.typeId, definition.id);
    const history = existing.filter((row) => row.definitionId === definitionId);
    const active = history.filter((row) => row.status === "ACTIVE");
    if (active.length > 1) {
      issues.push({
        field: draft.settingId,
        reason: "Există mai multe versiuni active. Salvează din nou după corectare.",
      });
      continue;
    }
    const currentActive = active[0] ?? null;
    if (currentActive && currentActive.value === draft.value) {
      continue;
    }

    const latestVersion = history.reduce((max, row) => (row.version > max ? row.version : max), 0);
    const nextVersion = latestVersion + 1;
    const supersedesVersion = currentActive
      ? currentActive.version
      : latestVersion > 0
        ? latestVersion
        : null;

    if (currentActive) {
      retire.push({ definitionId, version: currentActive.version });
    }

    next.push({
      technicalSettingVersionRowId: input.rowIdFor(definitionId),
      definitionId,
      typeId: definition.typeId,
      settingId: definition.id,
      version: nextVersion,
      status: "ACTIVE",
      value: draft.value,
      valueType: "number",
      unit: definition.unit,
      scope: TECHNICAL_SETTING_SCOPE,
      source: "ORGANIZATION",
      effectiveFrom: input.now,
      createdAt: input.now,
      ...actorFieldsFrom(actor),
      supersedesVersion,
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    alreadyApplied: next.length === 0,
    next,
    retire,
  };
}

export function isTechnicalSettingVersionRecord(
  value: unknown,
): value is TechnicalSettingVersionRecord {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const row = value as TechnicalSettingVersionRecord;
  const definition = findTechnicalSettingDefinition(row.definitionId);
  if (!definition) {
    return false;
  }
  if (
    typeof row.technicalSettingVersionRowId !== "string" ||
    row.typeId !== definition.typeId ||
    row.settingId !== definition.id ||
    !Number.isInteger(row.version) ||
    row.version < 1 ||
    !isTechnicalSettingVersionStatus(row.status) ||
    row.valueType !== "number" ||
    row.unit !== definition.unit ||
    row.scope !== TECHNICAL_SETTING_SCOPE ||
    !isTechnicalSettingVersionSource(row.source) ||
    !isTechnicalSettingActorKind(row.actorKind) ||
    typeof row.effectiveFrom !== "string" ||
    typeof row.createdAt !== "string"
  ) {
    return false;
  }
  if (row.supersedesVersion !== null && !Number.isInteger(row.supersedesVersion)) {
    return false;
  }
  if (validateTechnicalSettingValue(definition, row.value, row.unit).length > 0) {
    return false;
  }
  return actorIsValid(row);
}
