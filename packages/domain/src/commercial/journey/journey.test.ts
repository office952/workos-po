import { describe, expect, it } from "vitest";
import {
  quoteOverviewCommercialFields,
  type QuoteOverviewItem,
  type QuoteOverviewStage,
} from "../../quotes/overview.js";
import type { RequestAssemblyWork } from "../../requests/assemblyWork.js";
import type { CommercialRequest } from "../../requests/commercialRequest.js";
import { projectRequestDetail, projectRequestOverviewItem } from "../../requests/overview.js";
import { projectCustomerWorkspace } from "../../customers/workspace.js";
import { createCustomer } from "../../customers/identity.js";
import type { CommercialOfferDisposition, CommercialState } from "../closure/types.js";
import { projectOfferCommercialStatus } from "./offerStatus.js";

const REQUEST_ID = "crq:journey";
const REQUEST_HREF = "/requests/crq%3Ajourney";

function request(status: CommercialRequest["status"] = "IN_REVIEW"): CommercialRequest {
  return {
    requestId: REQUEST_ID,
    reference: "CER-JOURNEY",
    customerId: "cus:alpha",
    title: "Fațadă",
    description: "",
    status,
    optionalScopeIds: [],
    siteInstallationMode: null,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  };
}

function offer(input: {
  id: string;
  stage: QuoteOverviewStage;
  minute: number;
  kind?: "PRODUCT" | "ASSEMBLY";
  disposition?: CommercialOfferDisposition | null;
  superseded?: boolean;
  state?: CommercialState;
}): QuoteOverviewItem {
  const kind = input.kind ?? "PRODUCT";
  return {
    quoteSnapshotId: input.id,
    kind,
    kindLabel: kind === "ASSEMBLY" ? "Ansamblu" : "Produs",
    assemblyId: kind === "ASSEMBLY" ? `asm:${input.id}` : null,
    sectionCount: 1,
    superseded: input.superseded ?? false,
    reference: `OF-${input.id.toUpperCase()}`,
    productCode: "PRD-LETTERS",
    productLabel: "Litere",
    inscription: input.id,
    customerId: "cus:alpha",
    customerDisplayName: "Client Alpha",
    createdAt: `2026-11-02T10:${String(input.minute).padStart(2, "0")}:00.000Z`,
    grossDisplay: "100,00",
    currency: "EUR",
    stage: input.stage,
    stageLabel: input.stage,
    nextAction: "OPEN_QUOTE",
    nextActionLabel: "Deschide oferta",
    href: `/quotes/${encodeURIComponent(input.id)}`,
    acceptanceId: input.stage === "QUOTE_CREATED" ? null : `qad:${input.id}`,
    orderSnapshotId: input.stage === "ORDER_CREATED" ? `ord:${input.id}` : null,
    requestId: REQUEST_ID,
    requestReference: "CER-JOURNEY",
    disposition: input.disposition ?? null,
    dispositionLabel: null,
    ...quoteOverviewCommercialFields({
      stage: input.stage,
      superseded: input.superseded ?? false,
      disposition: input.disposition ?? null,
      commercialState: input.state ?? "OPEN",
    }),
  };
}

function assembly(overrides: Partial<RequestAssemblyWork> = {}): RequestAssemblyWork {
  return {
    assemblyId: "asm:draft",
    label: "Panou + litere",
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
    updatedAt: "2026-11-02T09:00:00.000Z",
    ...overrides,
  };
}

const OPEN = { state: "OPEN" as const, revision: 0, closedAt: null, reopenedAt: null };
const CLOSED = {
  state: "CLOSED" as const,
  revision: 2,
  closedAt: "2026-11-03T10:00:00.000Z",
  reopenedAt: null,
};
const REOPENED = {
  state: "OPEN" as const,
  revision: 3,
  closedAt: null,
  reopenedAt: "2026-11-04T10:00:00.000Z",
};

