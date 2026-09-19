import {
  CUT_SHEET_CNC_ID,
  composeProductProcessesFromTruth,
  compileAggregate,
  compileDefinition,
  compileEic,
  confirmReviewedDefinition,
  freezeAcceptedProductionSnapshot,
  materializeExecutionPlanFromSnapshot,
  seededDisplayLabelCatalog,
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
  type ExecutionPlanRecord,
} from "@workos-final/domain";

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

export function materializeCanonicalLettersPlan(
  inscription = "WORKOS",
): ExecutionPlanRecord {
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
    { createdAt: "2026-08-15T14:00:00.000Z" },
  );
  return materializeExecutionPlanFromSnapshot(snapshot, {
    createdAt: "2026-08-15T15:00:00.000Z",
  });
}

export function faceCncTaskId(record: ExecutionPlanRecord): string {
  const task = record.tasks.find(
    (item) => item.processId === CUT_SHEET_CNC_ID && item.scope === "FACE",
  );
  if (!task) {
    throw new Error("missing FACE CNC task");
  }
  return task.taskId;
}

export function taskIdForProcess(
  record: ExecutionPlanRecord,
  processId: string,
): string {
  const task = record.tasks.find((item) => item.processId === processId);
  if (!task) {
    throw new Error(`missing process ${processId}`);
  }
  return task.taskId;
}

export function backCncTaskId(record: ExecutionPlanRecord): string {
  const task = record.tasks.find(
    (item) => item.processId === CUT_SHEET_CNC_ID && item.scope === "BACK",
  );
  if (!task) {
    throw new Error("missing BACK CNC task");
  }
  return task.taskId;
}
