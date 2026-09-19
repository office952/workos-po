import { describe, expect, it } from "vitest";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import {
  DEFAULT_COMMERCIAL_POLICY,
  DEFAULT_COMMERCIAL_POLICY_ID,
  validateCommercialPolicy,
  type CommercialPolicy,
} from "./policy.js";
import {
  commercialCompletenessLabel,
  projectCommercialPrice,
  roundMoney,
} from "./price.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function confirmedEic(values: DraftValues = readyValues) {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values,
    },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  return compileEic(aggregate, composition);
}

function policy(overrides: Partial<CommercialPolicy> = {}): CommercialPolicy {
  return { ...DEFAULT_COMMERCIAL_POLICY, ...overrides };
}

describe("commercial policy", () => {
  it("keeps one owner-confirmed default policy", () => {
    expect(DEFAULT_COMMERCIAL_POLICY).toMatchObject({
      id: DEFAULT_COMMERCIAL_POLICY_ID,
      currency: "EUR",
      markupPercent: 35,
      vatPercent: 21,
      rounding: 0.01,
      defaultDiscountPercent: 0,
      defaultAdjustment: 0,
      version: 1,
      status: "ACTIVE",
    });
    expect(validateCommercialPolicy(DEFAULT_COMMERCIAL_POLICY)).toEqual([]);
  });

  it("rejects impossible policy values", () => {
    expect(validateCommercialPolicy(policy({ markupPercent: -1 }))).toEqual([
      { field: "markupPercent", reason: "Adaosul comercial nu poate fi negativ." },
    ]);
    expect(validateCommercialPolicy(policy({ vatPercent: -1 }))).toEqual([
      { field: "vatPercent", reason: "TVA nu poate fi negativ." },
    ]);
    expect(validateCommercialPolicy(policy({ defaultDiscountPercent: 101 }))).toEqual([
      {
        field: "defaultDiscountPercent",
        reason: "Discountul trebuie să fie între 0 și 100.",
      },
    ]);
    expect(validateCommercialPolicy(policy({ rounding: 1 }))).toEqual([
      { field: "rounding", reason: "Rotunjirea V1 este 0,01 EUR." },
    ]);
  });
});

