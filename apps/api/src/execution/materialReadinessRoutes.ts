import {
  materialReadinessModeLabel,
  type MaterialConfirmationError,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerMaterialReadinessRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/material-readiness", (c) => {
    const runtime = getProductSystem(c);
    const record = runtime.readMaterialReadiness();
    return c.json({
      canWrite: isOwner(c),
      mode: record.mode,
      modeLabel: materialReadinessModeLabel(record.mode),
      source: record.source,
      version: record.version,
    });
  });

  app.post("/api/admin/material-readiness", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const mode = readMode(await c.req.json().catch(() => null));
    if (!mode) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.setMaterialReadinessMode(
      mode,
      actorId(c),
      new Date().toISOString(),
    );
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      mode: result.record.mode,
      modeLabel: materialReadinessModeLabel(result.record.mode),
      source: result.record.source,
      version: result.record.version,
      canWrite: true,
    });
  });

  app.post("/api/execution-tasks/:taskId/material-readiness", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = readConfirmation(await c.req.json().catch(() => null));
    if (!body) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.confirmExecutionMaterial({
      taskId: c.req.param("taskId"),
      resourceId: body.resourceId,
      status: body.status,
      confirmedBy: actorId(c),
      confirmedAt: new Date().toISOString(),
    });
    if (!result.ok) {
      return c.json({ error: result.error }, confirmationHttpStatus(result.error));
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      confirmation: result.confirmation,
    });
  });
}

function actorId(c: ApiContext): string {
  return c.get("cloudUser")?.userId ?? "local";
}

function readMode(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const mode = (body as { mode?: unknown }).mode;
  return typeof mode === "string" && mode.trim().length > 0 ? mode.trim() : null;
}

function readConfirmation(body: unknown): { resourceId: string; status: string } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const resourceId = (body as { resourceId?: unknown }).resourceId;
  const status = (body as { status?: unknown }).status;
  if (typeof resourceId !== "string" || resourceId.trim().length === 0) {
    return null;
  }
  if (typeof status !== "string" || status.trim().length === 0) {
    return null;
  }
  return { resourceId: resourceId.trim(), status: status.trim() };
}

function confirmationHttpStatus(error: MaterialConfirmationError): 400 | 404 | 422 {
  switch (error) {
    case "task_not_found":
      return 404;
    case "invalid_status":
      return 400;
    case "not_material_demand":
      return 422;
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}
