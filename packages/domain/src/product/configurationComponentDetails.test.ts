import { describe, expect, it } from "vitest";
import { projectConfigurationPreview } from "./configurationPreview.js";
import { CANONICAL_PRODUCT_CODE, frontlitPlexiAl06FormSchema, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { ACM_CASSETTE_NONE_PRODUCT_CODE, acmCassetteNoneFormSchema, acmCassetteNoneTemplate } from "./acmCassetteNone.js";
import { listTypeTechnicalSettings } from "./technicalSettings.js";
import { starterResolvedFormulas } from "./resolveFormulas.js";
import type { ResolvedTechnicalSetting } from "./resolveTechnicalSettings.js";

const values = { "root.inscription": "NORD", "face.finish": "none", "face.confirmedAreaMm2": 250000, "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
const formulas = starterResolvedFormulas();
function settings(): ResolvedTechnicalSetting[] {
  return listTypeTechnicalSettings("LIGHTING_FRONT_LED").map((setting) => ({
    definitionId: `${setting.typeId}:${setting.id}`, typeId: setting.typeId, settingId: setting.id,
    version: 2, status: "ACTIVE", value: setting.resolution.status === "RESOLVED" ? setting.resolution.value : 0,
    valueType: "number", unit: setting.unit, scope: "ORGANIZATION", source: "ORGANIZATION",
    effectiveFrom: "2026-10-08T00:00:00.000Z", createdAt: "2026-10-08T00:00:00.000Z",
  }));
}
function preview(next = values, resolved = settings()) {
  return projectConfigurationPreview(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, { templateCode: CANONICAL_PRODUCT_CODE, values: next }, resolved, formulas);
}

describe("configuration component detail projection", () => {
  it("projects the actual BACK area dependency and existing technical quantities without pricing", () => {
    const details = preview().componentDetails;
    const back = details.find((item) => item.componentId === "BACK")!;
    expect(back.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Suprafață preluată", value: "250.000 mm²", kind: "MEASURED", sourceLabel: "Din Față, confirmată de operator" }),
      expect.objectContaining({ value: "0,25 m²", kind: "CALCULATED" }),
    ]));
    expect(back.inputFields).toEqual([{ fieldId: "face.confirmedAreaMm2", label: "Suprafață confirmată (mm²)", value: "250.000 mm²", componentLabel: "Față" }]);
    expect(JSON.stringify(details)).not.toMatch(/resourceId|cost|currency|markup|rate|formulaTraces|astIdentity/);
  });

  it("uses organization versions for electrical settings and updates results from them", () => {
    const resolved = settings().map((item) => item.settingId === "ledPitchMm" ? { ...item, value: 80 } : item);
    const lighting = preview(values, resolved).componentDetails.find((item) => item.componentId === "LIGHTING")!;
    expect(lighting.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "setting:ledPitchMm", value: "80 mm", sourceLabel: "Setare organizație · versiunea 2" }),
      expect.objectContaining({ id: "result:ledModuleQuantity", value: "157 buc" }),
    ]));
    expect(lighting.inputFields[0].fieldId).toBe("volume.confirmedPerimeterMm");
    expect(lighting.hasFormulas).toBe(true);
    expect(lighting.hasTechnicalSettings).toBe(true);
  });

  it("keeps missing dependencies navigable and does not replace unknown calculations with zero", () => {
    const blocked = preview({ ...values, "face.confirmedAreaMm2": Number.NaN, "volume.confirmedPerimeterMm": Number.NaN });
    for (const id of ["BACK", "LIGHTING"]) {
      const details = blocked.componentDetails.find((item) => item.componentId === id)!;
      expect(details.facts.filter((fact) => fact.kind === "CALCULATED")).toEqual([]);
      expect(details.inputFields[0].value).toBe("De completat");
      expect(details.unavailable.length).toBeGreaterThan(0);
    }
    expect(blocked.readiness).toBe("blocked");
    expect(blocked.reviewId).toBeNull();
  });

  it("does not allow draft values to override product material identity or technical settings", () => {
    const input = { ...values, "back.thicknessMm": 3, ledPitchMm: 1 };
    const draft = JSON.stringify(input);
    const result = preview(input);
    expect(result.product.fixedValues["back.thicknessMm"]).toBe(10);
    expect(result.componentDetails.find((item) => item.componentId === "LIGHTING")?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "setting:ledPitchMm", value: "100 mm" }),
    ]));
    expect(JSON.stringify(input)).toBe(draft);
    expect(result.values).toBe(input);
  });

  it("retains ACM anatomy and its frame input targets without manufacturing a lighting component", () => {
    const frameSettings: ResolvedTechnicalSetting[] = listTypeTechnicalSettings("STEEL_INTERNAL_FRAME").map((setting) => ({
      ...settings()[0], typeId: setting.typeId, settingId: setting.id, value: 2, unit: setting.unit,
    }));
    const result = projectConfigurationPreview(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, { templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE, values: {
      "root.inscription": "ACM", "face.widthMm": 1200, "face.heightMm": 800, "face.cassetteDepthMm": 100,
    } }, frameSettings, formulas);
    expect(result.componentDetails.map((item) => item.componentId)).toEqual(["FACE", "BACK"]);
    const frame = result.componentDetails[1];
    expect(frame.inputFields.map((field) => field.fieldId)).toEqual(["face.widthMm", "face.heightMm"]);
    expect(frame.facts).toEqual(expect.arrayContaining([expect.objectContaining({ id: "setting:frameClearanceMm", value: "2 mm" })]));
    expect(frame.hasFormulas).toBe(false);
  });
});
