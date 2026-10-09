import { getJson, patchJson } from "./http";

export function fetchProductSystem(): Promise<unknown> {
  return getJson("/api/product-system-admin");
}

export function updateProductLabel(code: string, displayLabel: string, revision: number): Promise<unknown> {
  return patchJson(`/api/admin/product-system/entities/PRODUCT_TEMPLATE/${encodeURIComponent(code)}/display-label`, { displayLabel, revision });
}
