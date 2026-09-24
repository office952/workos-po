import { describe, expect, it } from "vitest";
import { presentRequestDetail, presentRequestList } from "./requestAdapter";

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

  it("derives OPEN_QUOTE from linked offers when the envelope omits nextAction", () => {
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
    expect(detail?.nextAction).toBe("OPEN_QUOTE");
    expect(detail?.nextActionLabel).toBe("Deschide oferta");
  });
});
