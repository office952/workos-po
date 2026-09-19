import { describe, expect, it } from "vitest";
import { PLEXIGLAS_3MM_OPAL_ID } from "../resources/catalog.js";
import { forexBackContract } from "./back.js";
import {
  attributeOwnershipLabel,
  getComponentType,
  resolveTypeResources,
} from "./componentTypes.js";
import { FACE_AREA_FIELD, plexiglasFaceContract } from "./face.js";
import { frontlitPlexiAl06FormSchema, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { aluminiumVolumeContract } from "./volume.js";

const faceOpal3 = {
  "face.materialFamily": "plexiglas",
  "face.thicknessMm": 3,
  "face.opticalType": "opal",
} as const;

describe("component configuration model", () => {
  it("keeps FACE as a role independent from plexiglas 3 mm", () => {
    const type = getComponentType("PLEXIGLAS_FACE");
    expect(type.role).toBe("FACE");
    expect(type.id).toBe("PLEXIGLAS_FACE");
    expect(type.id).not.toContain("3MM");
    expect(frontlitPlexiAl06Template.components.find((item) => item.id === "FACE")?.typeId).toBe(
      "PLEXIGLAS_FACE",
    );
  });

  it("calculates FACE 3 mm opal and FACE 5 mm with the same contract", () => {
    const measurements = plexiglasFaceContract.collectMeasurements({
      [FACE_AREA_FIELD]: 250000,
    });
    const opal3 = plexiglasFaceContract.calculate({
      values: { ...faceOpal3 },
      measurements,
      shared: {},
      technicalSettings: [],
    });
    const opal5 = plexiglasFaceContract.calculate({
      values: {
        "face.materialFamily": "plexiglas",
        "face.thicknessMm": 5,
        "face.opticalType": "opal",
      },
      measurements,
      shared: {},
      technicalSettings: [],
    });
    expect(opal3.typeId).toBe("PLEXIGLAS_FACE");
    expect(opal5.typeId).toBe("PLEXIGLAS_FACE");
    expect(opal3.quantities[0]?.value).toBe(0.25);
    expect(opal5.quantities[0]?.value).toBe(0.25);
    expect(opal3.requirements[0]?.resourceId).toBe(PLEXIGLAS_3MM_OPAL_ID);
    expect(opal5.requirements).toEqual([]);
    expect(opal5.unavailable).toContain(
      "Nicio specificație de Plexiglas pentru această configurație.",
    );
  });

  it("separates optical material property from applied finish", () => {
    const type = getComponentType("PLEXIGLAS_FACE");
    expect(type.attributes.find((item) => item.id === "face.opticalType")).toEqual(
      expect.objectContaining({
        ownership: "MATERIAL_IDENTITY",
        kind: "optical",
      }),
    );
    expect(type.attributes.find((item) => item.id === "face.finish")).toEqual(
      expect.objectContaining({
        ownership: "CONFIGURABLE_BY_ORDER",
        kind: "applied_finish",
      }),
    );
    expect(type.attributes.find((item) => item.id === "face.color")?.kind).toBe("applied_color");
    expect(attributeOwnershipLabel("MATERIAL_IDENTITY")).not.toBe(
      attributeOwnershipLabel("CONFIGURABLE_BY_ORDER"),
    );
    expect(frontlitPlexiAl06Template.fixedValues["face.opticalType"]).toBe("opal");
    expect(
      frontlitPlexiAl06FormSchema.sections
        .flatMap((section) => section.fields)
        .map((field) => field.id),
    ).not.toContain("face.opticalType");
    expect(
      frontlitPlexiAl06FormSchema.sections
        .flatMap((section) => section.fields)
        .map((field) => field.id),
    ).not.toContain("face.thicknessMm");
  });

  it("does not create a new VOLUME calculator for depth or finish", () => {
    const measurements = aluminiumVolumeContract.collectMeasurements({
      "volume.confirmedPerimeterMm": 12500,
    });
    const depth60 = aluminiumVolumeContract.calculate({
      values: { "volume.depthMm": "60", "volume.finish": "none" },
      measurements,
      shared: {},
      technicalSettings: [],
    });
    const depth100 = aluminiumVolumeContract.calculate({
      values: { "volume.depthMm": "100", "volume.finish": "vinyl", "volume.color": "red" },
      measurements,
      shared: {},
      technicalSettings: [],
    });
    expect(depth60.typeId).toBe(depth100.typeId);
    expect(depth60.quantities.find((item) => item.id === "volume_linear")?.value).toBe(
      depth100.quantities.find((item) => item.id === "volume_linear")?.value,
    );
    expect(depth60.quantities.find((item) => item.id === "volume_lateral")?.value).toBe(0.75);
    expect(depth100.quantities.find((item) => item.id === "volume_lateral")?.value).toBe(1.25);
    const withoutVinyl = (requirements: typeof depth60.requirements) =>
      requirements
        .filter((item) => item.resourceId !== "MAT-VINYL-ORACAL-651")
        .map((item) => ({
          componentId: item.componentId,
          resourceId: item.resourceId,
          quantity: item.quantity,
          unit: item.unit,
        }));
    expect(withoutVinyl(depth60.requirements)).toEqual(withoutVinyl(depth100.requirements));
    expect(
      depth60.requirements.find((item) => item.resourceId === "aluminium_return_profile")
        ?.costQualifier,
    ).toEqual({ volumeDepthMm: 60 });
    expect(
      depth100.requirements.find((item) => item.resourceId === "aluminium_return_profile")
        ?.costQualifier,
    ).toEqual({ volumeDepthMm: 100 });
    expect(depth100.requirements.some((item) => item.resourceId === "MAT-VINYL-ORACAL-651")).toBe(
      true,
    );
  });

  it("keeps BACK on one Forex contract when thickness changes", () => {
    const ten = forexBackContract.calculate({
      values: { "back.thicknessMm": 10 },
      measurements: [],
      shared: { confirmedAreaMm2: 250000 },
      technicalSettings: [],
    });
    const five = forexBackContract.calculate({
      values: { "back.thicknessMm": 5 },
      measurements: [],
      shared: { confirmedAreaMm2: 250000 },
      technicalSettings: [],
    });
    expect(ten.typeId).toBe("FOREX_BACK");
    expect(five.typeId).toBe("FOREX_BACK");
    expect(ten.quantities[0]?.value).toBe(0.25);
    expect(five.quantities[0]?.value).toBe(0.25);
    expect(ten.requirements).toHaveLength(1);
    expect(five.requirements).toEqual([]);
    expect(resolveTypeResources("FOREX_BACK", { "back.thicknessMm": 5 })[0]?.status).toBe(
      "UNRESOLVED",
    );
  });

  it("keeps technical settings off the product configuration path", () => {
    expect(frontlitPlexiAl06Template.fixedValues.ledPitchMm).toBeUndefined();
    expect(
      frontlitPlexiAl06FormSchema.sections.flatMap((section) => section.fields).map((item) => item.id),
    ).not.toEqual(
      expect.arrayContaining(["ledPitchMm", "ledModulePowerW", "psuReservePercent"]),
    );
    expect(
      getComponentType("LIGHTING_FRONT_LED").attributes.find((item) => item.id === "ledPitchMm")
        ?.ownership,
    ).toBe("TECHNICAL_SETTING");
  });
});
