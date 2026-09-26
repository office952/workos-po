import {
  externalProductionHandoffModeLabel,
  type ExternalProviderMutationError,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerExternalProductionRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/external-production", (c) => {
    const runtime = getProductSystem(c);
    const mode = runtime.readExternalProductionHandoff();
    return c.json({
      canWrite: isOwner(c),
      mode: mode.mode,
      modeLabel: externalProductionHandoffModeLabel(mode.mode),
      source: mode.source,
      version: mode.version,
      providers: runtime.listExternalProductionProviders(),
    });
  });

  app.post("/api/admin/external-production", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const mode = readMode(await c.req.json().catch(() => null));
    if (!mode) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.setExternalProductionHandoffMode(
      mode,
      actorId(c),
      new Date().toISOString(),
    );
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      canWrite: true,
      mode: result.record.mode,
      modeLabel: externalProductionHandoffModeLabel(result.record.mode),
      source: result.record.source,
      version: result.record.version,
      providers: runtime.listExternalProductionProviders(),
    });
  });

  app.post("/api/admin/external-production/providers", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const name = readName(await c.req.json().catch(() => null));
    if (!name) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.createExternalProductionProvider(
      name,
      actorId(c),
      new Date().toISOString(),
    );
    if (!result.ok) {
      return c.json({ error: result.error }, providerHttpStatus(result.error));
    }
    return c.json({ provider: result.provider }, 201);
  });

  app.post(
    "/api/admin/external-production/providers/:providerId",
    requireOwnerRole(),
    async (c) => {
      const runtime = getProductSystem(c);
      const patch = readProviderPatch(await c.req.json().catch(() => null));
      if (!patch) {
        return c.json({ error: "invalid_payload" }, 400);
      }
      const result = runtime.updateExternalProductionProvider(c.req.param("providerId"), patch);
      if (!result.ok) {
        return c.json({ error: result.error }, providerHttpStatus(result.error));
      }
      return c.json({
        alreadyApplied: result.alreadyApplied,
        provider: result.provider,
      });
    },
  );
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

function readName(body: unknown): string | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const name = (body as { name?: unknown }).name;
  return typeof name === "string" && name.trim().length > 0 ? name : null;
}

function readProviderPatch(body: unknown): { name?: unknown; active?: unknown } | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const record = body as { name?: unknown; active?: unknown };
  if (record.name === undefined && record.active === undefined) {
    return null;
  }
  return { name: record.name, active: record.active };
}

function providerHttpStatus(
  error: ExternalProviderMutationError | "invalid_payload",
): 400 | 404 | 409 {
  switch (error) {
    case "invalid_name":
    case "invalid_payload":
      return 400;
    case "not_found":
      return 404;
    case "duplicate_name":
      return 409;
    default: {
      const exhaustive: never = error;
      return exhaustive;
    }
  }
}
