import { describe, expect, it } from "vitest";
import { ROLE_CAPABILITIES, capabilityExclusiveRole, type OrganizationRole } from "../governance/organizationRoles.js";
import { projectJobOverview, type JobOverviewItem } from "../jobs/overview.js";
import {
  projectQuoteOverview,
  quoteOverviewCommercialFields,
  type QuoteOverviewItem,
} from "../quotes/overview.js";
import type { RequestAssemblyWork } from "../requests/assemblyWork.js";
import type { CommercialRequest } from "../requests/commercialRequest.js";
import { projectRequestOverview, projectRequestOverviewItem } from "../requests/overview.js";
import {
  projectStartOverview,
  startIssuePhrase,
  type StartOverviewInput,
  type StartPriceApprovalInput,
} from "./overview.js";

const READ_AT = "2026-11-17T06:42:00.000Z";

function request(overrides: Partial<CommercialRequest> = {}): CommercialRequest {
  return {
    requestId: "crq:1",
    reference: "CER-00000001",
    customerId: "cus:1",
    title: "Reclamă fațadă",
    description: "",
    status: "NEW",
    optionalScopeIds: [],
    siteInstallationMode: null,
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-10T10:00:00.000Z",
    ...overrides,
  };
}

function quote(
  id: string,
  stage: QuoteOverviewItem["stage"],
  overrides: Partial<QuoteOverviewItem> = {},
  commercial: { commercialState?: "OPEN" | "CLOSED" | null } = {},
): QuoteOverviewItem {
  return {
    quoteSnapshotId: `qts:PRD:${id}`,
    kind: "PRODUCT",
    kindLabel: "Produs",
    assemblyId: null,
    sectionCount: 1,
    superseded: false,
    reference: `OF-${id.toUpperCase()}`,
    productCode: "PRD",
    productLabel: "Litere volumetrice",
    inscription: "NORD",
    customerId: "cus:1",
    customerDisplayName: "Nord Market SRL",
    createdAt: "2026-11-12T10:00:00.000Z",
    grossDisplay: "4.820,00",
    currency: "EUR",
    stage,
    stageLabel: "—",
    nextAction: "OPEN_QUOTE",
    nextActionLabel: "Deschide oferta",
    href: `/quotes/${id}`,
    ...quoteOverviewCommercialFields({
      stage,
      superseded: false,
      disposition: null,
      commercialState: commercial.commercialState ?? null,
    }),
    acceptanceId: stage === "QUOTE_CREATED" ? null : "qad:1",
    orderSnapshotId: stage === "ORDER_CREATED" ? `ord:${id}` : null,
    requestId: null,
    requestReference: null,
    disposition: null,
    dispositionLabel: null,
    ...overrides,
  };
}

function job(id: string, overrides: Partial<JobOverviewItem> = {}): JobOverviewItem {
  return {
    jobId: id,
    kind: "PRODUCT",
    kindLabel: "Produs",
    organizationId: "org:a",
    requestId: null,
    productCode: "PRD",
    productLabel: "Casetă ACM",
    inscription: "QUARTZ",
    memberLabels: [],
    customerId: "cus:2",
    customerDisplayName: "Quartz Dental SRL",
    createdAt: "2026-11-11T10:00:00.000Z",
    stage: "EXECUTION_IN_PROGRESS",
    stageLabel: "În lucru",
    nextAction: "CONTINUE_EXECUTION",
    nextActionLabel: "Urmărește producția",
    href: `/jobs/${id}`,
    priority: "STANDARD",
    priorityLabel: "Standard",
    targetDate: null,
    targetDateLabel: "Fără termen",
    planningEditable: true,
    overdue: false,
    needsAttention: false,
    attentionLabel: null,
    activeIssueCount: 0,
    completedCount: 3,
    taskCount: 9,
    inProgressCount: 1,
    progressLabel: "3 / 9 finalizate · 1 în lucru",
    orderSnapshotId: id,
    releaseSnapshotId: "rel:1",
    planId: "plan:1",
    ...overrides,
  };
}

function approval(overrides: Partial<StartPriceApprovalInput> = {}): StartPriceApprovalInput {
  return {
    approvalId: "apr:1",
    status: "REQUESTED",
    requestId: "crq:9",
    requestReference: "CER-7AB1CD73",
    requestTitle: "Casetă luminoasă ACM",
    customerDisplayName: "Quartz Dental SRL",
    triggeredRules: ["MAXIMUM_NET_VALUE"],
    requestedByLabel: "comercial@pilot-demo.test",
    requestedAt: "2026-11-16T09:00:00.000Z",
    ...overrides,
  };
}

function canAs(role: OrganizationRole): StartOverviewInput["can"] {
  return (capability) => ROLE_CAPABILITIES[role].has(capability);
}

