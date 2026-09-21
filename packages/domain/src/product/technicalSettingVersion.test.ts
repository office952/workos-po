import { describe, expect, it } from "vitest";
import {
  CONFIGURATION_SOURCES,
  isConfigurationSource,
} from "../configuration/contracts.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  validateTechnicalSettingValue,
} from "./technicalSettings.js";
import {
  TECHNICAL_SETTING_STARTER_SYSTEM_ID,
  createPlatformStarterTechnicalSettingVersions,
  isTechnicalSettingVersionRecord,
  planTechnicalSettingsSave,
  type PersistedTechnicalSettingVersion,
  type TechnicalSettingVersionRecord,
} from "./technicalSettingVersion.js";
import {
  TECHNICAL_SETTINGS_EMPTY_REASON,
  TECHNICAL_SETTINGS_INACTIVE,
  TECHNICAL_SETTINGS_INVALID,
  resolveOrganizationTechnicalSettings,
} from "./resolveTechnicalSettings.js";

function rowIdFor(definitionId: string): string {
  return `tsv:${definitionId}:test`;
}

function starters(now = "2026-09-20T00:00:00.000Z"): TechnicalSettingVersionRecord[] {
  return createPlatformStarterTechnicalSettingVersions({ now, rowIdFor });
}

describe("technical setting validation authority", () => {
  it("rejects zero pitch with an exclusive lower bound, not min=0", () => {
    const definition = {
      id: LED_PITCH_SETTING_ID,
      typeId: "LIGHTING_FRONT_LED" as const,
      label: "Pas module LED",
      description: "test",
      valueType: "number" as const,
      unit: "mm" as const,
      resolution: { status: "RESOLVED" as const, value: 100 },
      source: "test",
      classification: "OWNER_CONFIRMED" as const,
      configurable: true,
      unresolvedReason: "missing",
      constraints: { exclusiveMin: 0 },
    };
    expect(validateTechnicalSettingValue(definition, 0, "mm")[0]?.reason).toMatch(/mai mare decât 0/);
    expect(validateTechnicalSettingValue(definition, -1, "mm")).toHaveLength(1);
    expect(validateTechnicalSettingValue(definition, 80, "mm")).toEqual([]);
    expect(validateTechnicalSettingValue(definition, Number.NaN, "mm")).toHaveLength(1);
    expect(validateTechnicalSettingValue(definition, 80, "W")[0]?.reason).toMatch(/Unitatea/);
  });

  it("rejects negative module power and reserve outside 0-100", () => {
    const power = {
      id: LED_MODULE_POWER_SETTING_ID,
      typeId: "LIGHTING_FRONT_LED" as const,
      label: "Putere modul LED",
      description: "test",
      valueType: "number" as const,
      unit: "W" as const,
      resolution: { status: "RESOLVED" as const, value: 0.75 },
      source: "test",
      classification: "OWNER_CONFIRMED" as const,
      configurable: true,
      unresolvedReason: "missing",
      constraints: { min: 0 },
    };
    const reserve = {
      ...power,
      id: PSU_RESERVE_SETTING_ID,
      label: "Rezervă sursă de alimentare",
      unit: "percent" as const,
      constraints: { min: 0, max: 100 },
    };
    expect(validateTechnicalSettingValue(power, 0, "W")).toEqual([]);
    expect(validateTechnicalSettingValue(power, -0.1, "W")).toHaveLength(1);
    expect(validateTechnicalSettingValue(reserve, 0, "percent")).toEqual([]);
    expect(validateTechnicalSettingValue(reserve, 100, "percent")).toEqual([]);
    expect(validateTechnicalSettingValue(reserve, 101, "percent")).toHaveLength(1);
  });
});

describe("technical setting starter factory", () => {
  it("materializes current ACTIVE PLATFORM_STARTER SYSTEM rows from current starter inputs", () => {
    const rows = starters();
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => [row.settingId, row.value, row.version, row.source, row.actorKind])).toEqual([
      [LED_PITCH_SETTING_ID, 100, 1, "PLATFORM_STARTER", "SYSTEM"],
      [LED_MODULE_POWER_SETTING_ID, 0.75, 1, "PLATFORM_STARTER", "SYSTEM"],
      [PSU_RESERVE_SETTING_ID, 25, 1, "PLATFORM_STARTER", "SYSTEM"],
      ["frameClearanceMm", 2, 1, "PLATFORM_STARTER", "SYSTEM"],
    ]);
    expect(rows.every((row) => row.actorSystemId === TECHNICAL_SETTING_STARTER_SYSTEM_ID)).toBe(true);
    expect(rows.every((row) => row.status === "ACTIVE")).toBe(true);
    expect(rows.every(isTechnicalSettingVersionRecord)).toBe(true);
  });
});

