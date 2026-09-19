import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerProductSystemAdminRoutes(app: Hono<ApiEnv>): void {
  app.patch(
    "/api/admin/product-system/entities/:entityKind/:entityId/display-label",
    requireOwnerRole(),
    async (c) => {
      const runtime = getProductSystem(c);
      const entityKind = c.req.param("entityKind");
      const entityId = c.req.param("entityId");
      const body = (await c.req.json().catch(() => null)) as {
        displayLabel?: unknown;
        revision?: unknown;
      } | null;
      const expectedRevision =
        typeof body?.revision === "number" ? body.revision : undefined;
      const result = runtime.updateDisplayLabel(
        entityKind,
        entityId,
        body?.displayLabel,
        expectedRevision,
      );
      if (!result.ok) {
        switch (result.error) {
          case "invalid_kind":
          case "unknown_entity":
            return c.json({ error: result.error }, 404);
          case "invalid_label":
            return c.json({ error: result.error }, 400);
          case "revision_conflict":
            return c.json(
              { error: result.error, revision: result.revision },
              409,
            );
          default: {
            const _exhaustive: never = result.error;
            return c.json({ error: _exhaustive }, 500);
          }
        }
      }

      return c.json({
        entityKind: result.record.entityKind,
        entityId: result.record.entityId,
        displayLabel: result.record.displayLabel,
        revision: result.record.revision,
        admin: runtime.present().admin,
      });
    },
  );
}
