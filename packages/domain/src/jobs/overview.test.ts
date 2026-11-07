import { describe, expect, it } from "vitest";
import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import type { ExecutionPlanView, ExecutionTaskView } from "../execution/plan.js";
import type { AcceptedProductionSnapshot } from "../production/snapshot.js";
import {
  deriveJobNextAction,
  deriveJobStage,
  filterJobOverview,
  jobHref,
  projectAssemblyJobOverviewItem,
  projectJobOverview,
  projectJobOverviewItem,
} from "./overview.js";

function taskStub(
  overrides: Partial<ExecutionTaskView> &
    Pick<ExecutionTaskView, "status" | "requiresProvider">,
): ExecutionTaskView {
  return {
    taskId: "task:1",
    executionPlanId: "exp:test",
    sourceOperationId: "op:1",
    processId: "proc:cnc",
    processLabel: "Debitare CNC",
    scope: "FACE",
    scopeLabel: "Față",
    seq: 1,
    seqLabel: "01",
    dependsOnTaskIds: [],
    requiredCapabilityId: "CNC_CUTTING",
    requiredCapabilityLabel: "Debitare CNC",
    providerRequirement: "REQUIRED",
    quantities: [],
    resourceDemands: [],
    assignedProvider: null,
    assignedExecutor: null,
    plannedEffortMinutes: null,
    actualDurationMinutes: null,
    machineRuns: [],
    startedAt: null,
    completedAt: null,
    completion: null,
    actualConsumption: [],
    createdAt: "2026-08-17T08:00:00.000Z",
    statusLabel: "Planificat",
    assignmentLabel: "Nealocat",
    dependsOnLabels: [],
    waitingFor: [],
    eligibleProviders: [],
    eligibleExecutors: [],
    measurableQuantity: null,
    requiresCompletedQuantity: false,
    completionOutcomeLabel: null,
    completedQuantityLabel: null,
    varianceLabel: null,
    providerRequirementLabel: "Necesită utilaj / zonă",
    canAssign: false,
    canAssignExecutor: false,
    canStart: false,
    canClaimStart: false,
    startBlockReason: null,
    operatorRelation: "missing_provider",
    startedByLabel: null,
    canComplete: false,
    hasPlannedResources: false,
    canRecordActualConsumption: false,
    plannedTimeLabel: "Necunoscut",
    actualDurationLabel: "Necunoscut",
    timeVarianceMinutes: null,
    timeVarianceLabel: null,
    activeMachineRun: null,
    machineRunTotalMinutes: null,
    machineRunTotalLabel: null,
    canStartMachineRun: false,
    canStopMachineRun: false,
    completionBlockedByActiveMachineRun: false,
    materialParticipation: "NOT_ADOPTED",
    materialBlockLabel: null,
    materialLines: [],
    executionMode: "INTERNAL",
    externalProviderLabel: null,
    handedOffAt: null,
    returnedAt: null,
    canExternalize: false,
    canAssignExternalProvider: false,
    canHandOffExternal: false,
    canRecordExternalReturn: false,
    externalBlockLabel: null,
    qualityControl: false,
    latestQualityResult: null,
    qualityAttemptCount: 0,
    qualityAttempts: [],
    reworkEpisodes: [],
    openReworkEpisode: null,
    canRecordQualityPass: false,
    canRecordQualityFail: false,
    canCloseReworkEpisode: false,
    qualityBlockLabel: null,
    providerBindingState: "NONE",
    providerBindingSource: null,
    providerBindingLabel: null,
    ...overrides,
  } as ExecutionTaskView;
}

