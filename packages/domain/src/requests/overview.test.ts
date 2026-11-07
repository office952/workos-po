import { describe, expect, it } from "vitest";
import { createCustomer } from "../customers/identity.js";
import { projectCustomerWorkspace } from "../customers/workspace.js";
import { quoteOverviewCommercialFields, type QuoteOverviewItem } from "../quotes/overview.js";
import type { RequestAssemblyWork } from "./assemblyWork.js";
import { COMMERCIAL_REQUEST_STATUSES, type CommercialRequest } from "./commercialRequest.js";
import {
  deriveRequestCommercialProgress,
  filterRequestOverview,
  projectRequestDetail,
  projectRequestOverview,
  projectRequestOverviewItem,
} from "./overview.js";

function request(overrides: Partial<CommercialRequest> = {}): CommercialRequest {
  return {
    requestId: "crq:11111111-2222-3333-4444-555555555555",
    reference: "CER-11111111",
    customerId: "cus:active",
    title: "Litere exterior",
    description: "Pe fațadă, text HUB MEDIA.",
    status: "NEW",
    optionalScopeIds: [],
    siteInstallationMode: null,
    createdAt: "2026-08-17T10:00:00.000Z",
    updatedAt: "2026-08-17T10:00:00.000Z",
    ...overrides,
  };
}

function quote(stage: QuoteOverviewItem["stage"], inscription = "HUB"): QuoteOverviewItem {
  return {
    quoteSnapshotId: `qts:${inscription}`,
    kind: "PRODUCT",
    kindLabel: "Produs",
    assemblyId: null,
    sectionCount: 1,
    superseded: false,
    reference: "OF-ABCDEF01",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription,
    customerId: "cus:active",
    customerDisplayName: "HUB MEDIA",
    createdAt: "2026-08-17T12:00:00.000Z",
    grossDisplay: "624,82",
    currency: "EUR",
    stage,
    stageLabel: stage === "ORDER_CREATED" ? "Cu comandă" : "Creată",
    nextAction:
      stage === "ORDER_CREATED"
        ? "OPEN_ORDER"
        : stage === "QUOTE_ACCEPTED"
          ? "CREATE_ORDER"
          : "ACCEPT_QUOTE",
    nextActionLabel: "Deschide",
    href: `/quotes/${encodeURIComponent(`qts:${inscription}`)}`,
    ...quoteOverviewCommercialFields({
      stage,
      superseded: false,
      disposition: null,
      commercialState: null,
    }),
    acceptanceId: stage === "QUOTE_CREATED" ? null : "qad:1",
    orderSnapshotId: stage === "ORDER_CREATED" ? "ord:1" : null,
    requestId: null,
    requestReference: null,
    disposition: null,
    dispositionLabel: null,
  };
}

