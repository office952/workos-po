import { describe, expect, it } from "vitest";
import type { JobListItemTransport, RequestAssemblyWorkTransport, RequestLinkedOfferTransport } from "../api/types";
import type { ConfiguratorSession } from "../session/configuratorSession";
import {
  branchFilterParam,
  branchForQuote,
  filterBranches,
  parseBranchFilter,
  presentCommercialBranches,
} from "./requestCommercialBranches";

function offer(partial: Partial<RequestLinkedOfferTransport> & Pick<RequestLinkedOfferTransport, "quoteSnapshotId" | "productCode">): RequestLinkedOfferTransport {
  return {
    kind: "PRODUCT",
    kindLabel: "Produs",
    productLabel: "Litere",
    inscription: null,
    reference: partial.quoteSnapshotId,
    stageLabel: "Creată",
    superseded: false,
    attentionLabel: null,
    orderSnapshotId: null,
    commercialStatus: "AWAITING_CUSTOMER",
    commercialStatusLabel: "Fără decizie",
    obligationKind: "WAITING",
    followUp: true,
    decided: false,
    ...partial,
  };
}

const orderedStatus = {
  commercialStatus: "ORDERED",
  commercialStatusLabel: "Cu comandă",
  obligationKind: "NONE",
  followUp: false,
  decided: false,
};

const acceptedStatus = {
  commercialStatus: "ACCEPTED_WITHOUT_ORDER",
  commercialStatusLabel: "Acceptată · fără comandă",
  obligationKind: "ACTIONABLE",
  followUp: true,
  decided: false,
};

function assembly(partial: Partial<RequestAssemblyWorkTransport> & Pick<RequestAssemblyWorkTransport, "assemblyId">): RequestAssemblyWorkTransport {
  return {
    label: "Panou ACM + litere",
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
    ...partial,
  };
}

function job(partial: Partial<JobListItemTransport> & Pick<JobListItemTransport, "jobId" | "orderSnapshotId" | "stage" | "stageLabel">): JobListItemTransport {
  return {
    kind: "PRODUCT",
    kindLabel: "Produs",
    productCode: "P",
    productLabel: "Litere",
    inscription: "",
    memberLabels: [],
    customerId: null,
    customerDisplayName: null,
    requestId: "req-1",
    nextAction: "OPEN_EXECUTION",
    nextActionLabel: "Vezi operațiile",
    priority: "NORMAL",
    priorityLabel: "Normală",
    targetDate: null,
    targetDateLabel: "—",
    planningEditable: false,
    overdue: false,
    needsAttention: false,
    attentionLabel: null,
    progressLabel: null,
    createdAt: null,
    releaseSnapshotId: null,
    planId: null,
    ...partial,
  };
}

const ready = { jobsStatus: "ready" as const };

