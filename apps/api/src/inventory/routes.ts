import type { InventoryMutationError } from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerInventoryRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/inventory", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ inventory: runtime.readInventory() });
  });

  app.get("/api/inventory/:resourceId", (c) => {
    const runtime = getProductSystem(c);
    const detail = runtime.readInventoryItem(c.req.param("resourceId"));
    if (!detail) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ item: detail.item, movements: detail.movements });
  });

  app.post("/api/inventory/:resourceId/adjustments", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const input = readAdjustmentInput(await c.req.json().catch(() => null));
    if (!input) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.recordInventoryAdjustment(
      c.req.param("resourceId"),
      input.quantityDelta,
      input.note,
    );
    if (!result.ok) {
      return c.json({ error: result.error }, inventoryHttpStatus(result.error));
    }
    return c.json({
      movement: result.movement,
      inventory: result.projection,
    });
  });
}

function readAdjustmentInput(
  body: unknown,
): { quantityDelta: number; note?: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as { quantityDelta?: unknown; note?: unknown };
  if (typeof record.quantityDelta !== "number") {
    return null;
  }
  if (record.note !== undefined && typeof record.note !== "string") {
    return null;
  }
  return {
    quantityDelta: record.quantityDelta,
    ...(typeof record.note === "string" ? { note: record.note } : {}),
  };
}

function inventoryHttpStatus(error: InventoryMutationError): 404 | 422 {
  switch (error) {
    case "invalid_resource":
      return 404;
    case "invalid_quantity":
    case "invalid_note":
      return 422;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
