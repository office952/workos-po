import { describe, expect, it } from "vitest";
import type {
  CommercialJourneyItemTransport,
  CommercialJourneyTransport,
  JobListItemTransport,
  QuoteListItemTransport,
} from "../api/types";
import {
  presentJobWorklistAction,
  presentQuoteWorklistAction,
  presentRequestWorklistAction,
} from "./worklistAction";

function journey(partial: Partial<CommercialJourneyTransport> = {}): CommercialJourneyTransport {
  return {
    offerSummary: {
      count: 0,
      awaitingCustomer: 0,
      acceptedWithoutOrder: 0,
      ordered: 0,
      declined: 0,
      notPursued: 0,
      superseded: 0,
      undecided: 0,
      summaryLabel: "Fără ofertă",
    },
    actionable: [],
    waiting: [],
    actionableCount: 0,
    waitingCount: 0,
    orderCount: 0,
    nextAction: "OPEN_REQUEST",
    nextActionLabel: "Deschide cererea",
    nextActionHref: "/requests/req-1",
    needsAttention: false,
    attentionLabel: null,
    phase: "OPEN",
    phaseLabel: "Deschisă",
    phaseAt: null,
    administrativeNote: null,
    ...partial,
  };
}

function journeyItem(partial: Partial<CommercialJourneyItemTransport> = {}): CommercialJourneyItemTransport {
  return {
    kind: "ACCEPTED_WITHOUT_ORDER",
    key: "quote:q-1",
    quoteSnapshotId: "q-1",
    quoteKind: "PRODUCT",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    assemblyId: null,
    title: "OF-1",
    detail: "Acceptată · fără comandă",
    hint: null,
    actionLabel: "Confirmă comanda",
    href: "/quotes/q-1",
    action: "OPEN_QUOTE",
    ...partial,
  };
}

const awaiting = {
  commercialStatus: "AWAITING_CUSTOMER",
  commercialStatusLabel: "Fără decizie",
  obligationKind: "WAITING",
  followUp: true,
  decided: false,
};

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
    ...awaiting,
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

describe("presentRequestWorklistAction · the server journey's next action", () => {
  it("only opens the request when the server sent no journey", () => {
    expect(presentRequestWorklistAction({ requestId: "req-1", journey: null })).toEqual({
      actionLabel: "Deschide cererea",
      actionHref: "/cereri/req-1",
    });
  });

  it("keeps OPEN_REQUEST on the request page", () => {
    expect(presentRequestWorklistAction({ requestId: "req-1", journey: journey() })).toEqual({
      actionLabel: "Deschide cererea",
      actionHref: "/cereri/req-1",
    });
  });

  it("sends CHOOSE_PRODUCT to the product choice of this request", () => {
    expect(
      presentRequestWorklistAction({
        requestId: "req-1",
        journey: journey({ nextAction: "CHOOSE_PRODUCT", nextActionLabel: "Alege produsul" }),
      }),
    ).toEqual({ actionLabel: "Alege produsul", actionHref: "/cereri/req-1?alege-produs=1#alege-produs" });
  });

  it("opens the product offer the server named, with its product route", () => {
    expect(
      presentRequestWorklistAction({
        requestId: "req-1",
        journey: journey({
          nextAction: "OPEN_QUOTE",
          nextActionLabel: "Confirmă comanda",
          nextActionHref: "/quotes/q-1",
          actionable: [journeyItem()],
        }),
      }),
    ).toEqual({ actionLabel: "Confirmă comanda", actionHref: "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1" });
  });

  it("never sends an assembly offer to the product quote route", () => {
    expect(
      presentRequestWorklistAction({
        requestId: "req-1",
        journey: journey({
          nextAction: "OPEN_QUOTE",
          nextActionLabel: "Urmărește oferta",
          nextActionHref: "/quotes/asmq%3A1",
          waiting: [journeyItem({ key: "quote:asmq:1", quoteSnapshotId: "asmq:1", quoteKind: "ASSEMBLY", productCode: "SIGN_ASSEMBLY" })],
        }),
      }),
    ).toEqual({ actionLabel: "Urmărește oferta", actionHref: "/oferte/ansamblu/asmq%3A1" });
  });

  it("stays on the request when the named offer is not among the journey items", () => {
    expect(
      presentRequestWorklistAction({
        requestId: "req-1",
        journey: journey({ nextAction: "OPEN_QUOTE", nextActionLabel: "Deschide oferta", nextActionHref: "/quotes/q-gone" }),
      }),
    ).toEqual({ actionLabel: "Deschide oferta", actionHref: "/cereri/req-1" });
  });

  it("opens the server's assembly and the job of the order", () => {
    expect(
      presentRequestWorklistAction({
        requestId: "req-1",
        journey: journey({ nextAction: "OPEN_ASSEMBLY", nextActionLabel: "Deschide ansamblul", nextActionHref: "/assemblies/asm%3A1" }),
      }),
    ).toEqual({ actionLabel: "Deschide ansamblul", actionHref: "/ansamblu?assembly=asm%3A1" });
    expect(
      presentRequestWorklistAction({
        requestId: "req-1",
        journey: journey({ nextAction: "OPEN_ORDER", nextActionLabel: "Fișa lucrării", nextActionHref: "/jobs/ord-1" }),
      }),
    ).toEqual({ actionLabel: "Fișa lucrării", actionHref: "/lucrari/ord-1" });
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

  it("opens an offer awaiting the customer", () => {
    expect(presentQuoteWorklistAction(quote())).toEqual({
      actionLabel: "Deschide oferta",
      actionHref: "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    });
  });

  it("asks to confirm the order for an accepted offer without one", () => {
    expect(
      presentQuoteWorklistAction(
        quote({ commercialStatus: "ACCEPTED_WITHOUT_ORDER", commercialStatusLabel: "Acceptată · fără comandă", obligationKind: "ACTIONABLE" }),
      ),
    ).toEqual({ actionLabel: "Confirmarea comenzii", actionHref: "/oferte/produs/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1" });
  });

  it("routes an ordered offer to the job sheet and names that destination (D08)", () => {
    expect(
      presentQuoteWorklistAction(
        quote({
          stage: "ORDER_CREATED",
          stageLabel: "Cu comandă",
          nextAction: "OPEN_ORDER",
          nextActionLabel: "Deschide comanda",
          orderSnapshotId: "ord-1",
          commercialStatus: "ORDERED",
          commercialStatusLabel: "Cu comandă",
          obligationKind: "NONE",
          followUp: false,
        }),
      ),
    ).toEqual({ actionLabel: "Fișa lucrării", actionHref: "/lucrari/ord-1" });
  });

  it("only shows the decision of a declined offer", () => {
    expect(
      presentQuoteWorklistAction(
        quote({ commercialStatus: "DECLINED_BY_CUSTOMER", commercialStatusLabel: "Refuzată de client", obligationKind: "NONE", followUp: false, decided: true }),
      ).actionLabel,
    ).toBe("Vezi decizia");
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
