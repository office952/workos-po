import { createApp } from "../src/app.js";

type App = ReturnType<typeof createApp>;

export async function previewAcceptedValues(
  app: App,
  productCode: string,
  values: Record<string, unknown>,
) {
  const response = await app.request(`/api/products/${productCode}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const body = (await response.json()) as {
    reviewId?: string | null;
    readiness?: string;
    error?: string;
    product?: { fixedValues?: Record<string, unknown> };
  };
  return {
    status: response.status,
    values,
    reviewId: typeof body.reviewId === "string" ? body.reviewId : "",
    readiness: body.readiness,
    body,
  };
}

export function acceptedProductPayload(
  values: Record<string, unknown>,
  reviewId: string,
  extra: Record<string, unknown> = {},
) {
  return { values, reviewId, ...extra };
}
