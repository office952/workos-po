import { describe, expect, it } from "vitest";
import { presentConfigurationComponentDetails } from "./configurationComponentDetailsAdapter";

describe("component technical detail adapter", () => {
  it("passes server display values and input targets without inferring formulas or ownership", () => {
    const result = presentConfigurationComponentDetails([{
      componentId: "CUSTOM", label: "Componentă", typeId: "CUSTOM_TYPE", calculationLabel: "Calcul parțial",
      facts: [{ id: "custom", label: "Rezultat", value: "valoare server", kind: "CALCULATED", sourceLabel: "sursă server" }],
      inputFields: [{ fieldId: "opaque", label: "Intrare", value: "—", componentLabel: "Sursă" }],
      unavailable: ["De completat", 3], hasFormulas: true,
    }]);
    expect(result[0].facts[0].value).toBe("valoare server");
    expect(result[0].inputFields[0].fieldId).toBe("opaque");
    expect(result[0].unavailable).toEqual(["De completat"]);
    expect(result[0].hasTechnicalSettings).toBe(false);
  });

  it("supports older payloads and drops malformed facts instead of inventing values", () => {
    expect(presentConfigurationComponentDetails(undefined)).toEqual([]);
    expect(presentConfigurationComponentDetails([{}, null])).toEqual([]);
    const result = presentConfigurationComponentDetails([{ componentId: "BACK", label: "Spate", typeId: "BACK_TYPE", calculationLabel: "Indisponibil", facts: [{ id: "x", value: 0 }], inputFields: [null] }]);
    expect(result[0].facts).toEqual([]);
    expect(result[0].inputFields).toEqual([]);
  });
});