describe("commercial price projection", () => {
  it("turns complete planned EIC 382.50 into golden customer price", () => {
    const price = projectCommercialPrice({
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    expect(price.policyId).toBe(DEFAULT_COMMERCIAL_POLICY_ID);
    expect(price.policyVersion).toBe(1);
    expect(price.markupPercent).toBe(35);
    expect(price.markupAmount).toBe(133.88);
    expect(price.discountPercent).toBe(0);
    expect(price.discountAmount).toBe(0);
    expect(price.adjustmentAmount).toBe(0);
    expect(price.netPrice).toBe(516.38);
    expect(price.vatPercent).toBe(21);
    expect(price.vatAmount).toBe(108.44);
    expect(price.grossPrice).toBe(624.82);
    expect(price.currency).toBe("EUR");
    expect(price.completeness).toBe("COMPLETE");
    expect(price.unavailableReasons).toEqual([]);
    expect(JSON.stringify(price)).not.toMatch(/FACE|VOLUME|BACK|LIGHTING|LETTERS/);
  });

  it("does not hardcode the golden totals", () => {
    const price = projectCommercialPrice({
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    const markup = roundMoney(382.5 * 0.35);
    const net = roundMoney(382.5 + markup);
    const vat = roundMoney(net * 0.21);
    expect(price.markupAmount).toBe(markup);
    expect(price.netPrice).toBe(net);
    expect(price.vatAmount).toBe(vat);
    expect(price.grossPrice).toBe(roundMoney(net + vat));
  });

  it("keeps PARTIAL EIC from becoming final customer price", () => {
    const price = projectCommercialPrice({
      total: 345,
      currency: "EUR",
      completeness: "PARTIAL",
    });
    expect(price.completeness).toBe("PARTIAL");
    expect(price.unavailableReasons).toEqual([
      "Costul intern nu este complet pentru această configurație.",
    ]);
    expect(price.grossPrice).not.toBeNull();
  });

  it("is unavailable when currencies differ", () => {
    const price = projectCommercialPrice({
      total: 382.5,
      currency: "RON",
      completeness: "COMPLETE",
    });
    expect(price.completeness).toBe("UNAVAILABLE");
    expect(price.grossPrice).toBeNull();
    expect(price.unavailableReasons).toContain(
      "Moneda costului intern nu coincide cu moneda comercială.",
    );
  });

  it("is unavailable for invalid cost or policy", () => {
    expect(
      projectCommercialPrice({
        total: Number.NaN,
        currency: "EUR",
        completeness: "COMPLETE",
      }).completeness,
    ).toBe("UNAVAILABLE");
    expect(
      projectCommercialPrice(
        { total: 382.5, currency: "EUR", completeness: "COMPLETE" },
        policy({ markupPercent: -5 }),
      ).completeness,
    ).toBe("UNAVAILABLE");
    expect(
      projectCommercialPrice(
        { total: 100, currency: "EUR", completeness: "COMPLETE" },
        policy({ defaultAdjustment: -200 }),
      ),
    ).toMatchObject({
      completeness: "UNAVAILABLE",
      unavailableReasons: ["Prețul net nu poate fi negativ."],
    });
  });

  it("applies reserved discount and adjustment when a policy carries them", () => {
    const withDiscount = projectCommercialPrice(
      { total: 382.5, currency: "EUR", completeness: "COMPLETE" },
      policy({ defaultDiscountPercent: 10 }),
    );
    expect(withDiscount.discountAmount).toBe(51.64);
    expect(withDiscount.netPrice).toBe(464.74);
    expect(withDiscount.grossPrice).toBe(562.34);

    const withAdjustment = projectCommercialPrice(
      { total: 382.5, currency: "EUR", completeness: "COMPLETE" },
      policy({ defaultAdjustment: 50 }),
    );
    expect(withAdjustment.adjustmentAmount).toBe(50);
    expect(withAdjustment.netPrice).toBe(566.38);
    expect(withAdjustment.grossPrice).toBe(685.32);
  });

  it("labels completeness without color-only meaning", () => {
    expect(commercialCompletenessLabel("COMPLETE")).toBe("Complet");
    expect(commercialCompletenessLabel("PARTIAL")).toBe("Parțial");
    expect(commercialCompletenessLabel("UNAVAILABLE")).toBe("Indisponibil");
  });
});

describe("commercial configuration gate", () => {
  it("is COMPLETE for canonical 60 mm none/none", () => {
    const eic = confirmedEic();
    expect(eic.total).toBe(382.5);
    expect(eic.completeness).toBe("COMPLETE");
    const price = projectCommercialPrice(eic);
    expect(price.completeness).toBe("COMPLETE");
    expect(price.grossPrice).toBe(624.82);
    expect(JSON.stringify(price)).not.toMatch(/FACE|VOLUME|actualCost|inventory/i);
  });

  it.each([
    { depthMm: 30, eicTotal: 370, gross: 604.4 },
    { depthMm: 60, eicTotal: 382.5, gross: 624.82 },
    { depthMm: 80, eicTotal: 395, gross: 645.23 },
    { depthMm: 100, eicTotal: 407.5, gross: 665.66 },
  ] as const)("is COMPLETE at $depthMm mm", ({ depthMm, eicTotal, gross }) => {
    const eic = confirmedEic({
      ...readyValues,
      "volume.depthMm": String(depthMm),
    });
    expect(eic.completeness).toBe("COMPLETE");
    expect(eic.total).toBe(eicTotal);
    const price = projectCommercialPrice(eic);
    expect(price.completeness).toBe("COMPLETE");
    expect(price.grossPrice).toBe(gross);
    expect(price.unavailableReasons).toEqual([]);
    expect(price.grossPrice).toBe(
      roundMoney((eic.total + roundMoney(eic.total * 0.35)) * 1.21),
    );
  });

  it("stays PARTIAL for vinyl and painted finishes", () => {
    const vinyl = projectCommercialPrice(
      confirmedEic({
        ...readyValues,
        "face.finish": "vinyl",
        "face.color": "alb",
      }),
    );
    const painted = projectCommercialPrice(
      confirmedEic({
        ...readyValues,
        "volume.finish": "painted",
        "volume.color": "RAL 9010",
      }),
    );
    expect(vinyl.completeness).toBe("PARTIAL");
    expect(painted.completeness).toBe("PARTIAL");
  });
});
