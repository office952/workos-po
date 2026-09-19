import {
  omitForbiddenFinancialFields,
  projectOperationalProcessesAdministration,
  projectSystemGovernance,
  projectWorkcentersAdministration,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "./cloud/context.js";
import { requireOwnerRole } from "./cloud/middleware.js";

export function registerSystemProjectionRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/components", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ roles: runtime.present().components });
  });

  app.get("/api/product-system-admin", (c) => {
    const runtime = getProductSystem(c);
    return c.json(runtime.present().admin);
  });

  app.get("/api/resources-admin", (c) => {
    const runtime = getProductSystem(c);
    const projection = runtime.resourcesAdministration();
    if (isOwner(c)) {
      return c.json(projection);
    }
    return c.json(omitResourceCostAmounts(projection));
  });

  app.patch(
    "/api/resources-admin/cost-evidence/:evidenceRowId",
    requireOwnerRole(),
    async (c) => {
      const runtime = getProductSystem(c);
      const body = (await c.req.json().catch(() => null)) as {
        amount?: unknown;
        note?: unknown;
      } | null;
      const result = runtime.supersedeCostEvidence(
        c.req.param("evidenceRowId"),
        body?.amount,
        body?.note,
        {
          supplierLabel: (body as { supplierLabel?: unknown } | null)?.supplierLabel,
          validFrom: (body as { validFrom?: unknown } | null)?.validFrom,
          validUntil: (body as { validUntil?: unknown } | null)?.validUntil,
        },
      );
      if (!result.ok) {
        switch (result.error) {
          case "invalid_amount":
          case "invalid_note":
          case "invalid_qualifier":
          case "invalid_supplier":
          case "invalid_validity":
            return c.json({ error: result.error }, 400);
          case "unknown_resource":
          case "not_found":
            return c.json({ error: result.error }, 404);
          case "stale_cost_evidence":
          case "already_exists":
            return c.json({ error: result.error }, 409);
          default: {
            const _exhaustive: never = result.error;
            return c.json({ error: _exhaustive }, 500);
          }
        }
      }
      return c.json({
        evidence: result.evidence,
        admin: runtime.resourcesAdministration(),
      });
    },
  );

  app.post(
    "/api/resources-admin/cost-evidence",
    requireOwnerRole(),
    async (c) => {
      const runtime = getProductSystem(c);
      const body = (await c.req.json().catch(() => null)) as {
        resourceId?: unknown;
        amount?: unknown;
        note?: unknown;
        when?: unknown;
        supplierLabel?: unknown;
        validFrom?: unknown;
        validUntil?: unknown;
      } | null;
      if (!body || typeof body.resourceId !== "string") {
        return c.json({ error: "invalid_payload" }, 400);
      }
      const result = runtime.createInitialCostEvidence({
        resourceId: body.resourceId,
        amount: body.amount,
        note: body.note,
        when: body.when,
        supplierLabel: body.supplierLabel,
        validFrom: body.validFrom,
        validUntil: body.validUntil,
      });
      if (!result.ok) {
        switch (result.error) {
          case "invalid_amount":
          case "invalid_note":
          case "invalid_qualifier":
          case "invalid_supplier":
          case "invalid_validity":
            return c.json({ error: result.error }, 400);
          case "unknown_resource":
          case "not_found":
            return c.json({ error: result.error }, 404);
          case "stale_cost_evidence":
          case "already_exists":
            return c.json({ error: result.error }, 409);
          default: {
            const _exhaustive: never = result.error;
            return c.json({ error: _exhaustive }, 500);
          }
        }
      }
      return c.json({
        evidence: result.evidence,
        admin: runtime.resourcesAdministration(),
      }, 201);
    },
  );

  app.get("/api/operational-processes", (c) => {
    const runtime = getProductSystem(c);
    const projection = projectOperationalProcessesAdministration(
      runtime.listActiveCostEvidence(),
      runtime.providerRegistry,
    );
    if (isOwner(c)) {
      return c.json(projection);
    }
    return c.json(omitForbiddenFinancialFields(projection, "commercial"));
  });

  app.get("/api/workcenters", (c) => {
    const runtime = getProductSystem(c);
    const projection = projectWorkcentersAdministration(
      runtime.providerRegistry,
      runtime.listActiveCostEvidence(),
    );
    if (isOwner(c)) {
      return c.json(projection);
    }
    return c.json(omitForbiddenFinancialFields(projection, "commercial"));
  });

  app.get("/api/governance", (c) => {
    return c.json(projectSystemGovernance());
  });
}

function omitResourceCostAmounts(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitResourceCostAmounts);
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (
        key === "amount" ||
        key === "amountDisplay" ||
        key === "rate" ||
        key === "cost" ||
        key === "activeAmount" ||
        key === "unitAmount"
      ) {
        continue;
      }
      next[key] = omitResourceCostAmounts(child);
    }
    return next;
  }
  return value;
}
