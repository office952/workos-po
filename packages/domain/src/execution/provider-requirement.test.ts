import { describe, expect, it } from "vitest";
import { createPerson } from "../people/identity.js";
import {
  CUT_SHEET_CNC_ID,
  INSPECT_FINISHED_LETTER_ID,
  PACK_PRODUCT_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  frozenProviderRequirement,
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
import { MCH_CNC_4020_ID, WC_ASSEMBLY_01_ID } from "../workcenters/catalog.js";
import {
  assignExecutorToTask,
  assignProviderToTask,
  startExecutionTask,
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
    { createdAt: "2026-08-17T04:00:00.000Z" },
  );
  return materializeExecutionPlanFromSnapshot(snapshot, {
    createdAt: "2026-08-17T04:05:00.000Z",
  });
}

function person() {
  const created = createPerson("Executor test");
  if (!created.ok) {
    throw new Error("expected person");
  }
  return created.person;
}

describe("provider requirement start gate", () => {
  it("defaults historical records without the field to provider required", () => {
    expect(frozenProviderRequirement(undefined)).toBe("REQUIRED");
  });

  it("blocks a provider-required task until both provider and executor exist", () => {
    const record = planned();
    const people = [person()];
    const cnc = record.tasks.find(
      (item) => item.sourceOperationId === compositionNodeId("BACK", CUT_SHEET_CNC_ID),
    );
    if (!cnc) {
      throw new Error("missing CNC");
    }
    const executorOnly = assignExecutorToTask(record, cnc.taskId, people[0]!.personId, people);
    if (!executorOnly.ok) {
      throw new Error("expected executor");
    }
    expect(
      startExecutionTask(executorOnly.record, cnc.taskId, "2026-08-17T04:10:00.000Z", people),
    ).toEqual({ ok: false, error: "missing_assignment" });
    const providerOnly = assignProviderToTask(record, cnc.taskId, MCH_CNC_4020_ID);
    if (!providerOnly.ok) {
      throw new Error("expected provider");
    }
    expect(
      startExecutionTask(providerOnly.record, cnc.taskId, "2026-08-17T04:11:00.000Z", people),
    ).toEqual({ ok: false, error: "missing_executor" });
    const ready = assignExecutorToTask(
      providerOnly.record,
      cnc.taskId,
      people[0]!.personId,
      people,
    );
    if (!ready.ok) {
      throw new Error("expected both");
    }
    expect(
      startExecutionTask(ready.record, cnc.taskId, "2026-08-17T04:12:00.000Z", people).ok,
    ).toBe(true);
  });

  it("lets a manual task start with an executor and no provider", () => {
    const record = planned();
    const people = [person()];
    const uniformity = record.tasks.find(
      (item) => item.processId === TEST_ILLUMINATION_UNIFORMITY_ID,
    );
    if (!uniformity) {
      throw new Error("missing uniformity");
    }
    expect(
      startExecutionTask(record, uniformity.taskId, "2026-08-17T04:13:00.000Z", people),
    ).toEqual({ ok: false, error: "missing_executor" });
    expect(assignProviderToTask(record, uniformity.taskId, WC_ASSEMBLY_01_ID)).toEqual({
      ok: false,
      error: "ineligible_provider",
    });
    const assigned = assignExecutorToTask(
      record,
      uniformity.taskId,
      people[0]!.personId,
      people,
    );
    if (!assigned.ok) {
      throw new Error("expected executor");
    }
    expect(
      startExecutionTask(assigned.record, uniformity.taskId, "2026-08-17T04:14:00.000Z", people),
    ).toEqual({ ok: false, error: "dependencies_incomplete" });
    const view = projectExecutionPlanView(assigned.record, people);
    const task = view.tasks.find((item) => item.taskId === uniformity.taskId);
    expect(task?.requiresProvider).toBe(false);
    expect(task?.canAssign).toBe(false);
    expect(task?.assignedProvider).toBeNull();
    expect(view.progress.noProvider).toBe(0);
  });

  it("keeps inspect and pack blocked by dependencies even after executor assignment", () => {
    const record = planned();
    const people = [person()];
    const inspect = record.tasks.find((item) => item.processId === INSPECT_FINISHED_LETTER_ID);
    const pack = record.tasks.find((item) => item.processId === PACK_PRODUCT_ID);
    if (!inspect || !pack) {
      throw new Error("missing manual tasks");
    }
    const withInspect = assignExecutorToTask(record, inspect.taskId, people[0]!.personId, people);
    if (!withInspect.ok) {
      throw new Error("expected inspect executor");
    }
    const withPack = assignExecutorToTask(
      withInspect.record,
      pack.taskId,
      people[0]!.personId,
      people,
    );
    if (!withPack.ok) {
      throw new Error("expected pack executor");
    }
    expect(
      startExecutionTask(withPack.record, inspect.taskId, "2026-08-17T04:15:00.000Z", people),
    ).toEqual({ ok: false, error: "dependencies_incomplete" });
    expect(
      startExecutionTask(withPack.record, pack.taskId, "2026-08-17T04:16:00.000Z", people),
    ).toEqual({ ok: false, error: "dependencies_incomplete" });
  });
});
