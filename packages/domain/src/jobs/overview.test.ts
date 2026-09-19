import { describe, expect, it } from "vitest";
import type { OrderSnapshot } from "../commercial/orderSnapshot.js";
import type { ExecutionPlanView, ExecutionTaskView } from "../execution/plan.js";
import type { AcceptedProductionSnapshot } from "../production/snapshot.js";
import {
  deriveJobNextAction,
  deriveJobStage,
  filterJobOverview,
  jobHref,
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
    ...overrides,
  };
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
      inProgress: status === "IN_PROGRESS" ? 1 : 0,
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
  });
});
