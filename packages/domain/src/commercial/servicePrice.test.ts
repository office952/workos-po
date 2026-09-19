import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_POLICY } from "./policy.js";
import { projectCommercialPrice } from "./price.js";
import { projectLiveJobCommercial, projectManualFixedServicePrice } from "./servicePrice.js";

describe("manual fixed service commercial", () => {
  it("projects 200 EUR + TVA without cost-plus on internal EIC", () => {
    const price = projectManualFixedServicePrice({ netPrice: 200 });
    expect(price.completeness).toBe("COMPLETE");
    expect(price.netPrice).toBe(200);
    expect(price.vatPercent).toBe(DEFAULT_COMMERCIAL_POLICY.vatPercent);
    expect(price.vatAmount).toBe(42);
    expect(price.grossPrice).toBe(242);
    expect(price.markupPercent).toBe(0);
    expect(price.markupAmount).toBe(0);
    expect(price.internalCost).toBe(0);
  });

  it("stays PARTIAL when the Owner has not written a price", () => {
    const price = projectManualFixedServicePrice({ netPrice: null });
    expect(price.completeness).toBe("PARTIAL");
    expect(price.netPrice).toBeNull();
    expect(price.grossPrice).toBeNull();
  });

  it("projects the live job total from two COMPLETE lines", () => {
    const product = projectCommercialPrice({
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    const installation = projectManualFixedServicePrice({ netPrice: 200 });
    const job = projectLiveJobCommercial(product, installation);
    expect(job).toEqual({
      netPrice: 716.38,
      vatAmount: 150.44,
      grossPrice: 866.82,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    expect(job?.grossPrice).not.toBe(installation.grossPrice);
    expect(projectLiveJobCommercial(product, null)).toBeNull();
  });

  it("does not equal product cost-plus on the same internal total", () => {
    const service = projectManualFixedServicePrice({ netPrice: 200 });
    const productLike = projectCommercialPrice({
      total: 300,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    expect(service.grossPrice).toBe(242);
    expect(productLike.grossPrice).not.toBe(service.grossPrice);
    expect(productLike.markupPercent).toBe(35);
  });
});
