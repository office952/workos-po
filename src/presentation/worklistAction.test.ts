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
  presentRequestNextStep,
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
    inscription: null,
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

describe("presentRequestNextStep (W2 · D04)", () => {
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
    nextActionHref: null,
    linkedQuoteSnapshotId: null,
    linkedQuoteProductCode: null,
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

  const eight = Array.from({ length: 8 }, (_, index) =>
    linkedOffer({ quoteSnapshotId: `q-${index + 1}`, reference: `OF-${index + 1}`, inscription: `SFC-${index + 1}` }),
  );
  const openQuote = (target: string | null, linkedOffers: RequestLinkedOfferTransport[], nextActionHref: string | null = null) => ({
    ...detail,
    nextAction: "OPEN_QUOTE",
    nextActionLabel: "Deschide oferta",
    nextActionHref,
    linkedQuoteSnapshotId: target,
    linkedQuoteProductCode: target ? "PRD-LETTERS-FRONTLIT-PLEXI-AL06" : null,
    linkedOffers,
  });

  it("offers product choice when the request has no quote", () => {
    expect(presentRequestNextStep(detail)).toEqual({
      status: "ready",
      label: "Alege produs",
      href: "/cereri/req-1?alege-produs=1#alege-produs",
      targetQuoteSnapshotId: null,
      targetAssemblyId: null,
    });
  });

  it("opens the only quote when the server names it", () => {
    expect(presentRequestNextStep(openQuote("q-1", [linkedOffer()]))).toMatchObject({
      status: "ready",
      href: "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
      targetQuoteSnapshotId: "q-1",
    });
  });

  it("follows the server target among eight unaccepted quotes instead of the first or newest row", () => {
    expect(presentRequestNextStep(openQuote("q-3", eight))).toMatchObject({ status: "ready", targetQuoteSnapshotId: "q-3" });
  });

  it("follows the server target when two of eight quotes are ordered", () => {
    const mixed = eight.map((offer, index) =>
      index === 1 || index === 4 ? { ...offer, stage: "ORDER_CREATED", stageLabel: "Cu comandă", orderSnapshotId: `ord-${index + 1}` } : offer,
    );
    expect(presentRequestNextStep(openQuote("q-5", mixed))).toMatchObject({
      status: "ready",
      href: "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-5",
      targetQuoteSnapshotId: "q-5",
    });
  });

  it("never sends an assembly offer to the product quote route", () => {
    const assemblyOffer = linkedOffer({ quoteSnapshotId: "asmq:1", kind: "ASSEMBLY", productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1" });
    const step = presentRequestNextStep(openQuote("asmq:1", [assemblyOffer, linkedOffer()]));
    expect(step).toMatchObject({ status: "ready", href: "/oferte/ansamblu/asmq%3A1" });
  });

  it("opens the server-chosen assembly", () => {
    expect(
      presentRequestNextStep({
        ...detail,
        nextAction: "OPEN_ASSEMBLY",
        nextActionLabel: "Deschide ansamblul",
        linkedAssemblyId: "asm:quoted",
        assemblies: [{
          assemblyId: "asm:quoted",
          label: "Panou",
          stage: "QUOTE_CREATED",
          stageLabel: "Ofertă creată",
          quoteGrossPrice: null,
          currency: null,
          quoteSnapshotId: null,
          orderSnapshotId: null,
          hasProduction: false,
          executionPlanId: null,
          revisionPending: false,
          membersEditable: true,
        }],
      }),
    ).toEqual({
      status: "ready",
      label: "Deschide ansamblul",
      href: "/ansamblu?assembly=asm%3Aquoted",
      targetQuoteSnapshotId: null,
      targetAssemblyId: "asm:quoted",
    });
  });

  it("says the target is missing instead of choosing another quote when the server target is stale", () => {
    expect(presentRequestNextStep(openQuote("q-gone", eight, "/quotes/qts%3Agone"))).toEqual({
      status: "target-missing",
      label: "Deschide oferta",
    });
  });

  it("says the assembly target is missing when it is not in this request", () => {
    expect(
      presentRequestNextStep({ ...detail, nextAction: "OPEN_ASSEMBLY", nextActionLabel: "Deschide ansamblul", linkedAssemblyId: "asm:gone" }),
    ).toEqual({ status: "target-missing", label: "Deschide ansamblul" });
  });

  it("falls back to the server href only when no target id was sent", () => {
    expect(
      presentRequestNextStep(openQuote(null, eight, "/quotes/qts%3APRD-ACM-CASSETTE-NONE%3Aabc")),
    ).toMatchObject({ status: "ready", href: "/quotes/PRD-ACM-CASSETTE-NONE/qts%3APRD-ACM-CASSETTE-NONE%3Aabc" });
    expect(presentRequestNextStep(openQuote(null, eight))).toEqual({ status: "target-missing", label: "Deschide oferta" });
  });

  it("shows no next step for OPEN_REQUEST or a missing next action (e.g. without permission)", () => {
    expect(presentRequestNextStep({ ...detail, nextAction: "OPEN_REQUEST", nextActionLabel: "Deschide" })).toEqual({ status: "none" });
    expect(presentRequestNextStep({ ...detail, nextAction: "", nextActionLabel: "", linkedOffers: [linkedOffer()] })).toEqual({ status: "none" });
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

  it("routes OPEN_ORDER to the job sheet and names that destination (D08)", () => {
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
      actionLabel: "Fișa lucrării",
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
