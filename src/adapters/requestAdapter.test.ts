import { describe, expect, it } from "vitest";
import { presentRequestDetail, presentRequestList, presentRequestOverview } from "./requestAdapter";

describe("request adapter", () => {
  it("projects createdAt and next-action fields without calling them updatedAt", () => {
    const items = presentRequestList({
      overview: {
        requests: [
          {
            requestId: "req-1",
            title: "Litere",
            reference: "CRQ-104",
            customerId: "cus-1",
            customerDisplayName: "Atelier Nord",
            status: "READY_FOR_QUOTE",
            statusLabel: "Gata de ofertă",
            commercialProgress: "QUOTE_CREATED",
            commercialProgressLabel: "Ofertă creată",
            createdAt: "2026-09-01T10:00:00.000Z",
            nextAction: "OPEN_QUOTE",
            nextActionLabel: "Deschide oferta",
            needsAttention: true,
            attentionLabel: "Urmează oferta",
            linkedQuoteSnapshotId: "q-1",
            linkedQuoteProductCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
          },
        ],
      },
    });
    expect(items[0]).toMatchObject({
      createdAt: "2026-09-01T10:00:00.000Z",
      nextAction: "OPEN_QUOTE",
      linkedQuoteSnapshotId: "q-1",
      attentionLabel: "Urmează oferta",
    });
    expect(items[0]).not.toHaveProperty("updatedAt");
  });

  it("projects request detail attachments and installation without denial copy", () => {
    const detail = presentRequestDetail({
      detail: {
        request: {
          requestId: "req-1",
          title: "Litere",
          reference: "CRQ-104",
          description: "Față plexi",
          customerId: "cus-1",
          status: "IN_REVIEW",
          createdAt: "2026-09-01T10:00:00.000Z",
        },
        customerDisplayName: "Atelier Nord",
        statusLabel: "În lucru",
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        canUploadAttachments: true,
        linkedOffers: [
          {
            quoteSnapshotId: "q-1",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            reference: "OF-1",
          },
        ],
        attachments: [
          {
            attachmentId: "att-1",
            originalFileName: "brief.pdf",
            sizeLabel: "2.0 KB",
            createdAt: "2026-09-01T10:00:00.000Z",
            downloadHref: "/api/requests/req-1/attachments/att-1/download",
          },
        ],
        installationOffer: {
          capabilityId: "SITE_INSTALLATION",
          selected: true,
          label: "Montaj la locație",
          mode: "INTERNAL",
          orgConfigured: true,
          orgOfferMode: "INTERNAL",
          canSelectNew: true,
          canChangeSelection: false,
          canChangeMode: false,
          selectionLocked: true,
          showModeControl: false,
          availableModes: ["INTERNAL"],
          persistedSelectionPreserved: false,
          persistedModeIncompatible: false,
        },
        canWriteInstallationFacts: false,
        canWriteInstallationPrice: false,
      },
    });
    expect(detail?.reference).toBe("CRQ-104");
    expect(detail?.attachments[0]?.downloadHref).toContain("/attachments/att-1/download");
    expect(detail?.installationOffer).toMatchObject({
      selected: true,
      canSelectNew: true,
      canChangeSelection: false,
      canChangeMode: false,
      selectionLocked: true,
      showModeControl: false,
      availableModes: ["INTERNAL"],
      persistedSelectionPreserved: false,
      persistedModeIncompatible: false,
      orgConfigured: true,
      orgOfferMode: "INTERNAL",
    });
    expect(detail?.canWriteInstallationFacts).toBe(false);
    expect(JSON.stringify(detail)).not.toMatch(/Nu adăuga montaj|Montajul nu face parte/);
  });

  it("does not invent OPEN_QUOTE when the envelope omits nextAction", () => {
    const detail = presentRequestDetail({
      detail: {
        request: {
          requestId: "req-2",
          title: "Caseta",
          customerId: "cus-2",
          status: "NEW",
        },
        linkedOffers: [
          {
            quoteSnapshotId: "qts:PRD-ACM-CASSETTE-NONE:abff",
            productCode: "PRD-ACM-CASSETTE-NONE",
            reference: "OF-1",
          },
        ],
      },
    });
    expect(detail?.nextAction).toBe("");
    expect(detail?.nextActionLabel).toBe("");
  });

  it("does not invent CHOOSE_PRODUCT when READY_FOR_QUOTE lacks nextAction", () => {
    const detail = presentRequestDetail({
      detail: {
        request: {
          requestId: "req-3",
          title: "Litere",
          customerId: "cus-3",
          status: "READY_FOR_QUOTE",
        },
        statusLabel: "Gata de ofertă",
        linkedOffers: [],
      },
    });
    expect(detail?.nextAction).toBe("");
    expect(detail?.nextActionLabel).toBe("");
    expect(detail?.nextAction).not.toBe("CHOOSE_PRODUCT");
    expect(detail?.nextAction).not.toBe("OPEN_QUOTE");
  });

  it("projects request assembly work, the server-chosen assembly and the additional-work flag", () => {
    const detail = presentRequestDetail({
      detail: {
        request: { requestId: "req-asm", title: "Panou", customerId: "cus-1", status: "NEW" },
        nextAction: "OPEN_ASSEMBLY",
        linkedAssemblyId: "asm:1",
        canStartAdditionalWork: true,
        assemblies: [
          {
            assemblyId: "asm:1",
            label: "Panou ACM + litere volumetrice",
            stage: "PRODUCTION_RELEASED",
            stageLabel: "Eliberat în producție",
            quoteSnapshotId: "asmq:1",
            quoteGrossPrice: 766.34,
            currency: "EUR",
            orderSnapshotId: "asmo:1",
            productionSnapshotId: "asmp:1",
            executionPlanId: null,
            revisionPending: false,
            membersEditable: false,
          },
          { assemblyId: 7, label: "invalid" },
        ],
      },
    });
    expect(detail?.nextAction).toBe("OPEN_ASSEMBLY");
    expect(detail?.nextActionLabel).toBe("Deschide ansamblul");
    expect(detail?.linkedAssemblyId).toBe("asm:1");
    expect(detail?.canStartAdditionalWork).toBe(true);
    expect(detail?.assemblies).toEqual([
      {
        assemblyId: "asm:1",
        label: "Panou ACM + litere volumetrice",
        stage: "PRODUCTION_RELEASED",
        stageLabel: "Eliberat în producție",
        quoteGrossPrice: 766.34,
        currency: "EUR",
        quoteSnapshotId: "asmq:1",
        orderSnapshotId: "asmo:1",
        hasProduction: true,
        executionPlanId: null,
        revisionPending: false,
        membersEditable: false,
      },
    ]);
  });

  it("keeps facade and fixing other notes on the installation transport", () => {
    const populated = presentRequestDetail({
      detail: {
        request: { requestId: "req-notes", title: "Note", customerId: "cus-1", status: "NEW" },
        installationFacts: {
          version: 2,
          facadeType: "OTHER",
          facadeOtherNote: "Panou compozit existent pe structură metalică",
          fixingMethod: "OTHER",
          fixingOtherNote: "Bride speciale existente",
        },
      },
    });
    expect(populated?.installationFacts?.facadeOtherNote).toBe(
      "Panou compozit existent pe structură metalică",
    );
    expect(populated?.installationFacts?.fixingOtherNote).toBe("Bride speciale existente");

    const empty = presentRequestDetail({
      detail: {
        request: { requestId: "req-empty", title: "Gol", customerId: "cus-1", status: "NEW" },
        installationFacts: {
          version: 1,
          facadeType: "CONCRETE",
          facadeOtherNote: null,
          fixingMethod: "MECHANICAL_ANCHOR",
          fixingOtherNote: null,
        },
      },
    });
    expect(empty?.installationFacts?.facadeOtherNote).toBeNull();
    expect(empty?.installationFacts?.fixingOtherNote).toBeNull();
  });
});

describe("presentRequestOverview", () => {
  it("keeps the server summary beside the requests and never invents one", () => {
    const withSummary = presentRequestOverview({
      overview: {
        summary: { total: 3, needsAttention: 1, newCount: 2, inReview: 0, waitingCustomer: 1, readyForQuote: 0, blocked: 0 },
        requests: [{ requestId: "r1", title: "Litere" }],
      },
    });
    expect(withSummary.summary).toEqual({ total: 3, needsAttention: 1, newCount: 2, inReview: 0, waitingCustomer: 1, readyForQuote: 0, blocked: 0 });
    expect(withSummary.requests).toHaveLength(1);
    const partial = presentRequestOverview({ overview: { summary: { total: 1 }, requests: [] } });
    expect(partial.summary?.newCount).toBeNull();
    expect(presentRequestOverview({ overview: { requests: [] } }).summary).toBeNull();
  });
});
