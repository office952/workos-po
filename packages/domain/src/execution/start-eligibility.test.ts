import { describe, expect, it } from "vitest";
import { assignPersonSkill, retirePersonSkill } from "../people/assignment.js";
import { createPerson, setPersonAvailability, type Person } from "../people/identity.js";
import { createSkill } from "../people/skills.js";
import type { PeopleEligibilityContext } from "../people/eligibility.js";
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
import { MCH_CNC_4020_ID } from "../workcenters/catalog.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  completeExecutionTask,
  plannedCompletionInput,
  startExecutionTask,
} from "./lifecycle.js";
import {
  materializeExecutionPlanFromSnapshot,
  projectExecutionPlanView,
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
  );
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  const snapshot = freezeAcceptedProductionSnapshot(
    truth,
    aggregate,
    composition,
    compileEic(aggregate, composition),
    { createdAt: "2026-08-17T14:00:00.000Z" },
  );
  return materializeExecutionPlanFromSnapshot(snapshot, {
    createdAt: "2026-08-17T15:00:00.000Z",
  });
}

function cncOperator(name: string, personId: string) {
  const created = createPerson(name, { personId });
  const skill = createSkill({
    code: "SK_CNC_OPERATOR",
    displayLabel: "CNC",
    skillId: "skl:cnc",
  });
  if (!created.ok || !skill.ok) {
    throw new Error("expected person and skill");
  }
  const assigned = assignPersonSkill({
    personId: created.person.personId,
    skillId: skill.skill.skillId,
    personStatus: "ACTIVE",
    skillStatus: "ACTIVE",
    existing: [],
  });
  if (!assigned.ok) {
    throw new Error("expected skill assignment");
  }
  const eligibility: PeopleEligibilityContext = {
    skills: [skill.skill],
    assignments: [assigned.assignment],
    requirements: [{ capabilityId: "CNC_ROUTING", skillId: skill.skill.skillId }],
  };
  return { person: created.person, skill: skill.skill, assignment: assigned.assignment, eligibility };
}

function backCncTask(record: ReturnType<typeof planned>) {
  const sourceId = compositionNodeId("BACK", CUT_SHEET_CNC_ID);
  const task = record.tasks.find((item) => item.sourceOperationId === sourceId);
  if (!task) {
    throw new Error("missing back CNC");
  }
  return task;
}

function readyCncTask(person: Person, eligibility: PeopleEligibilityContext) {
  const record = planned();
  const task = backCncTask(record);
  const withProvider = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
  if (!withProvider.ok) {
    throw new Error("expected provider");
  }
  const assigned = assignExecutorToTask(
    withProvider.record,
    task.taskId,
    person.personId,
    [person],
    eligibility,
  );
  if (!assigned.ok) {
    throw new Error(assigned.error);
  }
  return { record: assigned.record, taskId: task.taskId };
}

