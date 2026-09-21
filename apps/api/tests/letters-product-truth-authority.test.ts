import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  compileDefinition,
  definitionReviewId,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
  type ProductDefinition,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { applyMigrations, openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  acceptedProductPayload,
  previewAcceptedValues,
} from "./accepted-product-helpers.js";

type JsonObject = Record<string, unknown>;

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-letters-authority-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const vinylValues = {
  ...readyValues,
  "face.finish": "vinyl",
  "face.color": "alb",
};

const paintedValues = {
  ...readyValues,
  "volume.finish": "painted",
  "volume.color": "negru",
};

const lettersFixedIdentity = {
  "face.materialFamily": "plexiglas",
  "face.thicknessMm": 3,
  "face.opticalType": "opal",
  "volume.materialFamily": "aluminium",
  "volume.thicknessMm": 0.6,
  "back.materialFamily": "forex",
  "back.thicknessMm": 10,
  "lighting.mode": "front_lit",
} as const;

function craftMaliciousDefinition(): ProductDefinition {
  const honest = compileDefinition(frontlitPlexiAl06Template, frontlitPlexiAl06FormSchema, {
    templateCode: CANONICAL_PRODUCT_CODE,
    values: readyValues,
  });
  const crafted: ProductDefinition = {
    ...honest,
    values: {
      ...honest.values,
      "face.thicknessMm": 8,
      "volume.thicknessMm": 2,
      "back.thicknessMm": 19,
      "lighting.mode": "halo",
    },
    selectedComponentIds: [...honest.selectedComponentIds, "FORGED"],
  };
  return { ...crafted, reviewId: definitionReviewId(crafted) };
}

