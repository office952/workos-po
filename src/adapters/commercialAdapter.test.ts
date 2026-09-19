import { describe, expect, it } from "vitest";
import { presentCommercialPrice } from "./commercialAdapter";

describe("presentCommercialPrice", () => {
  it("passes through server selling price without calculating markup", () => {
    const presented = presentCommercialPrice({
      netPrice: 516.38,
      grossPrice: 624.82,
      vatPercent: 21,
      vatAmount: 108.44,
      currency: "EUR",
      completeness: "COMPLETE",
      unavailableReasons: [],
      internalCost: 382.5,
      internalCostCurrency: "EUR",
    });
    expect(presented).toEqual({
      netPrice: 516.38,
      grossPrice: 624.82,
      vatPercent: 21,
      vatAmount: 108.44,
      currency: "EUR",
      completeness: "COMPLETE",
      unavailableReasons: [],
      internalCost: 382.5,
      internalCostCurrency: "EUR",
    });
  });

  it("does not invent a selling price when the payload is missing", () => {
    expect(presentCommercialPrice(undefined)).toBeNull();
  });
});
