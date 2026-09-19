import { describe, expect, it } from "vitest";
import { presentCostLine } from "./costLine";

describe("presentCostLine", () => {
  it("formats server-owned fields and does not multiply quantity by rate", () => {
    const presented = presentCostLine({
      resourceId: "aluminium_return_profile",
      label: "Profil aluminiu 0,6 mm",
      quantity: 12.5,
      unit: "m",
      rate: 3,
      currency: "EUR",
      cost: 99,
    });
    expect(presented.equationLabel).toContain("99,00 EUR");
    expect(presented.equationLabel).not.toContain("37,50");
  });
});