function input(overrides: Partial<StartOverviewInput> = {}): StartOverviewInput {
  return {
    readAt: READ_AT,
    can: canAs("owner"),
    requests: { status: "READY", value: projectRequestOverview([]) },
    quotes: { status: "READY", value: projectQuoteOverview([]) },
    jobs: { status: "READY", value: { overview: projectJobOverview([]), issueStates: new Map() } },
    priceApprovals: { status: "READY", value: [] },
    setup: { status: "READY", value: { enabledProductCount: 2, activePeopleCount: 3 } },
    ...overrides,
  };
}

function jobsSource(jobs: JobOverviewItem[], issues: [string, { open: number; acknowledged: number }][] = []) {
  return {
    status: "READY" as const,
    value: { overview: projectJobOverview(jobs), issueStates: new Map(issues) },
  };
}

describe("projectStartOverview · attention levels", () => {
  it("puts a pending price approval under ACTION only for the role that alone may decide it", () => {
    expect(capabilityExclusiveRole("quotes.price_exception.approve")).toBe("owner");
    const start = projectStartOverview(input({ priceApprovals: { status: "READY", value: [approval()] } }));
    expect(start.attention.counts).toEqual({ ACTION: 1, ATTENTION: 0, WATCH: 0 });
    const [entry] = start.attention.entries;
    expect(entry).toMatchObject({
      level: "ACTION",
      objectKind: "PRICE_APPROVAL",
      reference: "CER-7AB1CD73",
      reasonLabel: "Așteaptă aprobarea Proprietarului",
      actionLabel: "Deschide solicitarea",
      actionNote: "Ofertare · numai rolul Proprietar",
      target: { kind: "PRICE_APPROVALS" },
    });
    expect(entry?.detail).toContain("Valoarea netă depășește limita fără aprobare");
  });

  it("never turns a permission into an assignment: an accepted offer without order is ATTENTION, also for the owner", () => {
    const accepted = quote("3b592b0e", "QUOTE_ACCEPTED");
    const owner = projectStartOverview(input({ quotes: { status: "READY", value: projectQuoteOverview([accepted]) } }));
    expect(owner.attention.counts).toEqual({ ACTION: 0, ATTENTION: 1, WATCH: 0 });
    expect(owner.attention.entries[0]).toMatchObject({
      level: "ATTENTION",
      reasonLabel: "Acceptată · fără comandă",
      actionNote: "4.820,00 EUR · pas permis rolului tău",
      target: { kind: "QUOTE", quoteKind: "PRODUCT", productCode: "PRD", quoteSnapshotId: "qts:PRD:3b592b0e" },
    });
    const member = projectStartOverview(
      input({ can: canAs("member"), quotes: { status: "READY", value: projectQuoteOverview([accepted]) } }),
    );
    expect(member.attention.entries[0]?.actionNote).toBe("4.820,00 EUR · comanda se confirmă de Proprietar");
  });

  it("does not list an open offer without a decision as something to do", () => {
    const start = projectStartOverview(
      input({ quotes: { status: "READY", value: projectQuoteOverview([quote("a", "QUOTE_CREATED")]) } }),
    );
    expect(start.attention.entries).toEqual([]);
  });

  it("keeps a reported issue as WATCH and an overdue job as ATTENTION, never as a blocker", () => {
    const reported = job("ord:reported", {
      needsAttention: true,
      attentionLabel: "Problemă semnalată",
      activeIssueCount: 1,
    });
    const overdue = job("ord:overdue", {
      stage: "EXECUTION_PLANNED",
      stageLabel: "Plan de execuție",
      needsAttention: true,
      attentionLabel: "Termen depășit",
      overdue: true,
      targetDate: "2026-11-14",
      targetDateLabel: "14.11.2026",
      createdAt: "2026-11-09T10:00:00.000Z",
    });
    const start = projectStartOverview(
      input({ jobs: jobsSource([reported, overdue], [["ord:reported", { open: 0, acknowledged: 1 }]]) }),
    );
    expect(start.attention.counts).toEqual({ ACTION: 0, ATTENTION: 1, WATCH: 1 });
    const [attention, watch] = start.attention.entries;
    expect(attention).toMatchObject({ key: "job:ord:overdue", level: "ATTENTION", reasonLabel: "Termen depășit" });
    expect(attention?.detail).toContain("termen țintă 14.11.2026");
    expect(watch).toMatchObject({ key: "job:ord:reported", level: "WATCH", actionLabel: "Urmărește producția" });
    expect(watch?.detail).toContain("o problemă raportată, preluată");
    expect(JSON.stringify(start)).not.toMatch(/[Bb]loc/);
  });

  it("shows a job that is both overdue and has a reported issue once", () => {
    const both = job("ord:both", {
      needsAttention: true,
      attentionLabel: "Termen depășit",
      overdue: true,
      activeIssueCount: 2,
      targetDate: "2026-11-10",
      targetDateLabel: "10.11.2026",
    });
    const start = projectStartOverview(
      input({ jobs: jobsSource([both], [["ord:both", { open: 1, acknowledged: 1 }]]) }),
    );
    expect(start.attention.entries).toHaveLength(1);
    expect(start.attention.entries[0]?.level).toBe("ATTENTION");
    expect(start.attention.entries[0]?.detail).toContain("2 probleme raportate, 1 nepreluate");
  });

  it("orders by level, then oldest first, without a score", () => {
    const start = projectStartOverview(
      input({
        priceApprovals: { status: "READY", value: [approval({ requestedAt: "2026-11-16T09:00:00.000Z" })] },
        quotes: {
          status: "READY",
          value: projectQuoteOverview([
            quote("newer", "QUOTE_ACCEPTED", { createdAt: "2026-11-15T10:00:00.000Z" }),
            quote("older", "QUOTE_ACCEPTED", { createdAt: "2026-11-01T10:00:00.000Z" }),
          ]),
        },
      }),
    );
    expect(start.attention.entries.map((entry) => entry.key)).toEqual([
      "approval:apr:1",
      "quote:qts:PRD:older",
      "quote:qts:PRD:newer",
    ]);
  });

  it("describes issue states without claiming more than was recorded", () => {
    expect(startIssuePhrase({ open: 0, acknowledged: 0 })).toBeNull();
    expect(startIssuePhrase({ open: 1, acknowledged: 0 })).toBe("o problemă raportată, încă nepreluată");
    expect(startIssuePhrase({ open: 0, acknowledged: 3 })).toBe("3 probleme raportate, toate preluate");
  });
});

