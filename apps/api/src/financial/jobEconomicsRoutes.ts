import { projectActualInternalCost, projectJobEconomicResult } from "@workos-final/domain";
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
      if (runtime.readAssemblyOrder(jobId)) {
        return c.json({
          available: false,
          reason: "Comparația planificat vs realizat pentru ansambluri nu este inclusă în această versiune.",
        });
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
