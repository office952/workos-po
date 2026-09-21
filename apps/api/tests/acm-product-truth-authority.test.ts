import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_CASSETTE_NONE_PROOF_VALUES,
  ACM_CASSETTE_NONE_READY_VALUES,
  CANONICAL_PRODUCT_CODE,
  FRAME_CLEARANCE_SETTING_ID,
  compileDefinition,
  definitionReviewId,
  acmCassetteNoneFormSchema,
  acmCassetteNoneTemplate,
  type ProductDefinition,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { cleanupCloudTemps } from "./cloud-harness.js";
import { acceptedProductPayload, previewAcceptedValues } from "./accepted-product-helpers.js";

type JsonObject = Record<string, unknown>;

afterEach(() => {
  cleanupCloudTemps();
});

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const lettersReady = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmFixedIdentity = {
  "face.materialFamily": "acm",
  "face.thicknessMm": 3,
  "face.finish": "none",
  "back.materialFamily": "steel",
} as const;

function craftMaliciousAcmDefinition(): ProductDefinition {
  const honest = compileDefinition(acmCassetteNoneTemplate, acmCassetteNoneFormSchema, {
    templateCode: ACM_CASSETTE_NONE_PRODUCT_CODE,
    values: ACM_CASSETTE_NONE_READY_VALUES,
  });
  const crafted: ProductDefinition = {
    ...honest,
    values: {
      ...honest.values,
      "face.thicknessMm": 8,
      "face.materialFamily": "plexiglas",
      "root.mountingSystem": "steel_angle",
      "face.foldCount": "2",
    },
    selectedComponentIds: [...honest.selectedComponentIds, "FORGED"],
  };
  return { ...crafted, reviewId: definitionReviewId(crafted) };
}

async function createCustomer(app: ReturnType<typeof createApp>, name = "Client ACM") {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

describe("ACM accepted product authority", () => {
  it("rejects definition-only confirm, quote freeze, and accepted production", async () => {
    const app = createApp();
    const compiled = await readBody(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: ACM_CASSETTE_NONE_READY_VALUES }),
      }),
    );
    const payload = {
      definition: compiled.definition,
      reviewId: compiled.reviewId,
    };
    const confirm = await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const quote = await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        customerId: await createCustomer(app),
      }),
    });
    const production = await app.request(
      `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(confirm.status).toBe(400);
    expect((await readBody(confirm)).error).toBe("review_required");
    expect(quote.status).toBe(400);
    expect((await readBody(quote)).error).toBe("review_required");
    expect(production.status).toBe(400);
    expect((await readBody(production)).error).toBe("review_required");
  });

  it("ignores a malicious extra definition when values and crv1 are valid", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(
      app,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      ACM_CASSETTE_NONE_READY_VALUES,
    );
    expect(previewed.reviewId).toMatch(/^crv1:/);
    const crafted = craftMaliciousAcmDefinition();
    const response = await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...acceptedProductPayload(previewed.values, previewed.reviewId),
        definition: crafted,
      }),
    });
    expect(response.status).toBe(200);
    const truth = (await readBody(response)).truth as { values: Record<string, unknown> };
    expect(truth.values).toMatchObject(acmFixedIdentity);
    expect(truth.values["face.thicknessMm"]).toBe(3);
    expect(truth.values["root.mountingSystem"]).toBeUndefined();
    expect(truth.values["face.foldCount"]).toBeUndefined();
  });

  it("confirms server-owned ACM identity and proof blank from values and crv1", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(
      app,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      {
        ...ACM_CASSETTE_NONE_PROOF_VALUES,
        "face.thicknessMm": 12,
        "face.materialFamily": "aluminium",
      },
    );
    expect(previewed.readiness).toBe("ready");
    const response = await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(previewed.values, previewed.reviewId)),
    });
    expect(response.status).toBe(200);
    const body = await readBody(response);
    const truth = body.truth as { values: Record<string, unknown>; templateVersion: string };
    expect(truth.templateVersion).toBe("2");
    expect(truth.values).toMatchObject(acmFixedIdentity);
    const quantities = ((body.aggregate as JsonObject).quantities as JsonObject[]) ?? [];
    expect(quantities.find((item) => item.id === "cassette_blank_area")?.value).toBeCloseTo(2.2791, 6);
  });

  it("freezes template v2 and frame clearance provenance, then keeps the snapshot after a later change", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(
      app,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      ACM_CASSETTE_NONE_PROOF_VALUES,
    );
    const frozen = await readBody(
      await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/accepted-production-snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acceptedProductPayload(previewed.values, previewed.reviewId)),
      }),
    );
    const snapshot = frozen.snapshot as JsonObject;
    expect((snapshot.truth as JsonObject).templateVersion).toBe("2");
    const used = (snapshot.usedTechnicalSettings as JsonObject[]) ?? [];
    expect(used.find((item) => item.id === FRAME_CLEARANCE_SETTING_ID)).toMatchObject({
      value: 2,
      version: 1,
      source: "PLATFORM_STARTER",
      definitionId: "STEEL_INTERNAL_FRAME.frameClearanceMm",
    });
    expect(used.some((item) => item.id === "ledPitchMm")).toBe(false);
    expect(JSON.stringify(snapshot.truth)).not.toMatch(/mountingSystem|foldCount/);

    await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settings: [{ settingId: FRAME_CLEARANCE_SETTING_ID, value: 6 }],
      }),
    });
    const reread = await readBody(
      await app.request(
        `/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/accepted-production-snapshots/${snapshot.snapshotId as string}`,
      ),
    );
    const storedUsed =
      ((reread.snapshot as JsonObject).usedTechnicalSettings as JsonObject[]) ?? [];
    expect(storedUsed.find((item) => item.id === FRAME_CLEARANCE_SETTING_ID)?.value).toBe(2);
  });

  it("does not invalidate Letters crv1 when only ACM clearance changes", async () => {
    const app = createApp();
    const letters = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, lettersReady);
    const acm = await previewAcceptedValues(
      app,
      ACM_CASSETTE_NONE_PRODUCT_CODE,
      ACM_CASSETTE_NONE_READY_VALUES,
    );
    expect(letters.reviewId).toMatch(/^crv1:/);
    expect(acm.reviewId).toMatch(/^crv1:/);

    await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        settings: [{ settingId: FRAME_CLEARANCE_SETTING_ID, value: 6 }],
      }),
    });

    const staleAcm = await app.request(`/api/products/${ACM_CASSETTE_NONE_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(acm.values, acm.reviewId)),
    });
    expect(staleAcm.status).toBe(409);

    const stillLetters = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(letters.values, letters.reviewId)),
    });
    expect(stillLetters.status).toBe(200);
  });
});
