import type { Hono } from "hono";
import {
  projectStartOverview,
  type OrganizationCapability,
  type StartOverviewInput,
  type StartPriceApprovalInput,
  type StartSourceInput,
} from "@workos-final/domain";
import { can, getProductSystem, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireCapability } from "../cloud/middleware.js";
import { readActiveIssueStatesByJobId } from "../execution/taskDossierStore.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";

/**
 * Start · one read-only orientation projection for the signed-in role.
 *
 * Every source is authorized on the server with the capability its own register uses, read from
 * the organization's own runtime, and isolated from the others: a source that cannot be read is
 * reported as unavailable, never as an empty register. Nothing here writes.
 */
export function registerStartRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/start", requireCapability("org.settings.read"), (c) => {
    return c.json({ start: readStartOverview(c, getProductSystem(c), new Date().toISOString()) });
  });
}

function readSource<T>(permitted: boolean, read: () => T): StartSourceInput<T> {
  if (!permitted) {
    return { status: "NOT_PERMITTED" };
  }
  try {
    return { status: "READY", value: read() };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}

export function readStartOverview(c: ApiContext, runtime: ProductSystemRuntime, readAt: string) {
  const allowed = (capability: OrganizationCapability) => can(c, capability);
  const input: StartOverviewInput = {
    readAt,
    can: allowed,
    requests: readSource(allowed("requests.read"), () => runtime.listRequestOverview()),
    quotes: readSource(allowed("quotes.read"), () => runtime.listQuoteOverview()),
    jobs: readSource(allowed("jobs.read"), () => {
      const overview = runtime.listJobOverview();
      // Same visibility as the Lucrări register: without request access only released work.
      const jobs = allowed("requests.read")
        ? overview.jobs
        : overview.jobs.filter((job) => Boolean(job.planId));
      return {
        overview: { ...overview, jobs },
        issueStates: readActiveIssueStatesByJobId(runtime.assemblyPlane().db),
      };
    }),
    priceApprovals: readSource(allowed("quotes.price_exception.approve"), () =>
      runtime.listPriceApprovals({ status: "REQUESTED" }).map((approval): StartPriceApprovalInput => {
        const request = runtime.readCommercialRequest(approval.subject.requestId);
        const customer = request?.customerId ? runtime.getCustomer(request.customerId) : null;
        return {
          approvalId: approval.approvalId,
          status: approval.status,
          requestId: approval.subject.requestId,
          requestReference: request?.reference ?? null,
          requestTitle: request?.title ?? null,
          customerDisplayName: customer?.displayName ?? null,
          triggeredRules: approval.triggeredRules,
          requestedByLabel: approval.requestedByLabel,
          requestedAt: approval.requestedAt,
        };
      }),
    ),
    setup: readSource(allowed("org.settings.read") && allowed("resources.read"), () => {
      const enablement = runtime.resolveProductEnablement();
      return {
        enabledProductCount: enablement.ok ? enablement.enabledTemplateCodes.length : null,
        activePeopleCount: runtime.listPeople().filter((person) => person.status === "ACTIVE").length,
      };
    }),
  };
  return projectStartOverview(input);
}
