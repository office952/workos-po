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
          label: resource.label,
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

export type MaterialOrderQuantityResult =
  | { ok: true; quantity: number }
  | { ok: false; error: "invalid_quantity" | "below_estimated_requirement" };

export function resolveRequestedMaterialQuantity(
  estimatedQuantity: number,
  unit: string,
  requested: unknown,
): MaterialOrderQuantityResult {
  if (!Number.isFinite(estimatedQuantity) || estimatedQuantity <= 0) {
    return { ok: false, error: "invalid_quantity" };
  }
  const quantity = requested === undefined ? estimatedQuantity : requested;
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0 || quantity > 1e9) {
    return { ok: false, error: "invalid_quantity" };
  }
  if (unit === "buc" && !Number.isInteger(quantity)) {
    return { ok: false, error: "invalid_quantity" };
  }
  if (quantity + 1e-9 < estimatedQuantity) {
    return { ok: false, error: "below_estimated_requirement" };
  }
  return { ok: true, quantity };
}
