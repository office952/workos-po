import { readFileSync } from "node:fs";
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
import {
  LAB_SITE_INSTALL_ID,
  SVC_SITE_INSTALL_SUBCONTRACT_ID,
} from "../resources/catalog.js";
import { compileEic } from "../resources/eic.js";
import { DEFAULT_COMMERCIAL_POLICY, type CommercialPolicy } from "./policy.js";
import { projectCommercialPrice } from "./price.js";
import { projectManualFixedServicePrice } from "./servicePrice.js";
import { freezeOrderSnapshot } from "./orderSnapshot.js";
import { recordQuoteAcceptance } from "./quoteAcceptance.js";
import {
  freezeQuoteSnapshot,
  hasValidQuoteSnapshotContentHash,
  isTrustedFrozenQuoteV2ForOrder,
  quoteSnapshotContentHash,
  type FrozenQuoteLine,
  type FrozenSiteInstallationQuoteLine,
  type QuoteInstallationFreezeInput,
  type QuoteSnapshot,
} from "./quoteSnapshot.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function frozenAcceptedQuote() {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: readyValues,
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
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    { createdAt: "2026-08-17T00:00:00.000Z" },
  );
  if (!frozen.ok) {
    throw new Error("expected frozen quote");
  }
  const accepted = recordQuoteAcceptance(frozen.snapshot, {
    acceptedAt: "2026-08-17T01:00:00.000Z",
  });
  if (!accepted.ok) {
    throw new Error("expected acceptance");
  }
  return { quote: frozen.snapshot, acceptance: accepted.decision };
}