function order(inscription = "WORKOS"): OrderSnapshot {
  return {
    orderSnapshotId: `ord:${inscription}`,
    schemaVersion: 1,
    status: "FROZEN",
    createdAt: "2026-08-17T06:00:00.000Z",
    sourceQuoteSnapshotId: "qts:test",
    sourceQuoteContentHash: "hash",
    sourceAcceptanceId: "qad:test",
    sourceAcceptedAt: "2026-08-17T05:00:00.000Z",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription,
    sourceReviewId: "rev:test",
    contentHash: "hash",
    truth: {
      templateCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      templateVersion: "1",
      familyId: "fam",
      selectedComponentIds: [],
      values: {},
      measurements: [],
    },
    quantities: [],
    eic: { total: 382.5, currency: "EUR", completeness: "COMPLETE", lines: [] },
    commercial: {
      policyId: "policy",
      policyVersion: 1,
      markupPercent: 35,
      markupAmount: 133.88,
      discountPercent: 0,
      discountAmount: 0,
      adjustmentAmount: 0,
      netPrice: 516.38,
      vatPercent: 21,
      vatAmount: 108.44,
      grossPrice: 624.82,
      currency: "EUR",
      completeness: "COMPLETE",
    },
    productionInput: {
      schemaVersion: 1,
      contentHash: "hash",
      requirements: [],
      operations: [],
      usedTechnicalSettings: [],
      usedRecipes: [],
    },
  };
}

function release(): AcceptedProductionSnapshot {
  return {
    snapshotId: "aps:test",
    schemaVersion: 1,
    status: "ACCEPTED",
    productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
    productLabel: "Litere",
    inscription: "WORKOS",
    sourceReviewId: "rev:test",
    sourceConfirmedAt: "2026-08-17T04:00:00.000Z",
    createdAt: "2026-08-17T07:00:00.000Z",
    contentHash: "hash",
    releaseSource: "ORDER",
    sourceOrderSnapshotId: "ord:WORKOS",
    sourceOrderContentHash: "hash",
    sourceProductionInputHash: "hash",
    truth: order().truth,
    quantities: [],
    requirements: [],
    operations: [],
    usedTechnicalSettings: [],
    usedRecipes: [],
    eic: { total: 382.5, currency: "EUR", completeness: "COMPLETE", lines: [] },
  };
}

function planView(
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED",
  extras?: Partial<ExecutionPlanView["progress"]> & {
    tasks?: ExecutionPlanView["tasks"];
  },
): ExecutionPlanView {
  return {
    plan: {
      planId: "exp:test",
      sourceSnapshotId: "aps:test",
      sourceSnapshotHash: "hash",
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      productLabel: "Litere",
      inscription: "WORKOS",
      createdAt: "2026-08-17T08:00:00.000Z",
      status: "PLANNED",
      taskCount: 12,
      schemaVersion: 1,
      eicTotal: 382.5,
      eicCurrency: "EUR",
      eicCompleteness: "COMPLETE",
    },
    progress: {
      total: 12,
      completed: status === "COMPLETED" ? 12 : status === "IN_PROGRESS" ? 3 : 0,
      inProgress: extras?.inProgress ?? (status === "IN_PROGRESS" ? 1 : 0),
      outside: extras?.outside ?? 0,
      planned: status === "COMPLETED" ? 0 : 9,
      waitingDependencies: 0,
      noProvider: extras?.noProvider ?? 0,
      noExecutor: extras?.noExecutor ?? 12,
      varianceCount: 0,
      status,
    },
    progressStatus: status,
    statusLabel: status === "COMPLETED" ? "Finalizat" : status === "IN_PROGRESS" ? "În lucru" : "Planificat",
    sourceKind: "ORDER",
    sourceKindLabel: "Eliberată din comandă",
    jobHref: "/jobs/ord%3AWORKOS",
    externalProviderChoices: [],
    timeSummary: {
      plannedKnownMinutes: 0,
      actualKnownMinutes: 0,
      plannedKnownTaskCount: 0,
      actualKnownTaskCount: 0,
      totalTaskCount: 0,
      plannedKnownLabel: "Planificat cunoscut: 0 min / 0 din 0 sarcini",
      actualKnownLabel: "Realizat cunoscut: 0 min / 0 din 0 sarcini",
    },
    actualInternalCost: {
      status: "UNAVAILABLE",
      statusLabel: "Indisponibil",
      currency: "EUR",
      calculableTotal: null,
      plannedComparableTotal: null,
      availableDifference: null,
      lines: [],
      calculableCount: 0,
      unavailableCount: 0,
    },
    tasks: extras?.tasks ?? [],
  };
}

