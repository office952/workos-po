import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAT_LED_MODULE_ID,
  MAT_LED_PSU_12V_160W_ID,
  MAT_LED_PSU_12V_200W_ID,
  MAT_LED_PSU_12V_60W_ID,
  listPsuCapacityCatalog,
} from "../resources/catalog.js";
import {
  LIGHTING_MISSING_LED_GEOMETRY,
  LIGHTING_MISSING_PSU_SELECTION,
  ledModuleQuantityFromPerimeter,
  lightingFrontLedContract,
  requiredPsuCapacityW,
} from "./lighting.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  listTypeTechnicalSettings,
  type ComponentTechnicalSettingDefinition,
} from "./technicalSettings.js";

const lightingSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "lighting.ts"),
  "utf8",
);
const contractSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "componentContract.ts"),
  "utf8",
);
const evaluationSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "componentEvaluation.ts"),
  "utf8",
);
const compilerSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "compiler.ts"),
  "utf8",
);

const confirmedPerimeter = {
  componentId: "VOLUME",
  fieldId: "volume.confirmedPerimeterMm",
  value: 12500,
  unit: "mm" as const,
  source: "OPERATOR_MANUAL" as const,
  confirmed: true as const,
};

function lightingSettings(
  overrides: Partial<Record<string, number>> = {},
): ComponentTechnicalSettingDefinition[] {
  return listTypeTechnicalSettings("LIGHTING_FRONT_LED").map((setting) => {
    const value = overrides[setting.id];
    if (value === undefined) {
      return setting;
    }
    return {
      ...setting,
      resolution: { status: "RESOLVED", value },
    };
  });
}

describe("LIGHTING_FRONT_LED", () => {
  it("resolves pitch, module power and PSU reserve as configurable settings", () => {
    const technicalSettings = listTypeTechnicalSettings("LIGHTING_FRONT_LED");
    const pitch = technicalSettings.find((item) => item.id === LED_PITCH_SETTING_ID);
    const power = technicalSettings.find((item) => item.id === LED_MODULE_POWER_SETTING_ID);
    const reserve = technicalSettings.find((item) => item.id === PSU_RESERVE_SETTING_ID);
    expect(pitch?.resolution).toEqual({ status: "RESOLVED", value: 100 });
    expect(power?.resolution).toEqual({ status: "RESOLVED", value: 0.75 });
    expect(power?.source).toBe("OWNER_CONFIRMED_DEVELOPMENT_DEFAULT");
    expect(power?.configurable).toBe(true);
    expect(reserve?.resolution).toEqual({ status: "RESOLVED", value: 25 });
    expect(reserve?.configurable).toBe(true);
  });

  it("stays partial without inventing LED quantity or fake zeros", () => {
    const result = lightingFrontLedContract.calculate({
      values: { "lighting.mode": "front_lit" },
      measurements: [],
      shared: {},
      technicalSettings: lightingSettings(),
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.quantities).toEqual([]);
    expect(result.requirements).toEqual([]);
    expect(result.unavailable).toEqual([LIGHTING_MISSING_LED_GEOMETRY]);
    expect(result.requirements.some((item) => item.quantity === 0)).toBe(false);
    expect(result.quantities.some((item) => item.value === 0)).toBe(false);
  });

  it("calculates modules, load, reserve and one 160 W PSU from confirmed perimeter", () => {
    expect(ledModuleQuantityFromPerimeter(12500, 100)).toBe(125);
    const result = lightingFrontLedContract.calculate({
      values: {},
      measurements: [confirmedPerimeter],
      shared: {},
      technicalSettings: lightingSettings(),
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.unavailable).toEqual([]);
    expect(result.quantities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "ledModuleQuantity",
          value: 125,
          unit: "buc",
        }),
        expect.objectContaining({
          id: "totalLedLoadW",
          value: 93.75,
          unit: "W",
        }),
        expect.objectContaining({
          id: "requiredPsuCapacityW",
          value: 117.1875,
          unit: "W",
        }),
        expect.objectContaining({
          id: "selectedPsu:MAT-LED-PSU-12V-160W",
          value: 1,
          unit: "buc",
        }),
      ]),
    );
    expect(result.requirements).toEqual([
      {
        componentId: "LIGHTING",
        resourceId: MAT_LED_MODULE_ID,
        quantity: 125,
        unit: "buc",
      },
      {
        componentId: "LIGHTING",
        resourceId: MAT_LED_PSU_12V_160W_ID,
        quantity: 1,
        unit: "buc",
      },
    ]);
  });

  it("selects multiple PSU units when required capacity exceeds 200 W", () => {
    const result = lightingFrontLedContract.calculate({
      values: {},
      measurements: [confirmedPerimeter],
      shared: {},
      technicalSettings: lightingSettings({ [LED_MODULE_POWER_SETTING_ID]: 1.44 }),
    });
    expect(result.status).toBe("CALCULATED");
    expect(result.quantities.find((item) => item.id === "totalLedLoadW")?.value).toBe(180);
    expect(result.quantities.find((item) => item.id === "requiredPsuCapacityW")?.value).toBe(
      225,
    );
    expect(result.requirements.filter((item) => item.resourceId !== MAT_LED_MODULE_ID)).toEqual([
      {
        componentId: "LIGHTING",
        resourceId: MAT_LED_PSU_12V_200W_ID,
        quantity: 1,
        unit: "buc",
      },
      {
        componentId: "LIGHTING",
        resourceId: MAT_LED_PSU_12V_60W_ID,
        quantity: 1,
        unit: "buc",
      },
    ]);
    expect(result.unavailable).not.toContain(LIGHTING_MISSING_PSU_SELECTION);
  });

  it("keeps the PSU formula setting-driven and free of hardcoded calibratable values", () => {
    expect(requiredPsuCapacityW(100, 25)).toBe(125);
    expect(requiredPsuCapacityW(100, 30)).toBe(130);
    expect(lightingSource).not.toMatch(/\b0\.75\b/);
    expect(lightingSource).not.toMatch(/\b25\b/);
    expect(lightingSource).not.toMatch(/\b1\.25\b/);
    expect(lightingSource).not.toMatch(/\b30\b/);
    expect(lightingSource).not.toMatch(/\b1\.30\b/);
    expect(lightingSource).not.toMatch(/\b250\b/);
    expect(lightingSource).not.toMatch(/\b150\b/);
    expect(lightingSource).not.toMatch(/shared\.totalLedLoadW/);
    expect(contractSource).not.toMatch(/totalLedLoadW/);
    expect(evaluationSource).not.toMatch(/totalLedLoadW/);
    expect(compilerSource).not.toMatch(/ledModuleQuantityFromPerimeter|selectPsuUnits/);
  });

  it("does not keep a 150 W PSU or 250 mm pitch as active truth", () => {
    expect(listPsuCapacityCatalog().map((item) => item.capacityW).sort((a, b) => a - b)).toEqual([
      60, 100, 160, 200,
    ]);
    expect(listTypeTechnicalSettings("LIGHTING_FRONT_LED").map((item) => item.resolution)).toEqual([
      { status: "RESOLVED", value: 100 },
      { status: "RESOLVED", value: 0.75 },
      { status: "RESOLVED", value: 25 },
    ]);
  });
});