describe("order snapshot freeze", () => {
  it("copies the accepted golden quote without calculating", () => {
    const { quote, acceptance } = frozenAcceptedQuote();
    const first = freezeOrderSnapshot(quote, acceptance, {
      createdAt: "2026-08-17T02:00:00.000Z",
    });
    const second = freezeOrderSnapshot(quote, acceptance, {
      createdAt: "2026-08-17T12:00:00.000Z",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.snapshot.status).toBe("FROZEN");
    expect(first.snapshot.orderSnapshotId).toBe(
      `ord:${acceptance.acceptanceId}:${first.snapshot.contentHash}`,
    );
    expect(first.snapshot.sourceQuoteSnapshotId).toBe(quote.quoteSnapshotId);
    expect(first.snapshot.sourceQuoteContentHash).toBe(quote.contentHash);
    expect(first.snapshot.sourceAcceptanceId).toBe(acceptance.acceptanceId);
    expect(first.snapshot.sourceAcceptedAt).toBe("2026-08-17T01:00:00.000Z");
    expect(first.snapshot.eic.total).toBe(382.5);
    expect(first.snapshot.commercial).toEqual(quote.commercial);
    expect(first.snapshot.commercial.grossPrice).toBe(624.82);
    expect(first.snapshot.truth.values["volume.depthMm"]).toBe("60");
    expect(first.snapshot.productionInput.contentHash).toBe(quote.productionInput.contentHash);
    expect(first.snapshot.productionInput.operations).toHaveLength(12);
    expect(first.snapshot.contentHash).toBe(second.snapshot.contentHash);
    expect(quoteSnapshotContentHash(quote)).toBe(quote.contentHash);
    expect(second.snapshot.createdAt).toBe("2026-08-17T12:00:00.000Z");
    expect(quote.status).toBe("FROZEN");
    expect(JSON.stringify(first.snapshot)).not.toMatch(
      /compileDefinition|compileAggregate|compileEic|projectCommercialPrice|ExecutionPlan|OrderOrchestrator/i,
    );
  });

  it("does not reprice when the current commercial policy changes", () => {
    const { quote, acceptance } = frozenAcceptedQuote();
    const frozen = freezeOrderSnapshot(quote, acceptance);
    const later = projectCommercialPrice(quote.eic, {
      ...DEFAULT_COMMERCIAL_POLICY,
      version: 2,
      markupPercent: 70,
      vatPercent: 19,
    } satisfies CommercialPolicy);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(later.grossPrice).not.toBe(frozen.snapshot.commercial.grossPrice);
    expect(frozen.snapshot.commercial.markupPercent).toBe(35);
    expect(frozen.snapshot.commercial.vatPercent).toBe(21);
    expect(frozen.snapshot.commercial.grossPrice).toBe(624.82);
    expect(frozen.snapshot.eic.total).toBe(382.5);
  });

  it("copies frozen customer identity from the quote and does not reread a later name", () => {
    const { quote, acceptance } = frozenAcceptedQuote();
    const quoted: QuoteSnapshot = {
      ...quote,
      customer: { customerId: "cus:letters", displayName: "Client Demo LETTERS" },
    };
    const frozen = freezeOrderSnapshot(quoted, acceptance);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(frozen.snapshot.customer).toEqual({
      customerId: "cus:letters",
      displayName: "Client Demo LETTERS",
    });
    const laterQuote: QuoteSnapshot = {
      ...quoted,
      customer: { customerId: "cus:letters", displayName: "Client Demo NOU" },
    };
    expect(frozen.snapshot.customer?.displayName).toBe("Client Demo LETTERS");
    expect(laterQuote.customer?.displayName).toBe("Client Demo NOU");
  });

  it("copies frozen seller identity from the quote and does not reread a later name", () => {
    const { quote, acceptance } = frozenAcceptedQuote();
    const quoted: QuoteSnapshot = {
      ...quote,
      seller: {
        legalName: "HUB MEDIA PRODUCTION S.R.L.",
        fiscalId: "RO54481582",
      },
    };
    const frozen = freezeOrderSnapshot(quoted, acceptance);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(frozen.snapshot.seller).toEqual({
      legalName: "HUB MEDIA PRODUCTION S.R.L.",
      fiscalId: "RO54481582",
    });
    const laterQuote: QuoteSnapshot = {
      ...quoted,
      seller: { legalName: "P-Media B", fiscalId: "RO54481582" },
    };
    expect(frozen.snapshot.seller?.legalName).toBe("HUB MEDIA PRODUCTION S.R.L.");
    expect(laterQuote.seller?.legalName).toBe("P-Media B");
  });

  it("does not reread a later product configuration", () => {
    const { quote, acceptance } = frozenAcceptedQuote();
    const frozen = freezeOrderSnapshot(quote, acceptance);
    const laterQuote: QuoteSnapshot = {
      ...quote,
      truth: {
        ...quote.truth,
        values: { ...quote.truth.values, "volume.depthMm": "30" },
      },
    };
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(frozen.snapshot.truth.values["volume.depthMm"]).toBe("60");
    expect(laterQuote.truth.values["volume.depthMm"]).toBe("30");
  });

  it("blocks a frozen quote without a matching acceptance", () => {
    const { quote, acceptance } = frozenAcceptedQuote();
    expect(
      freezeOrderSnapshot(quote, {
        ...acceptance,
        quoteSnapshotId: "qts:other",
      }),
    ).toMatchObject({ ok: false, error: "quote_not_accepted" });
    expect(
      freezeOrderSnapshot(quote, {
        ...acceptance,
        quoteContentHash: "0".repeat(64),
      }),
    ).toMatchObject({ ok: false, error: "acceptance_mismatch" });
    expect(
      freezeOrderSnapshot(
        { ...quote, eic: { ...quote.eic, completeness: "PARTIAL" } },
        acceptance,
      ),
    ).toMatchObject({ ok: false, error: "incompatible_order_source" });
  });

  it("does not import live compilers on the order freeze path", () => {
    const source = readFileSync(new URL("./orderSnapshot.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/compileDefinition|compileAggregate|compileEic/);
    expect(source).not.toMatch(/projectCommercialPrice|composeProductProcesses/);
    expect(source).not.toMatch(/listActiveCostEvidence/);
  });

  it("copies a valid INTERNAL Quote v2 into an immutable Order v2", () => {
    const { quote, acceptance } = frozenAcceptedInstallQuote("INTERNAL");
    const first = freezeOrderSnapshot(quote, acceptance, {
      createdAt: "2026-09-04T10:00:00.000Z",
    });
    const second = freezeOrderSnapshot(quote, acceptance, {
      createdAt: "2026-09-04T18:00:00.000Z",
    });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.snapshot.schemaVersion).toBe(2);
    expect(first.snapshot.lines).toHaveLength(2);
    expect(first.snapshot.jobCommercial?.grossPrice).toBe(quote.jobCommercial?.grossPrice);
    expect(first.snapshot.lines).toEqual(quote.lines);
    expect(first.snapshot.jobCommercial).toEqual(quote.jobCommercial);
    expect(first.snapshot.eic.total).toBe(382.5);
    expect(first.snapshot.commercial.grossPrice).toBe(624.82);
    expect(first.snapshot.contentHash).toBe(second.snapshot.contentHash);
    expect(Object.isFrozen(first.snapshot.lines)).toBe(true);
    expect(Object.isFrozen(first.snapshot.jobCommercial)).toBe(true);
    const laterRate = projectCommercialPrice(quote.eic, {
      ...DEFAULT_COMMERCIAL_POLICY,
      version: 2,
      markupPercent: 70,
    } satisfies CommercialPolicy);
    expect(laterRate.grossPrice).not.toBe(first.snapshot.commercial.grossPrice);
    const mutatedQuote: QuoteSnapshot = {
      ...quote,
      jobCommercial: quote.jobCommercial
        ? { ...quote.jobCommercial, grossPrice: 1 }
        : undefined,
    };
    expect(first.snapshot.jobCommercial?.grossPrice).toBe(quote.jobCommercial?.grossPrice);
    expect(mutatedQuote.jobCommercial?.grossPrice).toBe(1);
  });

  it("copies a valid SUBCONTRACTED Quote v2 without recalculating", () => {
    const { quote, acceptance } = frozenAcceptedInstallQuote("SUBCONTRACTED");
    const frozen = freezeOrderSnapshot(quote, acceptance);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const install = frozen.snapshot.lines?.find((line) => line.kind === "SITE_INSTALLATION");
    expect(frozen.snapshot.schemaVersion).toBe(2);
    expect(install).toMatchObject({
      providerMode: "SUBCONTRACTED",
      commercialUnit: "job",
      quantity: 1,
      sourceRequestId: "req:os-s7-subcontract",
    });
    expect(frozen.snapshot.jobCommercial).toEqual(quote.jobCommercial);
  });

  it("refuses a tampered Quote v2 instead of repairing it", () => {
    const { quote, acceptance } = frozenAcceptedInstallQuote("INTERNAL");
    expect(
      freezeOrderSnapshot(
        {
          ...quote,
          jobCommercial: quote.jobCommercial
            ? { ...quote.jobCommercial, grossPrice: 1 }
            : undefined,
        },
        acceptance,
      ),
    ).toMatchObject({ ok: false, error: "incompatible_order_source" });
    expect(
      freezeOrderSnapshot(
        {
          ...quote,
          lines: quote.lines?.map((line) =>
            line.kind === "SITE_INSTALLATION"
              ? { ...line, providerMode: "SUBCONTRACTED", commercialUnit: "job" }
              : line,
          ),
        },
        acceptance,
      ),
    ).toMatchObject({ ok: false, error: "incompatible_order_source" });
    expect(
      freezeOrderSnapshot(quote, {
        ...acceptance,
        quoteSnapshotId: "qts:other",
      }),
    ).toMatchObject({ ok: false, error: "quote_not_accepted" });
    expect(
      freezeOrderSnapshot(quote, {
        ...acceptance,
        quoteContentHash: "0".repeat(64),
      }),
    ).toMatchObject({ ok: false, error: "acceptance_mismatch" });
  });

  it("refuses Order v2 when the frozen Quote payload no longer matches its hash", () => {
    const { quote, acceptance } = frozenAcceptedInstallQuote("INTERNAL");
    expect(hasValidQuoteSnapshotContentHash(quote)).toBe(true);
    expect(isTrustedFrozenQuoteV2ForOrder(quote)).toBe(true);
    const tampered = mapInstallLine(quote, (line) => ({
      ...line,
      commercial: { ...line.commercial, netPrice: 1, grossPrice: 1 },
    }));
    expect(hasValidQuoteSnapshotContentHash(tampered)).toBe(false);
    expect(
      freezeOrderSnapshot(tampered, {
        ...acceptance,
        quoteContentHash: tampered.contentHash,
      }),
    ).toMatchObject({ ok: false, error: "incompatible_order_source" });
  });

  it("refuses semantically altered Quote v2 even if the hash is rewritten to match", () => {
    const { quote } = frozenAcceptedInstallQuote("INTERNAL");
    const cases: Array<(current: QuoteSnapshot) => QuoteSnapshot> = [
      (current) =>
        mapProductLine(current, (line) => ({
          ...line,
          commercial: { ...line.commercial, netPrice: 1, grossPrice: 1 },
        })),
      (current) =>
        mapProductLine(current, (line) => ({
          ...line,
          eic: { ...line.eic, total: 1 },
        })),
      (current) =>
        mapProductLine(current, (line) => ({
          ...line,
          eic: {
            ...line.eic,
            lines: line.eic.lines.map((eicLine) => ({ ...eicLine, rate: 1, cost: 1 })),
          },
        })),
      (current) => mapProductLine(current, (line) => ({ ...line, productCode: "PRD-OTHER" })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          commercial: { ...line.commercial, netPrice: 1, grossPrice: 1 },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          eic: { ...line.eic, total: 1 },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          eic: {
            ...line.eic,
            lines: line.eic.lines.map((eicLine) => ({ ...eicLine, rate: 1 })),
          },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          eic: {
            ...line.eic,
            lines: line.eic.lines.map((eicLine) => ({ ...eicLine, cost: 1 })),
          },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          eic: {
            ...line.eic,
            lines: line.eic.lines.map((eicLine) => ({
              ...eicLine,
              resourceId: "RES-OTHER",
            })),
          },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          eic: {
            ...line.eic,
            lines: line.eic.lines.map((eicLine) => ({ ...eicLine, quantity: 99 })),
          },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          providerMode: "SUBCONTRACTED",
          commercialUnit: "job",
          quantity: 1,
        })),
      (current) => mapInstallLine(current, (line) => ({ ...line, commercialUnit: "job" })),
      (current) => mapInstallLine(current, (line) => ({ ...line, quantity: 99 })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          technicalConfiguration: {
            ...line.technicalConfiguration,
            crewSize: 9,
          },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          technicalConfiguration: {
            ...line.technicalConfiguration,
            plannedDurationHours: 9,
          },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          evidence: { ...line.evidence, resourceId: "RES-OTHER" },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          evidence: { ...line.evidence, amount: 1 },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          evidence: { ...line.evidence, classification: "ESTIMATED" as never },
        })),
      (current) =>
        mapInstallLine(current, (line) => ({
          ...line,
          evidence: { ...line.evidence, perUnit: "job" },
        })),
      (current) => ({
        ...current,
        jobCommercial: current.jobCommercial
          ? { ...current.jobCommercial, netPrice: 1 }
          : undefined,
      }),
      (current) => ({
        ...current,
        jobCommercial: current.jobCommercial
          ? { ...current.jobCommercial, vatAmount: 1 }
          : undefined,
      }),
      (current) => ({
        ...current,
        jobCommercial: current.jobCommercial
          ? { ...current.jobCommercial, grossPrice: 1 }
          : undefined,
      }),
    ];
    for (const mutate of cases) {
      const rewritten = rehashedQuote(mutate(quote));
      expect(isTrustedFrozenQuoteV2ForOrder(rewritten)).toBe(false);
      expect(
        freezeOrderSnapshot(rewritten, {
          acceptanceId: `qad:${rewritten.quoteSnapshotId}`,
          schemaVersion: 1,
          quoteSnapshotId: rewritten.quoteSnapshotId,
          quoteContentHash: rewritten.contentHash,
          acceptedAt: "2026-09-04T01:00:00.000Z",
        }),
      ).toMatchObject({ ok: false, error: "incompatible_order_source" });
    }
  });

  it("refuses frozen-fact mutations that keep a stale contentHash", () => {
    const { quote, acceptance } = frozenAcceptedInstallQuote("INTERNAL");
    const stale = [
      mapInstallLine(quote, (line) => ({ ...line, sourceRequestId: "req:other" })),
      mapInstallLine(quote, (line) => ({
        ...line,
        technicalConfiguration: {
          ...line.technicalConfiguration,
          facadeType: "GLASS",
        },
      })),
      { ...quote, quoteSnapshotId: "qts:other:stale" },
    ];
    for (const tampered of stale) {
      expect(isTrustedFrozenQuoteV2ForOrder(tampered)).toBe(false);
      expect(
        freezeOrderSnapshot(tampered, {
          ...acceptance,
          quoteSnapshotId: tampered.quoteSnapshotId,
          quoteContentHash: tampered.contentHash,
        }),
      ).toMatchObject({ ok: false, error: "incompatible_order_source" });
    }
  });

  it("refuses a subcontract Quote v2 with missing supplier or validity even after rehash", () => {
    const { quote } = frozenAcceptedInstallQuote("SUBCONTRACTED");
    const missingSupplier = rehashedQuote(
      mapInstallLine(quote, (line) => ({
        ...line,
        evidence: { ...line.evidence, supplierLabel: "" },
      })),
    );
    const missingValidity = rehashedQuote(
      mapInstallLine(quote, (line) => ({
        ...line,
        evidence: { ...line.evidence, validUntil: "" },
      })),
    );
    expect(isTrustedFrozenQuoteV2ForOrder(missingSupplier)).toBe(false);
    expect(isTrustedFrozenQuoteV2ForOrder(missingValidity)).toBe(false);
  });
});

