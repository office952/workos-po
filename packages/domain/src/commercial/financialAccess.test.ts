import { describe, expect, it } from "vitest";
import {
  collectFinancialKeys,
  resolveFinancialAccess,
  scopeCommercialPrice,
  scopeExecutionPlanView,
  scopeOrderSnapshot,
  scopeQuoteSnapshot,
  scopeSiteInstallationOperatorView,
} from "./financialAccess.js";
import { projectCommercialPrice } from "./price.js";
import type { OrderSnapshot } from "./orderSnapshot.js";
import type { QuoteSnapshot } from "./quoteSnapshot.js";

const price = projectCommercialPrice({
  total: 382.5,
  currency: "EUR",
  completeness: "COMPLETE",
});

describe("financial access", () => {
  it("scopes by endpoint family, not only membership role", () => {
    expect(resolveFinancialAccess({ family: "workshop", isOwner: true })).toBe("workshop");
    expect(resolveFinancialAccess({ family: "workshop", isOwner: false })).toBe("workshop");
    expect(resolveFinancialAccess({ family: "commercial", isOwner: true })).toBe("owner");
    expect(resolveFinancialAccess({ family: "commercial", isOwner: false })).toBe("commercial");
  });

  it("gives owner internal cost, markup and margin", () => {
    const scoped = scopeCommercialPrice(price, "owner");
    expect(scoped).toMatchObject({
      internalCost: 382.5,
      markupPercent: 35,
      netPrice: 516.38,
      vatPercent: 21,
      grossPrice: 624.82,
    });
    expect(scoped && "marginAmount" in scoped ? scoped.marginAmount : null).toBe(133.88);
  });

  it("omits owner-only fields for member commercial", () => {
    const scoped = scopeCommercialPrice(price, "commercial");
    const keys = collectFinancialKeys(scoped);
    expect(keys.has("netPrice")).toBe(true);
    expect(keys.has("vatPercent")).toBe(true);
    expect(keys.has("grossPrice")).toBe(true);
    expect(keys.has("internalCost")).toBe(false);
    expect(keys.has("markupPercent")).toBe(false);
    expect(keys.has("marginAmount")).toBe(false);
    expect(scoped && "internalCost" in scoped).toBe(false);
  });

  it("returns no commercial payload for workshop", () => {
    expect(scopeCommercialPrice(price, "workshop")).toBeUndefined();
  });

  it("scopes an incomplete stored quote without throwing", () => {
    const scoped = scopeQuoteSnapshot(
      {
        quoteSnapshotId: "qts:incomplete",
        schemaVersion: 1,
        status: "FROZEN",
        createdAt: "2026-01-01T00:00:00.000Z",
        productCode: "PRD",
        productLabel: "Letters",
        inscription: "TEST",
        sourceReviewId: "rev:1",
        contentHash: "hash",
        customer: { customerId: "cus:1", displayName: "Client" },
        seller: { legalName: "Seller" },
      } as QuoteSnapshot,
      "owner",
    );
    expect(scoped.quoteSnapshotId).toBe("qts:incomplete");
    expect(scoped.eic).toBeUndefined();
    expect(scoped.commercial).toBeUndefined();
  });

  it("strips recipe rate and cost from member quote snapshots", () => {
    const scoped = scopeQuoteSnapshot(
      {
        quoteSnapshotId: "qts:recipes",
        schemaVersion: 1,
        status: "FROZEN",
        createdAt: "2026-01-01T00:00:00.000Z",
        productCode: "PRD",
        productLabel: "Letters",
        inscription: "TEST",
        sourceReviewId: "rev:1",
        contentHash: "hash",
        customer: { customerId: "cus:1", displayName: "Client" },
        seller: { legalName: "Seller" },
        productionInput: {
          schemaVersion: 1,
          requirements: [],
          operations: [],
          usedTechnicalSettings: [],
          usedRecipes: [
            {
              recipeId: "rec:1",
              processId: "proc:1",
              scope: "volume",
              costEvidenceId: "ev:1",
              resourceId: "res:1",
              resourceLabel: "Aluminiu",
              quantity: 12.4,
              unit: "m",
              rate: 3,
              currency: "EUR",
              cost: 37.2,
            },
          ],
          contentHash: "input",
        },
        commercial: {
          netPrice: 516.38,
          vatPercent: 21,
          vatAmount: 108.44,
          grossPrice: 624.82,
          currency: "EUR",
          completeness: "COMPLETE",
          discountPercent: 0,
          discountAmount: 0,
          adjustmentAmount: 0,
          policyId: "policy",
          policyVersion: 1,
          markupPercent: 35,
          markupAmount: 133.88,
        },
      } as unknown as QuoteSnapshot,
      "commercial",
    );
    const keys = collectFinancialKeys(scoped);
    expect(keys.has("grossPrice")).toBe(true);
    expect(keys.has("rate")).toBe(false);
    expect(keys.has("cost")).toBe(false);
    expect(JSON.stringify(scoped)).not.toContain("\"rate\"");
    expect(JSON.stringify(scoped)).not.toContain("\"cost\":");
  });

  it("strips execution money outside owner", () => {
    const view = {
      plan: {
        planId: "exp:1",
        sourceSnapshotId: "aps:1",
        sourceSnapshotHash: "h",
        productCode: "PRD",
        productLabel: "Litere",
        inscription: "TEST",
        createdAt: "2026-01-01T00:00:00.000Z",
        status: "PLANNED" as const,
        taskCount: 1,
        schemaVersion: 1 as const,
        eicTotal: 382.5,
        eicCurrency: "EUR" as const,
        eicCompleteness: "COMPLETE" as const,
      },
      progress: {
        total: 1,
        completed: 0,
        inProgress: 0,
        planned: 1,
        waitingDependencies: 0,
        noProvider: 0,
        noExecutor: 0,
        varianceCount: 0,
        status: "PLANNED" as const,
      },
      progressStatus: "PLANNED" as const,
      statusLabel: "Planificat",
      sourceKind: "ORDER" as const,
      sourceKindLabel: "Comandă",
      jobHref: "/jobs/ord%3A1",
      tasks: [],
      actualInternalCost: {
        status: "UNAVAILABLE" as const,
        statusLabel: "Indisponibil",
        currency: "EUR" as const,
        calculableTotal: null,
        plannedComparableTotal: null,
        availableDifference: null,
        lines: [],
        calculableCount: 0,
        unavailableCount: 0,
      },
    };
    const workshop = scopeExecutionPlanView(view, "workshop");
    const keys = collectFinancialKeys(workshop);
    expect(keys.has("eicTotal")).toBe(false);
    expect(keys.has("actualInternalCost")).toBe(false);
    expect(workshop.actualInternalCost).toBeUndefined();
    expect((workshop.plan as { eicTotal?: number }).eicTotal).toBeUndefined();
  });

  it("scopes schema v2 service lines by ownership instead of spreading evidence", () => {
    const snapshot = syntheticSubcontractQuoteV2();
    const owner = scopeQuoteSnapshot(snapshot, "owner");
    const commercial = scopeQuoteSnapshot(snapshot, "commercial");
    const workshop = scopeQuoteSnapshot(snapshot, "workshop");
    const ownerInstall = findInstallLine(owner);
    const commercialInstall = findInstallLine(commercial);
    const workshopInstall = findInstallLine(workshop);

    expect(ownerInstall?.evidence).toMatchObject({
      amount: 180,
      supplierLabel: "Montaj Rapid SRL",
      validFrom: "2027-01-01",
      validUntil: "2027-12-31",
      resourceId: "SVC-SITE-INSTALL-SUBCONTRACT",
    });
    expect(ownerInstall?.eic).toMatchObject({ total: 180, completeness: "COMPLETE" });
    expect(ownerInstall?.commercial).toMatchObject({ netPrice: 200, grossPrice: 242 });
    expect(owner.jobCommercial).toMatchObject({ grossPrice: 866.82 });

    expect(commercialInstall).toMatchObject({
      kind: "SITE_INSTALLATION",
      commercialStrategy: "MANUAL_FIXED_PER_REQUEST",
      providerMode: "SUBCONTRACTED",
      quantity: 1,
      commercialUnit: "job",
    });
    expect(commercialInstall?.commercial).toMatchObject({ netPrice: 200, grossPrice: 242 });
    expect(commercialInstall).not.toHaveProperty("evidence");
    expect(commercialInstall).not.toHaveProperty("eic");
    expect(commercialInstall).not.toHaveProperty("sourceRequestId");
    expect(commercial.jobCommercial).toMatchObject({
      netPrice: 716.38,
      grossPrice: 866.82,
    });
    expect(collectFinancialKeys(commercial).has("eic")).toBe(false);
    expect(collectFinancialKeys(commercial).has("rate")).toBe(false);
    expect(collectFinancialKeys(commercial).has("cost")).toBe(false);
    expect(JSON.stringify(commercial)).not.toContain("evidence");
    expect(JSON.stringify(commercial)).not.toContain("Montaj Rapid SRL");
    expect(JSON.stringify(commercial)).not.toContain("supplierLabel");
    expect(JSON.stringify(commercial)).not.toContain("validFrom");
    expect(JSON.stringify(commercial)).not.toContain("validUntil");
    expect(JSON.stringify(commercial)).not.toContain("\"amount\":180");
    expect(JSON.stringify(commercial)).not.toContain("\"total\":180");

    expect(workshopInstall).toMatchObject({
      kind: "SITE_INSTALLATION",
      quantity: 1,
      commercialUnit: "job",
    });
    expect(workshopInstall).not.toHaveProperty("evidence");
    expect(workshopInstall).not.toHaveProperty("eic");
    expect(workshopInstall).not.toHaveProperty("commercial");
    expect(workshopInstall).not.toHaveProperty("providerMode");
    expect(workshop.jobCommercial).toBeUndefined();
    expect(workshop.commercial).toBeUndefined();
    expect(JSON.stringify(workshop)).not.toContain("Montaj Rapid SRL");
    expect(JSON.stringify(workshop)).not.toContain("\"netPrice\"");
    expect(JSON.stringify(workshop)).not.toContain("\"grossPrice\"");
    expect(JSON.stringify(workshop)).not.toContain("\"amount\":180");
    expect(collectFinancialKeys(workshop).has("eic")).toBe(false);
    expect(collectFinancialKeys(workshop).has("cost")).toBe(false);
  });

  it("keeps live installation EIC on Owner views and strips it for Commercial and Workshop", () => {
    const view = {
      scopeId: "SITE_INSTALLATION" as const,
      label: "Montaj la locație" as const,
      eicCompleteness: "COMPLETE" as const,
      commercialCompleteness: "COMPLETE" as const,
      commercialNetPrice: 200,
      commercialGrossPrice: 242,
      incompleteReasons: [],
      ownerInternalCost: {
        label: "Cost intern estimat montaj",
        total: 300,
        currency: "EUR" as const,
        quantity: 12,
        unitLabel: "ore-persoană",
        rate: 25,
      },
    };
    expect(scopeSiteInstallationOperatorView(view, "owner").ownerInternalCost?.total).toBe(300);
    const commercial = scopeSiteInstallationOperatorView(view, "commercial");
    const workshop = scopeSiteInstallationOperatorView(view, "workshop");
    expect(commercial.ownerInternalCost).toBeUndefined();
    expect(workshop.ownerInternalCost).toBeUndefined();
    expect(commercial.commercialGrossPrice).toBe(242);
    expect(workshop.commercialGrossPrice).toBe(242);
    expect(JSON.stringify(commercial)).not.toContain("300");
    expect(JSON.stringify(commercial)).not.toContain("\"rate\":25");
    expect(JSON.stringify(workshop)).not.toContain("300");
    expect(collectFinancialKeys(commercial).has("rate")).toBe(false);
    expect(collectFinancialKeys(workshop).has("rate")).toBe(false);
  });

  it("scopes nested Order v2 service money with the same quote-v2 law", () => {
    const order = syntheticSubcontractOrderV2();
    const owner = scopeOrderSnapshot(order, "owner");
    const commercial = scopeOrderSnapshot(order, "commercial");
    const workshop = scopeOrderSnapshot(order, "workshop");
    const ownerInstall = findInstallLine(owner);
    const commercialInstall = findInstallLine(commercial);
    const workshopInstall = findInstallLine(workshop);

    expect(owner.jobCommercial).toMatchObject({ grossPrice: 866.82 });
    expect(ownerInstall?.evidence).toMatchObject({
      amount: 180,
      supplierLabel: "Montaj Rapid SRL",
    });
    expect(ownerInstall?.eic).toMatchObject({ total: 180 });
    expect(collectFinancialKeys(owner).has("eic")).toBe(true);

    expect(commercial.jobCommercial).toMatchObject({ grossPrice: 866.82 });
    expect(commercialInstall?.commercial).toMatchObject({ netPrice: 200, grossPrice: 242 });
    expect(commercialInstall).not.toHaveProperty("evidence");
    expect(commercialInstall).not.toHaveProperty("eic");
    expect(collectFinancialKeys(commercial).has("eic")).toBe(false);
    expect(JSON.stringify(commercial)).not.toContain("Montaj Rapid SRL");

    expect(workshop.jobCommercial).toBeUndefined();
    expect(workshop.commercial).toBeUndefined();
    expect(workshop.eic).toBeUndefined();
    expect(workshopInstall).not.toHaveProperty("commercial");
    expect(collectFinancialKeys(workshop).has("grossPrice")).toBe(false);
    expect(collectFinancialKeys(workshop).has("eic")).toBe(false);
  });
});

