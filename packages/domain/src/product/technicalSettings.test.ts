import { describe, expect, it } from "vitest";
import { frontlitPlexiAl06FormSchema } from "./frontlitPlexiAl06.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  createTechnicalSettingsRegistry,
  listTypeTechnicalSettings,
  projectTechnicalSettings,
  unresolvedSettingReasons,
  type ComponentTechnicalSettingDefinition,
} from "./technicalSettings.js";

function fixtureSetting(
  overrides: Partial<ComponentTechnicalSettingDefinition> &
    Pick<ComponentTechnicalSettingDefinition, "id" | "typeId" | "resolution" | "classification">,
): ComponentTechnicalSettingDefinition {
  return {
    label: overrides.label ?? overrides.id,
    description: "fixture",
    valueType: "number",
    unit: "mm",
    source: "test fixture",
    configurable: true,
    unresolvedReason: `${overrides.id} nerezolvat`,
    ...overrides,
  };
}

describe("technical settings registry", () => {
  it("looks up settings by variant and rejects duplicate ids", () => {
    const registry = createTechnicalSettingsRegistry([
      fixtureSetting({
        id: "wasteFactor",
        typeId: "PLEXIGLAS_FACE",
        classification: "OWNER_CONFIRMED",
        resolution: { status: "RESOLVED", value: 1.1 },
      }),
      fixtureSetting({
        id: "cncToleranceMm",
        typeId: "PLEXIGLAS_FACE",
        classification: "OWNER_DECISION_REQUIRED",
        resolution: { status: "UNRESOLVED", reason: "OWNER_DECISION_REQUIRED" },
      }),
    ]);

    expect(registry.get("PLEXIGLAS_FACE", "wasteFactor")?.resolution).toEqual({
      status: "RESOLVED",
      value: 1.1,
    });
    expect(registry.listByType("PLEXIGLAS_FACE").map((item) => item.id)).toEqual([
      "wasteFactor",
      "cncToleranceMm",
    ]);
    expect(registry.listByType("LIGHTING_FRONT_LED")).toEqual([]);
    expect(
      unresolvedSettingReasons(registry.listByType("PLEXIGLAS_FACE"), [
        "wasteFactor",
        "cncToleranceMm",
      ]),
    ).toEqual(["cncToleranceMm nerezolvat"]);

    expect(() =>
      createTechnicalSettingsRegistry([
        fixtureSetting({
          id: "wasteFactor",
          typeId: "PLEXIGLAS_FACE",
          classification: "OWNER_CONFIRMED",
          resolution: { status: "RESOLVED", value: 1 },
        }),
        fixtureSetting({
          id: "wasteFactor",
          typeId: "PLEXIGLAS_FACE",
          classification: "OWNER_CONFIRMED",
          resolution: { status: "RESOLVED", value: 2 },
        }),
      ]),
    ).toThrow(/Duplicate technical setting/);
  });

  it("rejects classification that does not match resolution", () => {
    expect(() =>
      createTechnicalSettingsRegistry([
        fixtureSetting({
          id: "broken",
          typeId: "ALUMINIUM_VOLUME",
          classification: "OWNER_CONFIRMED",
          resolution: { status: "UNRESOLVED", reason: "OWNER_DECISION_REQUIRED" },
        }),
      ]),
    ).toThrow(/owner-confirmed but not resolved/);
  });
});

describe("canonical lighting settings", () => {
  it("owns LED pitch, module power and owner-confirmed PSU reserve once", () => {
    const settings = listTypeTechnicalSettings("LIGHTING_FRONT_LED");
    expect(settings.map((item) => item.id)).toEqual([
      LED_PITCH_SETTING_ID,
      LED_MODULE_POWER_SETTING_ID,
      PSU_RESERVE_SETTING_ID,
    ]);
    expect(settings[0]?.resolution).toEqual({ status: "RESOLVED", value: 100 });
    expect(settings[0]?.source).toBe("OWNER_CONFIRMED");
    expect(settings[1]?.resolution).toEqual({ status: "RESOLVED", value: 0.75 });
    expect(settings[1]?.source).toBe("OWNER_CONFIRMED_DEVELOPMENT_DEFAULT");
    expect(settings[1]?.configurable).toBe(true);
    expect(settings[2]?.resolution).toEqual({ status: "RESOLVED", value: 25 });
    expect(settings[2]?.source).toBe("OWNER_CONFIRMED");
    expect(settings[2]?.configurable).toBe(true);
    expect(projectTechnicalSettings("LIGHTING_FRONT_LED")).toEqual([
      {
        id: LED_PITCH_SETTING_ID,
        label: "Pas module LED",
        valueDisplay: "100 mm",
        statusLabel: "Setat",
        sourceLabel: "Confirmat de owner",
        administrationLabel: "Configurabil",
      },
      {
        id: LED_MODULE_POWER_SETTING_ID,
        label: "Putere modul LED",
        valueDisplay: "0.75 W",
        statusLabel: "Setat",
        sourceLabel: "Confirmat de owner",
        administrationLabel: "Configurabil",
      },
      {
        id: PSU_RESERVE_SETTING_ID,
        label: "Rezervă sursă de alimentare",
        valueDisplay: "25 %",
        statusLabel: "Setat",
        sourceLabel: "Confirmat de owner",
        administrationLabel: "Configurabil",
      },
    ]);
  });

  it("keeps system settings out of product intake", () => {
    const fieldIds = frontlitPlexiAl06FormSchema.sections.flatMap((section) =>
      section.fields.map((field) => field.id),
    );
    expect(fieldIds).not.toContain(LED_PITCH_SETTING_ID);
    expect(fieldIds).not.toContain(LED_MODULE_POWER_SETTING_ID);
    expect(fieldIds).not.toContain(PSU_RESERVE_SETTING_ID);
    expect(JSON.stringify(frontlitPlexiAl06FormSchema)).not.toMatch(
      /ledPitch|ledModulePower|psuReserve|Pas module LED|Putere modul LED|Rezervă sursă/,
    );
  });
});
