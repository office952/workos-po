import type { Hono } from "hono";
import {
  jobExecutionHref,
  projectExecutionPlanView,
  scopeExecutionPlanView,
  scopeOrderSnapshot,
} from "@workos-final/domain";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { financialAccess } from "../financial/access.js";
import { httpPathIdentity } from "../httpPathIdentity.js";

export function registerJobRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/jobs", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ overview: runtime.listJobOverview() });
  });

  app.get("/api/jobs/:jobId", (c) => {
    const runtime = getProductSystem(c);
    const jobId = httpPathIdentity(c.req.path, "/api/jobs/");
    const order = runtime.readOrderSnapshot(jobId);
    if (!order) {
      return c.json({ error: "not_found" }, 404);
    }
    const job = runtime.listJobOverview().jobs.find((item) => item.jobId === jobId);
    if (!job) {
      return c.json({ error: "not_found" }, 404);
    }
    const access = financialAccess(c, "commercial");
    const quote = runtime
      .listQuoteOverview()
      .quotes.find((item) => item.quoteSnapshotId === order.sourceQuoteSnapshotId);
    const release = runtime.readProductionReleaseByOrder(jobId);
    const record = job.planId ? runtime.readExecutionPlan(job.planId) : null;
    const planView = record
      ? projectExecutionPlanView(
          record,
          runtime.listPeople(),
          runtime.readProductionSnapshot(record.plan.sourceSnapshotId),
          runtime.peopleEligibilityContext(),
          null,
          runtime.providerRegistry,
        )
      : null;
    const executionAccess = access === "owner" ? "owner" : "workshop";

    return c.json({
      job,
      order: scopeOrderSnapshot(order, access),
      quote: {
        quoteSnapshotId: order.sourceQuoteSnapshotId,
        href: quote?.href ?? `/quotes/${encodeURIComponent(order.sourceQuoteSnapshotId)}`,
        reference: quote?.reference ?? null,
      },
      request: quote?.requestId
        ? {
            requestId: quote.requestId,
            href: `/requests/${encodeURIComponent(quote.requestId)}`,
            reference: quote.requestReference,
          }
        : null,
      release: release ? { releaseSnapshotId: release.snapshotId } : null,
      execution: record
        ? {
            planId: record.plan.planId,
            href: jobExecutionHref(record.plan.planId),
            statusLabel: job.progressLabel ?? job.stageLabel,
            progressLabel: job.progressLabel,
            blocked: job.needsAttention,
            attentionLabel: job.attentionLabel,
            view: planView ? scopeExecutionPlanView(planView, executionAccess) : null,
          }
        : null,
    });
  });
}
