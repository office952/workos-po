import { describe, expect, it } from "vitest";
import { assignPersonSkill } from "../people/assignment.js";
import { createPerson, setPersonAvailability } from "../people/identity.js";
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
  assignProviderToTask,
  claimAndStartExecutionTask,
  completeExecutionTask,
  plannedCompletionInput,
} from "./lifecycle.js";
import { materializeExecutionPlanFromSnapshot, projectExecutionPlanView } from "./plan.js";

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

function cncPeople() {
  const florin = createPerson("Florin CNC", { personId: "per:florin" });
  const andrei = createPerson("Andrei Goghi", { personId: "per:andrei" });
  const skill = createSkill({
    code: "SK_CNC_OPERATOR",
    displayLabel: "CNC",
    skillId: "skl:cnc",
  });
  if (!florin.ok || !andrei.ok || !skill.ok) {
    throw new Error("setup");
  }
  const fAssign = assignPersonSkill({
    personId: florin.person.personId,
    skillId: skill.skill.skillId,
    personStatus: "ACTIVE",
    skillStatus: "ACTIVE",
    existing: [],
  });
  const aAssign = assignPersonSkill({
    personId: andrei.person.personId,
    skillId: skill.skill.skillId,
    personStatus: "ACTIVE",
    skillStatus: "ACTIVE",
    existing: fAssign.ok ? [fAssign.assignment] : [],
  });
  if (!fAssign.ok || !aAssign.ok) {
    throw new Error("assign");
  }
  const eligibility: PeopleEligibilityContext = {
    skills: [skill.skill],
    assignments: [fAssign.assignment, aAssign.assignment],
    requirements: [{ capabilityId: "CNC_ROUTING", skillId: skill.skill.skillId }],
  };
  return {
    florin: florin.person,
    andrei: andrei.person,
    people: [florin.person, andrei.person],
    eligibility,
  };
}

function backCnc(record: ReturnType<typeof planned>) {
  const sourceId = compositionNodeId("BACK", CUT_SHEET_CNC_ID);
  const task = record.tasks.find((item) => item.sourceOperationId === sourceId);
  if (!task) {
    throw new Error("missing back CNC");
  }
  return task;
}

describe("claimAndStartExecutionTask", () => {
  it("claims and starts an empty PLANNED task atomically", () => {
    const setup = cncPeople();
    const record = planned();
    const task = backCnc(record);
    const withProvider = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const claimed = claimAndStartExecutionTask(
      withProvider.record,
      task.taskId,
      setup.florin.personId,
      "2026-08-17T16:00:00.000Z",
      setup.people,
      setup.eligibility,
    );
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }
    const next = claimed.record.tasks.find((item) => item.taskId === task.taskId);
    expect(next?.status).toBe("IN_PROGRESS");
    expect(next?.assignedExecutor).toEqual({
      id: "per:florin",
      label: "Florin CNC",
    });
    expect(next?.startedAt).toBe("2026-08-17T16:00:00.000Z");
  });

  it("does not claim when provider is missing", () => {
    const setup = cncPeople();
    const record = planned();
    const task = backCnc(record);
    expect(
      claimAndStartExecutionTask(
        record,
        task.taskId,
        setup.florin.personId,
        "2026-08-17T16:00:00.000Z",
        setup.people,
        setup.eligibility,
      ),
    ).toEqual({ ok: false, error: "missing_assignment" });
    expect(record.tasks.find((item) => item.taskId === task.taskId)?.assignedExecutor).toBeNull();
  });

  it("does not claim when the person is temporarily unavailable", () => {
    const setup = cncPeople();
    const record = planned();
    const task = backCnc(record);
    const withProvider = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const away = setPersonAvailability(setup.florin, {
      availability: "TEMPORARILY_UNAVAILABLE",
      reason: "Concediu",
    });
    expect(away.ok).toBe(true);
    if (!away.ok) {
      return;
    }
    expect(
      claimAndStartExecutionTask(
        withProvider.record,
        task.taskId,
        setup.florin.personId,
        "2026-08-17T16:00:00.000Z",
        [away.person, setup.andrei],
        setup.eligibility,
      ),
    ).toEqual({ ok: false, error: "unavailable_person" });
  });

  it("rejects a second person after the first claim", () => {
    const setup = cncPeople();
    const record = planned();
    const task = backCnc(record);
    const withProvider = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const first = claimAndStartExecutionTask(
      withProvider.record,
      task.taskId,
      setup.florin.personId,
      "2026-08-17T16:00:00.000Z",
      setup.people,
      setup.eligibility,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(
      claimAndStartExecutionTask(
        first.record,
        task.taskId,
        setup.andrei.personId,
        "2026-08-17T16:00:01.000Z",
        setup.people,
        setup.eligibility,
      ),
    ).toEqual({ ok: false, error: "already_started_by_other" });
  });

  it("blocks complete for a different current operator", () => {
    const setup = cncPeople();
    const record = planned();
    const task = backCnc(record);
    const withProvider = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const started = claimAndStartExecutionTask(
      withProvider.record,
      task.taskId,
      setup.florin.personId,
      "2026-08-17T16:00:00.000Z",
      setup.people,
      setup.eligibility,
    );
    expect(started.ok).toBe(true);
    if (!started.ok) {
      return;
    }
    const startedTask = started.record.tasks.find((item) => item.taskId === task.taskId)!;
    expect(
      completeExecutionTask(
        started.record,
        task.taskId,
        "2026-08-17T16:30:00.000Z",
        plannedCompletionInput(startedTask),
        setup.andrei.personId,
      ),
    ).toEqual({ ok: false, error: "wrong_executor" });
    expect(
      completeExecutionTask(
        started.record,
        task.taskId,
        "2026-08-17T16:30:00.000Z",
        plannedCompletionInput(startedTask),
        setup.florin.personId,
      ).ok,
    ).toBe(true);
  });

  it("projects claim readiness for the current operator without preassignment", () => {
    const setup = cncPeople();
    const record = planned();
    const task = backCnc(record);
    const withProvider = assignProviderToTask(record, task.taskId, MCH_CNC_4020_ID);
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const view = projectExecutionPlanView(
      withProvider.record,
      setup.people,
      null,
      setup.eligibility,
      setup.florin.personId,
    );
    const projected = view.tasks.find((item) => item.taskId === task.taskId);
    expect(projected?.canAssignExecutor).toBe(false);
    expect(projected?.canClaimStart).toBe(true);
    expect(projected?.operatorRelation).toBe("can_claim");
  });
});
