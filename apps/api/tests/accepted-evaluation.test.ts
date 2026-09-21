import { describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  CANONICAL_PRODUCT_CODE,
  runWithProductEvaluationTraceAsync,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "PANOU ACM",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": 40,
};

async function previewProduct(productCode: string, values: Record<string, unknown>) {
  const response = await createApp().request(`/api/products/${productCode}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const body = await readBody(response);
  return { values, reviewId: body.reviewId as string, body };
}

describe("accepted product evaluation API", () => {
  it("does not evaluate or compile EIC for an unknown product", async () => {
    const { result, trace } = await runWithProductEvaluationTraceAsync(async () =>
      createApp().request("/api/products/PRD-UNKNOWN/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(result.status).toBe(404);
    expect(trace.evaluateProductComponents).toBe(0);
    expect(trace.compileEic).toBe(0);
    expect(trace.runtimePresent).toBe(1);
    expect(trace.runtimeLabels).toBe(0);
    expect(trace.listActiveCostEvidence).toBe(0);
  });

  it("does not evaluate or compile EIC before a reviewed definition exists", async () => {
    const { result, trace } = await runWithProductEvaluationTraceAsync(async () =>
      createApp().request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect(result.status).toBe(400);
    expect(trace.evaluateProductComponents).toBe(0);
    expect(trace.compileEic).toBe(0);
    expect(trace.runtimeLabels).toBe(0);
    expect(trace.listActiveCostEvidence).toBe(0);
  });

  it("does not evaluate or compile EIC for a not-ready reviewed definition", async () => {
    const values = {
      ...lettersValues,
      "root.inscription": "",
    };
    const reviewed = await previewProduct(CANONICAL_PRODUCT_CODE, values);
    const { result, trace } = await runWithProductEvaluationTraceAsync(async () =>
      createApp().request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values,
          reviewId: reviewed.reviewId,
        }),
      }),
    );
    expect(result.status).toBe(400);
    expect(trace.evaluateProductComponents).toBe(0);
    expect(trace.compileEic).toBe(0);
    expect(trace.runtimeLabels).toBe(0);
    expect(trace.listActiveCostEvidence).toBe(0);
  });

  it("does not evaluate or compile EIC for a review mismatch", async () => {
    const reviewed = await previewProduct(CANONICAL_PRODUCT_CODE, lettersValues);
    const { result, trace } = await runWithProductEvaluationTraceAsync(async () =>
      createApp().request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: { ...lettersValues, "root.inscription": "CHANGED" },
          reviewId: reviewed.reviewId,
        }),
      }),
    );
    expect(result.status).toBe(409);
    expect(trace.evaluateProductComponents).toBe(0);
    expect(trace.compileEic).toBe(0);
  });

  it("confirms LETTERS 60 mm with one evaluation, one EIC, and no extra runtime reads", async () => {
    const reviewed = await previewProduct(CANONICAL_PRODUCT_CODE, lettersValues);
    const { result, trace } = await runWithProductEvaluationTraceAsync(async () => {
      const response = await createApp().request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            values: reviewed.values,
            reviewId: reviewed.reviewId,
          }),
        },
      );
      return { status: response.status, body: await readBody(response) };
    });
    expect(result.status).toBe(200);
    expect((result.body.eic as JsonObject).total).toBe(382.5);
    expect((result.body.commercialPrice as JsonObject).grossPrice).toBe(624.82);
    expect(trace.evaluateProductComponents).toBe(1);
    expect(trace.compileEic).toBe(1);
    expect(trace.runtimePresent).toBe(1);
    expect(trace.runtimeLabels).toBe(1);
    expect(trace.listActiveCostEvidence).toBe(1);
  });

  it("confirms ACM cassette through the same evaluation pipeline", async () => {
    const reviewed = await previewProduct(ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    const { result, trace } = await runWithProductEvaluationTraceAsync(async () => {
      const response = await createApp().request(
        `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            values: reviewed.values,
            reviewId: reviewed.reviewId,
          }),
        },
      );
      return { status: response.status, body: await readBody(response) };
    });
    expect(result.status).toBe(200);
    expect(trace.evaluateProductComponents).toBe(1);
    expect(trace.compileEic).toBe(1);
    expect((result.body.eic as JsonObject).completeness).toBe("COMPLETE");
    expect((result.body.commercialPrice as JsonObject).grossPrice).toBe(118.66);
  });
});
