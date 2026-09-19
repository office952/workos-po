import { describe, expect, it } from "vitest";
import { presentCatalogProducts } from "./catalogAdapter";

describe("presentCatalogProducts", () => {
  it("flattens catalog products without inventing codes", () => {
    const products = presentCatalogProducts({
      tree: [
        {
          kind: "family",
          label: "Litere",
          children: [
            {
              kind: "product",
              code: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
              label: "Litere volumetrice luminoase",
              description: "Față plexiglas",
            },
          ],
        },
      ],
    });
    expect(products).toEqual([
      {
        code: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        label: "Litere volumetrice luminoase",
        description: "Față plexiglas",
        familyLabel: "Litere",
      },
    ]);
  });
});
