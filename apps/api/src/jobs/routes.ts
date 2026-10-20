import type { Hono } from "hono";
import {
  freezeProductionReleaseFromOrder,
  jobExecutionHref,
  materializeAssemblyExecutionPlan,
  materializeExecutionPlanFromSnapshot,
  projectAssemblyProduction,
  projectExecutionPlanView,
  projectSiteInstallationOperationalView,
  scopeExecutionPlanView,
  scopeOrderSnapshot,
} from "@workos-final/domain";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";
import {
  presentExecutionPlanForViewer,
  viewerCanAssignProvider,
} from "../execution/presentExecutionPlan.js";
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
    const located = locateJob(runtime, jobId);
    if (!located) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json(presentJobDetail(c, runtime, located));
  });

  app.patch("/api/jobs/:jobId/planning", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const jobId = httpPathIdentity(c.req.path, "/api/jobs/", "/planning");
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as { priority?: unknown; targetDate?: unknown };
    const patch: { priority?: unknown; targetDate?: unknown } = {};
    if (Object.prototype.hasOwnProperty.call(payload, "priority")) {
      patch.priority = payload.priority;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "targetDate")) {
      patch.targetDate = payload.targetDate;
    }
    const result = runtime.updateJobPlanning(jobId, patch, new Date().toISOString());
    if (!result.ok) {
      return c.json({ error: result.error }, planningHttpStatus(result.error));
    }
    const located = locateJob(runtime, jobId);
    if (!located) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      job: located.job,
    });
  });

  // One synchronous transaction owns release + plan. Retrying returns the same identities.
  app.post("/api/jobs/:jobId/production", requireOwnerRole(), (c) => {
    const runtime = getProductSystem(c);
    const jobId = httpPathIdentity(c.req.path, "/api/jobs/", "/production");
    const result = runtime.assemblyPlane().db.transaction(() => {
      const product = runtime.readOrderSnapshot(jobId);
      if (product) {
        const frozen = freezeProductionReleaseFromOrder(product);
        if (!frozen.ok) return { ok: false as const, error: frozen.error, reasons: frozen.reasons };
        const release = runtime.acceptProductionSnapshot(frozen.snapshot);
        const plan = runtime.persistExecutionPlan(materializeExecutionPlanFromSnapshot(release.snapshot));
        return { ok: true as const, created: release.created || plan.created,
          releaseSnapshotId: release.snapshot.snapshotId, planId: plan.record.plan.planId };
      }
      const order = runtime.readAssemblyOrder(jobId);
      if (!order) return null;
      let release = runtime.readAssemblyProductionForOrder(jobId);
      const releaseCreated = release === null;
      if (!release) {
        const projected = projectAssemblyProduction(order, {
          snapshotId: `asmp:${order.contentHash.slice(0, 24)}`,
          createdAt: new Date().toISOString(),
        });
        if (!projected.ok) return { ok: false as const, error: projected.error, reasons: projected.reasons };
        release = projected.snapshot;
        runtime.saveAssemblyProduction(release);
      }
      const plan = runtime.persistExecutionPlan(materializeAssemblyExecutionPlan(release));
      return { ok: true as const, created: releaseCreated || plan.created,
        releaseSnapshotId: release.snapshotId, planId: plan.record.plan.planId };
    }).immediate();
    if (!result) return c.json({ error: "not_found" }, 404);
    if (!result.ok) return c.json({ error: result.error, reasons: result.reasons }, 422);
    return c.json({ created: result.created, releaseSnapshotId: result.releaseSnapshotId,
      executionPlan: { plan: { planId: result.planId } } });
  });

  app.post("/api/jobs/:jobId/production-release", requireOwnerRole(), (c) => {
    const runtime = getProductSystem(c);
    const jobId = httpPathIdentity(c.req.path, "/api/jobs/", "/production-release");
    const product = runtime.readOrderSnapshot(jobId);
    if (product) {
      const frozen = freezeProductionReleaseFromOrder(product);
      if (!frozen.ok) {
        return c.json({ error: frozen.error, reasons: frozen.reasons }, 422);
      }
      const stored = runtime.acceptProductionSnapshot(frozen.snapshot);
      return c.json({ created: stored.created, releaseSnapshotId: stored.snapshot.snapshotId });
    }
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const assembly = runtime.readAssemblyOrder(jobId);
    if (!assembly) {
      return c.json({ error: "not_found" }, 404);
    }
    const existing = runtime.readAssemblyProductionForOrder(assembly.orderSnapshotId);
    if (existing) {
      return c.json({ created: false, releaseSnapshotId: existing.snapshotId });
    }
    const projected = projectAssemblyProduction(assembly, {
      snapshotId: `asmp:${assembly.contentHash.slice(0, 24)}`,
      createdAt: new Date().toISOString(),
    });
    if (!projected.ok) {
      return c.json({ error: projected.error, reasons: projected.reasons }, 422);
    }
    runtime.saveAssemblyProduction(projected.snapshot);
    return c.json({ created: true, releaseSnapshotId: projected.snapshot.snapshotId });
  });

  app.post("/api/jobs/:jobId/execution-plan", requireOwnerRole(), (c) => {
    const runtime = getProductSystem(c);
    const jobId = httpPathIdentity(c.req.path, "/api/jobs/", "/execution-plan");
    const product = runtime.readOrderSnapshot(jobId);
    if (product) {
      const release = runtime.readProductionReleaseByOrder(jobId);
      if (!release) {
        return c.json({ error: "not_found" }, 404);
      }
      const stored = runtime.persistExecutionPlan(materializeExecutionPlanFromSnapshot(release));
      return c.json({
        created: stored.created,
        executionPlan: { plan: { planId: stored.record.plan.planId } },
      });
    }
    if (!isOwner(c)) {
      return c.json({ error: "forbidden" }, 403);
    }
    const assembly = runtime.readAssemblyOrder(jobId);
    if (!assembly) {
      return c.json({ error: "not_found" }, 404);
    }
    const release = runtime.readAssemblyProductionForOrder(assembly.orderSnapshotId);
    if (!release) {
      return c.json({ error: "not_found" }, 404);
    }
    const stored = runtime.persistExecutionPlan(materializeAssemblyExecutionPlan(release));
    return c.json({
      created: stored.created,
      executionPlan: { plan: { planId: stored.record.plan.planId } },
    });
  });
}

