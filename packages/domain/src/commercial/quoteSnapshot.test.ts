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
import { DEFAULT_COMMERCIAL_POLICY, type CommercialPolicy } from "./policy.js";
import { projectCommercialPrice } from "./price.js";
import { projectManualFixedServicePrice } from "./servicePrice.js";
import {
  PRODUCT_COMMERCIAL_STRATEGY,
  freezeQuoteSnapshot,
  isSupportedQuoteSnapshot,
  quoteSnapshotContentHash,
} from "./quoteSnapshot.js";
import { freezeOrderSnapshot } from "./orderSnapshot.js";
import { recordQuoteAcceptance } from "./quoteAcceptance.js";
import { MANUAL_FIXED_SERVICE_STRATEGY } from "./servicePrice.js";
import { LAB_SITE_INSTALL_ID } from "../resources/catalog.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function confirmedSpine(values: DraftValues = readyValues) {
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
  const eic = compileEic(aggregate, composition);
  return { truth, aggregate, composition, eic };
}

describe("quote snapshot freeze", () => {
  it("freezes the golden COMPLETE offer without production coupling", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const commercial = projectCommercialPrice(eic);
    const result = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: "2026-08-17T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.snapshot.status).toBe("FROZEN");
    expect(result.snapshot.schemaVersion).toBe(1);
    expect(result.snapshot.eic.total).toBe(382.5);
    expect(result.snapshot.eic.completeness).toBe("COMPLETE");
    expect(result.snapshot.commercial).toEqual({
      policyId: "DEFAULT_COMMERCIAL_POLICY",
      policyVersion: 1,
      markupPercent: 35,
      markupAmount: 133.88,
      discountPercent: 0,
      discountAmount: 0,
      adjustmentAmount: 0,
      netPrice: 516.38,
      vatPercent: 21,
      vatAmount: 108.44,
      grossPrice: 624.82,
      currency: "EUR",
      completeness: "COMPLETE",
    });
    expect(result.snapshot.quoteSnapshotId).toBe(
      `qts:${CANONICAL_PRODUCT_CODE}:${result.snapshot.contentHash}`,
    );
    expect(result.snapshot.contentHash).toBe(
      // Proven equal on origin/main 33c2f9fae4402b152f2840c96cf6da98a1c74a03.
      "35e562617d45f4caabb4f582b9c6385e6be5c1edc345c1dd31d688b25add2f27",
    );
    expect(quoteSnapshotContentHash(result.snapshot)).toBe(result.snapshot.contentHash);
    expect(JSON.stringify(result.snapshot)).not.toMatch(
      /ExecutionPlan|ExecutionTask|inventory|actualCost|OrderSnapshot/i,
    );
    expect(result.snapshot).not.toHaveProperty("operations");
  });

  it("is idempotent for the same confirmed content", () => {
    const firstSpine = confirmedSpine();
    const secondSpine = confirmedSpine();
    const first = freezeQuoteSnapshot(
      firstSpine.truth,
      firstSpine.aggregate,
      firstSpine.composition,
      firstSpine.eic,
      projectCommercialPrice(firstSpine.eic),
      { createdAt: "2026-08-17T00:00:00.000Z" },
    );
    const second = freezeQuoteSnapshot(
      secondSpine.truth,
      secondSpine.aggregate,
      secondSpine.composition,
      secondSpine.eic,
      projectCommercialPrice(secondSpine.eic),
      { createdAt: "2026-08-17T12:00:00.000Z" },
    );
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(second.snapshot.contentHash).toBe(first.snapshot.contentHash);
    expect(second.snapshot.quoteSnapshotId).toBe(first.snapshot.quoteSnapshotId);
    expect(second.snapshot.createdAt).toBe("2026-08-17T12:00:00.000Z");
  });

  it("blocks PARTIAL EIC and commercial from becoming a frozen quote", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine({
      ...readyValues,
      "face.finish": "vinyl",
      "face.color": "alb",
    });
    const commercial = projectCommercialPrice(eic);
    expect(eic.completeness).toBe("PARTIAL");
    expect(commercial.completeness).toBe("PARTIAL");
    expect(freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial)).toEqual({
      ok: false,
      error: "incomplete_offer",
      reasons: [
        "Oferta nu poate fi înghețată până când costul intern și prețul client nu sunt complete.",
      ],
    });
  });

  it.each<DraftValues>([
    { "face.finish": "vinyl", "face.color": "alb" },
    { "volume.finish": "painted", "volume.color": "RAL 9010" },
  ])("blocks incomplete configuration %o", (overrides) => {
    const { truth, aggregate, composition, eic } = confirmedSpine({
      ...readyValues,
      ...overrides,
    });
    expect(
      freezeQuoteSnapshot(truth, aggregate, composition, eic, projectCommercialPrice(eic)).ok,
    ).toBe(false);
  });

  it.each([
    { depthMm: "30", eicTotal: 370, gross: 604.4 },
    { depthMm: "80", eicTotal: 395, gross: 645.23 },
    { depthMm: "100", eicTotal: 407.5, gross: 665.66 },
  ] as const)(
    "freezes a COMPLETE none/none offer at $depthMm mm",
    ({ depthMm, eicTotal, gross }) => {
      const { truth, aggregate, composition, eic } = confirmedSpine({
        ...readyValues,
        "volume.depthMm": depthMm,
      });
      const commercial = projectCommercialPrice(eic);
      expect(eic.completeness).toBe("COMPLETE");
      expect(eic.total).toBe(eicTotal);
      expect(commercial.completeness).toBe("COMPLETE");
      expect(commercial.grossPrice).toBe(gross);
      const frozen = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial);
      expect(frozen.ok).toBe(true);
      if (!frozen.ok) {
        return;
      }
      expect(frozen.snapshot.eic.total).toBe(eicTotal);
      expect(frozen.snapshot.commercial.grossPrice).toBe(gross);
    },
  );

  it("does not reprice when the current commercial policy changes", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
    );
    const laterPolicy: CommercialPolicy = {
      ...DEFAULT_COMMERCIAL_POLICY,
      version: 2,
      markupPercent: 70,
      vatPercent: 19,
    };
    const live = projectCommercialPrice(eic, laterPolicy);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(live.grossPrice).not.toBe(frozen.snapshot.commercial.grossPrice);
    expect(frozen.snapshot.commercial.policyVersion).toBe(1);
    expect(frozen.snapshot.commercial.markupPercent).toBe(35);
    expect(frozen.snapshot.commercial.vatPercent).toBe(21);
    expect(frozen.snapshot.commercial.grossPrice).toBe(624.82);
  });

  it("does not reprice when a later internal-cost total is supplied", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
    );
    const laterEic = { ...eic, total: 999 };
    const later = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      laterEic,
      projectCommercialPrice(laterEic),
    );
    expect(frozen.ok && later.ok).toBe(true);
    if (!frozen.ok || !later.ok) {
      return;
    }
    expect(frozen.snapshot.eic.total).toBe(382.5);
    expect(frozen.snapshot.commercial.grossPrice).toBe(624.82);
    expect(later.snapshot.contentHash).not.toBe(frozen.snapshot.contentHash);
    expect(later.snapshot.eic.total).toBe(999);
  });

  it("keeps the legacy hash when no customer is frozen", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const result = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.snapshot.customer).toBeUndefined();
    expect(result.snapshot.eic.total).toBe(382.5);
    expect(result.snapshot.commercial.grossPrice).toBe(624.82);
  });

  it("includes frozen customer identity in the content hash", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const commercial = projectCommercialPrice(eic);
    const withoutCustomer = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial);
    const withCustomer = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      customer: { customerId: "cus:letters", displayName: "Client Demo LETTERS" },
    });
    const renamedLive = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      customer: { customerId: "cus:letters", displayName: "Client Demo NOU" },
    });
    expect(withoutCustomer.ok && withCustomer.ok && renamedLive.ok).toBe(true);
    if (!withoutCustomer.ok || !withCustomer.ok || !renamedLive.ok) {
      return;
    }
    expect(withCustomer.snapshot.customer).toEqual({
      customerId: "cus:letters",
      displayName: "Client Demo LETTERS",
    });
    expect(withCustomer.snapshot.contentHash).not.toBe(withoutCustomer.snapshot.contentHash);
    expect(renamedLive.snapshot.contentHash).not.toBe(withCustomer.snapshot.contentHash);
    expect(withCustomer.snapshot.commercial.grossPrice).toBe(624.82);
  });

  it("includes frozen seller identity in the content hash", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const commercial = projectCommercialPrice(eic);
    const withoutSeller = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial);
    const withSeller = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      seller: {
        legalName: "HUB MEDIA PRODUCTION S.R.L.",
        brand: "HUB MEDIA PRODUCTION",
        fiscalId: "RO54481582",
      },
    });
    const renamedLive = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      seller: {
        legalName: "P-Media B",
        brand: "P-Media B",
        fiscalId: "RO54481582",
      },
    });
    expect(withoutSeller.ok && withSeller.ok && renamedLive.ok).toBe(true);
    if (!withoutSeller.ok || !withSeller.ok || !renamedLive.ok) {
      return;
    }
    expect(withoutSeller.snapshot.seller).toBeUndefined();
    expect(withSeller.snapshot.seller?.legalName).toBe("HUB MEDIA PRODUCTION S.R.L.");
    expect(withSeller.snapshot.contentHash).not.toBe(withoutSeller.snapshot.contentHash);
    expect(renamedLive.snapshot.contentHash).not.toBe(withSeller.snapshot.contentHash);
    expect(withSeller.snapshot.commercial.grossPrice).toBe(624.82);
  });

  it("rejects an empty seller identity when one is supplied", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    expect(
      freezeQuoteSnapshot(truth, aggregate, composition, eic, projectCommercialPrice(eic), {
        seller: { legalName: "   " },
      }),
    ).toEqual({
      ok: false,
      error: "invalid_seller",
      reasons: ["Identitatea vânzătorului nu este validă pentru înghețare."],
    });
  });

  it("rejects an empty customer identity when one is supplied", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    expect(
      freezeQuoteSnapshot(truth, aggregate, composition, eic, projectCommercialPrice(eic), {
        customer: { customerId: "cus:x", displayName: "   " },
      }),
    ).toEqual({
      ok: false,
      error: "invalid_customer",
      reasons: ["Identitatea clientului nu este validă pentru înghețare."],
    });
  });

  it("keeps the product-only hash on schema v1 and freezes a separate v2 job hash", () => {
    const { truth, aggregate, composition, eic } = confirmedSpine();
    const commercial = projectCommercialPrice(eic);
    const productOnly = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: "2026-09-02T00:00:00.000Z",
    });
    const again = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: "2026-09-02T12:00:00.000Z",
    });
    expect(productOnly.ok && again.ok).toBe(true);
    if (!productOnly.ok || !again.ok) {
      return;
    }
    expect(productOnly.snapshot.schemaVersion).toBe(1);
    expect(productOnly.snapshot.contentHash).toBe(again.snapshot.contentHash);
    expect(productOnly.snapshot.lines).toBeUndefined();

    const installCommercial = projectManualFixedServicePrice({ netPrice: 200 });
    const withInstall = freezeQuoteSnapshot(truth, aggregate, composition, eic, commercial, {
      createdAt: "2026-09-02T00:00:00.000Z",
      installation: {
        label: "Montaj la locație",
        providerMode: "INTERNAL",
        requestId: "req:prequote-v2",
        technicalConfiguration: {
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: 3,
          plannedDurationHours: 4,
        },
        evidence: {
          resourceId: LAB_SITE_INSTALL_ID,
          amount: 25,
          currency: "EUR",
          perUnit: "person_hour",
          source: "OWNER_CONFIRMED_WORKSHOP",
          classification: "OWNER_CONFIRMED",
          note: "Tarif intern sintetic.",
        },
        eic: {
          completeness: "COMPLETE",
          completenessReasons: [],
          geometryLabel: null,
          currency: "EUR",
          lines: [
            {
              resourceId: LAB_SITE_INSTALL_ID,
              label: "Manoperă montaj la locație",
              quantity: 12,
              unit: "person_hour",
              rate: 25,
              currency: "EUR",
              cost: 300,
              kind: "LABOR",
              group: "labor",
            },
          ],
          total: 300,
          excludedComponentLabels: [],
        },
        commercial: installCommercial,
      },
    });
    expect(withInstall.ok).toBe(true);
    if (!withInstall.ok) {
      return;
    }
    expect(withInstall.snapshot.schemaVersion).toBe(2);
    expect(withInstall.snapshot.contentHash).not.toBe(productOnly.snapshot.contentHash);
    expect(withInstall.snapshot.commercial.grossPrice).toBe(624.82);
    expect(withInstall.snapshot.jobCommercial?.grossPrice).toBe(866.82);
    expect(withInstall.snapshot.lines).toHaveLength(2);
    const productLine = withInstall.snapshot.lines?.[0];
    const installLine = withInstall.snapshot.lines?.[1];
    expect(productLine).toMatchObject({
      kind: "PRODUCT",
      commercialStrategy: PRODUCT_COMMERCIAL_STRATEGY,
    });
    expect(installLine).toMatchObject({
      kind: "SITE_INSTALLATION",
      commercialStrategy: MANUAL_FIXED_SERVICE_STRATEGY,
      providerMode: "INTERNAL",
      sourceRequestId: "req:prequote-v2",
      quantity: 12,
      commercialUnit: "person_hour",
      technicalConfiguration: {
        measurementStatus: "OFFICE_MEASURED",
        facadeType: "CONCRETE",
        fixingMethod: "MECHANICAL_ANCHOR",
        siteElectrical: "NOT_APPLICABLE",
        crewSize: 3,
        plannedDurationHours: 4,
      },
      evidence: {
        resourceId: LAB_SITE_INSTALL_ID,
        classification: "OWNER_CONFIRMED",
        amount: 25,
        perUnit: "person_hour",
      },
    });
    expect(isSupportedQuoteSnapshot(withInstall.snapshot)).toBe(true);
    expect(isSupportedQuoteSnapshot({
      ...withInstall.snapshot,
      jobCommercial: {
        ...withInstall.snapshot.jobCommercial!,
        grossPrice: 1,
      },
    })).toBe(false);
    expect(isSupportedQuoteSnapshot({
      ...withInstall.snapshot,
      lines: withInstall.snapshot.lines?.map((line) =>
        line.kind === "SITE_INSTALLATION"
          ? { ...line, providerMode: "SUBCONTRACTED", commercialUnit: "job" }
          : line,
      ),
    })).toBe(false);
    expect(isSupportedQuoteSnapshot({
      ...withInstall.snapshot,
      lines: withInstall.snapshot.lines?.map((line) =>
        line.kind === "SITE_INSTALLATION"
          ? { ...line, sourceRequestId: "" }
          : line,
      ),
    })).toBe(false);
    expect(recordQuoteAcceptance(withInstall.snapshot)).toMatchObject({
      ok: false,
      error: "service_quote_not_acceptable",
    });
    const ordered = freezeOrderSnapshot(withInstall.snapshot, {
      acceptanceId: "qad:os-s7",
      schemaVersion: 1,
      quoteSnapshotId: withInstall.snapshot.quoteSnapshotId,
      quoteContentHash: withInstall.snapshot.contentHash,
      acceptedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(ordered.ok).toBe(true);
    if (!ordered.ok) {
      return;
    }
    expect(ordered.snapshot.schemaVersion).toBe(2);
    expect(ordered.snapshot.lines).toEqual(withInstall.snapshot.lines);
    expect(ordered.snapshot.jobCommercial).toEqual(withInstall.snapshot.jobCommercial);
  });
});
