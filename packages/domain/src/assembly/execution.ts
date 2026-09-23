import {
  executionPlanIdFromSnapshot,
  executionTaskId,
  type ExecutionPlanRecord,
} from "../execution/plan.js";
import { setPlannedEffortOnTask, type TaskMutationResult } from "../execution/lifecycle.js";
import type { AssemblyProductionSnapshot } from "./snapshots.js";
import { ASSEMBLY_OFFERING_LABEL } from "./contract.js";

export function materializeAssemblyExecutionPlan(
  snapshot: AssemblyProductionSnapshot,
  options?: { createdAt?: string },
): ExecutionPlanRecord {
  const createdAt = options?.createdAt ?? snapshot.createdAt;
  const planId = executionPlanIdFromSnapshot(snapshot.snapshotId);
  const operations = [
    ...snapshot.members.flatMap((member) => member.operations),
    ...snapshot.assemblyOperations,
  ];
  const tasks = operations.map((operation, index) => {
    const seq = index + 1;
    return {
      taskId: executionTaskId(planId, operation.id),
      executionPlanId: planId,
      sourceOperationId: operation.id,
      processId: operation.processId,
      processLabel: operation.processLabel,
      scope: operation.scope,
      scopeLabel: operation.scopeLabel,
      seq,
      seqLabel: String(seq).padStart(2, "0"),
      dependsOnTaskIds: operation.dependsOn.map((operationId) =>
        executionTaskId(planId, operationId),
      ),
      requiredCapabilityId: operation.requiredCapabilityId,
      requiredCapabilityLabel: operation.requiredCapabilityLabel,
      providerRequirement: operation.providerRequirement ?? "REQUIRED",
      status: "PLANNED" as const,
      quantities: operation.quantities,
      resourceDemands: operation.resourceDemands,
      assignedProvider: null,
      assignedExecutor: null,
      plannedEffortMinutes: null,
      startedAt: null,
      completedAt: null,
      completion: null,
      actualConsumption: [],
      createdAt,
    };
  });
  return {
    plan: {
      planId,
      sourceSnapshotId: snapshot.snapshotId,
      sourceSnapshotHash: snapshot.contentHash,
      productCode: snapshot.assemblyKind,
      productLabel: ASSEMBLY_OFFERING_LABEL,
      inscription: ASSEMBLY_OFFERING_LABEL,
      createdAt,
      status: "PLANNED",
      taskCount: tasks.length,
      schemaVersion: 1,
      eicTotal: snapshot.eicTotal,
      eicCurrency: snapshot.eicCurrency,
      eicCompleteness: snapshot.eicCompleteness,
    },
    tasks,
  };
}

export function setAssemblyTaskPlannedEffort(
  record: ExecutionPlanRecord,
  taskId: string,
  plannedEffortMinutes: unknown,
): TaskMutationResult {
  return setPlannedEffortOnTask(record, taskId, plannedEffortMinutes);
}