describe("request commercial branches", () => {
  it("keeps two offers with the same product code as two objects", () => {
    const model = presentCommercialBranches({
      offers: [
        offer({ quoteSnapshotId: "q-a", productCode: "SAME", reference: "OF-A", createdAt: "2026-10-02T00:00:00.000Z" }),
        offer({ quoteSnapshotId: "q-b", productCode: "SAME", reference: "OF-B", createdAt: "2026-10-01T00:00:00.000Z" }),
      ],
      assemblies: [],
      jobs: [],
      ...ready,
    });
    expect(model.branches.map((branch) => branch.key)).toEqual(["quote:q-b", "quote:q-a"]);
    expect(new Set(model.branches.map((branch) => branch.quotes[0]?.quoteSnapshotId)).size).toBe(2);
  });

  it("keeps eight product quotes on one request as eight branches", () => {
    const offers = Array.from({ length: 8 }, (_, index) =>
      offer({
        quoteSnapshotId: `qts:branch-${index + 1}`,
        productCode: index < 4 ? "PRD-LETTERS-FRONTLIT-PLEXI-AL06" : "PRD-ACM-CASSETTE-NONE",
        reference: `OF-${index + 1}`,
        createdAt: `2026-10-0${index + 1}T00:00:00.000Z`,
      }),
    );
    const model = presentCommercialBranches({ offers, assemblies: [], jobs: [], ...ready });
    expect(model.branches).toHaveLength(8);
    expect(model.branches.map((branch) => branch.key).sort()).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((index) => `quote:qts:branch-${index}`).sort(),
    );
    const letters = model.branches.filter((branch) =>
      ["qts:branch-1", "qts:branch-2", "qts:branch-3", "qts:branch-4"].includes(
        branch.quotes[0]?.quoteSnapshotId ?? "",
      ),
    );
    expect(letters).toHaveLength(4);
    expect(new Set(letters.map((branch) => branch.quotes[0]?.quoteSnapshotId)).size).toBe(4);
  });

  it("keeps an older accepted assembly offer as the owner of the job", () => {
    const model = presentCommercialBranches({
      offers: [
        offer({
          quoteSnapshotId: "old",
          kind: "ASSEMBLY",
          kindLabel: "Ansamblu",
          assemblyId: "asm-1",
          productCode: "ASM",
          reference: "OF-VECHE",
          stage: "ORDER_CREATED",
          stageLabel: "Cu comandă",
          superseded: true,
          orderSnapshotId: "order-old",
          createdAt: "2026-09-01T00:00:00.000Z",
        }),
        offer({
          quoteSnapshotId: "new",
          kind: "ASSEMBLY",
          kindLabel: "Ansamblu",
          assemblyId: "asm-1",
          productCode: "ASM",
          reference: "OF-NOUA",
          stage: "QUOTE_CREATED",
          stageLabel: "Creată",
          superseded: false,
          needsAttention: true,
          orderSnapshotId: null,
          createdAt: "2026-10-01T00:00:00.000Z",
        }),
      ],
      assemblies: [assembly({ assemblyId: "asm-1", quoteSnapshotId: "new", orderSnapshotId: "order-old", stage: "ORDER_CREATED", stageLabel: "Comandă creată" })],
      jobs: [job({ jobId: "job-old", orderSnapshotId: "order-old", stage: "EXECUTION_IN_PROGRESS", stageLabel: "În lucru", progressLabel: "3/17", releaseSnapshotId: "rel-1", planId: "plan-1" })],
      ...ready,
    });
    expect(model.branches).toHaveLength(1);
    const branch = model.branches[0]!;
    expect(branch.key).toBe("assembly:asm-1");
    expect(branch.quotes.find((quote) => quote.quoteSnapshotId === "old")?.holdsJob).toBe(true);
    expect(branch.quotes.find((quote) => quote.quoteSnapshotId === "new")?.holdsJob).toBe(false);
    expect(branch.quotes.find((quote) => quote.quoteSnapshotId === "new")?.orderSnapshotId).toBeNull();
    expect(branch.stages.work.href).toBe("/lucrari/order-old");
    expect(branch.primaryAction?.label).toBe("Deschide oferta OF-NOUA");
    expect(branch.primaryAction?.href).toBe("/oferte/ansamblu/new");
    expect(branch.note).toContain("nu pe oferta curentă");
  });

  it("does not attach a job by product name or list position", () => {
    const model = presentCommercialBranches({
      offers: [
        offer({ quoteSnapshotId: "q-1", productCode: "P", productLabel: "Aceleași litere", orderSnapshotId: "order-1" }),
        offer({ quoteSnapshotId: "q-2", productCode: "P", productLabel: "Aceleași litere", orderSnapshotId: null }),
      ],
      assemblies: [],
      jobs: [job({ jobId: "job-2", orderSnapshotId: "order-2", stage: "ORDER_CREATED", stageLabel: "Comandă creată", productLabel: "Aceleași litere" })],
      ...ready,
    });
    expect(model.branches.every((branch) => branch.stages.work.href === null || branch.stages.work.detail === "Lucrarea acestei comenzi nu este în lista citită.")).toBe(true);
    expect(model.branches[0]?.quotes[0]?.holdsJob).toBe(false);
  });

  it("shows an order without a release as not yet in production", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", orderSnapshotId: "order-1", stageLabel: "Cu comandă" })],
      assemblies: [],
      jobs: [job({ jobId: "job-1", orderSnapshotId: "order-1", stage: "ORDER_CREATED", stageLabel: "Comandă creată" })],
      ...ready,
    });
    expect(model.branches[0]?.stages.production.detail).toBe("după trimiterea în producție");
    expect(model.branches[0]?.note).toContain("Producția nu a pornit");
  });

  it("shows a release without a plan from the server stage", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", orderSnapshotId: "order-1" })],
      assemblies: [],
      jobs: [job({ jobId: "job-1", orderSnapshotId: "order-1", stage: "RELEASED", stageLabel: "Eliberată pentru producție", releaseSnapshotId: "rel-1" })],
      ...ready,
    });
    expect(model.branches[0]?.stages.production.detail).toBe("fără plan de execuție");
    expect(model.branches[0]?.note).toContain("nu are încă un plan");
  });

  it("shows partial plan progress from the server label", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", orderSnapshotId: "order-1" })],
      assemblies: [],
      jobs: [job({
        jobId: "job-1",
        orderSnapshotId: "order-1",
        stage: "EXECUTION_IN_PROGRESS",
        stageLabel: "În lucru",
        progressLabel: "5/12",
        releaseSnapshotId: "rel-1",
        planId: "plan-1",
        completedCount: 5,
        taskCount: 12,
      })],
      ...ready,
    });
    expect(model.branches[0]?.stages.production.label).toBe("5/12");
    expect(model.branches[0]?.stages.production.href).toContain("plan-1");
  });

  it("does not treat finished production as delivery or installation confirmation", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", orderSnapshotId: "order-1" })],
      assemblies: [],
      jobs: [job({
        jobId: "job-1",
        orderSnapshotId: "order-1",
        stage: "EXECUTION_COMPLETED",
        stageLabel: "Finalizată",
        progressLabel: "7/7",
        releaseSnapshotId: "rel-1",
        planId: "plan-1",
      })],
      ...ready,
    });
    expect(model.branches[0]?.stages.production.label).toBe("7/7");
    expect(model.branches[0]?.note).toContain("nu confirmă livrarea sau montajul");
  });

  it("shows an unquoted local draft apart from persistent branches and without a server id", () => {
    const session = {
      drafts: { width: "100" },
      draftContext: { productCode: "P-LOCAL", requestId: "req-1", customerId: "cus-1" },
      draftRecovery: {},
      customerId: "cus-1",
      requestId: "req-1",
      productCode: "P-LOCAL",
      lastQuote: null,
    } as ConfiguratorSession;
    const model = presentCommercialBranches({
      offers: [],
      assemblies: [],
      jobs: [],
      session,
      requestId: "req-1",
      customerId: "cus-1",
      ...ready,
    });
    expect(model.branches).toHaveLength(0);
    expect(model.local).toHaveLength(1);
    expect(model.local[0]?.persisted).toBe(false);
    expect(model.local[0]?.title).toBe("Configurare locală");
    expect(JSON.stringify(model.local)).not.toContain("serverId");
    expect(model.local[0]?.href).toContain("product=P-LOCAL");
  });

  it("keeps a local draft beside a frozen offer of the same product", () => {
    const session = {
      drafts: { width: "100" },
      draftContext: { productCode: "P-LOCAL", requestId: "req-1", customerId: "cus-1" },
      draftRecovery: {},
      customerId: "cus-1",
      requestId: "req-1",
      productCode: "P-LOCAL",
      lastQuote: null,
    } as ConfiguratorSession;
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-frozen", productCode: "P-LOCAL", reference: "OF-9" })],
      assemblies: [],
      jobs: [],
      session,
      requestId: "req-1",
      customerId: "cus-1",
      ...ready,
    });
    expect(model.branches).toHaveLength(1);
    expect(model.local).toHaveLength(1);
    expect(model.local[0]?.persisted).toBe(false);
    expect(model.local[0]?.sessionKey).toContain("P-LOCAL");
    expect(model.local[0]?.sessionKey).toContain("req-1");
    expect(model.local[0]?.detail).toContain("OF-9");
    expect(model.local[0]?.detail).toContain("separată");
  });

  it("restores the same branch after a refresh key and keeps filter order", () => {
    const offers = Array.from({ length: 8 }, (_, index) => offer({
      quoteSnapshotId: `q-${index + 1}`,
      productCode: index % 2 === 0 ? "SAME" : `P-${index}`,
      productLabel: index === 3 ? "Semnalistică interioară pentru recepția clădirii administrative cu nume foarte lung" : `Produs ${index + 1}`,
      createdAt: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      ...(index === 2 || index === 6 ? acceptedStatus : {}),
    }));
    const model = presentCommercialBranches({ offers, assemblies: [], jobs: [], ...ready });
    expect(model.branches).toHaveLength(8);
    expect(model.branches.map((branch) => branch.indexLabel)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
    expect(branchForQuote(model.branches, "q-7")?.key).toBe("quote:q-7");
    expect(branchForQuote(model.branches, "missing")).toBeNull();
    const filtered = filterBranches(model.branches, "action");
    expect(filtered.map((branch) => branch.indexLabel)).toEqual(["03", "07"]);
    expect(filtered.map((branch) => branch.key)).toEqual(["quote:q-3", "quote:q-7"]);
  });

  it("round-trips the filter through the address", () => {
    expect(parseBranchFilter(null)).toBe("all");
    expect(parseBranchFilter("actiune")).toBe("action");
    expect(parseBranchFilter("atentie")).toBe("action");
    expect(parseBranchFilter("comanda")).toBe("ordered");
    expect(parseBranchFilter("altceva")).toBe("all");
    expect(branchFilterParam("all")).toBeNull();
    expect(parseBranchFilter(branchFilterParam("action"))).toBe("action");
    expect(parseBranchFilter(branchFilterParam("ordered"))).toBe("ordered");
  });

  it("names each branch by its server inscription and keeps the product under it (D03)", () => {
    const offers = ["SFC-L01", "SFC-L02", "SFC-A01"].map((inscription, index) =>
      offer({
        quoteSnapshotId: `q-${index + 1}`,
        productCode: index < 2 ? "LETTERS" : "ACM",
        productLabel: index < 2 ? "Litere volumetrice" : "Casetă ACM",
        inscription,
        reference: `OF-${index + 1}`,
        createdAt: `2026-10-0${index + 1}T00:00:00.000Z`,
      }),
    );
    const model = presentCommercialBranches({ offers, assemblies: [], jobs: [], ...ready });
    expect(model.branches.map((branch) => branch.title)).toEqual(["SFC-L01", "SFC-L02", "SFC-A01"]);
    expect(model.branches.map((branch) => branch.subtitle)).toEqual(["Litere volumetrice", "Litere volumetrice", "Casetă ACM"]);
    expect(model.branches.map((branch) => branch.offerReference)).toEqual(["OF-1", "OF-2", "OF-3"]);
  });

  it("falls back to the product honestly when the server has no inscription", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", productLabel: "Litere volumetrice", inscription: null, reference: "OF-1" })],
      assemblies: [],
      jobs: [],
      ...ready,
    });
    expect(model.branches[0]?.title).toBe("Litere volumetrice");
    expect(model.branches[0]?.subtitle).toBeNull();
  });

  it("keeps each offer's own commercial state; one ordered branch does not complete the others (D07)", () => {
    const model = presentCommercialBranches({
      offers: [
        offer({ quoteSnapshotId: "q-1", productCode: "P", stage: "ORDER_CREATED", stageLabel: "Cu comandă", orderSnapshotId: "order-1", createdAt: "2026-10-01T00:00:00.000Z", ...orderedStatus }),
        offer({ quoteSnapshotId: "q-2", productCode: "P", stage: "QUOTE_ACCEPTED", stageLabel: "Acceptată", createdAt: "2026-10-02T00:00:00.000Z", ...acceptedStatus }),
        offer({ quoteSnapshotId: "q-3", productCode: "P", stage: "QUOTE_CREATED", stageLabel: "Creată", createdAt: "2026-10-03T00:00:00.000Z" }),
      ],
      assemblies: [],
      jobs: [job({ jobId: "job-1", orderSnapshotId: "order-1", stage: "ORDER_CREATED", stageLabel: "Netrimisă în producție" })],
      ...ready,
    });
    expect(model.branches.map((branch) => branch.state)).toEqual(["ordered", "accepted", "awaiting"]);
    expect(model.branches.map((branch) => branch.stateLabel)).toEqual(["Cu comandă", "Acceptată · fără comandă", "Fără decizie"]);
    expect(model.branches.map((branch) => branch.obligation)).toEqual(["NONE", "ACTIONABLE", "WAITING"]);
    expect(model.branches.map((branch) => branch.needsAction)).toEqual([false, true, false]);
    expect(model.branches.map((branch) => branch.step?.label)).toEqual(["Fișa lucrării", "Confirmarea comenzii", "Deschide oferta"]);
    expect(model.branches[0]?.step?.href).toBe("/lucrari/order-1");
    expect(model.branches[1]?.chain[1]?.detail).toBe("Urmează confirmarea comenzii");
    expect(filterBranches(model.branches, "ordered").map((branch) => branch.key)).toEqual(["quote:q-1"]);
  });

  it("mutes decided and superseded offers and never reads them as an action", () => {
    const model = presentCommercialBranches({
      offers: [
        offer({ quoteSnapshotId: "q-1", productCode: "P", commercialStatus: "DECLINED_BY_CUSTOMER", commercialStatusLabel: "Refuzată de client", obligationKind: "NONE", followUp: false, decided: true }),
        offer({ quoteSnapshotId: "q-2", productCode: "P", commercialStatus: "SUPERSEDED", commercialStatusLabel: "Înlocuită de o versiune mai nouă", obligationKind: "NONE", followUp: false }),
      ],
      assemblies: [],
      jobs: [],
      ...ready,
    });
    expect(model.branches.map((branch) => [branch.state, branch.step?.label, branch.step?.tone, branch.needsAction])).toEqual([
      ["decided", "Vezi decizia", "muted", false],
      ["superseded", "Vezi versiunea", "muted", false],
    ]);
  });

  it("fails closed to an unclear state when the server sent no commercial status", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", stage: "QUOTE_ACCEPTED", commercialStatus: null, commercialStatusLabel: null, obligationKind: null })],
      assemblies: [],
      jobs: [],
      ...ready,
    });
    expect(model.branches[0]?.state).toBe("unclear");
    expect(model.branches[0]?.needsAction).toBe(false);
  });

  it("lets the request journey alone say which branch acts or waits", () => {
    const item = { kind: "ACCEPTED_WITHOUT_ORDER", key: "quote:q-2", quoteSnapshotId: "q-2", quoteKind: "PRODUCT", productCode: "P", assemblyId: null, title: "OF-2", detail: "", hint: null, actionLabel: "Confirmă comanda", href: "/quotes/q-2", action: "OPEN_QUOTE" } as const;
    const model = presentCommercialBranches({
      offers: [
        offer({ quoteSnapshotId: "q-1", productCode: "P", createdAt: "2026-10-01T00:00:00.000Z" }),
        offer({ quoteSnapshotId: "q-2", productCode: "P", createdAt: "2026-10-02T00:00:00.000Z" }),
      ],
      assemblies: [],
      jobs: [],
      journey: {
        offerSummary: { count: 2, awaitingCustomer: 1, acceptedWithoutOrder: 1, ordered: 0, declined: 0, notPursued: 0, superseded: 0, undecided: 0, summaryLabel: "2 oferte" },
        actionable: [item],
        waiting: [],
        actionableCount: 1,
        waitingCount: 0,
        orderCount: 0,
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Confirmă comanda",
        nextActionHref: "/quotes/q-2",
        needsAttention: true,
        attentionLabel: null,
        phase: "OPEN",
        phaseLabel: "Deschisă",
        phaseAt: null,
        administrativeNote: null,
      },
      ...ready,
    });
    expect(model.branches.map((branch) => branch.obligation)).toEqual(["NONE", "ACTIONABLE"]);
    expect(filterBranches(model.branches, "action").map((branch) => branch.key)).toEqual(["quote:q-2"]);
  });

  it("names the job destination truthfully (D08)", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", stage: "ORDER_CREATED", orderSnapshotId: "order-1", ...orderedStatus })],
      assemblies: [],
      jobs: [job({ jobId: "job-1", orderSnapshotId: "order-1", stage: "ORDER_CREATED", stageLabel: "Netrimisă în producție" })],
      ...ready,
    });
    const branch = model.branches[0]!;
    expect(branch.primaryAction?.label).toBe("Deschide fișa lucrării");
    expect(branch.primaryAction?.href).toBe("/lucrari/order-1");
    expect(branch.jobCell).toEqual({ label: "Fișa lucrării", href: "/lucrari/order-1", tone: expect.any(String) });
    expect(branch.chain.map((step) => step.name)).toEqual(["Ofertă acceptată", "Comandă", "Fișa lucrării"]);
    expect(branch.chain[2]?.value).toBe("Netrimisă în producție");
    expect(JSON.stringify(branch)).not.toContain("Deschide comanda");
  });

  it("keeps the job link usable but says plainly when the job list could not be read", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", stage: "ORDER_CREATED", orderSnapshotId: "order-1" })],
      assemblies: [],
      jobs: [],
      jobsStatus: "error",
    });
    expect(model.branches[0]?.jobCell.label).toBe("Necitită");
    expect(model.branches[0]?.chain[2]?.value).toBe("Fișa lucrării nu a putut fi citită");
    expect(model.branches[0]?.primaryAction?.href).toBe("/lucrari/order-1");
  });

  it("recovers a local draft stored for the same request without turning it into a branch", () => {
    const session = {
      drafts: {},
      draftContext: { productCode: null, requestId: null, customerId: null },
      draftRecovery: {
        "P-LOCAL\u001freq-1\u001fcus-1": {
          context: { productCode: "P-LOCAL", requestId: "req-1", customerId: "cus-1" },
          drafts: { height: "20" },
        },
      },
      customerId: null,
      requestId: null,
      productCode: null,
      lastQuote: null,
    } as ConfiguratorSession;
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "OTHER" })],
      assemblies: [],
      jobs: [],
      session,
      requestId: "req-1",
      ...ready,
    });
    expect(model.branches).toHaveLength(1);
    expect(model.local).toHaveLength(1);
  });

  it("does not invent an assembly link when the quote does not name one", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "orphan", kind: "ASSEMBLY", kindLabel: "Ansamblu", productCode: "ASM", productLabel: "Panou ACM + litere", assemblyId: null })],
      assemblies: [assembly({ assemblyId: "asm-1", label: "Panou ACM + litere" })],
      jobs: [],
      ...ready,
    });
    expect(model.branches.map((branch) => branch.kind).sort()).toEqual(["assembly", "unlinked"]);
    expect(model.branches.find((branch) => branch.kind === "unlinked")?.note).toContain("nu poate fi demonstrată");
  });

  it("reports an ambiguous job instead of choosing one", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", orderSnapshotId: "order-1" })],
      assemblies: [],
      jobs: [
        job({ jobId: "a", orderSnapshotId: "order-1", stage: "ORDER_CREATED", stageLabel: "Comandă creată" }),
        job({ jobId: "b", orderSnapshotId: "order-1", stage: "ORDER_CREATED", stageLabel: "Comandă creată" }),
      ],
      ...ready,
    });
    expect(model.branches[0]?.stages.work.detail).toContain("nu poate fi demonstrată");
  });

  it("does not claim the job was read when the job list failed", () => {
    const model = presentCommercialBranches({
      offers: [offer({ quoteSnapshotId: "q-1", productCode: "P", orderSnapshotId: "order-1" })],
      assemblies: [],
      jobs: [],
      jobsStatus: "error",
    });
    expect(model.branches[0]?.stages.work.detail).toBe("Starea lucrării nu a putut fi citită.");
  });
});
