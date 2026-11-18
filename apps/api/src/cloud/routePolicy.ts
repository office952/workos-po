import type { MiddlewareHandler } from "hono";
import { isOrganizationRole, roleCan, type OrganizationCapability } from "@workos-final/domain";
import type { ApiEnv } from "./context.js";

/**
 * V1 Organization Access · server-side route policy for the scoped roles (production, workshop).
 *
 * `owner` and `member` keep exactly their pre-V1 behaviour: they are governed by the per-route
 * checks (migrated to capabilities, AUTHORIZATION_CHECK_INVENTORY.md) and skip this table.
 * Every other role is **deny by default**: a route must be listed here and the role must hold the
 * capability. `"session"` = any authenticated, known role (account and session housekeeping).
 * The test `route-policy.test.ts` fails if a registered /api route is missing from this table.
 */
export type RoutePolicyCapability = OrganizationCapability | "session" | "public";

export const ROUTE_POLICY: Readonly<Record<string, RoutePolicyCapability>> = {
  // Public and session housekeeping
  "GET /api/health": "public",
  "GET /api/ready": "public",
  "POST /api/cloud/login": "public",
  "GET /api/cloud/session": "public",
  "POST /api/cloud/logout": "public",
  "POST /api/cloud/active-organization": "session",
  "POST /api/cloud/invitations/preview": "public",
  "POST /api/cloud/invitations/accept": "public",
  "POST /api/cloud/password-reset/request": "public",
  "POST /api/cloud/password-reset/complete": "public",
  "POST /api/cloud/email-verification/complete": "public",
  "GET /api/account/security": "session",
  "POST /api/account/password": "session",
  "POST /api/account/sessions/revoke-others": "session",
  "POST /api/account/email-verification": "session",

  // Start: read-only orientation; each source is authorized again inside the projection.
  "GET /api/start": "org.settings.read",

  // Organization access
  "GET /api/admin/access": "org.access.read",
  "GET /api/admin/access/events": "org.access.manage",
  "POST /api/admin/access/invitations": "org.access.manage",
  "POST /api/admin/access/invitations/:invitationId/resend": "org.access.manage",
  "POST /api/admin/access/invitations/:invitationId/revoke": "org.access.manage",
  "POST /api/admin/access/memberships/:membershipId/revoke": "org.access.manage",
  "POST /api/admin/access/memberships/:membershipId/role": "org.access.manage",
  "POST /api/admin/access/memberships/:membershipId/send-recovery": "org.access.manage",

  // Organization settings
  "GET /api/admin/assembly-operation-cost": "costs.internal.read",
  "POST /api/admin/assembly-operation-cost-policy": "costs.internal.manage",
  "GET /api/admin/commercial-policy": "org.settings.manage",
  "POST /api/admin/commercial-policy": "org.settings.manage",
  "GET /api/admin/external-production": "org.settings.read",
  "POST /api/admin/external-production": "org.settings.manage",
  "POST /api/admin/external-production/providers": "org.settings.manage",
  "POST /api/admin/external-production/providers/:providerId": "org.settings.manage",
  "GET /api/admin/formulas": "org.settings.read",
  "POST /api/admin/formulas": "org.settings.manage",
  "GET /api/admin/material-readiness": "org.settings.read",
  "POST /api/admin/material-readiness": "org.settings.manage",
  "GET /api/admin/product-enablement": "org.settings.read",
  "POST /api/admin/product-enablement": "org.settings.manage",
  "GET /api/admin/technical-settings": "org.settings.read",
  "POST /api/admin/technical-settings": "org.settings.manage",
  "PATCH /api/admin/product-system/entities/:entityKind/:entityId/display-label": "org.settings.manage",
  "GET /api/catalog/capabilities": "org.settings.read",
  "GET /api/catalog/presets": "org.settings.read",
  "GET /api/catalog/presets/:presetId": "org.settings.read",
  "POST /api/catalog/presets": "org.settings.manage",
  "GET /api/catalog/process-graph": "org.settings.read",
  "GET /api/components": "org.settings.read",
  "GET /api/governance": "org.settings.read",
  "GET /api/product-system-admin": "org.settings.read",
  "GET /api/seller": "prices.client.read",
  "GET /api/seller/versions": "org.settings.manage",
  "PATCH /api/seller": "org.settings.manage",
  // Commercial & Financial V1 · offering policy and price exception approvals
  "GET /api/offering-policy": "prices.client.read",
  "GET /api/admin/offering-policy": "org.settings.manage",
  "POST /api/admin/offering-policy": "org.settings.manage",
  "GET /api/admin/price-approvals": "quotes.price_exception.approve",
  "GET /api/admin/price-approvals/:approvalId": "quotes.price_exception.approve",
  "POST /api/admin/price-approvals/:approvalId/decision": "quotes.price_exception.approve",
  "POST /api/products/:productCode/price-approval-requests": "offering.policy.use",
  "GET /api/resources-admin": "resources.read",
  "POST /api/resources-admin/cost-evidence": "costs.internal.manage",
  "PATCH /api/resources-admin/cost-evidence/:evidenceRowId": "costs.internal.manage",

  // Resources: people, workcenters, machines, services
  "GET /api/people": "resources.read",
  "GET /api/people/:personId": "resources.read",
  "GET /api/people/eligibility": "resources.read",
  "GET /api/people/skills": "resources.read",
  "POST /api/people": "resources.manage",
  "PATCH /api/people/:personId": "resources.manage",
  "POST /api/people/:personId/skills": "resources.manage",
  "PATCH /api/people/:personId/skills/:skillId": "resources.manage",
  "POST /api/people/skills": "resources.manage",
  "PATCH /api/people/skills/:skillId": "resources.manage",
  "PUT /api/people/:personId/operator-pin": "resources.manage",
  "GET /api/workcenters": "resources.read",
  "POST /api/workcenters": "resources.manage",
  "PATCH /api/workcenters/:workcenterId": "resources.manage",
  "POST /api/machines": "resources.manage",
  "PATCH /api/machines/:machineId": "resources.manage",
  "GET /api/operational-services": "resources.read",
  "PATCH /api/operational-services/:capabilityId": "resources.manage",
  "GET /api/operational-processes": "resources.read",

  // Customers
  "GET /api/customers": "customers.read",
  "POST /api/customers": "customers.write",
  "GET /api/customers/fiscal-lookup": "customers.write",
  "GET /api/customers/:customerId": "customers.read",
  "PATCH /api/customers/:customerId": "customers.write",
  "GET /api/customers/:customerId/dossier": "customers.read",
  "GET /api/customers/:customerId/sites": "customers.read",
  "POST /api/customers/:customerId/sites": "customers.write",
  "PATCH /api/customers/:customerId/sites/:siteId": "customers.write",
  "PUT /api/customers/:customerId/site-assignments": "customers.write",
  "GET /api/customers/:customerId/logo/content": "customers.read",
  "PUT /api/customers/:customerId/logo": "customers.write",
  "DELETE /api/customers/:customerId/logo": "customers.write",
  "GET /api/customers/:customerId/history": "customers.financials.read",
  "GET /api/customers/:customerId/works": "customers.financials.read",
  "GET /api/customers/:customerId/workspace": "customers.financials.read",
  "PUT /api/customers/:customerId/works/representative-photo": "customers.write",
  "POST /api/customers/:customerId/historical-works": "customers.write",
  "PATCH /api/customers/:customerId/historical-works/:workId": "customers.write",
  "GET /api/customers/:customerId/commercial-terms": "customers.terms.read",
  "PUT /api/customers/:customerId/commercial-terms": "customers.terms.write",
  // Documents can be contracts, invoices and acceptance records: commercial terms scope.
  "GET /api/customers/:customerId/documents/:documentId/content": "customers.terms.read",
  "POST /api/customers/:customerId/documents": "customers.write",
  "PATCH /api/customers/:customerId/documents/:documentId": "customers.write",
  "POST /api/customers/:customerId/documents/:documentId/links": "customers.write",
  "DELETE /api/customers/:customerId/documents/:documentId/links": "customers.write",

  // Requests
  "GET /api/requests": "requests.read",
  "POST /api/requests": "requests.write",
  "GET /api/requests/:requestId": "requests.read",
  "PATCH /api/requests/:requestId": "requests.write",
  "PATCH /api/requests/:requestId/installation-facts": "requests.write",
  "PATCH /api/requests/:requestId/installation-price": "offering.policy.use",
  "GET /api/requests/:requestId/attachments": "requests.read",
  "POST /api/requests/:requestId/attachments": "requests.write",
  "GET /api/requests/:requestId/attachments/:attachmentId/download": "requests.read",
  "POST /api/requests/:requestId/commercial/decisions": "requests.outcome.manage",
  "POST /api/requests/:requestId/commercial/reopen": "requests.outcome.manage",
  "POST /api/requests/:requestId/quotes": "quotes.create",
  "POST /api/requests/:requestId/quotes/:quoteSnapshotId/resume": "requests.outcome.manage",

  // Configurator and products
  "GET /api/product-catalog": "configurator.use",
  "GET /api/products/:productCode": "configurator.use",
  "GET /api/products/:productCode/process-composition": "configurator.use",
  "POST /api/products/:productCode/compile": "configurator.use",
  "POST /api/products/:productCode/preview": "configurator.use",
  "POST /api/products/:productCode/confirm": "configurator.use",
  "POST /api/products/:productCode/accepted-production-snapshot": "configurator.use",

  // Quotes and orders
  "GET /api/quotes": "quotes.read",
  "GET /api/quotes/:quoteSnapshotId": "quotes.read",
  "POST /api/products/:productCode/quote-snapshots": "quotes.create",
  "GET /api/products/:productCode/quote-snapshots/:quoteSnapshotId": "quotes.read",
  "GET /api/products/:productCode/quote-snapshots/:quoteSnapshotId/document": "quotes.read",
  "GET /api/assembly-quotes/:quoteSnapshotId/document": "quotes.read",
  "GET /api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance": "quotes.read",
  "GET /api/products/:productCode/quote-snapshots/:quoteSnapshotId/order": "quotes.read",
  "POST /api/products/:productCode/quote-snapshots/:quoteSnapshotId/acceptance": "quotes.accept",
  "POST /api/products/:productCode/quote-snapshots/:quoteSnapshotId/order": "quotes.accept",
  "POST /api/products/:productCode/quote-snapshots/:quoteSnapshotId/confirm-order": "quotes.accept",
  "GET /api/products/:productCode/orders/:orderSnapshotId": "quotes.read",

  // Assemblies (reads carry the customer price)
  "GET /api/assemblies": "assemblies.read",
  "GET /api/assemblies/offering": "assemblies.read",
  "GET /api/assemblies/:assemblyId": "assemblies.read",
  "GET /api/assemblies/:assemblyId/members/:role": "assemblies.read",
  "POST /api/assemblies": "assemblies.manage",
  "POST /api/assemblies/:assemblyId/members": "assemblies.manage",
  "POST /api/assemblies/:assemblyId/review": "assemblies.manage",
  "POST /api/assemblies/:assemblyId/confirm": "assemblies.manage",
  "PUT /api/assemblies/:assemblyId/operation-estimates": "assemblies.manage",
  "POST /api/assemblies/:assemblyId/quote": "assemblies.manage",
  "POST /api/assemblies/:assemblyId/accept": "quotes.accept",
  "POST /api/assemblies/:assemblyId/production": "production.release",
  "POST /api/assemblies/:assemblyId/execution-plan": "production.release",

  // Production release and planning
  "GET /api/products/:productCode/orders/:orderSnapshotId/production-release": "jobs.read",
  "POST /api/products/:productCode/orders/:orderSnapshotId/production-release": "production.release",
  "GET /api/products/:productCode/accepted-production-snapshots/:snapshotId": "jobs.read",
  "GET /api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan": "jobs.read",
  "POST /api/products/:productCode/accepted-production-snapshots/:snapshotId/execution-plan": "production.release",
  "POST /api/jobs/:jobId/production": "production.release",
  "POST /api/jobs/:jobId/production-release": "production.release",
  "POST /api/jobs/:jobId/execution-plan": "production.release",
  "PATCH /api/jobs/:jobId/planning": "planning.manage",
  "GET /api/planning/workload": "planning.read",

  // Jobs
  "GET /api/jobs": "jobs.read",
  "GET /api/jobs/:jobId": "jobs.read",
  "GET /api/jobs/:jobId/record": "jobs.read",
  "GET /api/jobs/:jobId/economics": "costs.internal.read",
  "GET /api/jobs/:jobId/files": "jobs.read",
  "POST /api/jobs/:jobId/files": "jobs.files.write",
  "POST /api/jobs/:jobId/file-links": "jobs.files.write",
  "GET /api/jobs/:jobId/material-preparation": "jobs.read",
  "POST /api/jobs/:jobId/material-preparation/:resourceId/decision": "materials.decide",

  // Execution
  "GET /api/execution-plans/:planId": "jobs.read",
  "GET /api/execution-tasks/:taskId/dossier": "execution.operate",
  "GET /api/execution-artifacts/:artifactId/download": "execution.operate",
  "GET /api/operator-candidates": "execution.operate",
  "GET /api/operator-session": "execution.operate",
  "POST /api/operator-session": "execution.operate",
  "DELETE /api/operator-session": "execution.operate",
  "POST /api/dev/operator-session": "execution.operate",
  "GET /api/operator-task-inbox": "execution.operate",
  "POST /api/execution-tasks/:taskId/start": "execution.operate",
  "POST /api/execution-tasks/:taskId/leave": "execution.operate",
  "POST /api/execution-tasks/:taskId/complete": "execution.operate",
  "POST /api/execution-tasks/:taskId/quality-pass": "execution.operate",
  "POST /api/execution-tasks/:taskId/quality-fail": "execution.operate",
  "POST /api/execution-tasks/:taskId/machine-runs/start": "execution.operate",
  "POST /api/execution-machine-runs/:machineRunId/stop": "execution.operate",
  "POST /api/execution-tasks/:taskId/observations": "execution.operate",
  "POST /api/execution-tasks/:taskId/issues": "execution.operate",
  "POST /api/execution-tasks/:taskId/artifacts": "execution.operate",
  "POST /api/execution-tasks/:taskId/artifact-links": "execution.operate",
  "POST /api/execution-tasks/:taskId/artifact-use": "execution.operate",
  "POST /api/execution-tasks/:taskId/bind-unique-provider": "execution.operate",
  "POST /api/execution-tasks/:taskId/provider": "planning.manage",
  "POST /api/execution-tasks/:taskId/planned-effort": "planning.manage",
  "POST /api/execution-tasks/:taskId/executor": "planning.manage",
  "POST /api/execution-tasks/:taskId/external": "planning.manage",
  "POST /api/execution-tasks/:taskId/external-provider": "planning.manage",
  "POST /api/execution-tasks/:taskId/hand-off": "planning.manage",
  "POST /api/execution-tasks/:taskId/external-return": "planning.manage",
  "POST /api/execution-tasks/:taskId/instructions": "execution.supervise",
  "POST /api/execution-tasks/:taskId/issues/:entryId/acknowledge": "execution.supervise",
  "POST /api/execution-tasks/:taskId/issues/:entryId/resolve": "execution.supervise",
  "POST /api/execution-tasks/:taskId/rework-close": "execution.supervise",
  "POST /api/execution-tasks/:taskId/material-readiness": "execution.supervise",

  // Materials and stock
  "GET /api/inventory": "inventory.read",
  "GET /api/inventory/:resourceId": "inventory.read",
  "POST /api/inventory/:resourceId/adjustments": "inventory.adjust",
  "GET /api/material-requests": "inventory.read",
};

