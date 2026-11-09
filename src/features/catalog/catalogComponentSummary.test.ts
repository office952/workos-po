import { describe, expect, it } from "vitest";
import { catalogComponentSummaryText } from "./catalogComponentSummary";

describe("catalogComponentSummaryText", () => {
  it("states missing settings without inventing formulas or resources", () => {
    expect(catalogComponentSummaryText({ settings: 0, formulas: 0, resources: 1 })).toBe("fără setări · 1 resursă");
    expect(catalogComponentSummaryText({ settings: 0, formulas: 0, resources: 2 })).toBe("fără setări · 2 resurse");
  });

  it("counts real settings, formulas and resources", () => {
    expect(catalogComponentSummaryText({ settings: 3, formulas: 3, resources: 5 })).toBe("3 setări · 3 formule · 5 resurse");
    expect(catalogComponentSummaryText({ settings: 1, formulas: 1, resources: 0 })).toBe("1 setare · 1 formulă");
  });
});
