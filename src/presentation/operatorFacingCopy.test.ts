import { describe, expect, it } from "vitest";
import {
  presentOperatorFacingCopy,
  presentOperatorFacingCopyOrNull,
} from "./operatorFacingCopy";

describe("presentOperatorFacingCopy", () => {
  it("maps English owner wording to Proprietar without touching identifiers", () => {
    expect(
      presentOperatorFacingCopy(
        "Formula poate fi schimbată de owner fără editare de sursă.",
      ),
    ).toBe("Formula poate fi schimbată de proprietar fără editare de sursă.");
    expect(
      presentOperatorFacingCopy(
        "Valoare implicită de platformă. Trebuie confirmată de owner.",
      ),
    ).toBe("Valoare implicită de platformă. Trebuie confirmată de proprietar.");
    expect(presentOperatorFacingCopy("Achiziție confirmată de owner")).toBe(
      "Achiziție confirmată de proprietar",
    );
    expect(presentOperatorFacingCopy("Doar ownerul poate confirma.")).toBe(
      "Doar proprietarul poate confirma.",
    );
    expect(presentOperatorFacingCopy("LIGHTING_FRONT_LED.ledModuleQuantity")).toBe(
      "LIGHTING_FRONT_LED.ledModuleQuantity",
    );
  });

  it("preserves null", () => {
    expect(presentOperatorFacingCopyOrNull(null)).toBeNull();
    expect(presentOperatorFacingCopyOrNull(undefined)).toBeNull();
  });
});