describe("planned start current eligibility", () => {
  it("blocks start when the assigned executor becomes temporarily unavailable", () => {
    const setup = cncOperator("Florin CNC", "per:florin");
    const ready = readyCncTask(setup.person, setup.eligibility);
    const away = setPersonAvailability(setup.person, {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
    });
    expect(away.ok).toBe(true);
    if (!away.ok) {
      return;
    }
    const view = projectExecutionPlanView(
      ready.record,
      [away.person],
      null,
      setup.eligibility,
    );
    const projected = view.tasks.find((item) => item.taskId === ready.taskId);
    expect(projected?.assignedExecutor?.id).toBe("per:florin");
    expect(projected?.canStart).toBe(false);
    expect(projected?.startBlockReason).toBe("unavailable_person");
    expect(
      startExecutionTask(
        ready.record,
        ready.taskId,
        "2026-08-17T16:00:00.000Z",
        [away.person],
        setup.eligibility,
      ),
    ).toEqual({ ok: false, error: "unavailable_person" });

    const returned = setPersonAvailability(away.person, { availability: "AVAILABLE" });
    expect(returned.ok).toBe(true);
    if (!returned.ok) {
      return;
    }
    const restored = projectExecutionPlanView(
      ready.record,
      [returned.person],
      null,
      setup.eligibility,
      returned.person.personId,
    );
    expect(restored.tasks.find((item) => item.taskId === ready.taskId)?.canStart).toBe(true);
    expect(
      startExecutionTask(
        ready.record,
        ready.taskId,
        "2026-08-17T16:05:00.000Z",
        [returned.person],
        setup.eligibility,
      ).ok,
    ).toBe(true);
  });

  it("blocks start when the assigned executor loses the required skill", () => {
    const setup = cncOperator("Andrei Goghi", "per:andrei");
    const ready = readyCncTask(setup.person, setup.eligibility);
    const retired = retirePersonSkill(setup.assignment, "2026-08-17T16:10:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    const eligibility: PeopleEligibilityContext = {
      ...setup.eligibility,
      assignments: [retired.assignment],
    };
    const view = projectExecutionPlanView(ready.record, [setup.person], null, eligibility);
    const projected = view.tasks.find((item) => item.taskId === ready.taskId);
    expect(projected?.assignedExecutor?.id).toBe("per:andrei");
    expect(projected?.canStart).toBe(false);
    expect(projected?.startBlockReason).toBe("ineligible_executor");
    expect(
      startExecutionTask(
        ready.record,
        ready.taskId,
        "2026-08-17T16:11:00.000Z",
        [setup.person],
        eligibility,
      ),
    ).toEqual({ ok: false, error: "ineligible_executor" });
  });

  it("keeps IN_PROGRESS history when the executor later becomes unavailable", () => {
    const setup = cncOperator("Florin CNC", "per:florin-ip");
    const ready = readyCncTask(setup.person, setup.eligibility);
    const started = startExecutionTask(
      ready.record,
      ready.taskId,
      "2026-08-17T16:20:00.000Z",
      [setup.person],
      setup.eligibility,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const away = setPersonAvailability(setup.person, {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
    });
    expect(away.ok).toBe(true);
    if (!away.ok) {
      return;
    }
    const task = started.record.tasks.find((item) => item.taskId === ready.taskId);
    expect(task?.status).toBe("IN_PROGRESS");
    expect(task?.assignedExecutor?.id).toBe("per:florin-ip");
    expect(task?.startedAt).toBe("2026-08-17T16:20:00.000Z");
    const view = projectExecutionPlanView(
      started.record,
      [away.person],
      null,
      setup.eligibility,
      away.person.personId,
    );
    expect(view.tasks.find((item) => item.taskId === ready.taskId)?.canComplete).toBe(true);
    const completed = completeExecutionTask(
      started.record,
      ready.taskId,
      "2026-08-17T16:30:00.000Z",
      plannedCompletionInput(task!),
    );
    expect(completed.ok).toBe(true);
  });

  it("keeps IN_PROGRESS history when the executor later loses the skill", () => {
    const setup = cncOperator("Andrei Goghi", "per:andrei-ip");
    const ready = readyCncTask(setup.person, setup.eligibility);
    const started = startExecutionTask(
      ready.record,
      ready.taskId,
      "2026-08-17T16:40:00.000Z",
      [setup.person],
      setup.eligibility,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const retired = retirePersonSkill(setup.assignment, "2026-08-17T16:41:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    const task = started.record.tasks.find((item) => item.taskId === ready.taskId);
    expect(task?.status).toBe("IN_PROGRESS");
    expect(task?.assignedExecutor?.id).toBe("per:andrei-ip");
    const completed = completeExecutionTask(
      started.record,
      ready.taskId,
      "2026-08-17T16:50:00.000Z",
      plannedCompletionInput(task!),
    );
    expect(completed.ok).toBe(true);
  });

  it("still requires a provider even when the person is skill-eligible", () => {
    const setup = cncOperator("Florin CNC", "per:florin-provider");
    const record = planned();
    const task = backCncTask(record);
    const assigned = assignExecutorToTask(
      record,
      task.taskId,
      setup.person.personId,
      [setup.person],
      setup.eligibility,
    );
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) {
      return;
    }
    expect(
      startExecutionTask(
        assigned.record,
        task.taskId,
        "2026-08-17T17:00:00.000Z",
        [setup.person],
        setup.eligibility,
      ),
    ).toEqual({ ok: false, error: "missing_assignment" });
    const view = projectExecutionPlanView(
      assigned.record,
      [setup.person],
      null,
      setup.eligibility,
    );
    expect(view.tasks.find((item) => item.taskId === task.taskId)?.canStart).toBe(false);
    expect(view.tasks.find((item) => item.taskId === task.taskId)?.requiresProvider).toBe(true);
  });
});
