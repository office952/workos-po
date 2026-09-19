import type {
  ComponentCalculationContract,
  ComponentCalculationInput,
  ComponentCalculationResult,
} from "./componentContract.js";
import { resolveTypeResources } from "./componentTypes.js";
import { squareMetersFromMm2 } from "./units.js";

export const BACK_COMPONENT_ID = "BACK";

const BACK_GAPS = [] as const;

function backResult(
  status: ComponentCalculationResult["status"],
  quantities: ComponentCalculationResult["quantities"],
  requirements: ComponentCalculationResult["requirements"],
  extraUnavailable: readonly string[] = [],
): ComponentCalculationResult {
  return {
    typeId: "FOREX_BACK",
    role: "BACK",
    status,
    quantities,
    requirements,
    unavailable: [...BACK_GAPS, ...extraUnavailable],
  };
}

export const forexBackContract: ComponentCalculationContract = {
  typeId: "FOREX_BACK",
  role: "BACK",
  profile: {
    measurement: "supplied_area_mm2",
    quantityUnit: "m2",
    independentCalculation: true,
    eic: "material",
    structuralGaps: BACK_GAPS,
  },
  collectMeasurements() {
    return [];
  },
  calculate(input: ComponentCalculationInput): ComponentCalculationResult {
    const areaMm2 = input.shared.confirmedAreaMm2;
    if (typeof areaMm2 !== "number") {
      return backResult("MISSING_MEASUREMENT", [], []);
    }
    const squareMeters = squareMetersFromMm2(areaMm2);
    const resolved = resolveTypeResources("FOREX_BACK", input.values);
    const requirements = resolved.flatMap((item) =>
      item.status === "RESOLVED"
        ? [
            {
              componentId: BACK_COMPONENT_ID,
              resourceId: item.resourceId,
              quantity: squareMeters,
              unit: "m2" as const,
            },
          ]
        : [],
    );
    return backResult(
      "CALCULATED",
      [
        {
          componentId: BACK_COMPONENT_ID,
          id: "back_area",
          label: "Suprafață spate",
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
