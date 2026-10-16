import { getResource } from "../resources/catalog.js";
import type { ExecutionPlanRecord } from "./plan.js";

/** This is an estimate from frozen operation demands, not stock or a physical count. */
export type JobMaterialRequirement = {
  resourceId: string;
  label: string;
  unit: string;
  estimatedQuantity: number;
  taskIds: string[];
};

export function projectJobMaterialRequirements(
  record: ExecutionPlanRecord,
): JobMaterialRequirement[] {
  const byResource = new Map<string, JobMaterialRequirement>();
  for (const task of record.tasks) {
    for (const demand of task.resourceDemands) {
      const resource = getResource(demand.resourceId);
      // No procurement for labor, services, unknown resources or incompatible units.
      if (
        resource?.kind !== "MATERIAL" ||
        resource.unit !== demand.unit ||
        !Number.isFinite(demand.quantity) ||
        demand.quantity <= 0
      ) {
        continue;
      }
      const key = demand.resourceId + ":" + demand.unit;
      const current = byResource.get(key);
      if (current) {
        current.estimatedQuantity += demand.quantity;
        if (!current.taskIds.includes(task.taskId)) {
          current.taskIds.push(task.taskId);
        }
      } else {
        byResource.set(key, {
          resourceId: demand.resourceId,
          // Preserve the frozen job-specific material wording, not a later catalog rename.
          label: demand.label,
          unit: demand.unit,
          estimatedQuantity: demand.quantity,
          taskIds: [task.taskId],
        });
      }
    }
  }
  return [...byResource.values()].sort(
    (a, b) => a.label.localeCompare(b.label, "ro") || a.resourceId.localeCompare(b.resourceId),
  );
}

export type OperatorReplenishmentSignal =
  | { ok: true; requestedQuantity: null }
  | { ok: false; error: "quantity_not_allowed" };

/**
 * An operator signal says that replenishment is needed.
 * It does not choose a purchase quantity, copy the technical estimate, or store zero.
 * Purchasing decides a quantity later.
 */
export function resolveOperatorReplenishmentSignal(
  requested: unknown,
): OperatorReplenishmentSignal {
  if (requested !== undefined && requested !== null) {
    return { ok: false, error: "quantity_not_allowed" };
  }
  return { ok: true, requestedQuantity: null };
}
