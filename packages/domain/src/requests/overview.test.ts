import { describe, expect, it } from "vitest";
import { createCustomer } from "../customers/identity.js";
import { projectCustomerWorkspace } from "../customers/workspace.js";
import type { QuoteOverviewItem } from "../quotes/overview.js";
import type { CommercialRequest } from "./commercialRequest.js";
import {
  deriveRequestCommercialProgress,
  deriveRequestOverviewAttention,
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
    href:
      stage === "ORDER_CREATED"
        ? "/products/PRD-LETTERS-FRONTLIT-PLEXI-AL06?order=ord:1"
        : "/products/PRD-LETTERS-FRONTLIT-PLEXI-AL06?quote=qts:1",
    needsAttention: stage !== "ORDER_CREATED",
    attentionLabel: null,
    acceptanceId: stage === "QUOTE_CREATED" ? null : "qad:1",
    orderSnapshotId: stage === "ORDER_CREATED" ? "ord:1" : null,
    requestId: null,
    requestReference: null,
  };
}

describe("request overview projection", () => {
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
    expect(item.nextActionLabel).toBe("Deschide oferta");
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
    expect(deriveRequestOverviewAttention({ status: "NEW", hasLinkedQuotes: false })).toEqual({
      needsAttention: false,
      attentionLabel: null,
    });
    expect(deriveRequestOverviewAttention({ status: "IN_REVIEW", hasLinkedQuotes: false })).toEqual({
      needsAttention: false,
      attentionLabel: null,
    });
    expect(
      deriveRequestOverviewAttention({ status: "WAITING_CUSTOMER", hasLinkedQuotes: false }),
    ).toEqual({
      needsAttention: false,
      attentionLabel: null,
    });
    expect(
      deriveRequestOverviewAttention({ status: "READY_FOR_QUOTE", hasLinkedQuotes: false }),
    ).toEqual({
      needsAttention: true,
      attentionLabel: "Urmează oferta",
    });
    expect(
      deriveRequestOverviewAttention({ status: "READY_FOR_QUOTE", hasLinkedQuotes: true }),
    ).toEqual({
      needsAttention: false,
      attentionLabel: null,
    });
    expect(deriveRequestOverviewAttention({ status: "BLOCKED", hasLinkedQuotes: true })).toEqual({
      needsAttention: true,
      attentionLabel: "Blocat",
    });
    expect(deriveRequestOverviewAttention({ status: "CANCELLED", hasLinkedQuotes: false })).toEqual({
      needsAttention: false,
      attentionLabel: null,
    });
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
    expect(detail.request.description).toContain("fațadă");
    expect(detail.request).not.toHaveProperty("eic");
    expect(detail.installationScope).toBeNull();
    expect(detail.installationFacts).toBeNull();
    expect(detail.canWriteInstallationFacts).toBe(false);
    expect(detail.installationOffer.canSelectNew).toBe(false);
    expect(detail.installationOffer.selected).toBe(false);
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
