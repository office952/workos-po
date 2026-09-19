import { describe, expect, it } from "vitest";
import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import type { QuoteAcceptanceDecision } from "../commercial/quoteAcceptance.js";
import type { QuoteSnapshot } from "../commercial/quoteSnapshot.js";
import {
  deriveQuoteOverviewNextAction,
  deriveQuoteOverviewStage,
  filterQuoteOverview,
  projectQuoteOverview,
  projectQuoteOverviewItem,
  quoteOverviewHref,
} from "./overview.js";

function quote(inscription = "WORKOS"): QuoteSnapshot {
  return {
    quoteSnapshotId: `qts:${inscription}`,
    schemaVersion: 1,
    status: "FROZEN",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription,
    sourceReviewId: "rev:test",
    sourceConfirmedAt: "2026-08-17T04:00:00.000Z",
    createdAt: "2026-08-17T05:00:00.000Z",
    contentHash: "abcdef0123456789",
    truth: {
      templateCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      templateVersion: "1",
      familyId: "fam",
      selectedComponentIds: [],
      values: {},
      measurements: [],
    },
    quantities: [],
    eic: { total: 382.5, currency: "EUR", completeness: "COMPLETE", lines: [] },
    commercial: {
      policyId: "policy",
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
    },
    productionInput: {
      schemaVersion: 1,
      contentHash: "prodhash",
      requirements: [],
      operations: [],
      usedTechnicalSettings: [],
      usedRecipes: [],
    },
  };
}

function acceptance(inscription = "WORKOS"): QuoteAcceptanceDecision {
  return {
    acceptanceId: `qad:qts:${inscription}`,
    schemaVersion: 1,
    quoteSnapshotId: `qts:${inscription}`,
    quoteContentHash: "abcdef0123456789",
    acceptedAt: "2026-08-17T06:00:00.000Z",
  };
}

function order(inscription = "WORKOS"): OrderSnapshot {
  return {
    orderSnapshotId: `ord:${inscription}`,
    schemaVersion: 1,
    status: "FROZEN",
    createdAt: "2026-08-17T07:00:00.000Z",
    sourceQuoteSnapshotId: `qts:${inscription}`,
    sourceQuoteContentHash: "abcdef0123456789",
    sourceAcceptanceId: `qad:qts:${inscription}`,
    sourceAcceptedAt: "2026-08-17T06:00:00.000Z",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription,
    sourceReviewId: "rev:test",
    contentHash: "orderhash",
    truth: quote(inscription).truth,
    quantities: [],
    eic: quote(inscription).eic,
    commercial: quote(inscription).commercial,
    productionInput: quote(inscription).productionInput,
  };
}

describe("quote overview projection", () => {
  it("derives stage from acceptance and order facts only", () => {
    expect(deriveQuoteOverviewStage({ acceptance: null, order: null })).toBe("QUOTE_CREATED");
    expect(deriveQuoteOverviewStage({ acceptance: acceptance(), order: null })).toBe(
      "QUOTE_ACCEPTED",
    );
    expect(deriveQuoteOverviewStage({ acceptance: acceptance(), order: order() })).toBe(
      "ORDER_CREATED",
    );
  });

  it("opens the frozen quote until an order exists", () => {
    expect(deriveQuoteOverviewNextAction("QUOTE_CREATED")).toBe("ACCEPT_QUOTE");
    expect(
      quoteOverviewHref({
        productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        quoteSnapshotId: "qts:WORKOS",
        orderSnapshotId: null,
        nextAction: "ACCEPT_QUOTE",
      }),
    ).toBe("/quotes/qts%3AWORKOS");
    expect(
      quoteOverviewHref({
        productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        quoteSnapshotId: "qts:WORKOS",
        orderSnapshotId: "ord:WORKOS",
        nextAction: "OPEN_ORDER",
      }),
    ).toBe("/quotes/qts%3AWORKOS");
  });

  it("projects operator labels from frozen quote facts", () => {
    const created = projectQuoteOverviewItem({
      quote: {
        ...quote(),
        customer: { customerId: "cus:letters", displayName: "Client Demo LETTERS" },
      },
      acceptance: null,
      order: null,
    });
    expect(created).toMatchObject({
      reference: "OF-ABCDEF01",
      stage: "QUOTE_CREATED",
      stageLabel: "Creată",
      nextActionLabel: "Marchează acceptată",
      customerId: "cus:letters",
      customerDisplayName: "Client Demo LETTERS",
      grossDisplay: "624,82",
      currency: "EUR",
      needsAttention: true,
      attentionLabel: "Urmează acceptarea",
    });
    expect(created.href).toBe("/quotes/qts%3AWORKOS");
  });

  it("keeps ordered quotes out of the needs-action filter", () => {
    const overview = projectQuoteOverview([
      projectQuoteOverviewItem({ quote: quote("A"), acceptance: null, order: null }),
      projectQuoteOverviewItem({
        quote: { ...quote("B"), createdAt: "2026-08-17T08:00:00.000Z" },
        acceptance: acceptance("B"),
        order: null,
      }),
      projectQuoteOverviewItem({
        quote: { ...quote("C"), createdAt: "2026-08-17T09:00:00.000Z" },
        acceptance: acceptance("C"),
        order: order("C"),
      }),
    ]);
    expect(overview.summary).toEqual({
      total: 3,
      needsAttention: 2,
      accepted: 1,
      ordered: 1,
    });
    expect(filterQuoteOverview(overview, "NEEDS_ACTION")).toHaveLength(2);
    expect(filterQuoteOverview(overview, "ACCEPTED")[0]?.inscription).toBe("B");
    expect(filterQuoteOverview(overview, "ORDERED")[0]?.inscription).toBe("C");
    expect(filterQuoteOverview(overview, "ORDERED", "zz-missing")).toHaveLength(0);
    expect(JSON.stringify(overview)).not.toMatch(/contentHash|schemaVersion|SENT|draft/);
  });

  it("searches frozen customer identity, not live rename convenience", () => {
    const item = projectQuoteOverviewItem({
      quote: {
        ...quote("FROZEN-INSCRIPTION"),
        customer: { customerId: "cus:1", displayName: "Nume Înghețat" },
      },
      acceptance: null,
      order: null,
    });
    const overview = projectQuoteOverview([item]);
    expect(filterQuoteOverview(overview, "ALL", "inghetat")).toHaveLength(1);
    expect(filterQuoteOverview(overview, "ALL", "FROZEN-INSCRIPTION")).toHaveLength(1);
    expect(filterQuoteOverview(overview, "ALL", "Live Rename")).toHaveLength(0);
  });
});