describe("job overview projection", () => {
  it("roots a commercial job on the order and derives stage from persisted facts", () => {
    expect(deriveJobStage({ release: null, progress: null })).toBe("ORDER_CREATED");
    expect(deriveJobStage({ release: release(), progress: null })).toBe("RELEASED");
    expect(deriveJobStage({ release: release(), progress: planView("PLANNED").progress })).toBe(
      "EXECUTION_PLANNED",
    );
    expect(deriveJobStage({ release: release(), progress: planView("IN_PROGRESS").progress })).toBe(
      "EXECUTION_IN_PROGRESS",
    );
    expect(deriveJobStage({ release: release(), progress: planView("COMPLETED").progress })).toBe(
      "EXECUTION_COMPLETED",
    );
  });

  it("derives one next action and href per stage", () => {
    expect(deriveJobNextAction("ORDER_CREATED")).toBe("RELEASE_TO_PRODUCTION");
    expect(jobHref({
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      orderSnapshotId: "ord:WORKOS",
      planId: null,
      nextAction: "RELEASE_TO_PRODUCTION",
    })).toBe("/jobs/ord%3AWORKOS");
    expect(jobHref({
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      orderSnapshotId: "ord:WORKOS",
      planId: "exp:test",
      nextAction: "CONTINUE_EXECUTION",
    })).toBe("/jobs/ord%3AWORKOS");
  });

  it("treats all required tasks completed as the only completed job", () => {
    const created = projectJobOverviewItem({
      order: order(),
      release: null,
      planView: null,
    });
    const done = projectJobOverviewItem({
      order: order("DONE"),
      release: release(),
      planView: planView("COMPLETED"),
    });
    expect(created.stage).toBe("ORDER_CREATED");
    expect(created.needsAttention).toBe(true);
    expect(done.stage).toBe("EXECUTION_COMPLETED");
    expect(done.nextActionLabel).toBe("Lucrare finalizată");
    expect(done.progressLabel).toBe("12 / 12 finalizate");
  });

  it("does not treat unclaimed PLANNED or IN_PROGRESS alone as attention after Claim-on-Start", () => {
    const unclaimed = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("PLANNED", {
        tasks: [taskStub({ status: "PLANNED", requiresProvider: false })],
      }),
    });
    const inProgress = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("IN_PROGRESS", {
        tasks: [
          taskStub({
            status: "IN_PROGRESS",
            requiresProvider: true,
            assignedProvider: {
              id: "wc:cnc",
              kind: "WORKCENTER",
              label: "CNC 4020",
            },
          }),
        ],
      }),
    });
    expect(unclaimed.needsAttention).toBe(false);
    expect(unclaimed.attentionLabel).toBeNull();
    expect(inProgress.needsAttention).toBe(false);
    expect(inProgress.attentionLabel).toBeNull();
  });

  it("flags only current provider blockers, not future dependency-gated provider gaps", () => {
    const currentGap = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("PLANNED", {
        noProvider: 1,
        tasks: [
          taskStub({
            status: "PLANNED",
            requiresProvider: true,
            waitingFor: [],
            assignedProvider: null,
          }),
        ],
      }),
    });
    const futureGap = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("PLANNED", {
        noProvider: 1,
        tasks: [
          taskStub({
            status: "PLANNED",
            requiresProvider: true,
            waitingFor: ["Debitare CNC"],
            assignedProvider: null,
          }),
        ],
      }),
    });
    expect(currentGap.attentionLabel).toBe("Lipsă utilaj dedicat");
    expect(currentGap.needsAttention).toBe(true);
    expect(futureGap.needsAttention).toBe(false);
    expect(futureGap.attentionLabel).toBeNull();
  });

  it("follows canonical provider binding instead of a missing assignment", () => {
    const attentionFor = (
      task: Parameters<typeof taskStub>[0],
      sibling?: Parameters<typeof taskStub>[0],
    ) =>
      projectJobOverviewItem({
        order: order(),
        release: release(),
        planView: planView("PLANNED", {
          tasks: sibling ? [taskStub(task), taskStub({ taskId: "task:2", ...sibling })] : [taskStub(task)],
        }),
      }).attentionLabel;

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: true,
        assignedProvider: null,
        providerBindingState: "UNIQUE_PENDING",
        providerBindingLabel: "Se asociază automat: CNC 4020",
        eligibleProviders: [{ id: "mch:cnc", kind: "MACHINE", label: "CNC 4020" }],
      }),
    ).toBeNull();

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: true,
        assignedProvider: null,
        providerBindingState: "NONE",
        eligibleProviders: [],
      }),
    ).toBe("Lipsă utilaj dedicat");

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: true,
        assignedProvider: null,
        providerBindingState: "CHOICE_REQUIRED",
        eligibleProviders: [
          { id: "mch:a", kind: "MACHINE", label: "CNC unu" },
          { id: "mch:b", kind: "MACHINE", label: "CNC doi" },
        ],
      }),
    ).toBe("Alegere utilaj necesară");

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: true,
        assignedProvider: { id: "mch:old", kind: "MACHINE", label: "Utilaj retras" },
        providerBindingState: "UNAVAILABLE",
        providerBindingLabel: "Utilajul alocat nu mai este eligibil",
        eligibleProviders: [],
      }),
    ).toBe("Utilajul alocat nu mai este eligibil");

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: true,
        waitingFor: ["Debitare CNC"],
        assignedProvider: null,
        providerBindingState: "NONE",
      }),
    ).toBeNull();

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: false,
        providerRequirement: "NOT_REQUIRED",
        providerBindingState: "NOT_REQUIRED",
        assignedProvider: null,
      }),
    ).toBeNull();

    expect(
      attentionFor({
        status: "PLANNED",
        requiresProvider: true,
        executionMode: "EXTERNAL",
        providerBindingState: "EXTERNAL",
        externalProviderLabel: "Atelier extern",
        assignedProvider: null,
      }),
    ).toBeNull();

    expect(
      attentionFor({
        status: "COMPLETED",
        requiresProvider: true,
        assignedProvider: null,
        providerBindingState: "NONE",
      }),
    ).toBeNull();

    expect(
      attentionFor({
        status: "IN_PROGRESS",
        requiresProvider: true,
        assignedProvider: { id: "mch:cnc", kind: "MACHINE", label: "CNC 4020" },
        providerBindingState: "ASSIGNED",
      }),
    ).toBeNull();

    expect(
      attentionFor(
        {
          status: "PLANNED",
          requiresProvider: true,
          assignedProvider: null,
          providerBindingState: "UNIQUE_PENDING",
          eligibleProviders: [{ id: "mch:cnc", kind: "MACHINE", label: "CNC 4020" }],
        },
        {
          status: "IN_PROGRESS",
          requiresProvider: true,
          assignedProvider: { id: "mch:cnc", kind: "MACHINE", label: "CNC 4020" },
          providerBindingState: "ASSIGNED",
          activeMachineRun: {
            machineRunId: "mrun:1",
            executionPlanId: "exp:test",
            taskId: "task:2",
            machineProviderId: "mch:cnc",
            machineProviderLabel: "CNC 4020",
            startedAt: "2026-08-17T09:00:00.000Z",
            completedAt: null,
            durationMinutes: null,
            startedByOperatorId: "per:1",
            startedByOperatorLabel: "Operator",
            completedByOperatorId: null,
            completedByOperatorLabel: null,
            createdAt: "2026-08-17T09:00:00.000Z",
            schemaVersion: 1,
          },
        },
      ),
    ).toBeNull();

    expect(
      attentionFor(
        {
          status: "PLANNED",
          requiresProvider: true,
          providerBindingState: "NONE",
          assignedProvider: null,
        },
        {
          status: "PLANNED",
          requiresProvider: true,
          providerBindingState: "CHOICE_REQUIRED",
          assignedProvider: null,
        },
      ),
    ).toBe("Lipsă utilaj dedicat");
  });

  it("raises job attention for open issues without replacing provider attention", () => {
    const idle = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("IN_PROGRESS", {
        tasks: [
          taskStub({
            status: "IN_PROGRESS",
            requiresProvider: true,
            assignedProvider: { id: "wc:cnc", kind: "WORKCENTER", label: "CNC 4020" },
          }),
        ],
      }),
    });
    const reported = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("IN_PROGRESS", {
        tasks: [
          taskStub({
            status: "IN_PROGRESS",
            requiresProvider: true,
            assignedProvider: { id: "wc:cnc", kind: "WORKCENTER", label: "CNC 4020" },
          }),
        ],
      }),
      activeIssueCount: 1,
    });
    const many = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("IN_PROGRESS", {
        tasks: [
          taskStub({
            status: "IN_PROGRESS",
            requiresProvider: true,
            assignedProvider: { id: "wc:cnc", kind: "WORKCENTER", label: "CNC 4020" },
          }),
        ],
      }),
      activeIssueCount: 2,
    });
    const providerAndIssue = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("PLANNED", {
        tasks: [taskStub({ status: "PLANNED", requiresProvider: true, assignedProvider: null })],
      }),
      activeIssueCount: 1,
    });
    const resolved = projectJobOverviewItem({
      order: order(),
      release: release(),
      planView: planView("IN_PROGRESS", {
        tasks: [
          taskStub({
            status: "IN_PROGRESS",
            requiresProvider: true,
            assignedProvider: { id: "wc:cnc", kind: "WORKCENTER", label: "CNC 4020" },
          }),
        ],
      }),
      activeIssueCount: 0,
    });
    expect(idle.needsAttention).toBe(false);
    expect(reported.needsAttention).toBe(true);
    expect(reported.attentionLabel).toBe("Problemă semnalată");
    expect(reported.activeIssueCount).toBe(1);
    expect(many.attentionLabel).toBe("Probleme semnalate");
    expect(filterJobOverview(projectJobOverview([many]), "NEEDS_ACTION")).toHaveLength(1);
    expect(providerAndIssue.attentionLabel).toBe("Lipsă utilaj dedicat");
    expect(providerAndIssue.needsAttention).toBe(true);
    expect(providerAndIssue.activeIssueCount).toBe(1);
    expect(resolved.needsAttention).toBe(false);
    expect(resolved.attentionLabel).toBeNull();
  });

  it("raises issue attention on an assembly job already in execution", () => {
    const assembly = projectAssemblyJobOverviewItem({
      orderSnapshotId: "asmo:running",
      organizationId: "org:workshop",
      requestId: "crq:1",
      label: "Panou ACM + litere volumetrice",
      createdAt: "2026-09-20T08:00:00.000Z",
      members: [
        { role: "SUPPORT_PANEL", inscription: "PANOU" },
        { role: "SIGNAGE_LETTERS", inscription: "LITERE" },
      ],
      customer: { customerId: "cus:1", displayName: "Client Ansamblu" },
      releaseSnapshotId: "rel:1",
      planView: planView("IN_PROGRESS", {
        tasks: [
          taskStub({
            status: "IN_PROGRESS",
            requiresProvider: true,
            assignedProvider: { id: "wc:cnc", kind: "WORKCENTER", label: "CNC 4020" },
          }),
        ],
      }),
      activeIssueCount: 1,
    });
    expect(assembly.kind).toBe("ASSEMBLY");
    expect(assembly.needsAttention).toBe(true);
    expect(assembly.attentionLabel).toBe("Problemă semnalată");
  });

  it("keeps unresolved issues on a completed job in the needs-action filter", () => {
    const completedOpen = projectJobOverviewItem({
      order: order("DONE-ISSUE"),
      release: release(),
      planView: planView("COMPLETED"),
      activeIssueCount: 1,
    });
    expect(completedOpen.stage).toBe("EXECUTION_COMPLETED");
    expect(completedOpen.needsAttention).toBe(true);
    expect(completedOpen.attentionLabel).toBe("Problemă semnalată");
    expect(filterJobOverview(projectJobOverview([completedOpen]), "NEEDS_ACTION")).toHaveLength(1);
  });

  it("excludes completed jobs from the needs-action filter", () => {
    const overview = projectJobOverview([
      projectJobOverviewItem({ order: order("A"), release: null, planView: null }),
      projectJobOverviewItem({
        order: { ...order("B"), createdAt: "2026-08-17T09:00:00.000Z" },
        release: release(),
        planView: planView("COMPLETED"),
      }),
    ]);
    expect(overview.summary).toEqual({
      total: 2,
      active: 1,
      inExecution: 0,
      needsAttention: 1,
      completed: 1,
    });
    expect(filterJobOverview(overview, "NEEDS_ACTION")).toHaveLength(1);
    expect(filterJobOverview(overview, "COMPLETED")[0]?.inscription).toBe("B");
    expect(filterJobOverview(overview, "COMPLETED", "zz-missing")).toHaveLength(0);
    expect(JSON.stringify(overview)).not.toMatch(/PILOT|contentHash|schemaVersion/);
  });

  it("intersects operational filters with frozen inscription search", () => {
    const overview = projectJobOverview([
      projectJobOverviewItem({
        order: {
          ...order("HUB-ALPHA"),
          customer: { customerId: "cus:1", displayName: "Client Înghețat" },
        },
        release: null,
        planView: null,
      }),
      projectJobOverviewItem({
        order: {
          ...order("HUB-BETA"),
          createdAt: "2026-08-17T09:00:00.000Z",
          customer: { customerId: "cus:1", displayName: "Client Înghețat" },
        },
        release: release(),
        planView: planView("COMPLETED"),
      }),
    ]);
    expect(filterJobOverview(overview, "ALL", "HUB-ALPHA")).toHaveLength(1);
    expect(filterJobOverview(overview, "COMPLETED", "HUB-ALPHA")).toHaveLength(0);
    expect(filterJobOverview(overview, "COMPLETED", "HUB-BETA")).toHaveLength(1);
    expect(filterJobOverview(overview, "ALL", "inghetat")).toHaveLength(2);
    expect(filterJobOverview(overview, "ALL", "Live Rename")).toHaveLength(0);
  });

  it("projects frozen customer display name from the order snapshot", () => {
    const withCustomer = projectJobOverviewItem({
      order: {
        ...order("WORKOS"),
        customer: { customerId: "cus:letters", displayName: "Client Demo LETTERS" },
      },
      release: null,
      planView: null,
    });
    const legacy = projectJobOverviewItem({
      order: order("WORKOS"),
      release: null,
      planView: null,
    });
    expect(withCustomer.customerDisplayName).toBe("Client Demo LETTERS");
    expect(legacy.customerDisplayName).toBeNull();
    expect(withCustomer.inscription).toBe("WORKOS");
    expect(withCustomer.kind).toBe("PRODUCT");
    expect(withCustomer.priority).toBe("STANDARD");
    expect(withCustomer.targetDate).toBeNull();
  });

  it("projects one assembly job and keeps technical attention ahead of an overdue target", () => {
    const assembly = projectAssemblyJobOverviewItem({
      orderSnapshotId: "asmo:accepted",
      organizationId: "org:workshop",
      requestId: "crq:1",
      label: "Panou ACM + litere volumetrice",
      createdAt: "2026-09-20T08:00:00.000Z",
      members: [
        { role: "SUPPORT_PANEL", inscription: "PANOU" },
        { role: "SIGNAGE_LETTERS", inscription: "LITERE" },
      ],
      customer: { customerId: "cus:1", displayName: "Client Ansamblu" },
      releaseSnapshotId: null,
      planView: null,
      planning: { priority: "URGENT", targetDate: "2026-09-01" },
      today: "2026-09-23",
    });
    expect(assembly.kind).toBe("ASSEMBLY");
    expect(assembly.jobId).toBe("asmo:accepted");
    expect(assembly.productLabel).toBe("Panou ACM + litere volumetrice");
    expect(assembly.memberLabels).toEqual(["Panou ACM", "Litere volumetrice"]);
    expect(assembly.priority).toBe("URGENT");
    expect(assembly.overdue).toBe(true);
    expect(assembly.attentionLabel).toBe("Comanda așteaptă trimiterea în producție");
    expect(filterJobOverview(projectJobOverview([assembly]), "URGENT")).toHaveLength(1);
    expect(filterJobOverview(projectJobOverview([assembly]), "OVERDUE")).toHaveLength(1);

    const running = projectJobOverviewItem({
      order: order("LATE"),
      release: release(),
      planView: planView("IN_PROGRESS"),
      planning: { priority: "HIGH", targetDate: "2026-09-01" },
      today: "2026-09-23",
    });
    expect(running.attentionLabel).toBe("Termen depășit");
    expect(running.planningEditable).toBe(true);

    const done = projectJobOverviewItem({
      order: order("DONE-LATE"),
      release: release(),
      planView: planView("COMPLETED"),
      planning: { priority: "URGENT", targetDate: "2026-09-01" },
      today: "2026-09-23",
    });
    expect(done.overdue).toBe(false);
    expect(done.planningEditable).toBe(false);
  });

  it("names outside custody on the job stage without a new status", () => {
    const outsideOnly = projectJobOverviewItem({
      order: order("OUTSIDE-ONLY"),
      release: release(),
      planView: planView("IN_PROGRESS", { inProgress: 0, outside: 1 }),
    });
    expect(outsideOnly.stage).toBe("EXECUTION_IN_PROGRESS");
    expect(outsideOnly.stageLabel).toBe("La furnizor extern");

    const internalOnly = projectJobOverviewItem({
      order: order("INTERNAL-ONLY"),
      release: release(),
      planView: planView("IN_PROGRESS", { inProgress: 1, outside: 0 }),
    });
    expect(internalOnly.stage).toBe("EXECUTION_IN_PROGRESS");
    expect(internalOnly.stageLabel).toBe("În lucru");

    const mixed = projectJobOverviewItem({
      order: order("MIXED"),
      release: release(),
      planView: planView("IN_PROGRESS", { inProgress: 1, outside: 2 }),
    });
    expect(mixed.stage).toBe("EXECUTION_IN_PROGRESS");
    expect(mixed.stageLabel).toBe("În lucru · La furnizor extern");
    expect(mixed.progressLabel).toBe("3 / 12 finalizate · 1 în lucru · 2 la furnizor extern");

    const completed = projectJobOverviewItem({
      order: order("DONE-COPY"),
      release: release(),
      planView: planView("COMPLETED"),
    });
    expect(completed.stage).toBe("EXECUTION_COMPLETED");
    expect(completed.stageLabel).toBe("Finalizată");
  });

  it("counts outside tasks in job progress without calling them internal work", () => {
    const item = projectJobOverviewItem({
      order: order("OUTSIDE"),
      release: release(),
      planView: planView("PLANNED", { outside: 1 }),
    });
    expect(item.progressLabel).toBe("0 / 12 finalizate · 1 la furnizor extern");
    expect(item.progressLabel?.includes("în lucru")).toBe(false);
  });
});
