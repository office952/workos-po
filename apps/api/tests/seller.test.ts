import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE, OWNER_CONFIRMED_SELLER } from "@workos-final/domain";
import { createApp } from "../src/app.js";

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

describe("seller API", () => {
  it("returns the owner-confirmed current seller profile", async () => {
    const app = createApp();
    const response = await app.request("/api/seller");
    expect(response.status).toBe(200);
    const seller = (await readBody(response)).seller as JsonObject;
    expect(seller.legalName).toBe(OWNER_CONFIRMED_SELLER.legalName);
    expect(seller.fiscalId).toBe(OWNER_CONFIRMED_SELLER.fiscalId);
    expect(seller.iban).toBe(OWNER_CONFIRMED_SELLER.iban);
    expect(seller.address).toBe(OWNER_CONFIRMED_SELLER.address);
    expect(seller.locality).toBe("București");
    expect(JSON.stringify(seller)).not.toMatch(/phone|email|website|AI_DECISION/i);
  });

  it("persists a seller rename and freezes the previous name into an existing quote", async () => {
    const app = createApp();
    const customer = await app.request("/api/customers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Client Demo LETTERS" }),
    });
    const customerId = ((await readBody(customer)).customer as JsonObject).customerId as string;
    const compiled = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/compile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
      }),
    });
    const compiledBody = await readBody(compiled);
    const firstQuote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiledBody.definition,
        reviewId: compiledBody.reviewId,
        customerId,
      }),
    });
    const first = (await readBody(firstQuote)).quoteSnapshot as JsonObject;
    expect((first.seller as JsonObject).legalName).toBe(OWNER_CONFIRMED_SELLER.legalName);

    const renamed = await app.request("/api/seller", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...OWNER_CONFIRMED_SELLER,
        legalName: "P-Media B",
        brand: "P-Media B",
      }),
    });
    expect(((await readBody(renamed)).seller as JsonObject).legalName).toBe("P-Media B");

    const reread = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${first.quoteSnapshotId}`,
    );
    const stored = (await readBody(reread)).quoteSnapshot as JsonObject;
    expect((stored.seller as JsonObject).legalName).toBe(OWNER_CONFIRMED_SELLER.legalName);

    const secondQuote = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        definition: compiledBody.definition,
        reviewId: compiledBody.reviewId,
        customerId,
      }),
    });
    const second = (await readBody(secondQuote)).quoteSnapshot as JsonObject;
    expect((second.seller as JsonObject).legalName).toBe("P-Media B");
    expect(second.quoteSnapshotId).not.toBe(first.quoteSnapshotId);
  });
});