function locateJob(runtime: ReturnType<typeof getProductSystem>, jobId: string) {
  const job = runtime.listJobOverview().jobs.find((item) => item.jobId === jobId);
  if (!job) {
    return null;
  }
  if (job.kind === "PRODUCT") {
    const order = runtime.readOrderSnapshot(jobId);
    return order ? { job, order, assembly: null } : null;
  }
  const assembly = runtime.readAssemblyOrder(jobId);
  return assembly ? { job, order: null, assembly } : null;
}

function presentJobDetail(
  c: ApiContext,
  runtime: ReturnType<typeof getProductSystem>,
  located: NonNullable<ReturnType<typeof locateJob>>,
) {
  const { job } = located;
  const access = financialAccess(c, "commercial");
  const quote = located.order
    ? runtime
        .listQuoteOverview()
        .quotes.find((item) => item.quoteSnapshotId === located.order?.sourceQuoteSnapshotId)
    : null;
  const release = located.order
    ? runtime.readProductionReleaseByOrder(job.jobId)
    : runtime.readAssemblyProductionForOrder(job.jobId);
  const record = job.planId ? runtime.readExecutionPlan(job.planId) : null;
  const planView = record
    ? projectExecutionPlanView(
        record,
        runtime.listPeople(),
        located.order ? runtime.readProductionSnapshot(record.plan.sourceSnapshotId) : null,
        runtime.peopleEligibilityContext(),
        null,
        runtime.providerRegistry,
        runtime.materialReadinessContext(),
        runtime.externalProductionContext(),
        runtime.qualityControlProjection(record.plan.planId, isOwner(c)),
      )
    : null;
  const executionAccess = access === "owner" ? "owner" : "workshop";
  const requestId = job.requestId;
  return {
    job,
    order: located.order ? scopeOrderSnapshot(located.order, access) : null,
    quote: located.assembly
      ? {
          quoteSnapshotId: located.assembly.sourceQuoteSnapshotId,
          href: `/ansamblu?assembly=${encodeURIComponent(located.assembly.assemblyId)}`,
          reference: null,
        }
      : {
          quoteSnapshotId: located.order?.sourceQuoteSnapshotId ?? null,
          href:
            quote?.href ??
            (located.order
              ? `/quotes/${encodeURIComponent(located.order.sourceQuoteSnapshotId)}`
              : null),
          reference: quote?.reference ?? null,
        },
    request: requestId
      ? {
          requestId,
          href: `/requests/${encodeURIComponent(requestId)}`,
          reference: quote?.requestReference ?? null,
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
          view: planView
            ? presentExecutionPlanForViewer(
                scopeExecutionPlanView(planView, executionAccess),
                viewerCanAssignProvider(c),
              )
            : null,
        }
      : null,
    siteInstallation: siteInstallationForJob(located),
  };
}

function siteInstallationForJob(located: NonNullable<ReturnType<typeof locateJob>>) {
  const line = located.order?.lines?.find(
    (item) => item.kind === "SITE_INSTALLATION" && item.lineVersion === 2,
  ) ?? located.assembly?.serviceLine;
  if (!line || line.kind !== "SITE_INSTALLATION" || line.lineVersion !== 2) {
    return null;
  }
  return projectSiteInstallationOperationalView({
    providerMode: line.providerMode,
    hostContext: line.hostContext,
    mountingInterface: line.mountingInterface,
    siteExecutionContext: line.siteExecutionContext,
  });
}

function planningHttpStatus(
  error: "not_found" | "invalid_payload" | "invalid_priority" | "invalid_target_date" | "planning_readonly",
): 400 | 404 | 409 {
  switch (error) {
    case "not_found":
      return 404;
    case "planning_readonly":
      return 409;
    case "invalid_payload":
    case "invalid_priority":
    case "invalid_target_date":
      return 400;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
