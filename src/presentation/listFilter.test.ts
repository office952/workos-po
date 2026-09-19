import { describe, expect, it } from "vitest";
import { matchesSearch, uniqueLabels } from "./listFilter";

describe("listFilter", () => {
  it("matches any presented part without inventing values", () => {
    expect(matchesSearch("nord", ["Atelier Nord", "Cerere"])).toBe(true);
    expect(matchesSearch("lipsa", ["Atelier Nord"])).toBe(false);
    expect(matchesSearch("  ", ["Atelier Nord"])).toBe(true);
  });

  it("keeps first-seen unique labels", () => {
    expect(uniqueLabels(["Pregătită", "—", "Pregătită", "Nerezolvată", ""])).toEqual([
      "Pregătită",
      "Nerezolvată",
    ]);
  });
});
