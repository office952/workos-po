import { describe, expect, it } from "vitest";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import { CUT_SHEET_CNC_ID } from "../processes/catalog.js";
import { composeProductProcessesFromTruth, compositionNodeId } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import { freezeAcceptedProductionSnapshot } from "../production/snapshot.js";
import { MCH_CNC_4020_ID, workcenterRegistry } from "../workcenters/catalog.js";
import { createPerson, type Person } from "../people/identity.js";
import { deriveJobAttention } from "../jobs/overview.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  claimAndStartExecutionTask,
  plannedCompletionInput,
  startExecutionTask,
} from "./lifecycle.js";
import { startMachineRun } from "./machineRun.js";
import { projectOperatorTaskInbox } from "./inbox.js";
import { projectPlanningWorkload } from "./workload.js";
import { DISABLED_MATERIAL_READINESS } from "./materialReadiness.js";
import {
  assignExternalProviderToTask,
  createExternalProductionProvider,
  externalProviderNameKey,
  handOffExternalTask,
  markTaskExternal,
  nextExternalProductionHandoffVersion,
  recordExternalReturn,
  renameExternalProductionProvider,
  resolveExternalProductionHandoffMode,
  setExternalProductionProviderActive,
} from "./externalProduction.js";
import {
  materializeExecutionPlanFromSnapshot,
  presentActiveExecutionLabel,
  projectExecutionPlanView,
  summarizeExecutionProgress,
  type ExecutionPlanRecord,
  type ExecutionTask,
} from "./plan.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const provider = {
  providerId: "xprov:atelier",
  name: "Atelier Extern",
  active: true,
  createdAt: "2026-09-26T10:00:00.000Z",
  createdBy: "owner",
};

function planned() {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    { templateCode: CANONICAL_PRODUCT_CODE, values: readyValues },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
    { formulaVersionsForType: starterFormulaVersionsForType },
  );
  const composition = composeProductProcessesFromTruth(
    truth,
    frontlitPlexiAl06Template,
    undefined,
    { formulaVersionsForType: starterFormulaVersionsForType },
  );
  return materializeExecutionPlanFromSnapshot(
    freezeAcceptedProductionSnapshot(
      truth,
      aggregate,
      composition,
      compileEic(aggregate, composition),
      { createdAt: "2026-08-15T14:00:00.000Z" },
    ),
    { createdAt: "2026-08-15T15:00:00.000Z" },
  );
}

function peopleNamed(name: string, personId: string): Person {
  const created = createPerson(name, { personId });
  if (!created.ok) {
    throw new Error("expected person");
  }
  return created.person;
}

function chain(): ExecutionPlanRecord {
  const source = planned();
  const template = source.tasks[0];
  if (!template) {
    throw new Error("expected a template task");
  }
  const blank: ExecutionTask = {
    ...template,
    status: "PLANNED",
    providerRequirement: "NOT_REQUIRED",
    assignedProvider: null,
    assignedExecutor: null,
    machineRuns: [],
    actualConsumption: [],
    completion: null,
    startedAt: null,
    completedAt: null,
    actualDurationMinutes: null,
    plannedEffortMinutes: 40,
    executionMode: "INTERNAL",
    externalProviderId: null,
    externalProviderLabel: null,
    externalizedAt: null,
    externalizedBy: null,
    handedOffAt: null,
    handedOffBy: null,
    returnedAt: null,
    returnedBy: null,
    dependsOnTaskIds: [],
  };
  return {
    plan: source.plan,
    tasks: [
      { ...blank, taskId: "task:a", seq: 1, seqLabel: "01", processLabel: "Sarcină A" },
      {
        ...blank,
        taskId: "task:b",
        seq: 2,
        seqLabel: "02",
        processLabel: "Sarcină B",
        dependsOnTaskIds: ["task:a"],
      },
      {
        ...blank,
        taskId: "task:c",
        seq: 3,
        seqLabel: "03",
        processLabel: "Sarcină C",
        dependsOnTaskIds: ["task:b"],
      },
    ],
  };
}

function must<T extends { ok: true; record: ExecutionPlanRecord }>(
  result: T | { ok: false; error: string },
): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

