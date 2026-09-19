import type {
  ComponentCalculationContract,
  ComponentCalculationInput,
  ComponentCalculationResult,
} from "./componentContract.js";
import { MAT_VINYL_ORACAL_651_ID } from "../resources/catalog.js";
import { resolveTypeResources } from "./componentTypes.js";
import type { DraftValues, TechnicalMeasurement } from "./types.js";
import { squareMetersFromMm2 } from "./units.js";

export const FACE_COMPONENT_ID = "FACE";
export const FACE_AREA_FIELD = "face.confirmedAreaMm2";
export const FACE_MISSING_AREA = "Suprafață față neconfirmată";

export function faceAreaSquareMeters(areaMm2: number): number {
  return squareMetersFromMm2(areaMm2);
}

function faceResult(
  status: ComponentCalculationResult["status"],
  quantities: ComponentCalculationResult["quantities"],
  requirements: ComponentCalculationResult["requirements"],
  extraUnavailable: readonly string[] = [],
): ComponentCalculationResult {
  return {
    typeId: "PLEXIGLAS_FACE",
    role: "FACE",
    status,
    quantities,
    requirements,
    unavailable: [...extraUnavailable],
  };
}

export const plexiglasFaceContract: ComponentCalculationContract = {
  typeId: "PLEXIGLAS_FACE",
  role: "FACE",
  profile: {
    measurement: "confirmed_area_mm2",
    quantityUnit: "m2",
    independentCalculation: true,
    eic: "material",
    structuralGaps: [],
  },
  collectMeasurements(values: DraftValues): TechnicalMeasurement[] {
    const area = values[FACE_AREA_FIELD];
    if (typeof area !== "number") {
      return [];
    }
    return [
      {
        componentId: FACE_COMPONENT_ID,
        fieldId: FACE_AREA_FIELD,
        value: area,
        unit: "mm2",
        source: "OPERATOR_MANUAL",
        confirmed: true,
      },
    ];
  },
  calculate(input: ComponentCalculationInput): ComponentCalculationResult {
    const area = input.measurements.find(
      (item) => item.fieldId === FACE_AREA_FIELD,
    );
    if (!area) {
      return faceResult("MISSING_MEASUREMENT", [], [], [FACE_MISSING_AREA]);
    }
    const squareMeters = faceAreaSquareMeters(area.value);
    const resolved = resolveTypeResources("PLEXIGLAS_FACE", input.values);
    const requirements = [
      ...resolved.flatMap((item) =>
        item.status === "RESOLVED"
          ? [
              {
                componentId: FACE_COMPONENT_ID,
                resourceId: item.resourceId,
                quantity: squareMeters,
                unit: "m2" as const,
              },
            ]
          : [],
      ),
      ...(input.values["face.finish"] === "vinyl"
        ? [
            {
              componentId: FACE_COMPONENT_ID,
              resourceId: MAT_VINYL_ORACAL_651_ID,
              quantity: squareMeters,
              unit: "m2" as const,
            },
          ]
        : []),
    ];
    return faceResult(
      "CALCULATED",
      [
        {
          componentId: FACE_COMPONENT_ID,
          id: "face_area",
          label: "Suprafață față",
          value: squareMeters,
          unit: "m2",
          basis: "confirmed_area",
        },
      ],
      requirements,
      resolved.flatMap((item) => (item.status === "UNRESOLVED" ? [item.reason] : [])),
    );
  },
};