function findInstallLine(snapshot: Record<string, unknown>) {
  const lines = snapshot.lines as Array<Record<string, unknown>> | undefined;
  return lines?.find((line) => line.kind === "SITE_INSTALLATION");
}

function syntheticSubcontractQuoteV2(): QuoteSnapshot {
  const productCommercial = {
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
    currency: "EUR" as const,
    completeness: "COMPLETE" as const,
  };
  const installCommercial = {
    policyId: "policy",
    policyVersion: 1,
    markupPercent: 0,
    markupAmount: 0,
    discountPercent: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    netPrice: 200,
    vatPercent: 21,
    vatAmount: 42,
    grossPrice: 242,
    currency: "EUR" as const,
    completeness: "COMPLETE" as const,
  };
  return {
    quoteSnapshotId: "qts:v2-subcontract",
    schemaVersion: 2,
    status: "FROZEN",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription: "ACCESS",
    sourceReviewId: "rev:v2",
    sourceConfirmedAt: "2026-09-02T00:00:00.000Z",
    createdAt: "2026-09-02T00:00:00.000Z",
    contentHash: "hash-v2-subcontract",
    truth: {
      templateCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      templateVersion: "1",
      familyId: "letters",
      selectedComponentIds: [],
      values: {},
      measurements: [],
    },
    quantities: [],
    eic: {
      total: 382.5,
      currency: "EUR",
      completeness: "COMPLETE",
      lines: [],
    },
    commercial: productCommercial,
    productionInput: {
      schemaVersion: 1,
      requirements: [],
      operations: [],
      usedTechnicalSettings: [],
      usedRecipes: [],
      contentHash: "input",
    },
    lines: [
      {
        kind: "PRODUCT",
        lineVersion: 1,
        commercialStrategy: "PRODUCT_COST_PLUS",
        label: "Litere",
        productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        eic: {
          total: 382.5,
          currency: "EUR",
          completeness: "COMPLETE",
          lines: [],
        },
        commercial: productCommercial,
      },
      {
        kind: "SITE_INSTALLATION",
        lineVersion: 1,
        scopeId: "SITE_INSTALLATION",
        commercialStrategy: "MANUAL_FIXED_PER_REQUEST",
        providerMode: "SUBCONTRACTED",
        label: "Montaj la locație",
        sourceRequestId: "req:v2-subcontract",
        quantity: 1,
        commercialUnit: "job",
        eic: {
          total: 180,
          currency: "EUR",
          completeness: "COMPLETE",
          lines: [
            {
              resourceId: "SVC-SITE-INSTALL-SUBCONTRACT",
              label: "Montaj la locație subcontractat",
              quantity: 1,
              unit: "job",
              rate: 180,
              currency: "EUR",
              cost: 180,
            },
          ],
        },
        commercial: installCommercial,
        technicalConfiguration: {
          measurementStatus: "OFFICE_MEASURED",
          facadeType: "CONCRETE",
          fixingMethod: "MECHANICAL_ANCHOR",
          siteElectrical: "NOT_APPLICABLE",
          crewSize: null,
          plannedDurationHours: null,
        },
        evidence: {
          resourceId: "SVC-SITE-INSTALL-SUBCONTRACT",
          classification: "OWNER_CONFIRMED",
          amount: 180,
          currency: "EUR",
          perUnit: "job",
          supplierLabel: "Montaj Rapid SRL",
          validFrom: "2027-01-01",
          validUntil: "2027-12-31",
        },
      },
    ],
    jobCommercial: {
      netPrice: 716.38,
      vatAmount: 150.44,
      grossPrice: 866.82,
      currency: "EUR",
      completeness: "COMPLETE",
    },
  } as unknown as QuoteSnapshot;
}

function syntheticSubcontractOrderV2(): OrderSnapshot {
  const quote = syntheticSubcontractQuoteV2();
  return {
    orderSnapshotId: "ord:v2-subcontract",
    schemaVersion: 2,
    status: "FROZEN",
    createdAt: "2026-09-04T00:00:00.000Z",
    sourceQuoteSnapshotId: quote.quoteSnapshotId,
    sourceQuoteContentHash: quote.contentHash,
    sourceAcceptanceId: "qad:v2-subcontract",
    sourceAcceptedAt: "2026-09-04T01:00:00.000Z",
    productCode: quote.productCode,
    productLabel: quote.productLabel,
    inscription: quote.inscription,
    sourceReviewId: quote.sourceReviewId,
    contentHash: "hash-order-v2-subcontract",
    truth: quote.truth,
    quantities: quote.quantities,
    eic: quote.eic,
    commercial: quote.commercial,
    productionInput: quote.productionInput,
    lines: quote.lines,
    jobCommercial: quote.jobCommercial,
  };
}