describe("projectStartOverview · continue work", () => {
  const assembly: RequestAssemblyWork = {
    assemblyId: "asm:1",
    label: "Ansamblu parcare",
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
    updatedAt: "2026-11-12T10:00:00.000Z",
  };

  it("lists requests whose own journey names a step, with the journey's label and target", () => {
    const choose = projectRequestOverviewItem({
      request: request({ requestId: "crq:new", reference: "CER-NEW", status: "NEW", createdAt: "2026-11-12T10:00:00.000Z" }),
      customerDisplayName: "Atelier Panouri Fictive SRL",
      quotes: [],
    });
    const continueAssembly = projectRequestOverviewItem({
      request: request({ requestId: "crq:asm", reference: "CER-ASM", status: "IN_REVIEW", createdAt: "2026-11-11T10:00:00.000Z" }),
      customerDisplayName: "Nord Market SRL",
      quotes: [],
      assemblies: [assembly],
    });
    const waiting = projectRequestOverviewItem({
      request: request({ requestId: "crq:wait", status: "WAITING_CUSTOMER" }),
      customerDisplayName: "X",
      quotes: [],
    });
    const start = projectStartOverview(
      input({ requests: { status: "READY", value: projectRequestOverview([choose, continueAssembly, waiting]) } }),
    );
    expect(start.continueWork).toMatchObject({ status: "READY", total: 2 });
    expect(start.continueWork?.items.map((item) => [item.reference, item.nextActionLabel, item.target])).toEqual([
      ["CER-ASM", "Continuă ansamblul", { kind: "ASSEMBLY", assemblyId: "asm:1" }],
      ["CER-NEW", "Alege produsul", { kind: "REQUEST_PRODUCT", requestId: "crq:new" }],
    ]);
    expect(start.continueWork?.items[1]?.contextLabel).toBe("Atelier Panouri Fictive SRL · fără ofertă");
  });

  it("does not repeat an offer step as a request to continue", () => {
    const accepted = quote("acc", "QUOTE_ACCEPTED", { requestId: "crq:1" }, { commercialState: "OPEN" });
    const item = projectRequestOverviewItem({
      request: request({ status: "IN_REVIEW" }),
      customerDisplayName: "Nord Market SRL",
      quotes: [accepted],
      ledger: { state: "OPEN", revision: 0, closedAt: null, reopenedAt: null },
    });
    const start = projectStartOverview(
      input({
        requests: { status: "READY", value: projectRequestOverview([item]) },
        quotes: { status: "READY", value: projectQuoteOverview([accepted]) },
      }),
    );
    expect(start.attention.entries.map((entry) => entry.key)).toEqual(["quote:qts:PRD:acc"]);
    expect(start.continueWork?.items).toEqual([]);
  });

  it("offers no request steps to a role that cannot work on requests", () => {
    const item = projectRequestOverviewItem({ request: request(), customerDisplayName: "X", quotes: [] });
    const start = projectStartOverview(
      input({
        can: canAs("production"),
        requests: { status: "READY", value: projectRequestOverview([item]) },
        quotes: { status: "NOT_PERMITTED" },
        priceApprovals: { status: "NOT_PERMITTED" },
      }),
    );
    expect(start.continueWork).toBeNull();
    expect(start.canCreateRequest).toBe(false);
    expect(start.flow.map((stage) => stage.id)).toEqual(["REQUESTS", "JOBS", "EXECUTION"]);
    expect(start.sources.map((source) => source.id)).toEqual(["REQUESTS", "JOBS", "SETUP"]);
  });
});

