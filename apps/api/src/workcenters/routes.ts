import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerWorkcenterRoutes(app: Hono<ApiEnv>): void {
  app.post("/api/organization-providers/capability", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const payload = body as { capabilityId?: unknown; label?: unknown };
    if (typeof payload.capabilityId !== "string" || typeof payload.label !== "string") {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.ensureOrganizationCapabilityProvider({
      capabilityId: payload.capabilityId,
      label: payload.label,
    });
    if (!result.ok) {
      return c.json(
        { error: result.error, detail: result.detail },
        result.error === "provider_in_use" ? 409 : 400,
      );
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      machineId: result.machineId,
    });
  });
}