describe("external production handoff", () => {
  it("keeps the code default disabled and does not store a no-op row", () => {
    const absent = resolveExternalProductionHandoffMode([]);
    expect(absent).toMatchObject({ mode: "DISABLED", source: "CODE_DEFAULT", version: 0 });
    expect(
      nextExternalProductionHandoffVersion(absent, "DISABLED", "2026-09-26T10:00:00.000Z", "owner"),
    ).toBeNull();
    const enabled = nextExternalProductionHandoffVersion(
      absent,
      "ENABLED",
      "2026-09-26T10:00:00.000Z",
      "owner",
    );
    expect(enabled).toMatchObject({ version: 1, mode: "ENABLED" });
  });

  it("leaves the internal claim path unchanged", () => {
    const owner = peopleNamed("Operator CNC", "per:cnc");
    const record = planned();
    const sourceId = compositionNodeId("BACK", CUT_SHEET_CNC_ID);
    const task = record.tasks.find((item) => item.sourceOperationId === sourceId);
    if (!task) {
      throw new Error("missing CNC task");
    }
    const assigned = must(assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID));
    const withExecutor = must(
      assignExecutorToTask(assigned.record, task.taskId, owner.personId, [owner]),
    );
    const started = must(
      startExecutionTask(withExecutor.record, task.taskId, "2026-08-15T16:00:00.000Z", [owner]),
    );
    expect(started.record.tasks.find((item) => item.taskId === task.taskId)?.status).toBe(
      "IN_PROGRESS",
    );
    const fresh = started.record.tasks.find((item) => item.taskId === task.taskId);
    const completed = must(
      completeExecutionTask(
        started.record,
        task.taskId,
        "2026-08-15T18:00:00.000Z",
        plannedCompletionInput(fresh!),
        owner.personId,
      ),
    );
    expect(completed.record.tasks.find((item) => item.taskId === task.taskId)?.status).toBe(
      "COMPLETED",
    );
  });

  it("externalizes only when enabled, then hands off and returns without inventing internal work", () => {
    const owner = peopleNamed("Operator CNC", "per:cnc");
    const record = chain();
    expect(markTaskExternal(record, "task:b", "DISABLED", "owner", "2026-09-26T10:00:00.000Z")).toEqual(
      { ok: false, error: "external_production_disabled" },
    );
    const externalized = must(
      markTaskExternal(record, "task:b", "ENABLED", "owner", "2026-09-26T10:00:00.000Z"),
    );
    const marked = externalized.record.tasks.find((item) => item.taskId === "task:b");
    expect(marked).toMatchObject({
      executionMode: "EXTERNAL",
      status: "PLANNED",
      externalizedBy: "owner",
      startedAt: null,
      assignedExecutor: null,
    });
    expect(marked?.actualConsumption).toEqual([]);
    expect(marked?.machineRuns).toEqual([]);

    expect(assignExternalProviderToTask(externalized.record, "task:b", null)).toEqual({
      ok: false,
      error: "external_provider_not_found",
    });
    expect(
      assignExternalProviderToTask(externalized.record, "task:b", { ...provider, active: false }),
    ).toEqual({ ok: false, error: "external_provider_inactive" });
    const assigned = must(assignExternalProviderToTask(externalized.record, "task:b", provider));
    expect(handOffExternalTask(assigned.record, "task:b", "owner", "2026-09-26T11:00:00.000Z", provider.name)).toEqual(
      { ok: false, error: "dependencies_incomplete" },
    );

    const startedA = must(
      claimAndStartExecutionTask(
        assigned.record,
        "task:a",
        owner.personId,
        "2026-09-26T10:30:00.000Z",
        [owner],
      ),
    );
    const freshA = startedA.record.tasks.find((item) => item.taskId === "task:a");
    const completedA = must(
      completeExecutionTask(
        startedA.record,
        "task:a",
        "2026-09-26T10:40:00.000Z",
        plannedCompletionInput(freshA!),
        owner.personId,
      ),
    );
    expect(startExecutionTask(completedA.record, "task:b", "2026-09-26T10:45:00.000Z", [owner])).toEqual(
      { ok: false, error: "invalid_transition" },
    );
    const outside = must(
      handOffExternalTask(
        completedA.record,
        "task:b",
        "owner",
        "2026-09-26T11:00:00.000Z",
        provider.name,
      ),
    );
    const handed = outside.record.tasks.find((item) => item.taskId === "task:b");
    expect(handed).toMatchObject({
      status: "OUTSIDE",
      externalProviderLabel: "Atelier Extern",
      handedOffBy: "owner",
      startedAt: null,
      assignedExecutor: null,
      actualDurationMinutes: null,
    });
    expect(handed?.actualConsumption).toEqual([]);
    expect(completeExecutionTask(outside.record, "task:b", "2026-09-26T12:00:00.000Z", {})).toEqual({
      ok: false,
      error: "invalid_transition",
    });
    expect(startMachineRun(outside.record, "task:b", owner.personId, "2026-09-26T11:05:00.000Z", [owner])).toEqual({
      ok: false,
      error: "machine_run_not_allowed",
    });

    const blocked = projectExecutionPlanView(outside.record, [owner]);
    const progress = summarizeExecutionProgress(blocked.tasks);
    expect(progress.outside).toBe(1);
    expect(progress.inProgress).toBe(0);
    expect(progress.planned + progress.inProgress + progress.outside + progress.completed).toBe(
      progress.total,
    );
    const taskC = blocked.tasks.find((item) => item.taskId === "task:c");
    expect(taskC?.canClaimStart).toBe(false);
    expect(taskC?.waitingFor.length).toBeGreaterThan(0);

    const disabledReturn = must(
      recordExternalReturn(outside.record, "task:b", "owner", "2026-09-26T12:00:00.000Z"),
    );
    const returned = disabledReturn.record.tasks.find((item) => item.taskId === "task:b");
    expect(returned).toMatchObject({
      status: "COMPLETED",
      returnedBy: "owner",
      actualDurationMinutes: null,
      completion: null,
    });
    const open = projectExecutionPlanView(disabledReturn.record, [owner]);
    expect(open.tasks.find((item) => item.taskId === "task:c")?.waitingFor).toEqual([]);
  });

  it("does not strand an already external task when the capability is later disabled", () => {
    const record = chain();
    const externalized = must(
      markTaskExternal(record, "task:b", "ENABLED", "owner", "2026-09-26T10:00:00.000Z"),
    );
    const assigned = must(assignExternalProviderToTask(externalized.record, "task:b", provider));
    const completedA = completePredecessor(assigned.record);
    const outside = must(
      handOffExternalTask(completedA, "task:b", "owner", "2026-09-26T11:00:00.000Z", provider.name),
    );
    const returned = must(
      recordExternalReturn(outside.record, "task:b", "owner", "2026-09-26T12:00:00.000Z"),
    );
    expect(returned.record.tasks.find((item) => item.taskId === "task:b")?.status).toBe("COMPLETED");
    expect(returned.record.tasks.find((item) => item.taskId === "task:b")?.executionMode).toBe(
      "EXTERNAL",
    );
  });

  it("names outside, internal, mixed, and completed execution without a new status", () => {
    expect(
      presentActiveExecutionLabel({ status: "IN_PROGRESS", inProgress: 0, outside: 1 }),
    ).toBe("La furnizor extern");
    expect(
      presentActiveExecutionLabel({ status: "IN_PROGRESS", inProgress: 2, outside: 0 }),
    ).toBe("În lucru");
    expect(
      presentActiveExecutionLabel({ status: "IN_PROGRESS", inProgress: 1, outside: 1 }),
    ).toBe("În lucru · La furnizor extern");
    expect(
      presentActiveExecutionLabel({ status: "COMPLETED", inProgress: 0, outside: 0 }),
    ).toBe("Finalizat");
  });

  it("keeps the frozen provider label after a later rename and skips internal workload and inbox", () => {
    const owner = peopleNamed("Operator CNC", "per:cnc");
    const created = createExternalProductionProvider({
      providerId: provider.providerId,
      name: provider.name,
      createdAt: provider.createdAt,
      createdBy: provider.createdBy,
      existing: [],
    });
    expect(created.ok).toBe(true);
    const record = chain();
    const externalized = must(
      markTaskExternal(record, "task:b", "ENABLED", "owner", "2026-09-26T10:00:00.000Z"),
    );
    const assigned = must(assignExternalProviderToTask(externalized.record, "task:b", provider));
    const outside = must(
      handOffExternalTask(
        completePredecessor(assigned.record),
        "task:b",
        "owner",
        "2026-09-26T11:00:00.000Z",
        provider.name,
      ),
    );
    const renamed = renameExternalProductionProvider([provider], provider.providerId, "Alt nume");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) {
      return;
    }
    const view = projectExecutionPlanView(
      outside.record,
      [owner],
      null,
      null,
      owner.personId,
      workcenterRegistry,
      DISABLED_MATERIAL_READINESS,
      {
        mode: "DISABLED",
        providers: [renamed.provider],
      },
    );
    expect(view.tasks.find((item) => item.taskId === "task:b")?.externalProviderLabel).toBe(
      "Atelier Extern",
    );
    expect(view.tasks.find((item) => item.taskId === "task:b")?.statusLabel).toBe("La furnizor extern");
    expect(view.progress.status).toBe("IN_PROGRESS");
    expect(view.statusLabel).toBe("La furnizor extern");
    expect(view.statusLabel).toBe(presentActiveExecutionLabel(view.progress));
    expect(view.tasks.find((item) => item.taskId === "task:b")?.canClaimStart).toBe(false);
    expect(view.tasks.find((item) => item.taskId === "task:b")?.canRecordExternalReturn).toBe(true);

    const workload = projectPlanningWorkload([{ record: outside.record }]);
    const workloadIds = [
      ...workload.unassigned.map((item) => item.taskId),
      ...workload.providers.flatMap((group) => group.tasks.map((item) => item.taskId)),
    ];
    expect(workloadIds).not.toContain("task:b");

    const inbox = projectOperatorTaskInbox({
      currentOperator: owner,
      people: [owner],
      eligibility: null,
      plans: [{ record: outside.record, snapshot: null, customerDisplayName: null }],
    });
    const inboxIds = [
      ...inbox.inProgressMine,
      ...inbox.availableReady,
      ...inbox.availableNeedsProvider,
      ...inbox.waitingDependencies,
      ...inbox.blockedMaterial,
    ].map((item) => item.taskId);
    expect(inboxIds).not.toContain("task:b");

    const readyForProvider = completePredecessor(externalized.record);
    const attention = deriveJobAttention({
      stage: "EXECUTION_IN_PROGRESS",
      progress: null,
      tasks: projectExecutionPlanView(
        readyForProvider,
        [owner],
        null,
        null,
        null,
        workcenterRegistry,
        DISABLED_MATERIAL_READINESS,
        {
          mode: "ENABLED",
          providers: [],
        },
      ).tasks,
    });
    expect(attention.attentionLabel).toBe("Lipsă furnizor extern");
  });

  it("collides provider names through one canonical key and keeps the display spelling", () => {
    const key = externalProviderNameKey("Atelier Extern");
    expect(externalProviderNameKey("atelier extern")).toBe(key);
    expect(externalProviderNameKey("ATELIER EXTERN")).toBe(key);
    const first = createExternalProductionProvider({
      providerId: "xprov:1",
      name: "Atelier Extern",
      createdAt: "2026-09-26T10:00:00.000Z",
      createdBy: "owner",
      existing: [],
    });
    expect(first).toMatchObject({
      ok: true,
      provider: { name: "Atelier Extern" },
    });
    if (!first.ok) {
      return;
    }
    for (const name of ["atelier extern", "ATELIER EXTERN"]) {
      expect(
        createExternalProductionProvider({
          providerId: "xprov:2",
          name,
          createdAt: "2026-09-26T10:00:00.000Z",
          createdBy: "owner",
          existing: [first.provider],
        }),
      ).toEqual({ ok: false, error: "duplicate_name" });
    }
  });

  it("rejects a duplicate provider name and a new assignment to an inactive provider", () => {
    const first = createExternalProductionProvider({
      providerId: "xprov:1",
      name: "Atelier",
      createdAt: "2026-09-26T10:00:00.000Z",
      createdBy: "owner",
      existing: [],
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(
      createExternalProductionProvider({
        providerId: "xprov:2",
        name: "atelier",
        createdAt: "2026-09-26T10:00:00.000Z",
        createdBy: "owner",
        existing: [first.provider],
      }),
    ).toEqual({ ok: false, error: "duplicate_name" });
    const inactive = setExternalProductionProviderActive([first.provider], first.provider.providerId, false);
    expect(inactive.ok).toBe(true);
  });
});

function completePredecessor(record: ExecutionPlanRecord): ExecutionPlanRecord {
  const owner = peopleNamed("Operator CNC", "per:pred");
  const started = must(
    claimAndStartExecutionTask(record, "task:a", owner.personId, "2026-09-26T10:30:00.000Z", [owner]),
  );
  const fresh = started.record.tasks.find((item) => item.taskId === "task:a");
  return must(
    completeExecutionTask(
      started.record,
      "task:a",
      "2026-09-26T10:40:00.000Z",
      plannedCompletionInput(fresh!),
      owner.personId,
    ),
  ).record;
}
