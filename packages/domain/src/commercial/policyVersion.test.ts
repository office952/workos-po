import { describe, expect, it } from "vitest";
import { validateCommercialPolicy } from "./policy.js";
import { planCommercialPolicySave, type CommercialPolicyVersionRecord } from "./policyVersion.js";

describe("commercial policy version save", () => {
  it("writes organization version 1 on the first save", () => {
    const planned = planCommercialPolicySave(
      [],
      {
        markupPercent: 30,
        vatPercent: 19,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      },
      { rowId: "cpv:1", now: "2026-09-20T10:00:00.000Z" },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    expect(planned.alreadyApplied).toBe(false);
    expect(planned.next?.version).toBe(1);
    expect(planned.next?.status).toBe("ACTIVE");
    expect(planned.next?.source).toBe("ORGANIZATION");
    expect(planned.next?.supersedesVersion).toBeNull();
    expect(planned.retireVersion).toBeNull();
  });

  it("creates version N+1 and retires the previous ACTIVE", () => {
    const first: CommercialPolicyVersionRecord = {
      policyVersionRowId: "cpv:1",
      policyId: "DEFAULT_COMMERCIAL_POLICY",
      version: 1,
      status: "ACTIVE",
      label: "Politică comercială organizație",
      markupPercent: 30,
      vatPercent: 19,
      defaultDiscountPercent: 0,
      defaultAdjustment: 0,
      currency: "EUR",
      rounding: 0.01,
      source: "ORGANIZATION",
      effectiveFrom: "2026-09-20T10:00:00.000Z",
      createdAt: "2026-09-20T10:00:00.000Z",
      supersedesVersion: null,
    };
    const planned = planCommercialPolicySave(
      [first],
      {
        markupPercent: 32,
        vatPercent: 21,
        defaultDiscountPercent: 2,
        defaultAdjustment: 5,
      },
      { rowId: "cpv:2", now: "2026-09-20T11:00:00.000Z" },
    );
    expect(planned.ok).toBe(true);
    if (!planned.ok) {
      return;
    }
    expect(planned.next?.version).toBe(2);
    expect(planned.next?.supersedesVersion).toBe(1);
    expect(planned.retireVersion).toBe(1);
    expect(planned.next?.markupPercent).toBe(32);
  });

  it("rejects invalid currency, rounding, markup, VAT and discount", () => {
    expect(
      validateCommercialPolicy({
        id: "DEFAULT_COMMERCIAL_POLICY",
        label: "x",
        currency: "USD" as "EUR",
        markupPercent: 10,
        vatPercent: 10,
        rounding: 0.01,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
        version: 1,
        status: "ACTIVE",
      }).some((issue) => issue.field === "currency"),
    ).toBe(true);
    expect(
      validateCommercialPolicy({
        id: "DEFAULT_COMMERCIAL_POLICY",
        label: "x",
        currency: "EUR",
        markupPercent: 10,
        vatPercent: 10,
        rounding: 1,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
        version: 1,
        status: "ACTIVE",
      }).some((issue) => issue.field === "rounding"),
    ).toBe(true);
    const planned = planCommercialPolicySave(
      [],
      {
        markupPercent: -1,
        vatPercent: -2,
        defaultDiscountPercent: 120,
        defaultAdjustment: Number.POSITIVE_INFINITY,
      },
      { rowId: "cpv:bad", now: "2026-09-20T10:00:00.000Z" },
    );
    expect(planned.ok).toBe(false);
    if (planned.ok) {
      return;
    }
    expect(planned.issues.map((issue) => issue.field)).toEqual(
      expect.arrayContaining([
        "markupPercent",
        "vatPercent",
        "defaultDiscountPercent",
        "defaultAdjustment",
      ]),
    );
  });
});
