import {
  ASSEMBLY_ECONOMICS_LINES_NOT_RETAINED_REASON,
  assemblyQuoteCostCompleteness,
  projectActualInternalCost,
  projectAssemblyActualInternalCost,
  projectJobEconomicResult,
  type AssemblyOrderSnapshot,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireCapability } from "../cloud/middleware.js";
import { httpPathIdentity } from "../httpPathIdentity.js";

/**
 * Commercial & Financial V1 · planned vs operational economic result of a job.
 * Owner only (`costs.internal.read`): the payload contains internal cost and margins and is never
 * built for another role. All values come from the engine (frozen order, frozen production
 * snapshot, recorded execution); nothing is computed in the frontend.
 */
export function registerJobEconomicsRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/jobs/:jobId/economics", requireCapability("costs.internal.read"), (c) => {
    const runtime = getProductSystem(c);
    const path = c.req.path.replace(/\/economics$/, "");
    const jobId = httpPathIdentity(path, "/api/jobs/");
    const order = runtime.readOrderSnapshot(jobId);
    if (!order) {
      const assemblyOrder = runtime.readAssemblyOrder(jobId);
      if (assemblyOrder) {
        return c.json(assemblyEconomics(runtime, assemblyOrder));
      }
      return c.json({ error: "not_found" }, 404);
    }
    const release = runtime.readProductionReleaseByOrder(order.orderSnapshotId);
    const plan = release ? runtime.readExecutionPlanBySnapshot(release.snapshotId) : null;
    const operational = plan && release ? projectActualInternalCost(plan, release) : null;
    const completed = plan ? plan.tasks.filter((task) => task.status === "COMPLETED").length : 0;
    const executionLabel = !release
      ? "Lucrarea nu este eliberată în producție"
      : !plan
        ? "Fără plan de execuție"
        : completed === plan.tasks.length && plan.tasks.length > 0
          ? "Execuție finalizată"
          : `În execuție: ${completed} din ${plan.tasks.length} operații finalizate`;
    return c.json({
      available: true,
      economics: projectJobEconomicResult({
        productLabel: order.productLabel,
        orderNetPrice: order.commercial.netPrice,
        estimatedCostTotal: order.eic.total,
        estimatedCostCompleteness: order.eic.completeness === "COMPLETE" ? "COMPLETE" : "PARTIAL",
        acceptedIncompleteCost: Boolean(order.incompleteCostAcceptance),
        operational,
        executionLabel,
        hasExcludedInstallation: Boolean(order.jobCommercial),
      }),
    });
  });
}

/**
 * Assembly job: the same result contract as a product job, built from the frozen order only.
 * Each part is compared separately (its retained cost lines against the consumption recorded on
 * its own operations); assembly operations keep their frozen cost and an unknown operational
 * cost. An order accepted before cost lines were retained is reported as unavailable; nothing is
 * recalculated from current rates.
 */
function assemblyEconomics(
  runtime: ReturnType<typeof getProductSystem>,
  order: AssemblyOrderSnapshot,
) {
  if (order.children.some((child) => !child.eicLines)) {
    return { available: false as const, reason: ASSEMBLY_ECONOMICS_LINES_NOT_RETAINED_REASON };
  }
  const production = runtime.readAssemblyProductionForOrder(order.orderSnapshotId);
  const plan = production ? runtime.readExecutionPlanBySnapshot(production.snapshotId) : null;
  const operational =
    production && plan
      ? projectAssemblyActualInternalCost({
          parts: order.children.map((child) => {
            const member = production.members.find((item) => item.memberId === child.memberId);
            const operationIds = new Set((member?.operations ?? []).map((operation) => operation.id));
            const roleLabel = order.members.find((item) => item.memberId === child.memberId)?.roleLabel;
            return {
              key: child.memberId,
              label: `${roleLabel ?? child.productLabel} · ${child.inscription}`,
              plannedLines: child.eicLines ?? [],
              tasks: plan.tasks.filter((task) => operationIds.has(task.sourceOperationId)),
            };
          }),
          operationCost: order.operationCost ?? null,
        })
      : null;
  const completed = plan ? plan.tasks.filter((task) => task.status === "COMPLETED").length : 0;
  const executionLabel = !production
    ? "Lucrarea nu este eliberată în producție"
    : !plan
      ? "Fără plan de execuție"
      : completed === plan.tasks.length && plan.tasks.length > 0
        ? "Execuție finalizată"
        : `În execuție: ${completed} din ${plan.tasks.length} operații finalizate`;
  const estimatedCostTotal =
    Math.round(
      (order.children.reduce((sum, child) => sum + child.eicTotal, 0) + (order.operationCost?.knownTotal ?? 0)) * 100,
    ) / 100;
  return {
    available: true as const,
    /** Lines are grouped per part of the assembly (`groupLabel`), never merged across parts. */
    grouping: "PART" as const,
    economics: projectJobEconomicResult({
      productLabel: order.label,
      orderNetPrice: order.totals.netPrice,
      estimatedCostTotal,
      estimatedCostCompleteness: assemblyQuoteCostCompleteness(order, order.children),
      acceptedIncompleteCost: Boolean(order.incompleteCostAcceptance),
      operational,
      executionLabel,
      hasExcludedInstallation: Boolean(order.serviceLine),
    }),
  };
}
