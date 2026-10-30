import { getJson } from "./http";

export function fetchCatalogProcessGraph(
  productCode: string,
  scenarioId: string | null,
): Promise<unknown> {
  const params = new URLSearchParams({ product: productCode });
  if (scenarioId) {
    params.set("scenario", scenarioId);
  }
  return getJson(`/api/catalog/process-graph?${params.toString()}`);
}
