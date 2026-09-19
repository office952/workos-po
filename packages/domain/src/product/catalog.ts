import type {
  CatalogTreeNode,
  ProductCategory,
  ProductFamily,
  ProductTemplate,
} from "./types.js";

export const LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID = "LIGHTED_VOLUMETRIC_SIGNS";
export const SIGN_PANELS_FAMILY_ID = "SIGN_PANELS";
export const FRONT_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID =
  "FRONT_LIT_VOLUMETRIC_LETTERS";
export const ACM_CASSETTE_PANELS_CATEGORY_ID = "ACM_CASSETTE_PANELS";
export const HALO_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID =
  "HALO_LIT_VOLUMETRIC_LETTERS";
export const FULL_ALUMINIUM_VOLUMETRIC_LETTERS_CATEGORY_ID =
  "FULL_ALUMINIUM_VOLUMETRIC_LETTERS";

export const productFamilies: readonly ProductFamily[] = [
  {
    id: LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
    label: "Litere și semne volumetrice luminoase",
    description: "Familie de litere și semne volumetrice cu iluminare.",
  },
  {
    id: SIGN_PANELS_FAMILY_ID,
    label: "Panouri și casete",
    description: "Familie de panouri casetate. Fără iluminare în primul produs.",
  },
];

export const productCategories: readonly ProductCategory[] = [
  {
    id: FRONT_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID,
    familyId: LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
    parentId: null,
    label: "Litere volumetrice luminoase cu iluminare față",
    sortOrder: 1,
  },
  {
    id: HALO_LIT_VOLUMETRIC_LETTERS_CATEGORY_ID,
    familyId: LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
    parentId: null,
    label: "Litere volumetrice luminoase cu iluminare halou",
    sortOrder: 2,
  },
  {
    id: FULL_ALUMINIUM_VOLUMETRIC_LETTERS_CATEGORY_ID,
    familyId: LIGHTED_VOLUMETRIC_SIGNS_FAMILY_ID,
    parentId: null,
    label: "Litere volumetrice luminoase integral aluminiu",
    sortOrder: 3,
  },
  {
    id: ACM_CASSETTE_PANELS_CATEGORY_ID,
    familyId: SIGN_PANELS_FAMILY_ID,
    parentId: null,
    label: "Panouri ACM casetate",
    sortOrder: 1,
  },
];

export function getProductFamily(id: string): ProductFamily | undefined {
  return productFamilies.find((item) => item.id === id);
}

export function getProductCategory(id: string): ProductCategory | undefined {
  return productCategories.find((item) => item.id === id);
}

export function categoryHasCycle(
  categories: readonly ProductCategory[],
  startId: string,
): boolean {
  const seen = new Set<string>();
  let current = categories.find((item) => item.id === startId);
  while (current) {
    if (seen.has(current.id)) {
      return true;
    }
    seen.add(current.id);
    if (!current.parentId) {
      return false;
    }
    current = categories.find((item) => item.id === current?.parentId);
  }
  return false;
}

export function isLeafCategory(
  categories: readonly ProductCategory[],
  categoryId: string,
): boolean {
  return !categories.some((item) => item.parentId === categoryId);
}

export function buildCatalogTree(
  families: readonly ProductFamily[],
  categories: readonly ProductCategory[],
  products: readonly Pick<
    ProductTemplate,
    "code" | "label" | "description" | "familyId" | "categoryId"
  >[],
): CatalogTreeNode[] {
  return families.map((family) => ({
    kind: "family" as const,
    id: family.id,
    label: family.label,
    description: family.description,
    children: childNodes(family.id, null, categories, products),
  }));
}

function childNodes(
  familyId: string,
  parentId: string | null,
  categories: readonly ProductCategory[],
  products: readonly Pick<
    ProductTemplate,
    "code" | "label" | "description" | "familyId" | "categoryId"
  >[],
): CatalogTreeNode[] {
  const nested = categories
    .filter((item) => item.familyId === familyId && item.parentId === parentId)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((category) => ({
      kind: "category" as const,
      id: category.id,
      label: category.label,
      children: childNodes(familyId, category.id, categories, products),
    }));

  const placed = products
    .filter((item) => item.familyId === familyId && item.categoryId === parentId)
    .map((item) => ({
      kind: "product" as const,
      code: item.code,
      label: item.label,
      description: item.description,
    }));

  return [...nested, ...placed];
}
