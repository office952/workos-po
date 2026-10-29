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

export function writeCatalogSelection(selection: CatalogSelection): void {
  const next = catalogSelectionHref(selection);
  const current = `${window.location.pathname}${window.location.search}`;
  if (current !== next) {
    window.history.replaceState({}, "", next);
  }
}
