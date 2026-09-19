import { postJson } from "./http";
import type { PreviewRequest } from "./types";

export function previewPath(productCode: string): string {
  return `/api/products/${encodeURIComponent(productCode)}/preview`;
}

export async function postConfigurationPreview(
  productCode: string,
  request: PreviewRequest,
): Promise<unknown> {
  return postJson(previewPath(productCode), request);
}
