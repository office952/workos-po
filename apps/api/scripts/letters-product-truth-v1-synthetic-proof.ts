import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import {
  addOrganization,
  addUser,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "../tests/cloud-harness.js";

const PRODUCT = CANONICAL_PRODUCT_CODE;
const readyValues = {
  "root.inscription": "LETTERS-V1",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function main(): Promise<void> {
  const fixture = createCloudFixture();
  try {
    const org = await addOrganization(fixture, "Atelier Letters V1", "SYNTHETIC_TEST");
    await addUser(fixture, {
      email: "owner-letters-v1@test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const owner = await loginCloud(
      fixture.app,
      "owner-letters-v1@test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const headers = {
      cookie: owner.cookie ?? "",
      "content-type": "application/json",
    };

    const seller = await fixture.app.request("/api/seller", {
      method: "PATCH",
      headers,
      body: JSON.stringify({ legalName: "Atelier Letters Sintetic SRL" }),
    });
    if (seller.status !== 200) {
      throw new Error(`seller_failed:${seller.status}`);
    }

    const preview = await fixture.app.request(`/api/products/${PRODUCT}/preview`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: readyValues }),
    });
    const previewBody = await json(preview);
    if (preview.status !== 200 || typeof previewBody.reviewId !== "string") {
      throw new Error(`preview_failed:${preview.status}:${JSON.stringify(previewBody)}`);
    }
    if (!String(previewBody.reviewId).startsWith("crv1:")) {
      throw new Error(`preview_review_not_crv1:${String(previewBody.reviewId)}`);
    }

    const confirm = await fixture.app.request(`/api/products/${PRODUCT}/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: readyValues, reviewId: previewBody.reviewId }),
    });
    const confirmBody = await json(confirm);
    if (confirm.status !== 200) {
      throw new Error(`confirm_failed:${confirm.status}:${JSON.stringify(confirmBody)}`);
    }
    const truth = confirmBody.truth as { values?: Record<string, unknown> };
    if (truth.values?.["face.thicknessMm"] !== 3 || truth.values?.["lighting.mode"] !== "front_lit") {
      throw new Error(`fixed_identity_missing:${JSON.stringify(truth.values)}`);
    }

    const customer = await json(
      await fixture.app.request("/api/customers", {
        method: "POST",
        headers,
        body: JSON.stringify({ displayName: "Client Letters V1" }),
      }),
    );
    const customerId = (customer.customer as { customerId?: string }).customerId;
    const quote = await fixture.app.request(`/api/products/${PRODUCT}/quote-snapshots`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        values: readyValues,
        reviewId: previewBody.reviewId,
        customerId,
      }),
    });
    const quoteBody = await json(quote);
    if (quote.status !== 200) {
      throw new Error(`quote_failed:${quote.status}:${JSON.stringify(quoteBody)}`);
    }

    const production = await fixture.app.request(
      `/api/products/${PRODUCT}/accepted-production-snapshot`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ values: readyValues, reviewId: previewBody.reviewId }),
      },
    );
    if (production.status !== 200) {
      throw new Error(`production_failed:${production.status}`);
    }

    const invalid = await fixture.app.request(`/api/products/${PRODUCT}/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        values: { ...readyValues, "volume.depthMm": "45" },
        reviewId: previewBody.reviewId,
      }),
    });
    if (invalid.status !== 409 && invalid.status !== 400) {
      throw new Error(`invalid_depth_accepted:${invalid.status}`);
    }

    await fixture.app.request("/api/admin/technical-settings", {
      method: "POST",
      headers,
      body: JSON.stringify({ ledPitchMm: 80 }),
    });
    const stale = await fixture.app.request(`/api/products/${PRODUCT}/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: readyValues, reviewId: previewBody.reviewId }),
    });
    if (stale.status !== 409) {
      throw new Error(`stale_settings_not_rejected:${stale.status}`);
    }
    const nextPreview = await json(
      await fixture.app.request(`/api/products/${PRODUCT}/preview`, {
        method: "POST",
        headers,
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    const nextConfirm = await fixture.app.request(`/api/products/${PRODUCT}/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: readyValues, reviewId: nextPreview.reviewId }),
    });
    if (nextConfirm.status !== 200) {
      throw new Error(`new_crv1_confirm_failed:${nextConfirm.status}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          isolatedSyntheticSaas: true,
          product: PRODUCT,
          previewReviewIdPrefix: String(previewBody.reviewId).slice(0, 5),
          confirm: confirm.status,
          quoteFreeze: quote.status,
          acceptedProduction: production.status,
          invalidDepth: invalid.status,
          staleTechnicalSettings: stale.status,
          newPreviewAccepted: nextConfirm.status,
        },
        null,
        2,
      ),
    );
  } finally {
    fixture.close();
  }
}

await main();
