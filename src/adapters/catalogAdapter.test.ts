import { describe, expect, it } from "vitest";
import { presentCatalogProducts } from "./catalogAdapter";

describe("presentCatalogProducts", () => {
  it("preserves family and category labels from the server tree", () => {
    const products = presentCatalogProducts({
      tree: [
        {
          kind: "family",
          label: "Litere",
          children: [
            {
              kind: "category",
              label: "Frontlit",
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
        },
      ],
    });
    expect(products).toEqual([
      {
        code: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        label: "Litere volumetrice luminoase",
        description: "Față plexiglas",
        familyLabel: "Litere",
        categoryLabel: "Frontlit",
      },
    ]);
  });

  it("keeps products without inventing codes when categories are absent", () => {
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
        categoryLabel: null,
      },
    ]);
  });
});
