import { describe, expect, it } from "vitest";
import {
  defaultOpenCommercialLedger,
  planCloseOfferlessRequest,
  planReopenCommercialRequest,
  planResumeCommercialOffer,
  planSaveCommercialDecisions,
  resolveOfferCommercialStatus,
  type CommercialActor,
  type CommercialOfferFacts,
  type RecordedCommercialOperation,
} from "./index.js";
import { administrativeCancellationRefusal, newQuoteWhileClosedRefusal } from "./guards.js";

const owner: CommercialActor = {
  accountId: "usr:owner",
  role: "owner",
  displayName: "Proprietar",
};

const member: CommercialActor = {
  accountId: "usr:member",
  role: "member",
  displayName: "Membru",
};

function offer(
  id: string,
  overrides: Partial<CommercialOfferFacts> = {},
): CommercialOfferFacts {
  return {
    quoteSnapshotId: id,
    kind: "PRODUCT",
    superseded: false,
    accepted: false,
    ordered: false,
    currentDisposition: null,
    currentDispositionEventId: null,
    ...overrides,
  };
}

function ledger(revision = 0, state: "OPEN" | "CLOSED" = "OPEN") {
  return {
    ...defaultOpenCommercialLedger("crq:1", "2026-11-06T10:00:00.000Z"),
    revision,
    state,
  };
}

describe("commercial offer resolution matrix", () => {
  it("treats an unaccepted quote without disposition as unresolved", () => {
    expect(resolveOfferCommercialStatus(offer("q1"))).toMatchObject({
      source: "UNRESOLVED",
      commerciallyResolved: false,
      decisionRequired: true,
    });
  });

  it("resolves NOT_PURSUED and DECLINED_BY_CUSTOMER without inventing acceptance", () => {
    expect(
      resolveOfferCommercialStatus(offer("q1", { currentDisposition: "NOT_PURSUED" })),
    ).toMatchObject({ source: "DISPOSITION", commerciallyResolved: true, resumable: true });
    expect(
      resolveOfferCommercialStatus(offer("q1", { currentDisposition: "DECLINED_BY_CUSTOMER" })),
    ).toMatchObject({ source: "DISPOSITION", commerciallyResolved: true });
  });

  it("treats accepted-without-order as commercially resolved with an order obligation", () => {
    expect(resolveOfferCommercialStatus(offer("q1", { accepted: true }))).toMatchObject({
      source: "ACCEPTED",
      commerciallyResolved: true,
      outstandingOrderObligation: true,
      decisionRequired: false,
    });
  });

  it("treats ordered quotes as resolved without a refusal", () => {
    expect(resolveOfferCommercialStatus(offer("q1", { ordered: true, accepted: true }))).toMatchObject({
      source: "ORDERED",
      commerciallyResolved: true,
      outstandingOrderObligation: false,
    });
  });

  it("resolves superseded assembly quotes by lineage, not as a client refusal", () => {
    expect(resolveOfferCommercialStatus(offer("q-old", { kind: "ASSEMBLY", superseded: true }))).toMatchObject({
      source: "SUPERSEDED_LINEAGE",
      commerciallyResolved: true,
      resumable: false,
      decisionRequired: false,
    });
  });

  it("makes a resumed quote unresolved again when no acceptance or order exists", () => {
    expect(resolveOfferCommercialStatus(offer("q1"))).toMatchObject({ source: "UNRESOLVED" });
  });
});

