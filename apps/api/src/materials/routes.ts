import type { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { OPERATOR_SESSION_COOKIE } from "../operator/store.js";

export function registerJobMaterialRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/jobs/:jobId/material-preparation", (c) => {
    const preparation = getProductSystem(c).readJobMaterialPreparation(c.req.param("jobId"));
    if (!preparation) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ preparation });
  });

  app.get("/api/material-requests", (c) => {
    // Organization-isolated candidate source for a future Purchases page.
    // A material request is not a purchase order or a receipt.
    return c.json({ requests: getProductSystem(c).listJobMaterialRequests() });
  });

  app.post("/api/jobs/:jobId/material-preparation/:resourceId/decision", async (c) => {
    const runtime = getProductSystem(c);
    const operator = runtime.resolveOperatorSession(getCookie(c, OPERATOR_SESSION_COOKIE));
    if (!operator.ok || operator.person.status !== "ACTIVE") {
      return c.json({ error: "operator_identity_required" }, 401);
    }
    const body: unknown = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as Record<string, unknown>;
    if (payload.status !== "AVAILABLE" && payload.status !== "MISSING") {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const actionKey = payload.actionKey;
    if (typeof actionKey !== "string" || !/^[a-zA-Z0-9_-]{12,100}$/.test(actionKey)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    if ("requestedQuantity" in payload) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.decideJobMaterial({
      jobId: c.req.param("jobId"),
      resourceId: c.req.param("resourceId"),
      status: payload.status,
      actionKey,
      personId: operator.person.personId,
      personLabel: operator.person.displayName,
      now: new Date().toISOString(),
    });
    if (!result.ok) {
      const status = result.error === "job_not_found" || result.error === "unknown_material"
        ? 404
        : result.error === "plan_missing" ||
          result.error === "already_requested" ||
          result.error === "idempotency_conflict" ||
          result.error === "material_no_longer_planned"
          ? 409
          : 422;
      return c.json({ error: result.error }, status);
    }
    return c.json({ alreadyApplied: result.alreadyApplied, preparation: result.preparation });
  });
}
