import { STEEL_FRAME_PROFILE_ID } from "../resources/catalog.js";
import {
  FACE_HEIGHT_FIELD,
  FACE_THICKNESS_FIELD,
  FACE_WIDTH_FIELD,
} from "./acmCassetteBody.js";
import { frameExternalSizeMm, rectanglePerimeterMm } from "./acmGeometry.js";
import type {
  ComponentCalculationContract,
  ComponentCalculationResult,
} from "./componentContract.js";
import { FRAME_CLEARANCE_SETTING_ID, resolvedSettingValue } from "./technicalSettings.js";
import { linearMetersFromMm } from "./units.js";

export const STEEL_INTERNAL_FRAME_TYPE_ID = "STEEL_INTERNAL_FRAME" as const;
export const FRAME_MISSING_PANEL_GEOMETRY = "Cadrul nu poate fi calculat fără dimensiunile casetei";
export const FRAME_MISSING_CLEARANCE = "Jocul de montaj al cadrului nu este configurat";

function frameResult(
  status: ComponentCalculationResult["status"],
  quantities: ComponentCalculationResult["quantities"],
  requirements: ComponentCalculationResult["requirements"],
  extraUnavailable: readonly string[] = [],
): ComponentCalculationResult {
  return {
    typeId: STEEL_INTERNAL_FRAME_TYPE_ID,
    role: "BACK",
    status,
    quantities,
    requirements,
    unavailable: [...extraUnavailable],
  };
}

export const steelInternalFrameContract: ComponentCalculationContract = {
  typeId: STEEL_INTERNAL_FRAME_TYPE_ID,
  role: "BACK",
  profile: {
    measurement: "none",
    quantityUnit: "m",
    independentCalculation: true,
    eic: "material",
    structuralGaps: [],
  },
  collectMeasurements() {
    return [];
  },
  calculate(input) {
    const width = input.measurements.find((item) => item.fieldId === FACE_WIDTH_FIELD);
    const height = input.measurements.find((item) => item.fieldId === FACE_HEIGHT_FIELD);
    const thickness = input.measurements.find((item) => item.fieldId === FACE_THICKNESS_FIELD);
    if (!width || !height || !thickness) {
      return frameResult("MISSING_MEASUREMENT", [], [], [FRAME_MISSING_PANEL_GEOMETRY]);
    }
    const clearanceMm = resolvedSettingValue(input.technicalSettings, FRAME_CLEARANCE_SETTING_ID);
    if (clearanceMm === undefined) {
      return frameResult("UNAVAILABLE", [], [], [FRAME_MISSING_CLEARANCE]);
    }
    const frameWidth = frameExternalSizeMm(width.value, thickness.value, clearanceMm);
    const frameHeight = frameExternalSizeMm(height.value, thickness.value, clearanceMm);
    if (frameWidth <= 0 || frameHeight <= 0) {
      return frameResult("UNAVAILABLE", [], [], ["Dimensiunile casetei sunt prea mici pentru cadru."]);
    }
    const perimeterM = linearMetersFromMm(rectanglePerimeterMm(frameWidth, frameHeight));
    return frameResult(
      "CALCULATED",
      [
        {
          componentId: "BACK",
          id: "frame_external_width_m",
          label: "Lățime exterioară cadru",
          value: linearMetersFromMm(frameWidth),
          unit: "m",
          basis: "calculated_from_settings",
        },
        {
          componentId: "BACK",
          id: "frame_external_height_m",
          label: "Înălțime exterioară cadru",
          value: linearMetersFromMm(frameHeight),
          unit: "m",
          basis: "calculated_from_settings",
        },
        {
          componentId: "BACK",
          id: "frame_perimeter",
          label: "Perimetru cadru intern",
          value: perimeterM,
          unit: "m",
          basis: "calculated_from_settings",
        },
      ],
      [
        {
          componentId: "BACK",
          resourceId: STEEL_FRAME_PROFILE_ID,
          quantity: perimeterM,
          unit: "m",
        },
      ],
    );
  },
};
