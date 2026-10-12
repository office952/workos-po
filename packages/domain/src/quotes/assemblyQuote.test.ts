import { describe, expect, it } from "vitest";
import type { ConfirmedChildProduct } from "../assembly/model.js";
import type {
  AssemblyOrderSnapshot,
  AssemblyProductionSnapshot,
  AssemblyQuoteMember,
  AssemblyQuoteSnapshot,
} from "../assembly/snapshots.js";
import type { FrozenCommercialOffer } from "../commercial/quoteSnapshot.js";
import {
  INSPECT_FINISHED_ASSEMBLY_ID,
  MOUNT_LETTERS_ON_PANEL_ID,
  PACK_PRODUCT_ID,
} from "../processes/catalog.js";
import type { FrozenProductionOperation } from "../production/snapshot.js";
import {
  assemblyOperationMissingCostInputs,
  presentAssemblyQuoteDetail,
  presentAssemblyQuoteInternalCost,
  projectAssemblyQuoteOverviewItem,
  supersededAssemblyQuoteIds,
} from "./assemblyQuote.js";
import { filterQuoteOverview, projectQuoteOverview } from "./overview.js";

function offer(netPrice: number): FrozenCommercialOffer {
  const vatAmount = Math.round(netPrice * 21) / 100;
  return {
    policyId: "policy",
    policyVersion: 1,
    markupPercent: 35,
    markupAmount: 0,
    discountPercent: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    netPrice,
    vatPercent: 21,
    vatAmount,
    grossPrice: Math.round((netPrice + vatAmount) * 100) / 100,
    currency: "EUR",
    completeness: "COMPLETE",
  };
}

function member(role: AssemblyQuoteMember["role"], netPrice: number): AssemblyQuoteMember {
  return {
    memberId: `mem:${role}`,
    role,
    roleLabel: role === "SUPPORT_PANEL" ? "Panou ACM" : "Litere volumetrice",
    productCode: role === "SUPPORT_PANEL" ? "PRD-ACM-CASSETTE-NONE" : "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: role === "SUPPORT_PANEL" ? "Casetă ACM" : "Litere",
    inscription: role === "SUPPORT_PANEL" ? "PANOU" : "WORKOS",
    childQuoteSnapshotId: `qts:${role}`,
    childQuoteContentHash: `hash:${role}`,
    confirmedTruthId: `pct:${role}`,
    confirmedTruthHash: `truth:${role}`,
    commercial: offer(netPrice),
  };
}

function assemblyQuote(
  overrides: Partial<AssemblyQuoteSnapshot> = {},
): AssemblyQuoteSnapshot {
  const members = [member("SUPPORT_PANEL", 98.07), member("SIGNAGE_LETTERS", 516.38)];
  return {
    quoteSnapshotId: "asmq:truth-1",
    schemaVersion: 1,
    status: "FROZEN",
    organizationId: "org:alpha",
    requestId: "crq:1",
    assemblyKind: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
    assemblyContractVersion: "product-assembly-v1",
    assemblyId: "asm:1",
    assemblyTruthId: "truth-1",
    assemblyTruthHash: "truth-hash-1",
    label: "Panou ACM + litere volumetrice",
    createdAt: "2026-10-12T09:00:00.000Z",
    contentHash: "c0ffee0123456789",
    members,
    relationCommercialPrice: null,
    totals: {
      netPrice: 614.45,
      vatAmount: 129.03,
      grossPrice: 743.48,
      currency: "EUR",
      completeness: "COMPLETE",
    },
    ...overrides,
  };
}

function order(quote: AssemblyQuoteSnapshot): AssemblyOrderSnapshot {
  return {
    orderSnapshotId: "asmo:1",
    schemaVersion: 1,
    status: "FROZEN",
    organizationId: quote.organizationId,
    requestId: quote.requestId,
    sourceQuoteSnapshotId: quote.quoteSnapshotId,
    sourceQuoteContentHash: quote.contentHash,
    assemblyId: quote.assemblyId,
    assemblyTruthId: quote.assemblyTruthId,
    assemblyTruthHash: quote.assemblyTruthHash,
    assemblyKind: quote.assemblyKind,
    label: quote.label,
    createdAt: "2026-10-12T10:00:00.000Z",
    contentHash: "order-hash",
    members: quote.members,
    children: quote.members.map((item) => ({
      memberId: item.memberId,
      role: item.role,
      productCode: item.productCode,
      templateCode: item.productCode,
      templateVersion: "1",
      truthId: item.confirmedTruthId,
      truthHash: item.confirmedTruthHash,
      aggregateHash: "agg",
      productLabel: item.productLabel,
      inscription: item.inscription,
      childQuoteSnapshotId: item.childQuoteSnapshotId,
      childQuoteContentHash: item.childQuoteContentHash,
      commercial: item.commercial,
      productionInput: {} as AssemblyOrderSnapshot["children"][number]["productionInput"],
      eicTotal: item.role === "SUPPORT_PANEL" ? 72.64 : 382.5,
      eicCurrency: "EUR",
      eicCompleteness: "COMPLETE",
    })),
    relationCommercialPrice: null,
    totals: quote.totals,
  };
}

