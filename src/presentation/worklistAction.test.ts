import { describe, expect, it } from "vitest";
import type {
  JobListItemTransport,
  QuoteListItemTransport,
  RequestDetailTransport,
  RequestLinkedOfferTransport,
  RequestListItemTransport,
} from "../api/types";
import {
  presentJobWorklistAction,
  presentQuoteWorklistAction,
  presentRequestPrimaryAction,
  presentRequestWorklistAction,
} from "./worklistAction";

function linkedOffer(
  partial: Partial<RequestLinkedOfferTransport> = {},
): RequestLinkedOfferTransport {
  return {
    quoteSnapshotId: "q-1",
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere volumetrice",
    reference: "OF-1",
    stageLabel: "Creată",
    superseded: false,
    attentionLabel: "Urmează acceptarea",
    orderSnapshotId: null,
    ...partial,
  };
}

function request(
  partial: Partial<RequestListItemTransport> = {},
): RequestListItemTransport {
  return {
    requestId: "req-1",
    title: "Litere",
    reference: "CRQ-104",
    customerId: "cus-1",
    customerDisplayName: "Atelier Nord",
    status: "NEW",
    statusLabel: "Nouă",
    contextLabel: null,
    commercialProgress: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    nextAction: "OPEN_REQUEST",
    nextActionLabel: "Deschide",
    nextActionHref: null,
    needsAttention: false,
    attentionLabel: null,
    linkedQuoteSnapshotId: null,
    linkedQuoteProductCode: null,
    linkedAssemblyId: null,
    ...partial,
  };
}

function quote(partial: Partial<QuoteListItemTransport> = {}): QuoteListItemTransport {
  return {
    quoteSnapshotId: "q-1",
    kind: "PRODUCT",
    kindLabel: "Produs",
    assemblyId: null,
    sectionCount: 1,
    superseded: false,
    grossDisplay: "624,82",
    currency: "EUR",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    reference: "OF-1",
    inscription: "NORD",
    customerDisplayName: "Atelier Nord",
    stage: "QUOTE_CREATED",
    stageLabel: "Creată",
    createdAt: "2026-09-01T10:00:00.000Z",
    nextAction: "ACCEPT_QUOTE",
    nextActionLabel: "Marchează acceptată",
    needsAttention: true,
    attentionLabel: "Urmează acceptarea",
    requestId: "req-1",
    requestReference: "CRQ-104",
    orderSnapshotId: null,
    ...partial,
  };
}

function job(partial: Partial<JobListItemTransport> = {}): JobListItemTransport {
  return {
    jobId: "job-1",
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    memberLabels: [],
    customerId: "cus-1",
    requestId: "req-1",
    priority: "STANDARD",
    priorityLabel: "Standard",
    targetDate: null,
    targetDateLabel: "Fără termen",
    planningEditable: true,
    overdue: false,
    productLabel: "Litere",
    inscription: "NORD",
    customerDisplayName: "Atelier Nord",
    stage: "ORDER_CREATED",
    stageLabel: "Comandă creată",
    nextAction: "RELEASE_TO_PRODUCTION",
    nextActionLabel: "Eliberează pentru producție",
    needsAttention: true,
    attentionLabel: "Urmează eliberarea pentru producție",
    progressLabel: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    releaseSnapshotId: null,
    planId: null,
    orderSnapshotId: "job-1",
    ...partial,
  };
}

