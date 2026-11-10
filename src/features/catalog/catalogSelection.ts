import { navigate } from "../../routing/navigate";

export const CATALOG_TABS = ["constructie", "proces", "variante"] as const;

export type CatalogTab = (typeof CATALOG_TABS)[number];

export type CatalogSelection = {
  productCode: string | null;
  componentId: string | null;
  tab: CatalogTab;
};

const IDENTIFIER = /^[\w.-]+$/;

function isCatalogTab(value: string | null): value is CatalogTab {
  return value !== null && (CATALOG_TABS as readonly string[]).includes(value);
}

function readToken(value: string | null): string | null {
  return value && value.trim() !== "" ? value : null;
}

function safeIdentifier(value: string | null): string | null {
  const token = readToken(value);
  return token && IDENTIFIER.test(token) ? token : null;
}

export function readCatalogSelection(search: string): CatalogSelection {
  const params = new URLSearchParams(search);
  const tabValue = params.get("tab");
  return {
    productCode: readToken(params.get("product")),
    componentId: readToken(params.get("component")),
    tab: isCatalogTab(tabValue) ? tabValue : "constructie",
  };
}

export function catalogSelectionHref(selection: CatalogSelection): string {
  const params = new URLSearchParams();
  if (selection.productCode) {
    params.set("product", selection.productCode);
  }
  if (selection.componentId) {
    params.set("component", selection.componentId);
  }
  if (selection.tab !== "constructie") {
    params.set("tab", selection.tab);
  }
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

export function writeCatalogSelection(selection: CatalogSelection, mode: "push" | "replace" = "push"): void {
  navigate(catalogSelectionHref(selection), mode);
}

export function catalogAdminHref(
  path: "/admin/technical" | "/admin/formulas",
  typeId: string,
  selection: CatalogSelection,
): string {
  const params = new URLSearchParams();
  params.set("component", typeId);
  params.set("return", catalogSelectionHref(selection));
  return `${path}?${params.toString()}`;
}

export function sanitizeCatalogReturn(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (
    trimmed === "" ||
    !trimmed.startsWith("/catalog") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    trimmed.includes("://")
  ) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(trimmed, "https://workos.local");
  } catch {
    return null;
  }
  if (
    url.origin !== "https://workos.local" ||
    url.pathname !== "/catalog" ||
    url.username ||
    url.password ||
    url.hash !== ""
  ) {
    return null;
  }
  for (const key of url.searchParams.keys()) {
    if (key !== "product" && key !== "component" && key !== "tab") {
      return null;
    }
  }
  const product = url.searchParams.get("product");
  const component = url.searchParams.get("component");
  const tab = url.searchParams.get("tab");
  if (product !== null && !safeIdentifier(product)) {
    return null;
  }
  if (component !== null && !safeIdentifier(component)) {
    return null;
  }
  if (tab !== null && !isCatalogTab(tab)) {
    return null;
  }
  return catalogSelectionHref({
    productCode: product,
    componentId: component,
    tab: isCatalogTab(tab) ? tab : "constructie",
  });
}

export function catalogReturnFromSearch(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return sanitizeCatalogReturn(params.get("return")) ?? "/catalog";
}
