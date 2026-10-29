import { getJson } from "./http";

export function fetchCatalogCapabilities(): Promise<unknown> {
  return getJson("/api/catalog/capabilities");
}
