import { describe, expect, it } from "vitest";
import {
  ALUMINIUM_RETURN_PROFILE_ID,
  FOREX_10MM_ID,
  MAT_LED_MODULE_ID,
  MAT_LED_PSU_12V_100W_ID,
  MAT_LED_PSU_12V_160W_ID,
  MAT_LED_PSU_12V_200W_ID,
  MAT_LED_PSU_12V_60W_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  RETURN_CANT_FORMING_ID,
} from "./catalog.js";
import { liveResourceIdsForType, resolveResourcesForType } from "./resolve.js";

describe("resource resolution", () => {
  it("resolves FACE 3 mm opal to the reusable Plexiglas specification", () => {
    expect(
      resolveResourcesForType("PLEXIGLAS_FACE", {
        "face.thicknessMm": 3,
        "face.opticalType": "opal",
      }),
    ).toEqual([{ status: "RESOLVED", resourceId: PLEXIGLAS_3MM_OPAL_ID }]);
    expect(
      resolveResourcesForType("PLEXIGLAS_FACE", {
        "face.thicknessMm": 5,
        "face.opticalType": "opal",
      })[0]?.status,
    ).toBe("UNRESOLVED");
  });

  it("resolves BACK 10 mm and leaves 5 mm unresolved", () => {
    expect(
      resolveResourcesForType("FOREX_BACK", { "back.thicknessMm": 10 }),
    ).toEqual([{ status: "RESOLVED", resourceId: FOREX_10MM_ID }]);
    expect(
      resolveResourcesForType("FOREX_BACK", { "back.thicknessMm": 5 })[0]?.status,
    ).toBe("UNRESOLVED");
  });

  it("resolves VOLUME to aluminium profile plus forming service", () => {
    expect(
      resolveResourcesForType("ALUMINIUM_VOLUME", { "volume.thicknessMm": 0.6 }),
    ).toEqual([
      { status: "RESOLVED", resourceId: ALUMINIUM_RETURN_PROFILE_ID },
      { status: "RESOLVED", resourceId: RETURN_CANT_FORMING_ID },
    ]);
    expect(liveResourceIdsForType("ALUMINIUM_VOLUME")).toEqual([
      ALUMINIUM_RETURN_PROFILE_ID,
      RETURN_CANT_FORMING_ID,
    ]);
    expect(liveResourceIdsForType("LIGHTING_FRONT_LED")).toEqual([
      MAT_LED_MODULE_ID,
      MAT_LED_PSU_12V_60W_ID,
      MAT_LED_PSU_12V_100W_ID,
      MAT_LED_PSU_12V_160W_ID,
      MAT_LED_PSU_12V_200W_ID,
    ]);
    expect(resolveResourcesForType("LIGHTING_FRONT_LED", {})).toEqual([]);
  });
});
