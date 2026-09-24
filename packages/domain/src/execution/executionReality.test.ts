import { describe, expect, it } from "vitest";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import {
  CUT_SHEET_CNC_ID,
} from "../processes/catalog.js";
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
import { MCH_CNC_4020_ID } from "../workcenters/catalog.js";
import { createPerson, setPersonAvailability, type Person } from "../people/identity.js";
import {
  parseActualDurationMinutes,
  timeVarianceMinutes,
} from "./actualDuration.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  plannedCompletionInput,
  setPlannedEffortOnTask,
  startExecutionTask,
} from "./lifecycle.js";
import { startMachineRun, stopMachineRun } from "./machineRun.js";
import {
  materializeExecutionPlanFromSnapshot,
  projectExecutionPlanView,
  type ExecutionPlanRecord,
} from "./plan.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
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

function taskBySource(record: ExecutionPlanRecord, scope: "FACE" | "BACK", processId: string) {
  const sourceId = compositionNodeId(scope, processId);
  const task = record.tasks.find((item) => item.sourceOperationId === sourceId);
  if (!task) {
    throw new Error(`missing ${scope} ${processId}`);
  }
  return task;
}

function startedMachineTask() {
  const owner = peopleNamed("Operator CNC", "per:cnc");
  const record = planned();
  const task = taskBySource(record, "BACK", CUT_SHEET_CNC_ID);
  const assigned = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
  if (!assigned.ok) {
    throw new Error(assigned.error);
  }
  const withExecutor = assignExecutorToTask(assigned.record, task.taskId, owner.personId, [owner]);
  if (!withExecutor.ok) {
    throw new Error(withExecutor.error);
  }
  const effort = setPlannedEffortOnTask(withExecutor.record, task.taskId, 90);
  if (!effort.ok) {
    throw new Error(effort.error);
  }
  const started = startExecutionTask(
    effort.record,
    task.taskId,
    "2026-08-15T16:00:00.000Z",
    [owner],
  );
  if (!started.ok) {
    throw new Error(started.error);
  }
  return { record: started.record, taskId: task.taskId, owner };
}