describe("presentRequestWorklistAction", () => {
  it("keeps OPEN_REQUEST honest to request detail", () => {
    expect(presentRequestWorklistAction(request())).toEqual({
      actionLabel: "Deschide",
      actionHref: "/cereri/req-1",
    });
  });

  it("preserves customer and request context for CHOOSE_PRODUCT", () => {
    expect(
      presentRequestWorklistAction(
        request({
          nextAction: "CHOOSE_PRODUCT",
          nextActionLabel: "Alege produs",
          status: "READY_FOR_QUOTE",
        }),
      ),
    ).toEqual({
      actionLabel: "Alege produs",
      actionHref: "/cereri/req-1?alege-produs=1#alege-produs",
    });
  });

  it("opens the linked quote for OPEN_QUOTE", () => {
    expect(
      presentRequestWorklistAction(
        request({
          nextAction: "OPEN_QUOTE",
          nextActionLabel: "Deschide oferta",
          linkedQuoteSnapshotId: "q-1",
          linkedQuoteProductCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        }),
      ),
    ).toEqual({
      actionLabel: "Deschide oferta",
      actionHref: "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    });
  });

  it("maps current-main nextActionHref when linked quote fields are absent", () => {
    expect(
      presentRequestWorklistAction(
        request({
          nextAction: "OPEN_QUOTE",
          nextActionLabel: "Deschide oferta",
          nextActionHref:
            "/quotes/qts%3APRD-ACM-CASSETTE-NONE%3Aabffbb338a5a65fc2f9c69d41798d58f4fb73d27e4941df6a05052bddb2ca6d4",
        }),
      ),
    ).toEqual({
      actionLabel: "Deschide oferta",
      actionHref:
        "/quotes/PRD-ACM-CASSETTE-NONE/qts%3APRD-ACM-CASSETTE-NONE%3Aabffbb338a5a65fc2f9c69d41798d58f4fb73d27e4941df6a05052bddb2ca6d4",
    });
  });

  it("opens the request assembly for OPEN_ASSEMBLY instead of offering a product choice", () => {
    expect(
      presentRequestWorklistAction(
        request({
          nextAction: "OPEN_ASSEMBLY",
          nextActionLabel: "Deschide ansamblul",
          linkedAssemblyId: "asm:1",
        }),
      ),
    ).toEqual({ actionLabel: "Deschide ansamblul", actionHref: "/ansamblu?assembly=asm%3A1" });
  });

  it("falls back to request detail when OPEN_ASSEMBLY has no assembly identity", () => {
    expect(
      presentRequestWorklistAction(request({ nextAction: "OPEN_ASSEMBLY", nextActionLabel: "Deschide ansamblul" })),
    ).toEqual({ actionLabel: "Deschide", actionHref: "/cereri/req-1" });
  });
});

describe("presentRequestPrimaryAction", () => {
  const detail: RequestDetailTransport = {
    requestId: "req-1",
    title: "Litere",
    reference: "CRQ-104",
    description: "Față plexi",
    customerId: "cus-1",
    customerDisplayName: "Atelier Nord",
    status: "READY_FOR_QUOTE",
    statusLabel: "Gata de ofertă",
    commercialProgress: null,
    commercialProgressLabel: null,
    createdAt: "2026-09-01T10:00:00.000Z",
    nextAction: "CHOOSE_PRODUCT",
    nextActionLabel: "Alege produs",
    canUploadAttachments: true,
    linkedOffers: [],
    linkedQuoteIds: [],
    linkedQuoteProductCodes: [],
    assemblies: [],
    linkedAssemblyId: null,
    canStartAdditionalWork: false,
    attachments: [],
    installationOffer: {
      capabilityId: "SITE_INSTALLATION",
      selected: false,
      label: "Montaj la locație",
      mode: null,
      orgConfigured: false,
      orgOfferMode: null,
      canSelectNew: false,
      canChangeSelection: false,
      canChangeMode: false,
      selectionLocked: false,
      showModeControl: false,
      availableModes: [],
      persistedSelectionPreserved: false,
      persistedModeIncompatible: false,
    },
    installationScope: null,
    installationFacts: null,
    canWriteInstallationFacts: false,
    canWriteInstallationPrice: false,
  };

  it("does not show catalog when the next action is OPEN_QUOTE", () => {
    expect(
      presentRequestPrimaryAction({
        ...detail,
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        linkedOffers: [linkedOffer()],
      }),
    ).toEqual({
      actionLabel: "Deschide oferta",
      actionHref: "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    });
  });

  it("keeps OPEN_QUOTE on the product offer when assembly offers are listed too", () => {
    expect(
      presentRequestPrimaryAction({
        ...detail,
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        linkedOffers: [
          linkedOffer({ quoteSnapshotId: "asmq:1", kind: "ASSEMBLY", productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1" }),
          linkedOffer(),
        ],
      }),
    ).toEqual({
      actionLabel: "Deschide oferta",
      actionHref: "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    });
  });

  it("never sends an assembly offer to the product quote route", () => {
    expect(
      presentRequestPrimaryAction({
        ...detail,
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        linkedOffers: [
          linkedOffer({ quoteSnapshotId: "asmq:1", kind: "ASSEMBLY", productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1" }),
        ],
      })?.actionHref,
    ).toBe("/oferte/ansamblu/asmq%3A1");
  });

  it("makes the server-chosen assembly the primary action for OPEN_ASSEMBLY", () => {
    expect(
      presentRequestPrimaryAction({
        ...detail,
        nextAction: "OPEN_ASSEMBLY",
        nextActionLabel: "Deschide ansamblul",
        linkedAssemblyId: "asm:quoted",
      }),
    ).toEqual({ actionLabel: "Deschide ansamblul", actionHref: "/ansamblu?assembly=asm%3Aquoted" });
  });

  it("hides a primary action for OPEN_REQUEST", () => {
    expect(
      presentRequestPrimaryAction({
        ...detail,
        nextAction: "OPEN_REQUEST",
        nextActionLabel: "Deschide",
      }),
    ).toBeNull();
  });

  it("does not invent a primary action when nextAction is absent", () => {
    expect(
      presentRequestPrimaryAction({
        ...detail,
        nextAction: "",
        nextActionLabel: "",
        linkedOffers: [linkedOffer()],
      }),
    ).toBeNull();
  });
});

describe("presentQuoteWorklistAction", () => {
  it("opens the assembly for an assembly quote without an order", () => {
    expect(
      presentQuoteWorklistAction(
        quote({
          quoteSnapshotId: "asmq:1",
          kind: "ASSEMBLY",
          kindLabel: "Ansamblu",
          assemblyId: "asm:1",
          nextAction: "OPEN_ASSEMBLY",
          nextActionLabel: "Deschide ansamblul",
        }),
      ),
    ).toEqual({ actionLabel: "Deschide ansamblul", actionHref: "/ansamblu?assembly=asm%3A1" });
  });

  it("does not label ACCEPT_QUOTE as a command that only opens detail", () => {
    expect(presentQuoteWorklistAction(quote())).toEqual({
      actionLabel: "Deschide oferta",
      actionHref: "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    });
  });

  it("routes OPEN_ORDER to the job", () => {
    expect(
      presentQuoteWorklistAction(
        quote({
          stage: "ORDER_CREATED",
          stageLabel: "Cu comandă",
          nextAction: "OPEN_ORDER",
          nextActionLabel: "Deschide comanda",
          orderSnapshotId: "ord-1",
        }),
      ),
    ).toEqual({
      actionLabel: "Deschide comanda",
      actionHref: "/lucrari/ord-1",
    });
  });
});

describe("presentJobWorklistAction", () => {
  it("keeps command stages honest to job detail", () => {
    expect(presentJobWorklistAction(job())).toEqual({
      actionLabel: "Deschide lucrarea",
      actionHref: "/lucrari/job-1",
    });
  });

  it("continues execution on the plan route", () => {
    expect(
      presentJobWorklistAction(
        job({
          stage: "EXECUTION_IN_PROGRESS",
          nextAction: "CONTINUE_EXECUTION",
          nextActionLabel: "Continuă execuția",
          planId: "exp-1",
        }),
      ),
    ).toEqual({
      actionLabel: "Vezi operațiile",
      actionHref: "/lucrari/job-1?sectiune=operatii",
    });
  });
});
