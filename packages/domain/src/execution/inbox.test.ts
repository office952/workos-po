import { describe, expect, it } from "vitest";
import { assignPersonSkill, retirePersonSkill } from "../people/assignment.js";
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
  assignExecutorToTask,
  assignProviderToTask,
  claimAndStartExecutionTask,
} from "./lifecycle.js";
import { projectOperatorTaskInbox } from "./inbox.js";
import { materializeExecutionPlanFromSnapshot } from "./plan.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function planned(inscription: string, createdAt: string) {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: { ...readyValues, "root.inscription": inscription },
    },
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
    { createdAt },
  );
  return {
    record: materializeExecutionPlanFromSnapshot(snapshot, { createdAt }),
    snapshot,
  };
}

function cncPeople() {
  const florin = createPerson("Florin CNC", { personId: "per:florin" });
  const andrei = createPerson("Andrei Goghi", { personId: "per:andrei" });
  const calin = createPerson("Calin Cimpean", { personId: "per:calin" });
  const skill = createSkill({
    code: "SK_CNC_OPERATOR",
    displayLabel: "CNC",
    skillId: "skl:cnc",
  });
  if (!florin.ok || !andrei.ok || !calin.ok || !skill.ok) {
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
    calin: calin.person,
    skill: skill.skill,
    fAssign: fAssign.assignment,
    aAssign: aAssign.assignment,
    people: [florin.person, andrei.person, calin.person],
    eligibility,
  };
}

function backCnc(record: ReturnType<typeof planned>["record"]) {
  const sourceId = compositionNodeId("BACK", CUT_SHEET_CNC_ID);
  const task = record.tasks.find((item) => item.sourceOperationId === sourceId);
  if (!task) {
    throw new Error("missing back CNC");
  }
  return task;
}