describe("technical setting version save", () => {
  it("increments, supersedes, and treats unchanged values as alreadyApplied", () => {
    const existing = starters();
    const unchanged = planTechnicalSettingsSave(
      existing,
      [{ settingId: LED_PITCH_SETTING_ID, value: 100 }],
      { kind: "USER", userId: "user-1" },
      { now: "2026-09-20T01:00:00.000Z", rowIdFor },
    );
    expect(unchanged).toEqual({
      ok: true,
      alreadyApplied: true,
      next: [],
      retire: [],
    });

    const changed = planTechnicalSettingsSave(
      existing,
      [{ settingId: LED_PITCH_SETTING_ID, value: 80 }],
      { kind: "USER", userId: "user-1" },
      { now: "2026-09-20T01:00:00.000Z", rowIdFor },
    );
    expect(changed.ok).toBe(true);
    if (!changed.ok) {
      throw new Error("expected save plan");
    }
    expect(changed.alreadyApplied).toBe(false);
    expect(changed.retire).toEqual([
      { definitionId: "LIGHTING_FRONT_LED.ledPitchMm", version: 1 },
    ]);
    expect(changed.next[0]).toMatchObject({
      settingId: LED_PITCH_SETTING_ID,
      version: 2,
      value: 80,
      source: "ORGANIZATION",
      actorKind: "USER",
      actorUserId: "user-1",
      actorSystemId: null,
      supersedesVersion: 1,
      status: "ACTIVE",
    });
  });

  it("rejects invalid values and refuses a second ACTIVE stream", () => {
    const existing = starters();
    const invalid = planTechnicalSettingsSave(
      existing,
      [{ settingId: LED_PITCH_SETTING_ID, value: 0 }],
      { kind: "USER", userId: "user-1" },
      { now: "2026-09-20T01:00:00.000Z", rowIdFor },
    );
    expect(invalid.ok).toBe(false);

    const doubled = [
      ...existing,
      { ...existing[0]!, technicalSettingVersionRowId: "dup", version: 2 },
    ];
    const blocked = planTechnicalSettingsSave(
      doubled,
      [{ settingId: LED_PITCH_SETTING_ID, value: 80 }],
      { kind: "USER", userId: "user-1" },
      { now: "2026-09-20T01:00:00.000Z", rowIdFor },
    );
    expect(blocked.ok).toBe(false);
  });
});