function assemblyOperation(processId: string, label: string): FrozenProductionOperation {
  return {
    id: `ANSAMBLARE:${processId}`,
    processId,
    processLabel: label,
    scope: "ANSAMBLARE",
    scopeLabel: "Ansamblare",
    typeId: null,
    dependsOn: [],
    requiredCapabilityId: "cap",
    requiredCapabilityLabel: "cap",
    providerRequirement: "INTERNAL" as FrozenProductionOperation["providerRequirement"],
    quantities: [],
    resourceDemands: [],
  };
}

function production(source: AssemblyOrderSnapshot): AssemblyProductionSnapshot {
  return {
    snapshotId: "asmp:1",
    schemaVersion: 1,
    status: "ACCEPTED",
    organizationId: source.organizationId,
    sourceOrderSnapshotId: source.orderSnapshotId,
    sourceOrderContentHash: source.contentHash,
    assemblyId: source.assemblyId,
    assemblyTruthId: source.assemblyTruthId,
    assemblyTruthHash: source.assemblyTruthHash,
    assemblyKind: source.assemblyKind,
    label: source.label,
    createdAt: "2026-10-12T11:00:00.000Z",
    contentHash: "production-hash",
    members: [],
    assemblyOperations: [
      assemblyOperation(MOUNT_LETTERS_ON_PANEL_ID, "Montaj litere pe panou"),
      assemblyOperation(INSPECT_FINISHED_ASSEMBLY_ID, "Control final ansamblu"),
      assemblyOperation(PACK_PRODUCT_ID, "Ambalare"),
    ],
    eicTotal: 440.14,
    eicCurrency: "EUR",
    eicCompleteness: "PARTIAL",
  };
}

const customer = { customerId: "cus:1", displayName: "Client Panou" };

describe("assembly quote registry projection", () => {
  it("projects one commercial record with its sections, totals, customer and request", () => {
    const quote = assemblyQuote();
    const item = projectAssemblyQuoteOverviewItem({
      quote,
      order: null,
      customer,
      requestReference: "CR-1",
      superseded: false,
    });
    expect(item).toMatchObject({
      quoteSnapshotId: "asmq:truth-1",
      kind: "ASSEMBLY",
      kindLabel: "Ansamblu",
      assemblyId: "asm:1",
      sectionCount: 2,
      reference: "OF-C0FFEE01",
      productLabel: "Panou ACM + litere volumetrice",
      inscription: "PANOU · WORKOS",
      customerId: "cus:1",
      customerDisplayName: "Client Panou",
      requestId: "crq:1",
      requestReference: "CR-1",
      grossDisplay: "743,48",
      currency: "EUR",
      stage: "QUOTE_CREATED",
      nextAction: "OPEN_ASSEMBLY",
      nextActionLabel: "Deschide ansamblul",
      needsAttention: true,
      orderSnapshotId: null,
      href: "/quotes/asmq%3Atruth-1",
    });
  });

  it("recognises an accepted assembly order", () => {
    const quote = assemblyQuote();
    const item = projectAssemblyQuoteOverviewItem({
      quote,
      order: order(quote),
      customer,
      requestReference: null,
      superseded: false,
    });
    expect(item).toMatchObject({
      stage: "ORDER_CREATED",
      stageLabel: "Cu comandă",
      nextAction: "OPEN_ORDER",
      orderSnapshotId: "asmo:1",
      needsAttention: false,
    });
  });

  it("marks older frozen quotes of the same assembly as superseded without hiding them", () => {
    const first = assemblyQuote();
    const second = assemblyQuote({
      quoteSnapshotId: "asmq:truth-2",
      assemblyTruthId: "truth-2",
      createdAt: "2026-10-12T12:00:00.000Z",
      contentHash: "beef0123456789",
    });
    const other = assemblyQuote({ quoteSnapshotId: "asmq:other", assemblyId: "asm:2" });
    const superseded = supersededAssemblyQuoteIds([first, second, other]);
    expect([...superseded]).toEqual(["asmq:truth-1"]);
    const item = projectAssemblyQuoteOverviewItem({
      quote: first,
      order: null,
      customer: null,
      requestReference: null,
      superseded: true,
    });
    expect(item).toMatchObject({
      superseded: true,
      needsAttention: false,
      attentionLabel: "Înlocuită de o versiune mai nouă",
    });
  });

  it("unifies standalone and assembly items without duplicating either", () => {
    const quote = assemblyQuote();
    const assemblyItem = projectAssemblyQuoteOverviewItem({
      quote,
      order: null,
      customer,
      requestReference: null,
      superseded: false,
    });
    const productItem = {
      ...assemblyItem,
      quoteSnapshotId: "qts:standalone",
      kind: "PRODUCT" as const,
      kindLabel: "Produs",
      assemblyId: null,
      sectionCount: 1,
      createdAt: "2026-10-12T08:00:00.000Z",
    };
    const overview = projectQuoteOverview([productItem, assemblyItem]);
    expect(overview.summary).toMatchObject({ total: 2, assemblies: 1 });
    expect(overview.quotes.map((item) => item.quoteSnapshotId)).toEqual([
      "asmq:truth-1",
      "qts:standalone",
    ]);
    expect(filterQuoteOverview(overview, "ALL", "ansamblu").map((item) => item.kind)).toEqual([
      "ASSEMBLY",
    ]);
  });
});