describe("projectOperatorTaskInbox", () => {
  it("projects ready CNC work across two plans for Florin only", () => {
    const setup = cncPeople();
    const jobA = planned("JOB-A", "2026-08-17T10:00:00.000Z");
    const jobB = planned("JOB-B", "2026-08-17T11:00:00.000Z");
    const withA = assignProviderToTask(jobA.record, backCnc(jobA.record).taskId, MCH_CNC_4020_ID);
    const withB = assignProviderToTask(jobB.record, backCnc(jobB.record).taskId, MCH_CNC_4020_ID);
    expect(withA.ok && withB.ok).toBe(true);
    if (!withA.ok || !withB.ok) {
      return;
    }

    const florinInbox = projectOperatorTaskInbox({
      currentOperator: setup.florin,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [
        { record: withA.record, snapshot: jobA.snapshot, customerDisplayName: "Client A" },
        { record: withB.record, snapshot: jobB.snapshot, customerDisplayName: "Client B" },
      ],
    });
    expect(florinInbox.availableReady.map((item) => item.inscription).sort()).toEqual([
      "JOB-A",
      "JOB-B",
    ]);
    expect(florinInbox.availableReady.every((item) => item.canClaimStart)).toBe(true);

    const calinInbox = projectOperatorTaskInbox({
      currentOperator: setup.calin,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [
        { record: withA.record, snapshot: jobA.snapshot, customerDisplayName: "Client A" },
        { record: withB.record, snapshot: jobB.snapshot, customerDisplayName: "Client B" },
      ],
    });
    expect(calinInbox.availableReady).toEqual([]);
    expect(calinInbox.availableNeedsProvider).toEqual([]);
  });

  it("separates provider-needed and waiting dependencies", () => {
    const setup = cncPeople();
    const job = planned("NEED-PROV", "2026-08-17T12:00:00.000Z");
    const inbox = projectOperatorTaskInbox({
      currentOperator: setup.florin,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [{ record: job.record, snapshot: job.snapshot, customerDisplayName: null }],
    });
    const back = inbox.availableNeedsProvider.find((item) => item.processLabel.includes("CNC"));
    expect(back).toBeTruthy();
    expect(back?.canClaimStart).toBe(false);
    expect(inbox.availableReady).toEqual([]);
  });

  it("keeps in-progress mine after claim and hides it from Andrei", () => {
    const setup = cncPeople();
    const job = planned("CLAIMED", "2026-08-17T13:00:00.000Z");
    const withProvider = assignProviderToTask(
      job.record,
      backCnc(job.record).taskId,
      MCH_CNC_4020_ID,
    );
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const claimed = claimAndStartExecutionTask(
      withProvider.record,
      backCnc(job.record).taskId,
      setup.florin.personId,
      "2026-08-17T14:00:00.000Z",
      setup.people,
      setup.eligibility,
    );
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
      return;
    }

    const florinInbox = projectOperatorTaskInbox({
      currentOperator: setup.florin,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [{ record: claimed.record, snapshot: job.snapshot, customerDisplayName: "Client" }],
    });
    expect(florinInbox.inProgressMine).toHaveLength(1);
    expect(florinInbox.availableReady).toEqual([]);

    const andreiInbox = projectOperatorTaskInbox({
      currentOperator: setup.andrei,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [{ record: claimed.record, snapshot: job.snapshot, customerDisplayName: "Client" }],
    });
    expect(andreiInbox.inProgressMine).toEqual([]);
    expect(andreiInbox.availableReady.find((item) => item.inscription === "CLAIMED")).toBeUndefined();
  });

  it("excludes unavailable operators from claimable lanes but keeps their in-progress work", () => {
    const setup = cncPeople();
    const job = planned("AWAY", "2026-08-17T15:00:00.000Z");
    const withProvider = assignProviderToTask(
      job.record,
      backCnc(job.record).taskId,
      MCH_CNC_4020_ID,
    );
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const claimed = claimAndStartExecutionTask(
      withProvider.record,
      backCnc(job.record).taskId,
      setup.florin.personId,
      "2026-08-17T15:30:00.000Z",
      setup.people,
      setup.eligibility,
    );
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) {
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
    const second = planned("NEXT", "2026-08-17T16:00:00.000Z");
    const secondReady = assignProviderToTask(
      second.record,
      backCnc(second.record).taskId,
      MCH_CNC_4020_ID,
    );
    expect(secondReady.ok).toBe(true);
    if (!secondReady.ok) {
      return;
    }
    const inbox = projectOperatorTaskInbox({
      currentOperator: away.person,
      people: [away.person, setup.andrei, setup.calin],
      eligibility: setup.eligibility,
      plans: [
        { record: claimed.record, snapshot: job.snapshot, customerDisplayName: null },
        { record: secondReady.record, snapshot: second.snapshot, customerDisplayName: null },
      ],
    });
    expect(inbox.inProgressMine).toHaveLength(1);
    expect(inbox.availableReady).toEqual([]);
    expect(inbox.availableNeedsProvider).toEqual([]);
  });

  it("drops available work when the skill is retired", () => {
    const setup = cncPeople();
    const job = planned("SKILL", "2026-08-17T17:00:00.000Z");
    const withProvider = assignProviderToTask(
      job.record,
      backCnc(job.record).taskId,
      MCH_CNC_4020_ID,
    );
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const retired = retirePersonSkill(setup.fAssign, "2026-08-17T17:30:00.000Z");
    expect(retired.ok).toBe(true);
    if (!retired.ok) {
      return;
    }
    const eligibility: PeopleEligibilityContext = {
      skills: [setup.skill],
      assignments: [retired.assignment, setup.aAssign],
      requirements: setup.eligibility.requirements,
    };
    const inbox = projectOperatorTaskInbox({
      currentOperator: setup.florin,
      people: setup.people,
      eligibility,
      plans: [
        { record: withProvider.record, snapshot: job.snapshot, customerDisplayName: null },
      ],
    });
    expect(inbox.availableReady).toEqual([]);
  });

  it("does not show work reserved for another person as claimable", () => {
    const setup = cncPeople();
    const job = planned("RESERVED", "2026-08-17T18:00:00.000Z");
    const withProvider = assignProviderToTask(
      job.record,
      backCnc(job.record).taskId,
      MCH_CNC_4020_ID,
    );
    expect(withProvider.ok).toBe(true);
    if (!withProvider.ok) {
      return;
    }
    const reserved = assignExecutorToTask(
      withProvider.record,
      backCnc(job.record).taskId,
      setup.andrei.personId,
      setup.people,
      setup.eligibility,
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) {
      return;
    }
    const reservedTaskId = backCnc(job.record).taskId;
    const florinInbox = projectOperatorTaskInbox({
      currentOperator: setup.florin,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [
        { record: reserved.record, snapshot: job.snapshot, customerDisplayName: null },
      ],
    });
    const florinTaskIds = [
      ...florinInbox.availableReady,
      ...florinInbox.availableNeedsProvider,
      ...florinInbox.waitingDependencies,
      ...florinInbox.inProgressMine,
    ].map((item) => item.taskId);
    expect(florinTaskIds).not.toContain(reservedTaskId);
    expect(florinInbox.availableReady.find((item) => item.taskId === reservedTaskId)).toBeUndefined();

    const andreiInbox = projectOperatorTaskInbox({
      currentOperator: setup.andrei,
      people: setup.people,
      eligibility: setup.eligibility,
      plans: [
        { record: reserved.record, snapshot: job.snapshot, customerDisplayName: null },
      ],
    });
    const andreiReserved = andreiInbox.availableReady.find((item) => item.taskId === reservedTaskId);
    expect(andreiReserved?.reservedForLabel).toBe("Andrei Goghi");
    expect(andreiReserved?.canClaimStart).toBe(true);
  });
});