describe("technical setting resolver", () => {
  it("resolves PLATFORM_STARTER and ORGANIZATION versions and fails closed otherwise", () => {
    const starterResolution = resolveOrganizationTechnicalSettings(starters());
    expect(starterResolution.ok).toBe(true);
    if (!starterResolution.ok) {
      throw new Error("expected starter resolution");
    }
    expect(starterResolution.settings.map((item) => [item.settingId, item.value, item.source])).toEqual([
      [LED_PITCH_SETTING_ID, 100, "PLATFORM_STARTER"],
      [LED_MODULE_POWER_SETTING_ID, 0.75, "PLATFORM_STARTER"],
      [PSU_RESERVE_SETTING_ID, 25, "PLATFORM_STARTER"],
      ["frameClearanceMm", 2, "PLATFORM_STARTER"],
    ]);

    const planned = planTechnicalSettingsSave(
      starters(),
      [{ settingId: LED_PITCH_SETTING_ID, value: 80 }],
      { kind: "USER", userId: "user-1" },
      { now: "2026-09-20T01:00:00.000Z", rowIdFor },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      throw new Error("expected plan");
    }
    const retired = starters().map((row) =>
      row.settingId === LED_PITCH_SETTING_ID ? { ...row, status: "RETIRED" as const } : row,
    );
    const organization = resolveOrganizationTechnicalSettings([...retired, ...planned.next]);
    expect(organization.ok).toBe(true);
    if (!organization.ok) {
      throw new Error("expected organization resolution");
    }
    expect(organization.settings.find((item) => item.settingId === LED_PITCH_SETTING_ID)).toMatchObject({
      value: 80,
      source: "ORGANIZATION",
      version: 2,
    });

    expect(resolveOrganizationTechnicalSettings([])).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INACTIVE,
      reason: TECHNICAL_SETTINGS_EMPTY_REASON,
    });
    expect(resolveOrganizationTechnicalSettings(retired.filter((row) => row.status === "RETIRED"))).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INACTIVE,
    });
    expect(
      resolveOrganizationTechnicalSettings([
        ...starters(),
        { ...starters()[0]!, technicalSettingVersionRowId: "dup", version: 9 },
      ]),
    ).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INACTIVE,
    });
    expect(
      resolveOrganizationTechnicalSettings(
        starters().map((row) =>
          row.settingId === LED_PITCH_SETTING_ID ? { ...row, value: 0 } : row,
        ),
      ),
    ).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INVALID,
    });
  });

  it("does not inherit later platform starter or code values after first materialization", () => {
    const persisted = starters("2026-09-20T00:00:00.000Z");
    const laterPlatform = persisted.map((row) =>
      row.settingId === LED_PITCH_SETTING_ID ? { ...row, value: 80 } : row,
    );
    const resolved = resolveOrganizationTechnicalSettings(persisted);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error("expected persisted resolution");
    }
    expect(resolved.settings.find((item) => item.settingId === LED_PITCH_SETTING_ID)?.value).toBe(100);
    expect(laterPlatform.find((row) => row.settingId === LED_PITCH_SETTING_ID)?.value).toBe(80);
  });

  it("rejects any persisted row that fails the version-record guard", () => {
    const valid = starters();
    const unknownDefinition: PersistedTechnicalSettingVersion = {
      ...valid[0]!,
      technicalSettingVersionRowId: "unknown",
      definitionId: "UNKNOWN.type.setting",
      typeId: "UNKNOWN_TYPE",
      settingId: "unknownSetting",
    };
    const withUnknown = [...valid, unknownDefinition];
    const unknownResolution = resolveOrganizationTechnicalSettings(withUnknown);
    expect(unknownResolution).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INVALID,
    });
    expect(unknownResolution.ok ? [] : unknownResolution.history).toHaveLength(5);
    expect(unknownResolution.ok).toBe(false);

    expect(
      resolveOrganizationTechnicalSettings(
        valid.map((row) =>
          row.settingId === LED_PITCH_SETTING_ID ? { ...row, unit: "W" } : row,
        ),
      ),
    ).toMatchObject({ ok: false, error: TECHNICAL_SETTINGS_INVALID });
    expect(
      resolveOrganizationTechnicalSettings(
        valid.map((row) =>
          row.settingId === LED_PITCH_SETTING_ID ? { ...row, source: "CODE_DEFAULT" } : row,
        ),
      ),
    ).toMatchObject({ ok: false, error: TECHNICAL_SETTINGS_INVALID });
    expect(
      resolveOrganizationTechnicalSettings(
        valid.map((row) =>
          row.settingId === LED_PITCH_SETTING_ID ? { ...row, scope: "VARIANT" } : row,
        ),
      ),
    ).toMatchObject({ ok: false, error: TECHNICAL_SETTINGS_INVALID });
    expect(
      resolveOrganizationTechnicalSettings(
        valid.map((row) =>
          row.settingId === LED_MODULE_POWER_SETTING_ID
            ? { ...row, valueType: "string" }
            : row,
        ),
      ),
    ).toMatchObject({ ok: false, error: TECHNICAL_SETTINGS_INVALID });
    expect(
      resolveOrganizationTechnicalSettings(
        valid.map((row) =>
          row.settingId === PSU_RESERVE_SETTING_ID
            ? { ...row, actorKind: "USER", actorUserId: null, actorSystemId: null }
            : row,
        ),
      ),
    ).toMatchObject({ ok: false, error: TECHNICAL_SETTINGS_INVALID });

    const silentlyReduced = withUnknown.filter(isTechnicalSettingVersionRecord);
    expect(silentlyReduced).toHaveLength(4);
    expect(resolveOrganizationTechnicalSettings(silentlyReduced).ok).toBe(true);
    expect(resolveOrganizationTechnicalSettings(withUnknown).ok).toBe(false);

    expect(resolveOrganizationTechnicalSettings(valid).ok).toBe(true);
  });
});

describe("commercial source contract remains CF1-narrow", () => {
  it("does not accept PLATFORM_STARTER as a commercial configuration source", () => {
    expect(CONFIGURATION_SOURCES).toEqual(["CODE_DEFAULT", "ORGANIZATION"]);
    expect(isConfigurationSource("PLATFORM_STARTER")).toBe(false);
    expect(isConfigurationSource("CODE_DEFAULT")).toBe(true);
    expect(isConfigurationSource("ORGANIZATION")).toBe(true);
  });
});