async function createCustomer(app: ReturnType<typeof createApp>, name = "Client authority") {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

describe("accepted product authority", () => {
  it("keeps /compile as a compile contract, not mutation authority", async () => {
    const compiled = await createApp().request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues }),
    });
    expect(compiled.status).toBe(200);
    const body = await readBody(compiled);
    const definition = body.definition as JsonObject;
    expect(definition.readiness).toBe("ready");
    expect(body.reviewId).toBe(definition.reviewId);
    expect(String(body.reviewId)).not.toMatch(/^crv1:/);
  });

  it("rejects definition-only confirm, quote freeze, and accepted production", async () => {
    const app = createApp();
    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const payload = {
      definition: compiled.definition,
      reviewId: compiled.reviewId,
    };
    const confirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const quote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        customerId: await createCustomer(app),
      }),
    });
    const production = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
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

  it("rejects a crafted ProductDefinition even when its old review hash matches", async () => {
    const crafted = craftMaliciousDefinition();
    expect(definitionReviewId(crafted)).toBe(crafted.reviewId);
    expect(crafted.values["face.thicknessMm"]).toBe(8);
    const response = await createApp().request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: crafted,
        reviewId: crafted.reviewId,
      }),
    });
    expect(response.status).toBe(400);
    expect((await readBody(response)).error).toBe("review_required");
  });

  it("ignores a malicious extra definition when values and crv1 are valid", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, readyValues);
    expect(previewed.reviewId).toMatch(/^crv1:/);
    const crafted = craftMaliciousDefinition();
    const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...acceptedProductPayload(previewed.values, previewed.reviewId),
        definition: crafted,
      }),
    });
    expect(response.status).toBe(200);
    const truth = (await readBody(response)).truth as { values: Record<string, unknown> };
    expect(truth.values).toMatchObject(lettersFixedIdentity);
    expect(truth.values["face.thicknessMm"]).toBe(3);
    expect(truth.values["lighting.mode"]).toBe("front_lit");
    expect(truth.values["face.thicknessMm"]).not.toBe(8);
  });

  it("confirms server-owned fixed identity from values and crv1", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, {
      ...readyValues,
      "face.materialFamily": "aluminum",
      "face.thicknessMm": 12,
      "lighting.mode": "halo",
    });
    const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(previewed.values, previewed.reviewId)),
    });
    expect(response.status).toBe(200);
    const truth = (await readBody(response)).truth as { values: Record<string, unknown> };
    expect(truth.values).toMatchObject(lettersFixedIdentity);
  });

  it.each(["30", "60", "80", "100"] as const)(
    "accepts current volume depth %s mm",
    async (depthMm) => {
      const app = createApp();
      const values = { ...readyValues, "volume.depthMm": depthMm };
      const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, values);
      expect(previewed.readiness).toBe("ready");
      const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(acceptedProductPayload(values, previewed.reviewId)),
      });
      expect(response.status).toBe(200);
      const truth = (await readBody(response)).truth as { values: Record<string, unknown> };
      expect(truth.values["volume.depthMm"]).toBe(depthMm);
    },
  );

  it.each([
    { field: "volume.depthMm", value: "45" },
    { field: "face.finish", value: "powder" },
    { field: "volume.finish", value: "anodized" },
  ] as const)("rejects invalid $field as accepted truth", async ({ field, value }) => {
    const app = createApp();
    const values = { ...readyValues, [field]: value };
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, values);
    expect(previewed.readiness).toBe("blocked");
    expect(previewed.reviewId).toBe("");
    const confirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values, reviewId: previewed.reviewId }),
    });
    expect(confirm.status).toBe(400);
    expect((await readBody(confirm)).error).toBe("review_required");
  });

  it("keeps vinyl and painted color readiness", async () => {
    const app = createApp();
    const blockedVinyl = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, {
      ...readyValues,
      "face.finish": "vinyl",
    });
    expect(blockedVinyl.readiness).toBe("blocked");
    const blockedPainted = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, {
      ...readyValues,
      "volume.finish": "painted",
    });
    expect(blockedPainted.readiness).toBe("blocked");

    const vinyl = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, vinylValues);
    const vinylConfirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(vinylValues, vinyl.reviewId)),
    });
    expect(vinylConfirm.status).toBe(200);

    const painted = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, paintedValues);
    const paintedConfirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(paintedValues, painted.reviewId)),
    });
    expect(paintedConfirm.status).toBe(200);
  });

  it("rejects stale values after preview", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, readyValues);
    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        acceptedProductPayload(
          { ...readyValues, "root.inscription": "CHANGED" },
          previewed.reviewId,
        ),
      ),
    });
    expect(stale.status).toBe(409);
    expect((await readBody(stale)).error).toBe("review_mismatch");
  });

  it("rejects a stale review after a technical setting change", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, readyValues);
    await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledPitchMm: 80 }),
    });
    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(readyValues, previewed.reviewId)),
    });
    expect(stale.status).toBe(409);
    const next = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, readyValues);
    expect(next.reviewId).not.toBe(previewed.reviewId);
    const confirmed = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(readyValues, next.reviewId)),
    });
    expect(confirmed.status).toBe(200);
  });

  it("rejects a stale review after a formula version change", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, readyValues);
    const saved = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
        expression: {
          kind: "CEIL",
          operand: {
            kind: "DIVIDE",
            left: {
              kind: "DIVIDE",
              left: { kind: "JOB_REF", inputId: "confirmedPerimeterMm" },
              right: { kind: "CONFIG_REF", settingId: "ledPitchMm" },
            },
            right: { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" },
          },
        },
      }),
    });
    expect(saved.status).toBe(200);
    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(acceptedProductPayload(readyValues, previewed.reviewId)),
    });
    expect(stale.status).toBe(409);
  });

  it("fails closed when required technical settings are missing", async () => {
    const sqlitePath = tempSqlitePath();
    const seeded = createProductSystemRuntime(sqlitePath);
    seeded.close();
    const db = openSqliteDatabase(sqlitePath);
    applyMigrations(db);
    db.prepare("UPDATE technical_setting_versions SET status = 'RETIRED'").run();
    db.close();
    const runtime = createProductSystemRuntime(sqlitePath);
    const app = createApp({ productSystem: runtime });
    const preview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues }),
    });
    const confirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues, reviewId: "crv1:missing" }),
    });
    expect(preview.status).toBe(409);
    expect((await readBody(preview)).error).toBe("technical_settings_unavailable");
    expect(confirm.status).toBe(409);
    expect((await readBody(confirm)).error).toBe("technical_settings_unavailable");
    runtime.close();
  });

  it("fails closed when required formulas are missing", async () => {
    const sqlitePath = tempSqlitePath();
    const seeded = createProductSystemRuntime(sqlitePath);
    seeded.close();
    const db = openSqliteDatabase(sqlitePath);
    applyMigrations(db);
    db.prepare("UPDATE formula_versions SET status = 'RETIRED'").run();
    db.close();
    const runtime = createProductSystemRuntime(sqlitePath);
    const app = createApp({ productSystem: runtime });
    const preview = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues }),
    });
    const confirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues, reviewId: "crv1:missing" }),
    });
    expect(preview.status).toBe(409);
    expect((await readBody(preview)).error).toBe("formulas_unavailable");
    expect(confirm.status).toBe(409);
    expect((await readBody(confirm)).error).toBe("formulas_unavailable");
    runtime.close();
  });

  it("freezes confirm, quote, and accepted production from the same values and crv1", async () => {
    const app = createApp();
    const previewed = await previewAcceptedValues(app, CANONICAL_PRODUCT_CODE, readyValues);
    const payload = acceptedProductPayload(readyValues, previewed.reviewId);
    const confirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(confirm.status).toBe(200);
    const confirmed = await readBody(confirm);
    const quote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...payload,
        customerId: await createCustomer(app),
      }),
    });
    expect(quote.status).toBe(200);
    const production = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(production.status).toBe(200);
    const quoteSnapshot = (await readBody(quote)).quoteSnapshot as {
      productCode: string;
      truth: { values: Record<string, unknown> };
    };
    const snapshot = (await readBody(production)).snapshot as {
      productCode: string;
      truth: { values: Record<string, unknown> };
    };
    const truth = confirmed.truth as { values: Record<string, unknown>; reviewId: string };
    expect(previewed.reviewId).toMatch(/^crv1:/);
    expect(typeof truth.reviewId).toBe("string");
    expect(truth.reviewId.length).toBeGreaterThan(0);
    expect(truth.values).toMatchObject(lettersFixedIdentity);
    expect(quoteSnapshot.productCode).toBe(CANONICAL_PRODUCT_CODE);
    expect(quoteSnapshot.truth.values).toMatchObject(lettersFixedIdentity);
    expect(snapshot.productCode).toBe(CANONICAL_PRODUCT_CODE);
    expect(snapshot.truth.values).toMatchObject(lettersFixedIdentity);
  });
});