describe("actual task duration", () => {
  it("starts unknown and stores an explicit integer without inferring lifecycle time", () => {
    const { record, taskId, owner } = startedMachineTask();
    const fresh = record.tasks.find((item) => item.taskId === taskId);
    expect(fresh?.actualDurationMinutes).toBeNull();
    expect(fresh?.startedAt).toBe("2026-08-15T16:00:00.000Z");

    const completed = completeExecutionTask(
      record,
      taskId,
      "2026-08-15T18:00:00.000Z",
      { ...plannedCompletionInput(fresh!), actualDurationMinutes: 85 },
      owner.personId,
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    const task = completed.record.tasks.find((item) => item.taskId === taskId);
    expect(task?.actualDurationMinutes).toBe(85);
    expect(task?.completedAt).toBe("2026-08-15T18:00:00.000Z");
    expect(timeVarianceMinutes(90, 85)).toBe(-5);

    const omitted = completeExecutionTask(
      record,
      taskId,
      "2026-08-15T18:00:00.000Z",
      plannedCompletionInput(fresh!),
      owner.personId,
    );
    expect(omitted.ok).toBe(true);
    if (!omitted.ok) {
      return;
    }
    expect(omitted.record.tasks.find((item) => item.taskId === taskId)?.actualDurationMinutes).toBeNull();
    expect(parseActualDurationMinutes(-1)).toEqual({ ok: false, error: "invalid_actual_duration" });
    expect(parseActualDurationMinutes(1.5)).toEqual({ ok: false, error: "invalid_actual_duration" });
    expect(timeVarianceMinutes(null, 85)).toBeNull();
    expect(timeVarianceMinutes(90, null)).toBeNull();

    const view = projectExecutionPlanView(completed.record, [owner], null, null, owner.personId);
    const projected = view.tasks.find((item) => item.taskId === taskId);
    expect(projected?.timeVarianceLabel).toBe("Diferență -5 min");
    expect(projected?.actualDurationLabel).toBe("85 min");
    const unknownView = projectExecutionPlanView(record, [owner], null, null, owner.personId);
    expect(unknownView.tasks.find((item) => item.taskId === taskId)?.actualDurationLabel).toBe(
      "Necunoscut",
    );
  });
});

describe("machine runs", () => {
  it("records frozen machine segments and blocks completion while a run is active", () => {
    const { record, taskId, owner } = startedMachineTask();
    const other = peopleNamed("Alt operator", "per:other");
    const plannedTask = planned();
    const plannedId = taskBySource(plannedTask, "BACK", CUT_SHEET_CNC_ID).taskId;
    expect(startMachineRun(plannedTask, plannedId, owner.personId, "2026-08-15T16:01:00.000Z", [owner])).toEqual({
      ok: false,
      error: "machine_run_not_allowed",
    });

    const workcenterRecord: ExecutionPlanRecord = {
      ...record,
      tasks: record.tasks.map((item) =>
        item.taskId === taskId
          ? {
              ...item,
              assignedProvider: { id: "wc:assembly", kind: "WORKCENTER", label: "Asamblare" },
            }
          : item,
      ),
    };
    expect(
      startMachineRun(
        workcenterRecord,
        taskId,
        owner.personId,
        "2026-08-15T16:02:00.000Z",
        [owner],
      ),
    ).toEqual({ ok: false, error: "machine_run_not_allowed" });
    const unassignedRecord: ExecutionPlanRecord = {
      ...record,
      tasks: record.tasks.map((item) =>
        item.taskId === taskId ? { ...item, assignedProvider: null } : item,
      ),
    };
    expect(
      startMachineRun(
        unassignedRecord,
        taskId,
        owner.personId,
        "2026-08-15T16:02:00.000Z",
        [owner],
      ),
    ).toEqual({ ok: false, error: "machine_run_not_allowed" });

    expect(
      startMachineRun(record, taskId, other.personId, "2026-08-15T16:01:00.000Z", [owner, other]),
    ).toEqual({ ok: false, error: "wrong_executor" });
    expect(
      startMachineRun(record, taskId, owner.personId, "2026-08-15T16:01:00.000Z", []),
    ).toEqual({ ok: false, error: "unknown_person" });

    const started = startMachineRun(
      record,
      taskId,
      owner.personId,
      "2026-08-15T16:01:00.000Z",
      [owner],
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const first = started.record.tasks.find((item) => item.taskId === taskId)?.machineRuns[0];
    expect(first?.machineProviderId).toBe(MCH_CNC_4020_ID);
    expect(first?.machineProviderLabel).toBe("CNC 4020");
    expect(first?.startedAt).toBe("2026-08-15T16:01:00.000Z");
    expect(first?.durationMinutes).toBeNull();
    expect(
      startMachineRun(started.record, taskId, owner.personId, "2026-08-15T16:05:00.000Z", [owner]),
    ).toEqual({ ok: false, error: "machine_run_active" });
    expect(
      completeExecutionTask(started.record, taskId, "2026-08-15T17:00:00.000Z", { actualDurationMinutes: 85 }, owner.personId).ok,
    ).toBe(false);

    const stopped = stopMachineRun(
      started.record,
      first!.machineRunId,
      owner.personId,
      "2026-08-15T16:13:00.000Z",
      [owner],
    );
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) {
      return;
    }
    const closed = stopped.record.tasks
      .find((item) => item.taskId === taskId)
      ?.machineRuns[0];
    expect(closed?.durationMinutes).toBe(12);
    expect(stopMachineRun(stopped.record, first!.machineRunId, owner.personId, "2026-08-15T16:20:00.000Z", [owner])).toEqual({
      ok: false,
      error: "machine_run_closed",
    });

    const second = startMachineRun(
      stopped.record,
      taskId,
      owner.personId,
      "2026-08-15T16:20:00.000Z",
      [owner],
    );
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    const secondRun = second.record.tasks.find((item) => item.taskId === taskId)?.machineRuns[1];
    const finished = stopMachineRun(
      second.record,
      secondRun!.machineRunId,
      owner.personId,
      "2026-08-15T16:38:00.000Z",
      [owner],
    );
    expect(finished.ok).toBe(true);
    if (!finished.ok) {
      return;
    }
    const view = projectExecutionPlanView(finished.record, [owner], null, null, owner.personId);
    expect(view.tasks.find((item) => item.taskId === taskId)?.machineRunTotalMinutes).toBe(30);
    const task = finished.record.tasks.find((item) => item.taskId === taskId);
    const done = completeExecutionTask(
      finished.record,
      taskId,
      "2026-08-15T17:00:00.000Z",
      { ...plannedCompletionInput(task!), actualDurationMinutes: 85 },
      owner.personId,
    );
    expect(done.ok).toBe(true);
    if (!done.ok) {
      return;
    }
    const completedTask = done.record.tasks.find((item) => item.taskId === taskId);
    expect(completedTask?.actualDurationMinutes).toBe(85);
    expect(completedTask?.machineRuns[0]?.machineProviderLabel).toBe("CNC 4020");
  });

  it("lets the assigned operator close an active run after becoming unavailable", () => {
    const { record, taskId, owner } = startedMachineTask();
    const other = peopleNamed("Alt operator", "per:other-away");
    const started = startMachineRun(
      record,
      taskId,
      owner.personId,
      "2026-08-15T16:01:00.000Z",
      [owner],
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const away = setPersonAvailability(owner, {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
    });
    expect(away.ok).toBe(true);
    if (!away.ok) {
      return;
    }
    const run = started.record.tasks.find((item) => item.taskId === taskId)?.machineRuns[0];
    expect(
      stopMachineRun(started.record, run!.machineRunId, other.personId, "2026-08-15T16:13:00.000Z", [away.person, other]),
    ).toEqual({ ok: false, error: "wrong_executor" });
    const stopped = stopMachineRun(
      started.record,
      run!.machineRunId,
      away.person.personId,
      "2026-08-15T16:13:00.000Z",
      [away.person],
    );
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) {
      return;
    }
    const closed = stopped.record.tasks.find((item) => item.taskId === taskId)?.machineRuns[0];
    expect(closed?.machineProviderLabel).toBe("CNC 4020");
    expect(closed?.startedByOperatorId).toBe(owner.personId);
    expect(closed?.completedByOperatorId).toBe(owner.personId);
    expect(closed?.durationMinutes).toBe(12);
    expect(
      startMachineRun(stopped.record, taskId, away.person.personId, "2026-08-15T16:20:00.000Z", [away.person]),
    ).toEqual({ ok: false, error: "unavailable_person" });
    const task = stopped.record.tasks.find((item) => item.taskId === taskId);
    const done = completeExecutionTask(
      stopped.record,
      taskId,
      "2026-08-15T17:00:00.000Z",
      { ...plannedCompletionInput(task!), actualDurationMinutes: 85 },
      away.person.personId,
    );
    expect(done.ok).toBe(true);
  });
});
