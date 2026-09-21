import { ACM_3MM_ID } from "../resources/catalog.js";
import { squareMetersFromMm2 } from "./units.js";
import { cassetteBlankMm, rectanglePerimeterMm } from "./acmGeometry.js";
import type {
  ComponentCalculationContract,
  ComponentCalculationInput,
  ComponentCalculationResult,
} from "./componentContract.js";
import { resolveTypeResources } from "./componentTypes.js";
import type { DraftValues, TechnicalMeasurement } from "./types.js";

export const ACM_CASSETTE_BODY_TYPE_ID = "ACM_CASSETTE_BODY" as const;
export const FACE_WIDTH_FIELD = "face.widthMm";
export const FACE_HEIGHT_FIELD = "face.heightMm";
export const FACE_CASSETTE_DEPTH_FIELD = "face.cassetteDepthMm";
export const FACE_BACK_RETURN_FIELD = "face.backReturnMm";
export const FACE_THICKNESS_FIELD = "face.thicknessMm";
export const FACE_MISSING_CASSETTE_GEOMETRY = "Dimensiunile casetei nu sunt confirmate";

function cassetteResult(
  status: ComponentCalculationResult["status"],
  quantities: ComponentCalculationResult["quantities"],
  requirements: ComponentCalculationResult["requirements"],
  extraUnavailable: readonly string[] = [],
): ComponentCalculationResult {
  return {
    typeId: ACM_CASSETTE_BODY_TYPE_ID,
    role: "FACE",
    status,
    quantities,
    requirements,
    unavailable: [...extraUnavailable],
  };
}

function numericValue(
  values: DraftValues,
  fieldId: string,
  options: { readonly allowZero?: boolean } = {},
): number | null {
  const raw = values[fieldId];
  const allowZero = options.allowZero === true;
  if (typeof raw === "number" && Number.isFinite(raw) && (allowZero ? raw >= 0 : raw > 0)) {
    return raw;
  }
  if (typeof raw === "string") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0)) {
      return parsed;
    }
  }
  return null;
}

export const acmCassetteBodyContract: ComponentCalculationContract = {
  typeId: ACM_CASSETTE_BODY_TYPE_ID,
  role: "FACE",
  profile: {
    measurement: "confirmed_outer_dimensions_mm",
    quantityUnit: "m2",
    independentCalculation: true,
    eic: "material",
    structuralGaps: [],
  },
  collectMeasurements(values: DraftValues): TechnicalMeasurement[] {
    const width = numericValue(values, FACE_WIDTH_FIELD);
    const height = numericValue(values, FACE_HEIGHT_FIELD);
    const depth = numericValue(values, FACE_CASSETTE_DEPTH_FIELD);
    const thickness = numericValue(values, FACE_THICKNESS_FIELD);
    const backReturnPresent = values[FACE_BACK_RETURN_FIELD] !== undefined;
    const backReturn = backReturnPresent
      ? numericValue(values, FACE_BACK_RETURN_FIELD, { allowZero: true })
      : 0;
    if (
      width === null ||
      height === null ||
      depth === null ||
      thickness === null ||
      backReturn === null
    ) {
      return [];
    }
    const measurements: TechnicalMeasurement[] = [
      {
        componentId: "FACE",
        fieldId: FACE_WIDTH_FIELD,
        value: width,
        unit: "mm",
        source: "OPERATOR_MANUAL",
        confirmed: true,
        label: "Lățime exterioară",
      },
      {
        componentId: "FACE",
        fieldId: FACE_HEIGHT_FIELD,
        value: height,
        unit: "mm",
        source: "OPERATOR_MANUAL",
        confirmed: true,
        label: "Înălțime exterioară",
      },
      {
        componentId: "FACE",
        fieldId: FACE_CASSETTE_DEPTH_FIELD,
        value: depth,
        unit: "mm",
        source: "OPERATOR_MANUAL",
        confirmed: true,
        label: "Adâncime casetă / prima întoarcere",
      },
      {
        componentId: "FACE",
        fieldId: FACE_THICKNESS_FIELD,
        value: thickness,
        unit: "mm",
        source: "OPERATOR_MANUAL",
        confirmed: true,
        label: "Grosime ACM",
      },
    ];
    if (backReturnPresent) {
      measurements.push({
        componentId: "FACE",
        fieldId: FACE_BACK_RETURN_FIELD,
        value: backReturn,
        unit: "mm",
        source: "OPERATOR_MANUAL",
        confirmed: true,
        label: "A doua întoarcere / buză spate",
      });
    }
    return measurements;
  },
  calculate(input: ComponentCalculationInput): ComponentCalculationResult {
    const width = input.measurements.find((item) => item.fieldId === FACE_WIDTH_FIELD);
    const height = input.measurements.find((item) => item.fieldId === FACE_HEIGHT_FIELD);
    const depth = input.measurements.find((item) => item.fieldId === FACE_CASSETTE_DEPTH_FIELD);
    const thickness = input.measurements.find((item) => item.fieldId === FACE_THICKNESS_FIELD);
    const backReturn = input.measurements.find((item) => item.fieldId === FACE_BACK_RETURN_FIELD);
    if (!width || !height || !depth || !thickness) {
      return cassetteResult("MISSING_MEASUREMENT", [], [], [FACE_MISSING_CASSETTE_GEOMETRY]);
    }
    const secondReturnMm = backReturn?.value ?? 0;
    const faceAreaMm2 = width.value * height.value;
    const blankWidth = cassetteBlankMm(width.value, depth.value, secondReturnMm);
    const blankHeight = cassetteBlankMm(height.value, depth.value, secondReturnMm);
    const blankAreaMm2 = blankWidth * blankHeight;
    const resolved = resolveTypeResources(ACM_CASSETTE_BODY_TYPE_ID, input.values);
    const requirements = resolved.flatMap((item) =>
      item.status === "RESOLVED"
        ? [
            {
              componentId: "FACE" as const,
              resourceId: item.resourceId,
              quantity: squareMetersFromMm2(blankAreaMm2),
              unit: "m2" as const,
            },
          ]
        : [],
    );
    if (requirements.length === 0) {
      requirements.push({
        componentId: "FACE",
        resourceId: ACM_3MM_ID,
        quantity: squareMetersFromMm2(blankAreaMm2),
        unit: "m2",
      });
    }
    return cassetteResult("CALCULATED", [
      {
        componentId: "FACE",
        id: "face_area",
        label: "Suprafață față",
        value: squareMetersFromMm2(faceAreaMm2),
        unit: "m2",
        basis: "confirmed_area",
      },
      {
        componentId: "FACE",
        id: "cassette_blank_area",
        label: "Foaie dezvoltată (implicit, nu nesting)",
        value: squareMetersFromMm2(blankAreaMm2),
        unit: "m2",
        basis: "calculated_from_settings",
      },
      {
        componentId: "FACE",
        id: "cassette_blank_perimeter",
        label: "Perimetru foaie dezvoltată",
        value: rectanglePerimeterMm(blankWidth, blankHeight) / 1000,
        unit: "m",
        basis: "calculated_from_settings",
      },
    ], requirements);
  },
};