describe("planSaveCommercialDecisions", () => {
  const six = ["q1", "q2", "q3", "q4", "q5", "q6"].map((id) => offer(id));

  it("saves a homogeneous group while remaining OPEN", () => {
    const planned = planSaveCommercialDecisions({
      requestId: "crq:1",
      ledger: ledger(),
      offers: six,
      groups: [
        { disposition: "NOT_PURSUED", reason: "Nu se mai urmărește acum.", quoteSnapshotIds: ["q1", "q2", "q3"] },
      ],
      close: false,
      closeReason: null,
      expectedRevision: 0,
      operationId: "op-save",
      actor: owner,
      existingOperation: null,
    });
    expect(planned).toMatchObject({ ok: true, idempotent: false, nextState: "OPEN", nextRevision: 1 });
    if (!planned.ok) throw new Error("expected plan");
    expect(planned.events).toHaveLength(3);
    expect(planned.events.every((event) => event.eventKind === "OFFER_DISPOSITION")).toBe(true);
  });

  it("refuses closure while unresolved offers remain", () => {
    const planned = planSaveCommercialDecisions({
      requestId: "crq:1",
      ledger: ledger(),
      offers: six,
      groups: [
        { disposition: "NOT_PURSUED", reason: "Trei oferte.", quoteSnapshotIds: ["q1", "q2", "q3"] },
      ],
      close: true,
      closeReason: "Închidem.",
      expectedRevision: 0,
      operationId: "op-close-early",
      actor: owner,
      existingOperation: null,
    });
    expect(planned).toMatchObject({
      ok: false,
      error: "unresolved_offers",
      blockingQuoteSnapshotIds: ["q4", "q5", "q6"],
    });
  });

  it("closes atomically when every unresolved offer is covered and a separate close reason is present", () => {
    const mixed = [
      offer("ord-1", { ordered: true, accepted: true }),
      offer("ord-2", { ordered: true, accepted: true }),
      offer("acc-1", { accepted: true }),
      ...six,
    ];
    const planned = planSaveCommercialDecisions({
      requestId: "crq:1",
      ledger: ledger(),
      offers: mixed,
      groups: [
        { disposition: "NOT_PURSUED", reason: "Stoc vechi.", quoteSnapshotIds: ["q1", "q2", "q3"] },
        { disposition: "DECLINED_BY_CUSTOMER", reason: "Clientul a ales altă variantă.", quoteSnapshotIds: ["q4", "q5", "q6"] },
      ],
      close: true,
      closeReason: "Urmărirea comercială s-a încheiat.",
      expectedRevision: 0,
      operationId: "op-close",
      actor: owner,
      existingOperation: null,
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) throw new Error("expected plan");
    expect(planned.nextState).toBe("CLOSED");
    expect(planned.events.some((event) => event.eventKind === "REQUEST_CLOSED")).toBe(true);
    expect(planned.events.filter((event) => event.eventKind === "OFFER_DISPOSITION")).toHaveLength(6);
  });

  it("does not allow marking accepted or ordered quotes as declined", () => {
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(),
        offers: [offer("acc", { accepted: true })],
        groups: [{ disposition: "DECLINED_BY_CUSTOMER", reason: "Nu.", quoteSnapshotIds: ["acc"] }],
        close: false,
        closeReason: null,
        expectedRevision: 0,
        operationId: "op-acc",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "accepted_offer_not_declinable" });
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(),
        offers: [offer("ord", { ordered: true })],
        groups: [{ disposition: "NOT_PURSUED", reason: "Nu.", quoteSnapshotIds: ["ord"] }],
        close: false,
        closeReason: null,
        expectedRevision: 0,
        operationId: "op-ord",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "ordered_offer_not_declinable" });
  });

  it("does not close an assembly branch merely because an old version was superseded", () => {
    const planned = planSaveCommercialDecisions({
      requestId: "crq:1",
      ledger: ledger(),
      offers: [
        offer("old", { kind: "ASSEMBLY", superseded: true }),
        offer("current", { kind: "ASSEMBLY" }),
      ],
      groups: [],
      close: true,
      closeReason: "Gata.",
      expectedRevision: 0,
      operationId: "op-sup",
      actor: owner,
      existingOperation: null,
    });
    expect(planned).toMatchObject({
      ok: false,
      error: "unresolved_offers",
      blockingQuoteSnapshotIds: ["current"],
    });
  });

  it("requires a separate close reason and a reason per homogeneous group", () => {
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(),
        offers: [offer("q1")],
        groups: [{ disposition: "NOT_PURSUED", reason: "   ", quoteSnapshotIds: ["q1"] }],
        close: false,
        closeReason: null,
        expectedRevision: 0,
        operationId: "op-empty",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "homogeneous_reason_required" });
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(),
        offers: [],
        groups: [],
        close: true,
        closeReason: "",
        expectedRevision: 0,
        operationId: "op-close-reason",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "close_reason_required" });
  });

  it("refuses non-owners, revision mismatches, and payload conflicts", () => {
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(),
        offers: [],
        groups: [],
        close: true,
        closeReason: "Gata.",
        expectedRevision: 0,
        operationId: "op-member",
        actor: member,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "forbidden" });
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(2),
        offers: [],
        groups: [],
        close: true,
        closeReason: "Gata.",
        expectedRevision: 0,
        operationId: "op-rev",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "commercial_revision_mismatch", currentRevision: 2 });
    const existing: RecordedCommercialOperation = {
      operationId: "op-same",
      requestId: "crq:1",
      payloadFingerprint: "other",
      resultRevision: 1,
    };
    expect(
      planSaveCommercialDecisions({
        requestId: "crq:1",
        ledger: ledger(1, "CLOSED"),
        offers: [],
        groups: [],
        close: true,
        closeReason: "Gata.",
        expectedRevision: 1,
        operationId: "op-same",
        actor: owner,
        existingOperation: existing,
      }),
    ).toMatchObject({ ok: false, error: "commercial_operation_conflict" });
  });

  it("returns idempotent success for the same operation id and payload", () => {
    const args = {
      requestId: "crq:1",
      ledger: ledger(),
      offers: [],
      groups: [] as const,
      close: true,
      closeReason: "Fără oferte.",
      expectedRevision: 0,
      operationId: "op-idemp",
      actor: owner,
      existingOperation: null as RecordedCommercialOperation | null,
    };
    const first = planSaveCommercialDecisions(args);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected first");
    const replay = planSaveCommercialDecisions({
      ...args,
      ledger: { ...ledger(1, "CLOSED"), closeReason: "Fără oferte." },
      expectedRevision: 99,
      existingOperation: {
        operationId: "op-idemp",
        requestId: "crq:1",
        payloadFingerprint: first.payloadFingerprint,
        resultRevision: 1,
      },
    });
    expect(replay).toMatchObject({ ok: true, idempotent: true, nextRevision: 1 });
  });
});

