import { describe, expect, it } from "vitest";
import {
  buildCatalogTree,
  categoryHasCycle,
  getProductCategory,
  getProductFamily,
  isLeafCategory,
  productCategories,
  productFamilies,
} from "./catalog.js";
import { CANONICAL_PRODUCT_CODE, frontlitPlexiAl06Template } from "./frontlitPlexiAl06.js";
import { productTemplates } from "./productRegistry.js";
import { projectProductCatalog } from "./catalogProjection.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import type { ProductCategory, ProductFamily } from "./types.js";

describe("product catalog integrity", () => {
  it("keeps unique family, category, and product ids", () => {
    const familyIds = productFamilies.map((item) => item.id);
    const categoryIds = productCategories.map((item) => item.id);
    const productCodes = productTemplates.map((item) => item.code);
    expect(new Set(familyIds).size).toBe(familyIds.length);
    expect(new Set(categoryIds).size).toBe(categoryIds.length);
    expect(new Set(productCodes).size).toBe(productCodes.length);
  });

  it("keeps valid parent and family references without cycles", () => {
    for (const category of productCategories) {
      expect(getProductFamily(category.familyId)).toBeDefined();
      if (category.parentId) {
        const parent = getProductCategory(category.parentId);
        expect(parent).toBeDefined();
        expect(parent?.familyId).toBe(category.familyId);
      }
      expect(categoryHasCycle(productCategories, category.id)).toBe(false);
    }
  });

  it("places the canonical product on a leaf category in a known family", () => {
    expect(frontlitPlexiAl06Template.code).toBe(CANONICAL_PRODUCT_CODE);
    expect(frontlitPlexiAl06Template.legacyReference).toBe(
      "TPL-VOLUMETRIC-LETTERS_v2",
    );
    expect(getProductFamily(frontlitPlexiAl06Template.familyId)).toBeDefined();
    expect(getProductCategory(frontlitPlexiAl06Template.categoryId)).toBeDefined();
    expect(
      isLeafCategory(productCategories, frontlitPlexiAl06Template.categoryId),
    ).toBe(true);
  });

  it("does not create placeholder products in empty categories", () => {
    const occupied = new Set(productTemplates.map((item) => item.categoryId));
    const empty = productCategories.filter((item) => !occupied.has(item.id));
    expect(empty.length).toBeGreaterThan(0);
    const tree = projectProductCatalog(seededDisplayLabelCatalog());
    const emptyLabels = empty.map((item) => item.label);
    for (const family of tree) {
      if (family.kind !== "family") {
        continue;
      }
      for (const child of family.children) {
        if (child.kind === "category" && emptyLabels.includes(child.label)) {
          expect(child.children.some((node) => node.kind === "product")).toBe(
            false,
          );
        }
      }
    }
  });
});

describe("catalog tree depth", () => {
  it("renders a grandchild category without assuming two levels", () => {
    const families: ProductFamily[] = [
      { id: "F", label: "Familie", description: "" },
    ];
    const categories: ProductCategory[] = [
      {
        id: "C1",
        familyId: "F",
        parentId: null,
        label: "Categorie",
        sortOrder: 1,
      },
      {
        id: "C2",
        familyId: "F",
        parentId: "C1",
        label: "Subcategorie",
        sortOrder: 1,
      },
    ];
    const tree = buildCatalogTree(families, categories, [
      {
        code: "P1",
        label: "Produs",
        description: "",
        familyId: "F",
        categoryId: "C2",
      },
    ]);
    expect(tree[0]?.kind).toBe("family");
    if (tree[0]?.kind !== "family") {
      throw new Error("expected family");
    }
    expect(tree[0].children[0]?.kind).toBe("category");
    const category = tree[0].children[0];
    if (category?.kind !== "category") {
      throw new Error("expected category");
    }
    expect(category.children[0]?.kind).toBe("category");
    const nested = category.children[0];
    if (nested?.kind !== "category") {
      throw new Error("expected nested category");
    }
    expect(nested.children[0]).toMatchObject({ kind: "product", code: "P1" });
  });

  it("detects a category cycle", () => {
    const cyclic: ProductCategory[] = [
      {
        id: "A",
        familyId: "F",
        parentId: "B",
        label: "A",
        sortOrder: 1,
      },
      {
        id: "B",
        familyId: "F",
        parentId: "A",
        label: "B",
        sortOrder: 2,
      },
    ];
    expect(categoryHasCycle(cyclic, "A")).toBe(true);
  });
});
