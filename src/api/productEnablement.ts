import { getJson, sendJson } from "./http";

export function productEnablementPath(): string {
  return "/api/admin/product-enablement";
}

export async function fetchProductEnablement(): Promise<unknown> {
  return getJson(productEnablementPath());
}

export async function postProductEnablement(body: {
  products: ReadonlyArray<{ templateCode: string; enabled: boolean }>;
}): Promise<ReturnType<typeof sendJson>> {
  return sendJson("POST", productEnablementPath(), body);
}