describe("request overview projection", () => {
  it.each(COMMERCIAL_REQUEST_STATUSES)("projects product selection for active intake status %s without advancing readiness", (status) => {
    const expected = ["NEW", "IN_REVIEW", "READY_FOR_QUOTE"].includes(status)
      ? "CHOOSE_PRODUCT"
      : "OPEN_REQUEST";
    const source = request({ status });
    const item = projectRequestOverviewItem({ request: source, customerDisplayName: "Client", quotes: [] });
    const detail = projectRequestDetail({ request: source, customerDisplayName: "Client", quotes: [] });
    expect(item.nextAction).toBe(expected);
    expect(detail.nextAction).toBe(expected);
    expect(item.status).toBe(status);
    expect(detail.request.status).toBe(status);
    expect(source.status).toBe(status);
  });

  it.each(["NEW", "IN_REVIEW", "WAITING_CUSTOMER", "READY_FOR_QUOTE", "CANCELLED"] as const)(
    "preserves linked-offer continuation for status %s",
    (status) => {
      const item = projectRequestOverviewItem({
        request: request({ status }),
        customerDisplayName: "Client",
        quotes: [quote("QUOTE_CREATED")],
      });
      expect(item.nextAction).toBe("OPEN_QUOTE");
      expect(item.needsAttention).toBe(false);
    },
  );

  it("keeps request status separate from derived offer progress", () => {
    const item = projectRequestOverviewItem({
      request: request({ status: "READY_FOR_QUOTE" }),
      customerDisplayName: "HUB MEDIA",
      quotes: [quote("QUOTE_ACCEPTED")],
    });
    expect(item.status).toBe("READY_FOR_QUOTE");
    expect(item.statusLabel).toBe("Gata de ofertă");
    expect(item.commercialProgress).toBe("QUOTE_ACCEPTED");
    expect(item.commercialProgressLabel).toBe("Ofertă acceptată");
    expect(item.nextAction).toBe("OPEN_QUOTE");
    expect(item.nextActionLabel).toBe("Confirmarea comenzii");
    expect(item.needsAttention).toBe(true);
    expect(item.linkedQuoteSnapshotId).toBe("qts:HUB");
    expect(item.linkedQuoteProductCode).toBe("PRD-LETTERS-FRONTLIT-PLEXI-AL06");
    expect(item.href).toBe("/requests/crq%3A11111111-2222-3333-4444-555555555555");
    expect(item.nextActionHref).toContain("/quotes/");
    expect(item.nextActionHref).not.toContain("/requests/");
    expect(JSON.stringify(item)).not.toMatch(/contentHash|schemaVersion|SENT|draft|Intake/);
  });

  it("derives the furthest linked commercial stage", () => {
    expect(deriveRequestCommercialProgress([])).toBeNull();
    expect(deriveRequestCommercialProgress([quote("QUOTE_CREATED")])).toBe("QUOTE_CREATED");
    expect(
      deriveRequestCommercialProgress([
        quote("QUOTE_CREATED", "A"),
        quote("ORDER_CREATED", "B"),
      ]),
    ).toBe("ORDER_CREATED");
  });

  it("applies the accepted request attention law", () => {
    const attention = (status: CommercialRequest["status"], quotes: QuoteOverviewItem[] = []) => {
      const item = projectRequestOverviewItem({
        request: request({ status }),
        customerDisplayName: "Client",
        quotes,
      });
      return { needsAttention: item.needsAttention, attentionLabel: item.attentionLabel };
    };
    const none = { needsAttention: false, attentionLabel: null };
    expect(attention("NEW")).toEqual(none);
    expect(attention("IN_REVIEW")).toEqual(none);
    expect(attention("WAITING_CUSTOMER")).toEqual(none);
    expect(attention("READY_FOR_QUOTE")).toEqual({
      needsAttention: true,
      attentionLabel: "Urmează oferta",
    });
    expect(attention("READY_FOR_QUOTE", [quote("QUOTE_CREATED")])).toEqual(none);
    expect(attention("BLOCKED", [quote("QUOTE_CREATED")])).toEqual({
      needsAttention: true,
      attentionLabel: "Cerere blocată",
    });
    expect(attention("CANCELLED")).toEqual(none);
  });

  it("orders by createdAt descending and does not promote attention", () => {
    const overview = projectRequestOverview([
      projectRequestOverviewItem({
        request: request({
          requestId: "crq:old-blocked",
          status: "BLOCKED",
          createdAt: "2026-08-17T10:00:00.000Z",
        }),
        customerDisplayName: "A",
        quotes: [],
      }),
      projectRequestOverviewItem({
        request: request({
          requestId: "crq:newer",
          status: "NEW",
          createdAt: "2026-08-17T12:00:00.000Z",
        }),
        customerDisplayName: "B",
        quotes: [],
      }),
      projectRequestOverviewItem({
        request: request({
          requestId: "crq:old",
          status: "CANCELLED",
          createdAt: "2026-08-17T11:00:00.000Z",
        }),
        customerDisplayName: "C",
        quotes: [],
      }),
    ]);
    expect(overview.requests.map((item) => item.requestId)).toEqual([
      "crq:newer",
      "crq:old",
      "crq:old-blocked",
    ]);
    expect(overview.summary.needsAttention).toBe(1);
    expect(filterRequestOverview(overview, "NEW")).toHaveLength(1);
    expect(filterRequestOverview(overview, "CANCELLED")[0]?.requestId).toBe("crq:old");
    expect(filterRequestOverview(overview, "ALL", "CER-11111111")).toHaveLength(3);
    expect(filterRequestOverview(overview, "CANCELLED", "C")[0]?.requestId).toBe("crq:old");
    expect(filterRequestOverview(overview, "NEW", "B")).toHaveLength(1);
    expect(filterRequestOverview(overview, "NEW", "zz-missing")).toHaveLength(0);
  });

  it("projects detail with linked offers and customer lock after a quote", () => {
    const detail = projectRequestDetail({
      request: request({ status: "IN_REVIEW" }),
      customerDisplayName: "HUB MEDIA",
      quotes: [quote("QUOTE_CREATED")],
    });
    expect(detail.canChangeCustomer).toBe(false);
    expect(detail.canUpdateStatus).toBe(true);
    expect(detail.canUploadAttachments).toBe(true);
    expect(detail.attachments).toEqual([]);
    expect(detail.linkedOffers).toHaveLength(1);
    expect(detail.nextAction).toBe("OPEN_QUOTE");
    expect(detail.nextActionLabel).toBe("Deschide oferta");
    expect(detail.request.description).toContain("fațadă");
    expect(detail.request).not.toHaveProperty("eic");
    expect(detail.installationScope).toBeNull();
    expect(detail.installationFacts).toBeNull();
    expect(detail.canWriteInstallationFacts).toBe(false);
    expect(detail.installationOffer.canSelectNew).toBe(false);
    expect(detail.installationOffer.selected).toBe(false);
  });

  describe("request-level next action target (W2 · D04)", () => {
    function branch(stage: QuoteOverviewItem["stage"], inscription: string, minute: number): QuoteOverviewItem {
      return {
        ...quote(stage, inscription),
        createdAt: `2026-11-04T10:${String(minute).padStart(2, "0")}:00.000Z`,
        orderSnapshotId: stage === "ORDER_CREATED" ? `ord:${inscription}` : null,
      };
    }
    const eight = (stages: Partial<Record<number, QuoteOverviewItem["stage"]>> = {}) =>
      Array.from({ length: 8 }, (_, index) => branch(stages[index] ?? "QUOTE_CREATED", `SFC-${index + 1}`, index));

    function both(quotes: readonly QuoteOverviewItem[], assemblies: readonly RequestAssemblyWork[] = []) {
      const source = request({ status: "IN_REVIEW" });
      return {
        item: projectRequestOverviewItem({ request: source, customerDisplayName: "Client", quotes, assemblies }),
        detail: projectRequestDetail({ request: source, customerDisplayName: "Client", quotes, assemblies }),
      };
    }

    function expectSameTarget(quotes: readonly QuoteOverviewItem[], assemblies: readonly RequestAssemblyWork[] = []) {
      const { item, detail } = both(quotes, assemblies);
      expect(detail.nextAction).toBe(item.nextAction);
      expect(detail.nextActionLabel).toBe(item.nextActionLabel);
      expect(detail.nextActionHref).toBe(item.nextActionHref);
      expect(detail.linkedQuoteSnapshotId).toBe(item.linkedQuoteSnapshotId);
      expect(detail.linkedQuoteProductCode).toBe(item.linkedQuoteProductCode);
      expect(detail.linkedAssemblyId).toBe(item.linkedAssemblyId);
      return detail;
    }

    it("has no quote target without quotes", () => {
      const detail = expectSameTarget([]);
      expect(detail.nextAction).toBe("CHOOSE_PRODUCT");
      expect(detail.linkedQuoteSnapshotId).toBeNull();
      expect(detail.nextActionHref).toBe("/requests/crq%3A11111111-2222-3333-4444-555555555555");
    });

    it("targets the only quote", () => {
      const detail = expectSameTarget([branch("QUOTE_CREATED", "SFC-1", 0)]);
      expect(detail.linkedQuoteSnapshotId).toBe("qts:SFC-1");
      expect(detail.nextActionHref).toBe("/quotes/qts%3ASFC-1");
    });

    it("opens the request when eight offers all wait for the customer", () => {
      const detail = expectSameTarget(eight());
      expect(detail.nextAction).toBe("OPEN_REQUEST");
      expect(detail.journey.waitingCount).toBe(8);
      expect(detail.journey.actionableCount).toBe(0);
    });

    it("still waits on the customer when two of eight offers have orders", () => {
      const detail = expectSameTarget(eight({ 1: "ORDER_CREATED", 4: "ORDER_CREATED" }));
      expect(detail.nextAction).toBe("OPEN_REQUEST");
      expect(detail.journey.orderCount).toBe(2);
      expect(detail.journey.waitingCount).toBe(6);
    });

    it("targets the only accepted offer without an order, not the newer ordered one", () => {
      const detail = expectSameTarget(eight({ 2: "QUOTE_ACCEPTED", 5: "ORDER_CREATED" }));
      expect(detail.nextAction).toBe("OPEN_QUOTE");
      expect(detail.nextActionHref).toBe("/quotes/qts%3ASFC-3");
      expect(detail.nextActionLabel).toBe("Confirmarea comenzii");
    });

    it("summarizes two accepted offers without orders instead of choosing one", () => {
      const detail = expectSameTarget(eight({ 0: "QUOTE_ACCEPTED", 2: "QUOTE_ACCEPTED" }));
      expect(detail.nextAction).toBe("OPEN_REQUEST");
      expect(detail.nextActionLabel).toBe("2 de rezolvat");
    });

    it("opens the job sheet of an ordered assembly when nothing else waits", () => {
      const assembly: RequestAssemblyWork = {
        assemblyId: "asm:1",
        label: "Fațadă",
        stage: "ORDER_CREATED",
        stageLabel: "Comandă creată",
        quoteSnapshotId: "aqs:1",
        quoteGrossPrice: 1000,
        currency: "EUR",
        orderSnapshotId: "ord:asm",
        productionSnapshotId: null,
        executionPlanId: null,
        revisionPending: false,
        membersEditable: false,
        memberProductCodes: [],
        updatedAt: "2026-11-04T11:00:00.000Z",
      };
      const assemblyOffer: QuoteOverviewItem = {
        ...branch("ORDER_CREATED", "ASM", 9),
        quoteSnapshotId: "aqs:1",
        kind: "ASSEMBLY",
        assemblyId: "asm:1",
        orderSnapshotId: "ord:asm",
      };
      const detail = expectSameTarget([assemblyOffer], [assembly]);
      expect(detail.nextAction).toBe("OPEN_ORDER");
      expect(detail.nextActionHref).toBe("/jobs/ord%3Aasm");
      expect(detail.nextActionLabel).toBe("Fișa lucrării");
    });

    it("continues an assembly still in configuration", () => {
      const assembly: RequestAssemblyWork = {
        assemblyId: "asm:draft",
        label: "Fațadă",
        stage: "IN_CONFIGURATION",
        stageLabel: "În configurare",
        quoteSnapshotId: null,
        quoteGrossPrice: null,
        currency: null,
        orderSnapshotId: null,
        productionSnapshotId: null,
        executionPlanId: null,
        revisionPending: false,
        membersEditable: true,
        memberProductCodes: [],
        updatedAt: "2026-11-04T11:00:00.000Z",
      };
      const detail = expectSameTarget([], [assembly]);
      expect(detail.nextAction).toBe("OPEN_ASSEMBLY");
      expect(detail.nextActionHref).toBe("/assemblies/asm%3Adraft");
      expect(detail.nextActionLabel).toBe("Continuă ansamblul");
    });
  });

  it("projects selected site installation without folding it into the request", () => {
    const detail = projectRequestDetail({
      request: request({ optionalScopeIds: ["SITE_INSTALLATION"] }),
      customerDisplayName: "HUB MEDIA",
      quotes: [],
    });
    expect(detail.installationOffer.selected).toBe(true);
    expect(detail.installationOffer.persistedSelectionPreserved).toBe(true);
    expect(detail.installationOffer.mode).toBeNull();
    expect(detail.installationScope?.scopeId).toBe("SITE_INSTALLATION");
    expect(detail.installationScope?.eicCompleteness).toBe("PARTIAL");
    expect(detail.installationScope?.commercialCompleteness).toBe("PARTIAL");
    expect(detail.installationFacts).toBeNull();
    expect(detail.canWriteInstallationFacts).toBe(true);
    expect(detail.installationScope?.incompleteReasons.map((reason) => reason.id)).toContain(
      "MISSING_COST_EVIDENCE",
    );
    expect(detail.request).not.toHaveProperty("eic");
    expect(JSON.stringify(detail.installationScope)).not.toMatch(/0(?:[.,]0+)? EUR|"total"/);
    expect(JSON.stringify(detail)).not.toMatch(/productWidth|TRANSPORT|confirmedAreaMm2/);
  });

  it("blocks uploads on cancelled requests while keeping attachment projection", () => {
    const detail = projectRequestDetail({
      request: request({ status: "CANCELLED" }),
      customerDisplayName: "HUB MEDIA",
      quotes: [],
      attachments: [
        {
          attachmentId: "att:1",
          requestId: "crq:11111111-2222-3333-4444-555555555555",
          originalFileName: "brief.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          storageKey: "abc",
          sha256: "deadbeef",
          createdAt: "2026-08-17T12:00:00.000Z",
        },
      ],
    });
    expect(detail.canUploadAttachments).toBe(false);
    expect(detail.attachments).toHaveLength(1);
    expect(detail.attachments[0]?.sizeLabel).toBe("2.0 KB");
  });

  it("keeps Client Hub requestNeedsAction on the same request attention truth", () => {
    const created = createCustomer("Client Alpha", { customerId: "cus:alpha" });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    const fresh = projectRequestOverviewItem({
      request: request({ status: "NEW" }),
      customerDisplayName: "Client Alpha",
      quotes: [],
    });
    const ready = projectRequestOverviewItem({
      request: request({
        requestId: "crq:ready",
        status: "READY_FOR_QUOTE",
      }),
      customerDisplayName: "Client Alpha",
      quotes: [],
    });
    expect(fresh.needsAttention).toBe(false);
    expect(ready.needsAttention).toBe(true);
    const workspace = projectCustomerWorkspace({
      customer: created.customer,
      requests: [fresh, ready],
      quotes: [],
      jobs: [],
    });
    expect(workspace.summary.requestNeedsAction).toBe(1);
  });
});