describe("assembly quote detail", () => {
  it("keeps child sections independently traceable and totals unchanged", () => {
    const quote = assemblyQuote();
    const detail = presentAssemblyQuoteDetail({ quote, order: null, production: null, superseded: false });
    expect(detail.sections).toHaveLength(2);
    expect(detail.sections.map((section) => section.roleLabel)).toEqual([
      "Panou ACM",
      "Litere volumetrice",
    ]);
    const sectionsGross = detail.sections.reduce((sum, section) => sum + section.grossPrice, 0);
    expect(Math.round(sectionsGross * 100) / 100).toBe(detail.totals.grossPrice);
    expect(detail.totals).toEqual({ netPrice: 614.45, vatAmount: 129.03, grossPrice: 743.48, currency: "EUR" });
    expect(detail.serviceSection).toBeNull();
  });

  it("does not mutate the frozen snapshot when presenting it", () => {
    const quote = assemblyQuote();
    const before = JSON.stringify(quote);
    presentAssemblyQuoteDetail({ quote, order: order(quote), production: null, superseded: false });
    presentAssemblyQuoteInternalCost({ quote, order: order(quote), production: null, confirmedChildren: [] });
    expect(JSON.stringify(quote)).toBe(before);
  });
});

describe("assembly quote internal cost honesty", () => {
  it("reports PARTIAL production cost and names the missing inputs per assembly operation", () => {
    const quote = assemblyQuote();
    const frozenOrder = order(quote);
    const cost = presentAssemblyQuoteInternalCost({
      quote,
      order: frozenOrder,
      production: production(frozenOrder),
      confirmedChildren: [],
    });
    expect(cost?.source).toBe("ORDER");
    expect(cost?.sections.map((section) => section.total)).toEqual([72.64, 382.5]);
    expect(cost?.production).toMatchObject({ total: 440.14, completeness: "PARTIAL" });
    expect(cost?.productionPending).toBe(false);
    const missing = new Map(
      cost?.production?.unpricedOperations.map((item) => [item.processLabel, item.missingInputs]),
    );
    expect(missing.get("Montaj litere pe panou")).toEqual([
      "Rețetă de cost pentru operație",
      "Bază de cantitate la nivel de ansamblu",
      "Tarif confirmat de organizație",
    ]);
    expect(missing.get("Control final ansamblu")).toHaveLength(3);
    expect(missing.get("Ambalare")).toEqual(["Cantitate la nivel de ansamblu (Suprafață față (m²))"]);
  });

  it("does not sum section costs before production release", () => {
    const quote = assemblyQuote();
    const children = quote.members.map(
      (item) =>
        ({
          truthId: item.confirmedTruthId,
          truthHash: item.confirmedTruthHash,
          eicTotal: 100,
          eicCompleteness: item.role === "SUPPORT_PANEL" ? "PARTIAL" : "COMPLETE",
        }) as ConfirmedChildProduct,
    );
    const cost = presentAssemblyQuoteInternalCost({ quote, order: null, production: null, confirmedChildren: children });
    expect(cost).toMatchObject({ source: "CONFIRMED_MEMBERS", production: null, productionPending: true });
    expect(cost?.sections.map((section) => section.completenessLabel)).toEqual([
      expect.any(String),
      expect.any(String),
    ]);
    expect(cost?.sections[0]?.completeness).toBe("PARTIAL");
    expect(cost).not.toHaveProperty("total");
  });

  it("withholds cost evidence when a confirmed member cannot be traced", () => {
    const quote = assemblyQuote();
    expect(
      presentAssemblyQuoteInternalCost({ quote, order: null, production: null, confirmedChildren: [] }),
    ).toBeNull();
  });

  it("asks only for an assembly quantity when the process already has a recipe", () => {
    expect(
      assemblyOperationMissingCostInputs({ processId: PACK_PRODUCT_ID, quantities: [] }),
    ).toHaveLength(1);
  });
});
