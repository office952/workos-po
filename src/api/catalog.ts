import { getJson } from "./http";

export async function fetchProductCatalog(): Promise<unknown> {
  return getJson("/api/product-catalog");
}