function project(
  quotes: readonly QuoteOverviewItem[],
  options: {
    status?: CommercialRequest["status"];
    assemblies?: readonly RequestAssemblyWork[];
    ledger?: typeof OPEN | typeof CLOSED | typeof REOPENED;
  } = {},
) {
  const source = request(options.status);
  const ledger = options.ledger ?? OPEN;
  const item = projectRequestOverviewItem({
    request: source,
    customerDisplayName: "Client Alpha",
    quotes,
    assemblies: options.assemblies ?? [],
    ledger,
  });
  const detail = projectRequestDetail({
    request: source,
    customerDisplayName: "Client Alpha",
    quotes,
    assemblies: options.assemblies ?? [],
    commercial: {
      state: ledger.state,
      stateLabel: "",
      revision: ledger.revision,
      closedAt: ledger.closedAt,
      closedBy: null,
      closeReason: null,
      reopenedAt: ledger.reopenedAt,
      reopenedBy: null,
      reopenReason: null,
      offers: [],
      availableActions: [],
      blockingReasons: [],
      outstandingAcceptedWithoutOrder: [],
      unresolvedQuoteSnapshotIds: [],
      canClose: false,
      canReopen: false,
      canSaveDecisions: false,
      canCreateQuote: ledger.state === "OPEN",
      timeline: [],
    },
  });
  expect(detail.journey).toEqual(item.journey);
  expect(detail.nextActionHref).toBe(item.nextActionHref);
  return item.journey;
}

describe("offer commercial status", () => {
  it("never presents refused, not pursued or superseded offers as awaiting acceptance", () => {
    const facts = { ordered: false, accepted: false, superseded: false, commercialState: "OPEN" as const };
    expect(projectOfferCommercialStatus({ ...facts, disposition: "DECLINED_BY_CUSTOMER" })).toMatchObject({
      commercialStatus: "DECLINED_BY_CUSTOMER",
      obligationKind: "NONE",
      followUp: false,
      decided: true,
    });
    expect(projectOfferCommercialStatus({ ...facts, disposition: "NOT_PURSUED" })).toMatchObject({
      commercialStatusLabel: "Nu se mai urmărește",
      followUp: false,
      decided: true,
    });
    expect(projectOfferCommercialStatus({ ...facts, superseded: true, disposition: null })).toMatchObject({
      commercialStatus: "SUPERSEDED",
      followUp: false,
      decided: false,
    });
  });

  it("keeps acceptance and order ahead of a later disposition", () => {
    expect(
      projectOfferCommercialStatus({
        ordered: true,
        accepted: true,
        superseded: true,
        disposition: "NOT_PURSUED",
        commercialState: "CLOSED",
      }).commercialStatus,
    ).toBe("ORDERED");
  });
});