type CompiledPolicy = { method: string; pattern: RegExp; capability: RoutePolicyCapability; key: string };

const COMPILED: CompiledPolicy[] = Object.entries(ROUTE_POLICY)
  .map(([key, capability]) => {
    const [method, template] = key.split(" ") as [string, string];
    const literalSegments = template.split("/").filter((segment) => segment && !segment.startsWith(":")).length;
    const pattern = new RegExp(
      `^${template
        .split("/")
        .map((segment) => (segment.startsWith(":") ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
        .join("/")}$`,
    );
    return { method, pattern, capability, key, literalSegments };
  })
  // Literal paths (e.g. /api/assemblies/offering) win over parameterised siblings.
  .sort((a, b) => (b as { literalSegments: number }).literalSegments - (a as { literalSegments: number }).literalSegments);

export function routePolicyFor(method: string, path: string): CompiledPolicy | null {
  const upper = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  return COMPILED.find((entry) => entry.method === upper && entry.pattern.test(path)) ?? null;
}

/** Roles governed by their per-route checks only (pre-V1 behaviour preserved). */
const LEGACY_ROLES = new Set(["owner", "member"]);

export function enforceScopedRolePolicy(): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    if (c.get("accessMode") !== "cloud") {
      await next();
      return;
    }
    const role = c.get("membership")?.role;
    if (!role || LEGACY_ROLES.has(role)) {
      await next();
      return;
    }
    if (!isOrganizationRole(role)) {
      return c.json({ error: "forbidden", reason: "role_unsupported" }, 403);
    }
    const policy = routePolicyFor(c.req.method, c.req.path);
    if (!policy) {
      return c.json({ error: "forbidden", reason: "route_not_permitted" }, 403);
    }
    if (policy.capability === "public" || policy.capability === "session") {
      await next();
      return;
    }
    if (!roleCan(role, policy.capability)) {
      return c.json({ error: "forbidden", reason: "capability_missing" }, 403);
    }
    await next();
  };
}
