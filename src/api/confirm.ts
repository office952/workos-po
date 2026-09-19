import { postJson } from "./http";
import type { ConfirmRequest } from "./types";

export function confirmPath(productCode: string): string {
  return `/api/products/${encodeURIComponent(productCode)}/confirm`;
}

export async function postConfigurationConfirm(
  productCode: string,
  request: ConfirmRequest,
): Promise<unknown> {
  return postJson(confirmPath(productCode), request);
}