function frozenAcceptedInstallQuote(mode: "INTERNAL" | "SUBCONTRACTED") {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: readyValues,
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
  const installation = installFreezeInput(mode);
  const frozen = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    { createdAt: "2026-09-04T00:00:00.000Z", installation },
  );
  if (!frozen.ok) {
    throw new Error("expected frozen install quote");
  }
  const liveAcceptance = recordQuoteAcceptance(frozen.snapshot);
  if (liveAcceptance.ok) {
    throw new Error("live v2 acceptance must stay refused");
  }
  return {
    quote: frozen.snapshot,
    acceptance: {
      acceptanceId: `qad:${frozen.snapshot.quoteSnapshotId}`,
      schemaVersion: 1 as const,
      quoteSnapshotId: frozen.snapshot.quoteSnapshotId,
      quoteContentHash: frozen.snapshot.contentHash,
      acceptedAt: "2026-09-04T01:00:00.000Z",
    },
  };
}

function installFreezeInput(
  mode: "INTERNAL" | "SUBCONTRACTED",
): QuoteInstallationFreezeInput {
  if (mode === "INTERNAL") {
    return {
      label: "Montaj la locație",
      providerMode: "INTERNAL",
      requestId: "req:os-s7-internal",
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
      commercial: projectManualFixedServicePrice({ netPrice: 200 }),
    };
  }
  return {
    label: "Montaj la locație",
    providerMode: "SUBCONTRACTED",
    requestId: "req:os-s7-subcontract",
    technicalConfiguration: {
      measurementStatus: "OFFICE_MEASURED",
      facadeType: "CONCRETE",
      fixingMethod: "MECHANICAL_ANCHOR",
      siteElectrical: "NOT_APPLICABLE",
      crewSize: null,
      plannedDurationHours: null,
    },
    evidence: {
      resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
      amount: 180,
      currency: "EUR",
      perUnit: "job",
      source: "OWNER_CONFIRMED_WORKSHOP",
      classification: "OWNER_CONFIRMED",
      note: "Cost subcontractant sintetic.",
      supplierLabel: "Montaj Rapid SRL",
      validUntil: "2027-12-31",
    },
    eic: {
      completeness: "COMPLETE",
      completenessReasons: [],
      geometryLabel: null,
      currency: "EUR",
      lines: [
        {
          resourceId: SVC_SITE_INSTALL_SUBCONTRACT_ID,
          label: "Montaj la locație subcontractat",
          quantity: 1,
          unit: "job",
          rate: 180,
          currency: "EUR",
          cost: 180,
          kind: "SERVICE",
          group: "services",
        },
      ],
      total: 180,
      excludedComponentLabels: [],
    },
    commercial: projectManualFixedServicePrice({ netPrice: 200 }),
  };
}

function mapProductLine(
  quote: QuoteSnapshot,
  update: (line: Extract<FrozenQuoteLine, { kind: "PRODUCT" }>) => FrozenQuoteLine,
): QuoteSnapshot {
  return {
    ...quote,
    lines: quote.lines?.map((line) => (line.kind === "PRODUCT" ? update(line) : line)),
  };
}

function mapInstallLine(
  quote: QuoteSnapshot,
  update: (line: FrozenSiteInstallationQuoteLine) => FrozenQuoteLine,
): QuoteSnapshot {
  return {
    ...quote,
    lines: quote.lines?.map((line) => (line.kind === "SITE_INSTALLATION" ? update(line) : line)),
  };
}

function rehashedQuote(quote: QuoteSnapshot): QuoteSnapshot {
  const contentHash = quoteSnapshotContentHash(quote);
  return {
    ...quote,
    contentHash,
    quoteSnapshotId: `qts:${quote.productCode}:${contentHash}`,
  };
}