describe("offerless close, reopen and resume", () => {
  it("closes a request with no offers when a reason is present", () => {
    const planned = planCloseOfferlessRequest({
      requestId: "crq:1",
      ledger: ledger(),
      offers: [],
      reason: "Cerere exploratorie, fără ofertă.",
      expectedRevision: 0,
      operationId: "op-empty-close",
      actor: owner,
      existingOperation: null,
    });
    expect(planned).toMatchObject({ ok: true, nextState: "CLOSED" });
  });

  it("reopens with a reason and does not clear prior dispositions", () => {
    const planned = planReopenCommercialRequest({
      requestId: "crq:1",
      ledger: { ...ledger(3, "CLOSED"), closeReason: "Gata." },
      reason: "Clientul a revenit.",
      expectedRevision: 3,
      operationId: "op-reopen",
      actor: owner,
      existingOperation: null,
    });
    expect(planned).toMatchObject({ ok: true, nextState: "OPEN" });
    if (!planned.ok) throw new Error("expected reopen");
    expect(planned.dispositionDeletes).toEqual([]);
    expect(planned.events[0]?.eventKind).toBe("REQUEST_REOPENED");
  });

  it("resumes one eligible offer without erasing history", () => {
    const planned = planResumeCommercialOffer({
      requestId: "crq:1",
      ledger: ledger(4),
      offers: [
        offer("kept", { currentDisposition: "NOT_PURSUED", currentDispositionEventId: "cle:1" }),
        offer("resume", { currentDisposition: "DECLINED_BY_CUSTOMER", currentDispositionEventId: "cle:2" }),
      ],
      quoteSnapshotId: "resume",
      reason: "Reluăm discuția pe această variantă.",
      expectedRevision: 4,
      operationId: "op-resume",
      actor: owner,
      existingOperation: null,
    });
    expect(planned).toMatchObject({ ok: true, nextState: "OPEN" });
    if (!planned.ok) throw new Error("expected resume");
    expect(planned.dispositionDeletes).toEqual(["resume"]);
    expect(planned.events[0]).toMatchObject({
      eventKind: "OFFER_RESUMED",
      quoteSnapshotId: "resume",
      supersedesEventId: "cle:2",
    });
  });

  it("rejects resume while CLOSED or for a superseded assembly quote", () => {
    expect(
      planResumeCommercialOffer({
        requestId: "crq:1",
        ledger: ledger(1, "CLOSED"),
        offers: [offer("q1", { currentDisposition: "NOT_PURSUED", currentDispositionEventId: "cle:1" })],
        quoteSnapshotId: "q1",
        reason: "Reluăm.",
        expectedRevision: 1,
        operationId: "op-closed",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "commercial_request_closed" });
    expect(
      planResumeCommercialOffer({
        requestId: "crq:1",
        ledger: ledger(),
        offers: [
          offer("old", {
            kind: "ASSEMBLY",
            superseded: true,
            currentDisposition: "NOT_PURSUED",
            currentDispositionEventId: "cle:1",
          }),
        ],
        quoteSnapshotId: "old",
        reason: "Reluăm.",
        expectedRevision: 0,
        operationId: "op-old",
        actor: owner,
        existingOperation: null,
      }),
    ).toMatchObject({ ok: false, error: "superseded_offer_not_resumable" });
  });
});

describe("guards around adjacent mutations", () => {
  it("blocks new quotes on a commercially closed request", () => {
    expect(newQuoteWhileClosedRefusal("CLOSED")?.error).toBe("commercial_request_closed");
    expect(newQuoteWhileClosedRefusal("OPEN")).toBeNull();
  });

  it("protects administrative cancellation when orders exist", () => {
    expect(administrativeCancellationRefusal({ nextStatus: "CANCELLED", hasOrders: true })?.error).toBe(
      "order_obligation_blocks_cancellation",
    );
    expect(administrativeCancellationRefusal({ nextStatus: "CANCELLED", hasOrders: false })).toBeNull();
    expect(administrativeCancellationRefusal({ nextStatus: "IN_REVIEW", hasOrders: true })).toBeNull();
  });
});
