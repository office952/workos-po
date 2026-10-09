import { describe, expect, it } from "vitest";
import {
  MAT_LED_PSU_12V_100W_ID,
  MAT_LED_PSU_12V_160W_ID,
  MAT_LED_PSU_12V_200W_ID,
  MAT_LED_PSU_12V_60W_ID,
  listPsuCapacityCatalog,
} from "../resources/catalog.js";
import { selectPsuUnits } from "./psuSelection.js";

describe("selectPsuUnits", () => {
  it("selects one 160 W unit for the 12.5 m Letters fixture", () => {
    expect(selectPsuUnits(117.1875)).toEqual([
      expect.objectContaining({
        resourceId: MAT_LED_PSU_12V_160W_ID,
        capacityW: 160,
        quantity: 1,
      }),
    ]);
  });

  it("does not block above 200 W and stays deterministic", () => {
    const first = selectPsuUnits(225);
    const second = selectPsuUnits(225);
    expect(first).toEqual(second);
    expect(first).toEqual([
      expect.objectContaining({
        resourceId: MAT_LED_PSU_12V_200W_ID,
        quantity: 1,
      }),
      expect.objectContaining({
        resourceId: MAT_LED_PSU_12V_60W_ID,
        quantity: 1,
      }),
    ]);
    expect(first.reduce((sum, item) => sum + item.capacityW * item.quantity, 0)).toBeGreaterThanOrEqual(
      225,
    );
  });

  it("prefers fewer units, then less surplus", () => {
    expect(selectPsuUnits(100)).toEqual([
      expect.objectContaining({
        resourceId: MAT_LED_PSU_12V_100W_ID,
        quantity: 1,
      }),
    ]);
    expect(selectPsuUnits(201)).toEqual([
      expect.objectContaining({
        resourceId: MAT_LED_PSU_12V_160W_ID,
        quantity: 1,
      }),
      expect.objectContaining({
        resourceId: MAT_LED_PSU_12V_60W_ID,
        quantity: 1,
      }),
    ]);
  });

  it("filters PSU candidates by electrical voltage without cross-voltage fallback", () => {
    const catalog = [
      { resourceId: "PSU12", label: "12 V supply", capacityW: 100, voltageV: 12 },
      { resourceId: "PSU24", label: "24 V supply", capacityW: 160, voltageV: 24 },
    ];
    expect(selectPsuUnits(80, catalog, 12)).toEqual([
      { resourceId: "PSU12", label: "12 V supply", capacityW: 100, quantity: 1 },
    ]);
    expect(selectPsuUnits(80, catalog, 24)).toEqual([
      { resourceId: "PSU24", label: "24 V supply", capacityW: 160, quantity: 1 },
    ]);
    expect(selectPsuUnits(80, catalog, 48)).toEqual([]);
    expect(selectPsuUnits(80, catalog, -12)).toEqual([]);
  });

  it("reads capacities from the resource catalog", () => {
    expect(listPsuCapacityCatalog().some((item) => item.capacityW === 150)).toBe(false);
    expect(selectPsuUnits(50, listPsuCapacityCatalog())).toEqual([
      expect.objectContaining({ resourceId: MAT_LED_PSU_12V_60W_ID }),
    ]);
  });
});
