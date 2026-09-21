import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ACM_GOLDEN_DEPTH_MM,
  ACM_GOLDEN_HEIGHT_MM,
  ACM_GOLDEN_WIDTH_MM,
  CANONICAL_PRODUCT_CODE,
  SITE_INSTALLATION_SCOPE_ID,
  collectFinancialKeys,
} from "@workos-final/domain";
import { API_CONTRACT_ID, createApp } from "../src/app.js";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

type JsonObject = Record<string, unknown>;

const lettersReady = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmReady = {
  "root.inscription": "ACM",
  "root.mountingSystem": "steel_angle",
  "face.widthMm": ACM_GOLDEN_WIDTH_MM,
  "face.heightMm": ACM_GOLDEN_HEIGHT_MM,
  "face.cassetteDepthMm": String(ACM_GOLDEN_DEPTH_MM),
  "face.foldCount": "1",
};

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

async function preview(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  const response = await app.request(`/api/products/${productCode}/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values, ...extra }),
  });
  return { response, body: await readBody(response) };
}

async function confirmPlatformCostEvidence(
  app: ReturnType<typeof createApp>,
  cookie: string,
) {
  const admin = await readBody(
    await app.request("/api/resources-admin", { headers: { cookie } }),
  );
  const rows =
    (admin.costEvidence as Array<{ evidenceRowId?: string; amount?: number }>) ?? [];
  for (const row of rows) {
    if (!row.evidenceRowId || typeof row.amount !== "number") {
      continue;
    }
    const written = await app.request(
      `/api/resources-admin/cost-evidence/${encodeURIComponent(row.evidenceRowId)}`,
      {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ amount: row.amount, note: "Confirmat test transport" }),
      },
    );
    expect(written.status).toBe(200);
  }
}

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

describe("UI20 transport contract", () => {
  it("exposes a transport contract identity on health", async () => {
    const response = await createApp().request("/api/health");
    const body = await readBody(response);
    expect(response.status).toBe(200);
    expect(body.apiContractId).toBe(API_CONTRACT_ID);
    expect(body.service).toBe("workos-final-api");
  });

  it("previews LETTERS none/none without a ProductDefinition graph", async () => {
    const { response, body } = await preview(createApp(), CANONICAL_PRODUCT_CODE, lettersReady);
    expect(response.status).toBe(200);
    expect(body.readiness).toBe("ready");
    expect(String(body.reviewId)).toMatch(/^crv1:/);
    expect(body.definition).toBeUndefined();
    const product = body.product as JsonObject;
    expect(product.productCode).toBe(CANONICAL_PRODUCT_CODE);
    expect((product.fixedValues as JsonObject)["lighting.mode"]).toBe("front_lit");
    const selected = (body.selectedComponents as Array<{ id: string }>).map((item) => item.id);
    expect(selected).toEqual(expect.arrayContaining(["FACE", "VOLUME", "BACK", "LIGHTING"]));
    const schema = body.formSchema as { sections: Array<{ fields: Array<{ id: string }> }> };
    const fieldIds = schema.sections.flatMap((section) => section.fields.map((field) => field.id));
    expect(fieldIds).not.toContain("face.color");
    expect(JSON.stringify(body)).not.toMatch(/"measurements"/);
    const again = await preview(createApp(), CANONICAL_PRODUCT_CODE, lettersReady);
    expect(again.body.reviewId).toBe(body.reviewId);
  });

  it("updates LETTERS visibility and readiness from values", async () => {
    const blocked = await preview(createApp(), CANONICAL_PRODUCT_CODE, {
      ...lettersReady,
      "root.inscription": "",
    });
    expect(blocked.body.readiness).toBe("blocked");
    expect(blocked.body.reviewId).toBeNull();

    const vinyl = await preview(createApp(), CANONICAL_PRODUCT_CODE, {
      ...lettersReady,
      "face.finish": "vinyl",
    });
    const schema = vinyl.body.formSchema as {
      sections: Array<{ fields: Array<{ id: string }> }>;
    };
    const fieldIds = schema.sections.flatMap((section) => section.fields.map((field) => field.id));
    expect(fieldIds).toContain("face.color");
    expect(vinyl.body.readiness).toBe("blocked");
  });

  it("keeps ACM free of LETTERS VOLUME and LIGHTING assumptions", async () => {
    const { body } = await preview(createApp(), ACM_CASSETTE_NONE_PRODUCT_CODE, acmReady);
    expect(body.readiness).toBe("ready");
    const selected = (body.selectedComponents as Array<{ id: string }>).map((item) => item.id);
    expect(selected).toEqual(["FACE", "BACK"]);
    const schema = body.formSchema as { sections: Array<{ fields: Array<{ id: string }> }> };
    const fieldIds = schema.sections.flatMap((section) => section.fields.map((field) => field.id));
    expect(fieldIds.some((id) => id.startsWith("volume.") || id.startsWith("lighting."))).toBe(
      false,
    );
  });

  it("confirms and freezes a quote from values + reviewId without ProductDefinition", async () => {
    const app = createApp();
    const previewed = await preview(app, CANONICAL_PRODUCT_CODE, lettersReady);
    const confirm = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: lettersReady,
        reviewId: previewed.body.reviewId,
      }),
    });
    const confirmed = await readBody(confirm);
    expect(confirm.status).toBe(200);
    expect((confirmed.truth as JsonObject).status).toBe("CONFIRMED_IN_RUNTIME");
    expect((confirmed.commercialExperience as JsonObject).primaryAction).toBe("CREATE_QUOTE");
    expect(confirmed.installationPrequoteReady).toBeNull();

    const customer = await readBody(
      await app.request("/api/customers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "Client UI20" }),
      }),
    );
    const quote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: lettersReady,
        reviewId: previewed.body.reviewId,
        customerId: (customer.customer as JsonObject).customerId,
      }),
    });
    const frozen = await readBody(quote);
    expect(quote.status).toBe(200);
    expect((frozen.quoteSnapshot as JsonObject).quoteSnapshotId).toMatch(/^qts:/);
    expect((frozen.commercialExperience as JsonObject).primaryAction).toBe("DOWNLOAD_QUOTE");
  });

  it("rejects stale review after values change and rejects legacy definition confirm", async () => {
    const app = createApp();
    const previewed = await preview(app, CANONICAL_PRODUCT_CODE, lettersReady);
    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: { ...lettersReady, "root.inscription": "CHANGED" },
        reviewId: previewed.body.reviewId,
      }),
    });
    expect(stale.status).toBe(409);

    const compiled = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: lettersReady }),
      }),
    );
    const legacy = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiled.definition,
        reviewId: compiled.reviewId,
      }),
    });
    expect(legacy.status).toBe(400);
    expect((await readBody(legacy)).error).toBe("review_required");
  });

  it("rejects a settings-bound review identity that no longer matches", async () => {
    const app = createApp();
    const previewed = await preview(app, CANONICAL_PRODUCT_CODE, lettersReady);
    const staleSettings = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: lettersReady,
        reviewId: "crv1:deadbeef",
      }),
    });
    expect(staleSettings.status).toBe(409);
    expect(previewed.body.reviewId).not.toBe("crv1:deadbeef");
  });

  it("keeps selected installation blocked until prequote ready", async () => {
    const app = createApp();
    const customerResponse = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client montaj" }),
    });
    expect(customerResponse.status).toBe(201);
    const customer = await readBody(customerResponse);
    const createdResponse = await app.request("/api/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerId: (customer.customer as JsonObject).customerId,
        title: "Cerere montaj",
        description: "Clientul a cerut o ofertă cu montaj.",
      }),
    });
    expect(createdResponse.status).toBe(201);
    const created = await readBody(createdResponse);
    const requestId = (created.request as JsonObject).requestId as string;
    expect(requestId).toMatch(/^crq:/);
    const disabledSelect = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(disabledSelect.status).toBe(400);
    expect((await preview(app, CANONICAL_PRODUCT_CODE, lettersReady, { requestId })).body.installation).toMatchObject(
      { selected: false, prequoteReady: null },
    );

    const enabled = await app.request("/api/operational-services/SITE_INSTALLATION", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ offerMode: "INTERNAL" }),
    });
    expect(enabled.status).toBe(200);
    const selected = await app.request(`/api/requests/${requestId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID] }),
    });
    expect(selected.status).toBe(200);
    expect(((await readBody(selected)).request as JsonObject).optionalScopeIds).toEqual([
      SITE_INSTALLATION_SCOPE_ID,
    ]);
    const previewed = await preview(app, CANONICAL_PRODUCT_CODE, lettersReady, { requestId });
    const installation = previewed.body.installation as JsonObject;
    expect(installation.selected).toBe(true);
    expect(installation.prequoteReady).toBe(false);

    const confirm = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: lettersReady,
          reviewId: previewed.body.reviewId,
          requestId,
        }),
      }),
    );
    expect(confirm.installationPrequoteReady).toBe(false);

    const quote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: lettersReady,
        reviewId: previewed.body.reviewId,
        customerId: (customer.customer as JsonObject).customerId,
        requestId,
      }),
    });
    expect(quote.status).toBe(422);
  });

  it("keeps member financial scope and owner writes unchanged", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Atelier UI20");
    await addUser(fixture, {
      email: "owner-ui20@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    await addUser(fixture, {
      email: "member-ui20@test",
      password: MEMBER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "member",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-ui20@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const member = await loginCloud(
      fixture.app,
      "member-ui20@test",
      MEMBER_PASSWORD,
      org.organization.organizationId,
    );
    const ownerHeaders = {
      cookie: owner.cookie ?? "",
      "content-type": "application/json",
    };
    await confirmPlatformCostEvidence(fixture.app, owner.cookie ?? "");
    const previewed = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: ownerHeaders,
        body: JSON.stringify({ values: lettersReady }),
      }),
    );
    const memberConfirm = await readBody(
      await fixture.app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: {
          cookie: member.cookie ?? "",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          values: lettersReady,
          reviewId: previewed.reviewId,
        }),
      }),
    );
    const memberKeys = collectFinancialKeys(memberConfirm);
    expect(memberKeys.has("grossPrice")).toBe(true);
    expect(memberKeys.has("internalCost")).toBe(false);
    expect(memberKeys.has("markupPercent")).toBe(false);
    expect((memberConfirm.commercialExperience as JsonObject).primaryAction).toBe("CREATE_QUOTE");

    const seller = await fixture.app.request("/api/seller", {
      method: "PATCH",
      headers: {
        cookie: member.cookie ?? "",
        "content-type": "application/json",
      },
      body: JSON.stringify({ legalName: "Nu" }),
    });
    expect(seller.status).toBe(403);
    fixture.close();
  });
});
