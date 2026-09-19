import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "./frontlitPlexiAl06.js";
import { getComponentContract } from "./componentRegistry.js";
import { plexiglasFaceContract } from "./face.js";
import {
  createDisplayLabelCatalog,
  seedDisplayLabelRecords,
} from "./displayMetadata.js";
import { presentProductSystem } from "./productSystemPresentation.js";

describe("product system presentation", () => {
  it("reads display labels from the supplied catalog not from code leftovers", () => {
    const labels = createDisplayLabelCatalog(
      seedDisplayLabelRecords().map((item) => {
        if (item.entityKind === "PRODUCT_FAMILY") {
          return { ...item, displayLabel: "Familie administrată", revision: 4 };
        }
        if (item.entityId === CANONICAL_PRODUCT_CODE) {
          return { ...item, displayLabel: "Produs administrat", revision: 3 };
        }
        if (item.entityId === "PLEXIGLAS_FACE") {
          return { ...item, displayLabel: "Față plexiglas administrată", revision: 2 };
        }
        return item;
      }),
    );
    const presented = presentProductSystem(labels);
    expect(presented.catalog[0]?.label).toBe("Familie administrată");
    expect(presented.admin.families[0]?.label).toBe("Familie administrată");
    expect(presented.admin.families[0]?.displayRevision).toBe(4);
    expect(presented.admin.products[0]?.label).toBe("Produs administrat");
    expect(presented.template(CANONICAL_PRODUCT_CODE)?.label).toBe("Produs administrat");
    expect(presented.admin.types[0]?.label).toBe("Față plexiglas administrată");
    expect(presented.components[0]?.types[0]?.label).toBe("Față plexiglas administrată");
    expect(presented.admin.products[0]?.code).toBe(CANONICAL_PRODUCT_CODE);
    expect(presented.admin.types[0]?.typeId).toBe("PLEXIGLAS_FACE");
    expect(getComponentContract("PLEXIGLAS_FACE")).toBe(plexiglasFaceContract);
  });
});
