import { describe, expect, it } from "vitest";
import { DEFAULT_COMMERCIAL_POLICY } from "./policy.js";
import {
  INVALID_MANUAL_PRODUCT_PRICE_REASON,
  MANUAL_FIXED_PRODUCT_STRATEGY,
  MISSING_MANUAL_PRODUCT_PRICE_REASON,
  PRODUCT_COST_PLUS_STRATEGY,
  projectAuthorizedProductCommercialPrice,
  projectManualFixedProductPrice,
} from "./productPrice.js";
import { projectCommercialPrice } from "./price.js";
import { codeDefaultCommercialPolicy } from "./resolvePolicy.js";

describe("manual fixed product commercial", () => {
  it("applies policy VAT to a valid manual net", () => {
    const policy = {
      ...codeDefaultCommercialPolicy(),
      vatPercent: 21,
    };
    const price = projectManualFixedProductPrice({ netPrice: 200 }, policy);
    expect(price.commercialStrategy).toBe(MANUAL_FIXED_PRODUCT_STRATEGY);
    expect(price.completeness).toBe("COMPLETE");
    expect(price.netPrice).toBe(200);
    expect(price.vatPercent).toBe(21);
    expect(price.vatAmount).toBe(42);
    expect(price.grossPrice).toBe(242);
    expect(price.internalCostCompleteness).toBe("PARTIAL");
    expect(price.internalCost).toBe(0);
    expect(price.markupPercent).toBe(0);

    const withKnownCost = projectManualFixedProductPrice(
      {
        netPrice: 200,
        internalCost: 150,
        internalCostCompleteness: "PARTIAL",
      },
      policy,
    );
    expect(withKnownCost.internalCost).toBe(150);
    expect(withKnownCost.internalCostCompleteness).toBe("PARTIAL");
  });

  it("R-001A keeps commercial net and VAT invariant when internal labor cost changes", () => {
    const policy = { ...codeDefaultCommercialPolicy(), vatPercent: 21 };
    const first = projectManualFixedProductPrice(
      { netPrice: 680, internalCost: 340, internalCostCompleteness: "COMPLETE" },
      policy,
    );
    const second = projectManualFixedProductPrice(
      { netPrice: 680, internalCost: 420, internalCostCompleteness: "COMPLETE" },
      policy,
    );
    expect(first.commercialStrategy).toBe(MANUAL_FIXED_PRODUCT_STRATEGY);
    expect(second.commercialStrategy).toBe(MANUAL_FIXED_PRODUCT_STRATEGY);
    expect([first.netPrice, first.vatAmount, first.grossPrice]).toEqual([680, 142.8, 822.8]);
    expect([second.netPrice, second.vatAmount, second.grossPrice]).toEqual(
      [first.netPrice, first.vatAmount, first.grossPrice],
    );
    expect(first.internalCost).toBe(340);
    expect(second.internalCost).toBe(420);
  });

  it("rejects a negative or invalid manual net", () => {
    expect(projectManualFixedProductPrice({ netPrice: -10 }).unavailableReasons).toContain(
      MISSING_MANUAL_PRODUCT_PRICE_REASON,
    );
    expect(projectManualFixedProductPrice({ netPrice: Number.NaN }).completeness).toBe(
      "PARTIAL",
    );
    expect(
      projectManualFixedProductPrice({ netPrice: 0 }).unavailableReasons,
    ).toContain(MISSING_MANUAL_PRODUCT_PRICE_REASON);
  });

  it.each([
    { label: "net overflow", netPrice: 1e308 },
    { label: "gross-only overflow", netPrice: 1.6e306 },
    { label: "largest finite number", netPrice: Number.MAX_VALUE },
  ])("fails closed when monetary rounding overflows ($label)", ({ netPrice }) => {
    expect(Number.isFinite(netPrice)).toBe(true);
    const price = projectManualFixedProductPrice({ netPrice });
    expect(price.completeness).toBe("UNAVAILABLE");
    expect(price.unavailableReasons).toEqual([INVALID_MANUAL_PRODUCT_PRICE_REASON]);
    expect(price.netPrice).toBeNull();
    expect(price.vatAmount).toBeNull();
    expect(price.grossPrice).toBeNull();
  });

  it("keeps a large but representable manual net complete and finite", () => {
    const price = projectManualFixedProductPrice({ netPrice: 1e12 });
    expect(price.completeness).toBe("COMPLETE");
    expect([price.netPrice, price.vatAmount, price.grossPrice].every(Number.isFinite)).toBe(true);
    expect(JSON.parse(JSON.stringify(price)).grossPrice).toBe(price.grossPrice);
  });

  it("does not treat missing manual net as zero", () => {
    const price = projectManualFixedProductPrice({ netPrice: null });
    expect(price.netPrice).toBeNull();
    expect(price.grossPrice).toBeNull();
    expect(price.completeness).toBe("PARTIAL");
    expect(price.unavailableReasons).toEqual([MISSING_MANUAL_PRODUCT_PRICE_REASON]);
  });

  it("keeps product and service strategy identities distinct", () => {
    const product = projectManualFixedProductPrice({ netPrice: 200 });
    expect(product.commercialStrategy).toBe(MANUAL_FIXED_PRODUCT_STRATEGY);
    expect(product.commercialStrategy).not.toBe("MANUAL_FIXED_PER_REQUEST");
  });

  it("uses cost-plus when it is complete and no authorized override is supplied", () => {
    const costPlus = projectCommercialPrice({
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    const resolved = projectAuthorizedProductCommercialPrice(
      costPlus,
      DEFAULT_COMMERCIAL_POLICY,
      { authorized: true },
    );
    expect(resolved.commercialStrategy).toBe(PRODUCT_COST_PLUS_STRATEGY);
    expect(resolved.grossPrice).toBe(costPlus.grossPrice);
  });

  it("uses manual product price when cost-plus is unavailable", () => {
    const costPlus = projectCommercialPrice({
      total: 100,
      currency: "EUR",
      completeness: "PARTIAL",
    });
    const resolved = projectAuthorizedProductCommercialPrice(
      costPlus,
      DEFAULT_COMMERCIAL_POLICY,
      { authorized: true, manualNetPrice: 250 },
    );
    expect(resolved.commercialStrategy).toBe(MANUAL_FIXED_PRODUCT_STRATEGY);
    expect(resolved.netPrice).toBe(250);
    expect(resolved.completeness).toBe("COMPLETE");
    expect(resolved.internalCostCompleteness).toBe("PARTIAL");
    expect(resolved.internalCost).toBe(100);
  });

  it("uses authorized override even when cost-plus is available", () => {
    const costPlus = projectCommercialPrice({
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    const resolved = projectAuthorizedProductCommercialPrice(
      costPlus,
      DEFAULT_COMMERCIAL_POLICY,
      { authorized: true, preferManual: true, manualNetPrice: 300 },
    );
    expect(resolved.commercialStrategy).toBe(MANUAL_FIXED_PRODUCT_STRATEGY);
    expect(resolved.netPrice).toBe(300);
    expect(resolved.grossPrice).not.toBe(costPlus.grossPrice);
  });

  it("keeps cost-plus reasons when calculation is incomplete and no manual net is supplied", () => {
    const costPlus = projectCommercialPrice({
      total: 100,
      currency: "EUR",
      completeness: "PARTIAL",
    });
    const resolved = projectAuthorizedProductCommercialPrice(
      costPlus,
      DEFAULT_COMMERCIAL_POLICY,
      { authorized: true },
    );
    expect(resolved.commercialStrategy).toBe(PRODUCT_COST_PLUS_STRATEGY);
    expect(resolved.completeness).toBe("PARTIAL");
    expect(resolved.unavailableReasons).toEqual(costPlus.unavailableReasons);
  });

  it("ignores client-supplied manual net when not authorized", () => {
    const costPlus = projectCommercialPrice({
      total: 100,
      currency: "EUR",
      completeness: "PARTIAL",
    });
    const resolved = projectAuthorizedProductCommercialPrice(
      costPlus,
      DEFAULT_COMMERCIAL_POLICY,
      { authorized: false, manualNetPrice: 250 },
    );
    expect(resolved.commercialStrategy).toBe(PRODUCT_COST_PLUS_STRATEGY);
    expect(resolved.completeness).toBe("PARTIAL");
  });
});