describe("projectStartOverview · operational flow", () => {
  it("counts each stage in its own unit and takes operations from plan progress, not from jobs", () => {
    const requests = [
      projectRequestOverviewItem({ request: request({ requestId: "crq:a", status: "NEW" }), customerDisplayName: "A", quotes: [] }),
      projectRequestOverviewItem({ request: request({ requestId: "crq:b", status: "IN_REVIEW" }), customerDisplayName: "B", quotes: [] }),
      projectRequestOverviewItem({ request: request({ requestId: "crq:c", status: "CANCELLED" }), customerDisplayName: "C", quotes: [] }),
    ];
    const jobs = [
      job("ord:1", { taskCount: 12, completedCount: 7, inProgressCount: 2 }),
      job("ord:2", { taskCount: 9, completedCount: 3, inProgressCount: 1, activeIssueCount: 1 }),
      job("ord:3", { stage: "EXECUTION_PLANNED", stageLabel: "Plan de execuție", taskCount: 5, completedCount: 0, inProgressCount: 0 }),
      job("ord:4", { stage: "EXECUTION_COMPLETED", stageLabel: "Finalizată", taskCount: 4, completedCount: 4, inProgressCount: 0 }),
    ];
    const start = projectStartOverview(
      input({
        requests: { status: "READY", value: projectRequestOverview(requests) },
        quotes: {
          status: "READY",
          value: projectQuoteOverview([quote("w", "QUOTE_CREATED"), quote("o", "ORDER_CREATED")]),
        },
        jobs: jobsSource(jobs),
      }),
    );
    const stage = (id: string) => start.flow.find((item) => item.id === id);
    expect(stage("REQUESTS")).toMatchObject({ total: 2, unitLabel: "cereri deschise" });
    expect(stage("REQUESTS")?.segments.map((segment) => [segment.label, segment.count])).toEqual([
      ["Nouă", 1],
      ["În lucru", 1],
    ]);
    expect(stage("QUOTES")).toMatchObject({ total: 1, unitLabel: "ofertă activă" });
    expect(stage("JOBS")).toMatchObject({ total: 3, unitLabel: "lucrări active" });
    expect(stage("EXECUTION")).toMatchObject({ total: 21, unitLabel: "operații, în 2 lucrări în lucru" });
    expect(stage("EXECUTION")?.segments.map((segment) => [segment.id, segment.count])).toEqual([
      ["COMPLETED", 10],
      ["IN_PROGRESS", 3],
      ["REMAINING", 8],
    ]);
    expect(stage("EXECUTION")?.highlight).toEqual({ label: "1 lucrare cu probleme raportate", tone: "neutral" });
  });
});

describe("projectStartOverview · missing data", () => {
  it("reports an unreadable source as unavailable, never as zero or as an empty organization", () => {
    const start = projectStartOverview(input({ quotes: { status: "UNAVAILABLE" } }));
    const quotes = start.flow.find((stage) => stage.id === "QUOTES");
    expect(quotes).toMatchObject({ status: "UNAVAILABLE", total: null, segments: [] });
    expect(start.sources.find((source) => source.id === "QUOTES")?.status).toBe("UNAVAILABLE");
    expect(start.attention.incompleteLevels).toEqual(["ATTENTION"]);
    expect(start.activity).toBe("UNKNOWN");
  });

  it("calls an organization new only when every permitted source was read and is empty", () => {
    const fresh = projectStartOverview(
      input({ setup: { status: "READY", value: { enabledProductCount: 0, activePeopleCount: 0 } } }),
    );
    expect(fresh.activity).toBe("NONE");
    expect(fresh.setup).toEqual({
      enabledProductCount: 0,
      canManage: true,
      optionalNotes: ["Oameni, zone și utilaje (necesare doar pentru Atelier)"],
    });
    expect(fresh.flow.every((stage) => stage.total === 0)).toBe(true);
  });

  it("does not expose price approvals to a role that cannot decide them", () => {
    const start = projectStartOverview(
      input({ can: canAs("member"), priceApprovals: { status: "READY", value: [approval()] } }),
    );
    expect(start.attention.entries).toEqual([]);
  });
});
