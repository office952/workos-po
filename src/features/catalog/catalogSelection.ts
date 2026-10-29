import { navigate } from "../../routing/navigate";

export type CatalogSelection = {
  productCode: string | null;
  componentId: string | null;
};

export function readCatalogSelection(search: string): CatalogSelection {
  const params = new URLSearchParams(search);
  const productCode = params.get("product");
  const componentId = params.get("component");
  return {
    productCode: productCode && productCode.trim() !== "" ? productCode : null,
    componentId: componentId && componentId.trim() !== "" ? componentId : null,
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
  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

export function writeCatalogSelection(selection: CatalogSelection, mode: "push" | "replace" = "push"): void {
  navigate(catalogSelectionHref(selection), mode);
}
