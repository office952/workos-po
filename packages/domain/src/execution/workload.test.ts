import { describe, expect, it } from "vitest";
import { assignProviderToTask } from "./lifecycle.js";
import { materializeExecutionPlanFromSnapshot } from "./plan.js";
import { compareWorkloadDisplayOrder, projectPlanningWorkload } from "./workload.js";
import { starterFormulaVersionsForType } from "../product/resolveFormulas.js";
import {
  composeProductProcessesFromTruth,
} from "../processes/composition.js";
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
import {
  MCH_CNC_4020_ID,
  WC_ASSEMBLY_01_ID,
  createWorkcenterRegistry,
} from "../workcenters/catalog.js";

const readyValues: DraftValues = {
  "root.inscription": "ALPHA DEMO",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function plannedRecord() {
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

describe("projectPlanningWorkload", () => {
  it("sums known minutes on the exact assigned provider and keeps UNKNOWN separate", () => {
    const record = plannedRecord();
    const cnc = record.tasks.find((task) => task.requiredCapabilityId === "CNC_ROUTING");
    if (!cnc) {
      throw new Error("expected CNC task");
    }
    const assigned = assignProviderToTask(record, cnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error(assigned.error);
    }
    const withEffort = {
      ...assigned.record,
      tasks: assigned.record.tasks.map((task) => {
        if (task.taskId !== cnc.taskId) {
          return task;
        }
        return { ...task, plannedEffortMinutes: 45 };
      }),
    };
    const projection = projectPlanningWorkload([{ record: withEffort, jobId: "ord:1" }]);
    const machine = projection.providers.find((item) => item.provider.id === MCH_CNC_4020_ID);
    expect(machine?.knownQueuedMinutes).toBe(45);
    expect(machine?.unknownEffortCount).toBe(0);
    expect(machine?.tasks).toHaveLength(1);
    expect(projection.unassigned.some((item) => item.taskId === cnc.taskId)).toBe(false);
  });

  it("does not roll machine load into the parent workcenter", () => {
    const record = plannedRecord();
    const cnc = record.tasks.find((task) => task.requiredCapabilityId === "CNC_ROUTING");
    if (!cnc) {
      throw new Error("expected CNC task");
    }
    const assigned = assignProviderToTask(record, cnc.taskId, MCH_CNC_4020_ID);
    if (!assigned.ok) {
      throw new Error(assigned.error);
    }
    const withEffort = {
      ...assigned.record,
      tasks: assigned.record.tasks.map((task) =>
        task.taskId === cnc.taskId ? { ...task, plannedEffortMinutes: 135 } : task,
      ),
    };
    const projection = projectPlanningWorkload([{ record: withEffort }]);
    const zone = projection.providers.find((item) => item.provider.id === "WC_CNC_ROUTING");
    const machine = projection.providers.find((item) => item.provider.id === MCH_CNC_4020_ID);
    expect(machine?.knownQueuedMinutes).toBe(135);
    expect(zone?.knownQueuedMinutes ?? 0).toBe(0);
    expect(zone?.tasks ?? []).toEqual([]);
  });

  it("excludes completed tasks and counts IN_PROGRESS", () => {
    const record = plannedRecord();
    const cnc = record.tasks.find((task) => task.requiredCapabilityId === "CNC_ROUTING");
    const other = record.tasks.find(
      (task) => task.taskId !== cnc?.taskId && task.requiredCapabilityId === "CNC_ROUTING",
    );
    if (!cnc) {
      throw new Error("expected CNC task");
    }
    let next = assignProviderToTask(record, cnc.taskId, MCH_CNC_4020_ID);
    if (!next.ok) {
      throw new Error(next.error);
    }
    if (other) {
      next = assignProviderToTask(next.record, other.taskId, MCH_CNC_4020_ID);
      if (!next.ok) {
        throw new Error(next.error);
      }
    }
    const mutated = {
      ...next.record,
      tasks: next.record.tasks.map((task) => {
        if (task.taskId === cnc.taskId) {
          return { ...task, status: "IN_PROGRESS" as const, plannedEffortMinutes: 45 };
        }
        if (other && task.taskId === other.taskId) {
          return { ...task, status: "COMPLETED" as const, plannedEffortMinutes: 90 };
        }
        return task;
      }),
    };
    const projection = projectPlanningWorkload([{ record: mutated }]);
    const machine = projection.providers.find((item) => item.provider.id === MCH_CNC_4020_ID);
    expect(machine?.knownQueuedMinutes).toBe(45);
    expect(machine?.tasks.map((item) => item.taskId)).toEqual([cnc.taskId]);
  });

  it("lists unassigned provider-required tasks separately", () => {
    const record = plannedRecord();
    const projection = projectPlanningWorkload([{ record }]);
    expect(projection.unassigned.length).toBeGreaterThan(0);
    expect(projection.unassigned.every((item) => item.requiresProvider)).toBe(true);
    expect(projection.unassigned.every((item) => item.assignedProvider === null)).toBe(true);
  });

  it("keeps WORKCENTER and MACHINE groups independent", () => {
    const record = plannedRecord();
    const workcenterTask = record.tasks[0];
    const machineTask = record.tasks[1];
    if (!workcenterTask || !machineTask) {
      throw new Error("expected at least two tasks");
    }
    const withEffort = {
      ...record,
      tasks: record.tasks.map((task) => {
        if (task.taskId === workcenterTask.taskId) {
          return {
            ...task,
            assignedProvider: {
              kind: "WORKCENTER" as const,
              id: WC_ASSEMBLY_01_ID,
              label: "Masă asamblare 1",
            },
            plannedEffortMinutes: 30,
          };
        }
        if (task.taskId === machineTask.taskId) {
          return {
            ...task,
            assignedProvider: {
              kind: "MACHINE" as const,
              id: MCH_CNC_4020_ID,
              label: "CNC 4020",
            },
            plannedEffortMinutes: 45,
          };
        }
        return task;
      }),
    };
    const projection = projectPlanningWorkload(
      [{ record: withEffort }],
      createWorkcenterRegistry(
        [
          {
            id: WC_ASSEMBLY_01_ID,
            label: "Masă asamblare 1",
            description: "test",
            lifecycle: "ACTIVE",
            capabilityIds: ["MANUAL_ASSEMBLY"],
          },
        ],
        [
          {
            id: MCH_CNC_4020_ID,
            label: "CNC 4020",
            description: "test",
            workcenterId: null,
            lifecycle: "ACTIVE",
            capabilityIds: ["CNC_ROUTING"],
          },
        ],
      ),
    );
    expect(projection.providers).toHaveLength(2);
    expect(
      projection.providers.find((item) => item.provider.id === WC_ASSEMBLY_01_ID)?.knownQueuedMinutes,
    ).toBe(30);
    expect(
      projection.providers.find((item) => item.provider.id === MCH_CNC_4020_ID)?.knownQueuedMinutes,
    ).toBe(45);
  });

  it("sorts IN_PROGRESS before PLANNED without treating seq as priority", () => {
    expect(
      compareWorkloadDisplayOrder(
        {
          status: "IN_PROGRESS",
          createdAt: "2026-09-21T10:00:00.000Z",
          executionPlanId: "exp:b",
          seq: 9,
          taskId: "task:b",
        },
        {
          status: "PLANNED",
          createdAt: "2026-09-21T08:00:00.000Z",
          executionPlanId: "exp:a",
          seq: 1,
          taskId: "task:a",
        },
      ),
    ).toBeLessThan(0);
  });
});