describe("request commercial journey", () => {
  it("1 · new request without offers chooses a product and has nothing to resolve", () => {
    const journey = project([], { status: "NEW" });
    expect(journey).toMatchObject({
      nextAction: "CHOOSE_PRODUCT",
      nextActionLabel: "Alege produsul",
      actionableCount: 0,
      waitingCount: 0,
      phase: "NEW",
      phaseLabel: "Nouă",
      needsAttention: false,
    });
    expect(journey.offerSummary.summaryLabel).toBe("Fără ofertă");
  });

  it("2 · one offer waiting for the customer is a navigation link, not attention", () => {
    const journey = project([offer({ id: "a", stage: "QUOTE_CREATED", minute: 1 })]);
    expect(journey).toMatchObject({
      nextAction: "OPEN_QUOTE",
      nextActionHref: "/quotes/a",
      actionableCount: 0,
      waitingCount: 1,
      needsAttention: false,
      attentionLabel: null,
    });
    expect(journey.waiting[0]).toMatchObject({
      title: "Așteaptă răspunsul clientului",
      actionLabel: "Deschide oferta",
    });
  });

  it("3 · an accepted offer without an order is the one actionable target", () => {
    const journey = project([offer({ id: "a", stage: "QUOTE_ACCEPTED", minute: 1 })]);
    expect(journey).toMatchObject({
      nextAction: "OPEN_QUOTE",
      nextActionLabel: "Confirmarea comenzii",
      nextActionHref: "/quotes/a",
      actionableCount: 1,
      needsAttention: true,
      attentionLabel: "Confirmarea comenzii",
    });
    expect(journey.actionable[0]).toMatchObject({
      kind: "CONFIRM_ORDER",
      hint: "Se confirmă în ofertă, numai de proprietar.",
      actionLabel: "Deschide pentru confirmare",
    });
  });

  it("4 · a created order opens the job sheet with nothing actionable", () => {
    const journey = project([offer({ id: "a", stage: "ORDER_CREATED", minute: 1 })]);
    expect(journey).toMatchObject({
      nextAction: "OPEN_ORDER",
      nextActionLabel: "Fișa lucrării",
      nextActionHref: "/jobs/ord%3Aa",
      actionableCount: 0,
      orderCount: 1,
    });
  });

  it("5 · mixed offers target the accepted offer, never the newer ordered one", () => {
    const journey = project([
      offer({ id: "ordered", stage: "ORDER_CREATED", minute: 9 }),
      offer({ id: "accepted", stage: "QUOTE_ACCEPTED", minute: 2 }),
      offer({ id: "waiting", stage: "QUOTE_CREATED", minute: 5 }),
      offer({ id: "refused", stage: "QUOTE_CREATED", minute: 1, disposition: "DECLINED_BY_CUSTOMER" }),
    ]);
    expect(journey.nextActionHref).toBe("/quotes/accepted");
    expect(journey.offerSummary).toMatchObject({
      count: 4,
      ordered: 1,
      acceptedWithoutOrder: 1,
      awaitingCustomer: 1,
      declined: 1,
    });
    expect(journey.offerSummary.summaryLabel).toBe(
      "4 oferte · 1 cu comandă · 1 acceptată fără comandă · 1 așteaptă clientul · 1 refuzată",
    );
    expect(journey.actionable.map((item) => item.quoteSnapshotId)).toEqual(["accepted"]);
    expect(journey.waiting.map((item) => item.quoteSnapshotId)).toEqual(["waiting"]);
  });

  it("6 · a refused offer is decided and not followed up", () => {
    const journey = project([
      offer({ id: "refused", stage: "QUOTE_CREATED", minute: 1, disposition: "DECLINED_BY_CUSTOMER" }),
    ]);
    expect(journey).toMatchObject({ actionableCount: 0, waitingCount: 0, nextAction: "OPEN_REQUEST" });
  });

  it("7 · closing keeps an accepted offer without an order visible, counted once", () => {
    const journey = project(
      [
        offer({ id: "accepted", stage: "QUOTE_ACCEPTED", minute: 1, state: "CLOSED" }),
        offer({ id: "refused", stage: "QUOTE_CREATED", minute: 2, disposition: "NOT_PURSUED", state: "CLOSED" }),
      ],
      { ledger: CLOSED, assemblies: [assembly()] },
    );
    expect(journey).toMatchObject({
      actionableCount: 1,
      nextActionHref: "/quotes/accepted",
      phase: "CLOSED",
      phaseLabel: "Încheiată comercial",
      phaseAt: "2026-11-03T10:00:00.000Z",
    });
  });

  it("7b · an undecided offer left on a closed request stays actionable", () => {
    const journey = project(
      [offer({ id: "legacy", stage: "QUOTE_CREATED", minute: 1, state: "CLOSED" })],
      { ledger: CLOSED },
    );
    expect(journey.actionable[0]).toMatchObject({ kind: "DECIDE_CLOSED_OFFER" });
    expect(journey.waitingCount).toBe(0);
  });

  it("8 · a reopened request keeps prior decisions and shows its reopen date", () => {
    const journey = project(
      [offer({ id: "refused", stage: "QUOTE_CREATED", minute: 1, disposition: "DECLINED_BY_CUSTOMER" })],
      { ledger: REOPENED },
    );
    expect(journey).toMatchObject({
      actionableCount: 0,
      phase: "REOPENED",
      phaseLabel: "Redeschisă",
      phaseAt: "2026-11-04T10:00:00.000Z",
    });
  });

  it("9 · assembly offers: acceptance means ordered and a superseded version is not pending", () => {
    const journey = project([
      offer({ id: "old", stage: "QUOTE_CREATED", minute: 1, kind: "ASSEMBLY", superseded: true }),
      offer({ id: "current", stage: "QUOTE_CREATED", minute: 2, kind: "ASSEMBLY" }),
      offer({ id: "product", stage: "ORDER_CREATED", minute: 3 }),
    ]);
    expect(journey.waiting.map((item) => item.quoteSnapshotId)).toEqual(["current"]);
    expect(journey.offerSummary.superseded).toBe(1);
    expect(journey.nextActionHref).toBe("/quotes/current");
  });

  it("9b · assembly preparation is actionable only while commercial follow-up is open", () => {
    const open = project([], { assemblies: [assembly()] });
    expect(open).toMatchObject({
      nextAction: "OPEN_ASSEMBLY",
      nextActionLabel: "Continuă ansamblul",
      nextActionHref: "/assemblies/asm%3Adraft",
    });
    expect(project([], { assemblies: [assembly()], ledger: CLOSED }).actionableCount).toBe(0);
  });

  it("11 · several orders open the request to list the job sheets", () => {
    const journey = project([
      offer({ id: "a", stage: "ORDER_CREATED", minute: 1 }),
      offer({ id: "b", stage: "ORDER_CREATED", minute: 2, kind: "ASSEMBLY" }),
    ]);
    expect(journey).toMatchObject({
      nextAction: "OPEN_REQUEST",
      nextActionLabel: "Fișele lucrărilor",
      nextActionHref: REQUEST_HREF,
      orderCount: 2,
    });
  });

  it("12 · ties break by creation time, then id, identically for row and detail", () => {
    const journey = project([
      offer({ id: "b", stage: "QUOTE_ACCEPTED", minute: 1 }),
      offer({ id: "a", stage: "QUOTE_ACCEPTED", minute: 1 }),
      offer({ id: "c", stage: "QUOTE_ACCEPTED", minute: 0 }),
    ]);
    expect(journey.actionable.map((item) => item.quoteSnapshotId)).toEqual(["c", "a", "b"]);
    expect(journey).toMatchObject({ nextAction: "OPEN_REQUEST", nextActionLabel: "3 de rezolvat" });
  });

  it("blocked and ready-for-offer requests are request-level obligations", () => {
    expect(project([offer({ id: "a", stage: "QUOTE_CREATED", minute: 1 })], { status: "BLOCKED" })).toMatchObject({
      actionableCount: 1,
      waitingCount: 1,
      attentionLabel: "Cerere blocată",
      administrativeNote: "Blocat",
    });
    expect(project([], { status: "READY_FOR_QUOTE" })).toMatchObject({
      nextAction: "CHOOSE_PRODUCT",
      attentionLabel: "Urmează oferta",
    });
  });

  it("13 · Cereri, the dossier and Oferte count each obligation exactly once", () => {
    const quotes = [
      offer({ id: "accepted", stage: "QUOTE_ACCEPTED", minute: 1, state: "CLOSED" }),
      offer({ id: "ordered", stage: "ORDER_CREATED", minute: 2, state: "CLOSED" }),
    ];
    const row = projectRequestOverviewItem({
      request: request(),
      customerDisplayName: "Client Alpha",
      quotes,
      ledger: CLOSED,
    });
    const created = createCustomer("Client Alpha", { customerId: "cus:alpha" });
    if (!created.ok) {
      throw new Error("customer");
    }
    const workspace = projectCustomerWorkspace({
      customer: created.customer,
      requests: [row],
      quotes,
      jobs: [],
    });
    expect(row.journey.actionableCount).toBe(1);
    expect(quotes.filter((quote) => quote.needsAttention)).toHaveLength(1);
    expect(workspace.summary.commercialActionableCount).toBe(1);
    expect(workspace.summary.requestNeedsAction + workspace.summary.quoteNeedsAction).toBe(1);
  });
});
