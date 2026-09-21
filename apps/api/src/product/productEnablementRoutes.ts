import {
  isProductEnablementSource,
  overlayEnablementLabels,
  productEnablementSourceLabel,
  type ProductEnablementDraft,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

const SINGLE_PLANE_OWNER_ACTOR = "single-plane:owner";

export function registerProductEnablementRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/product-enablement", (c) => {
    const runtime = getProductSystem(c);
    return c.json(presentProductEnablementAdmin(runtime, isOwner(c)));
  });

  app.post("/api/admin/product-enablement", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const drafts = readDrafts(await c.req.json().catch(() => null));
    if (!drafts) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const actorUserId = c.get("cloudUser")?.userId ?? SINGLE_PLANE_OWNER_ACTOR;
    const saved = runtime.saveProductEnablement(drafts, actorUserId);
    if (!saved.ok) {
      return c.json(
        {
          error: saved.error,
          issues: saved.issues ?? [],
          reasons: saved.issues?.map((issue) => issue.reason) ??
            (saved.reason ? [saved.reason] : []),
          ...presentProductEnablementAdmin(runtime, true),
        },
        saved.error === "invalid_enablement" ? 400 : 409,
      );
    }
    return c.json({
      alreadyApplied: saved.alreadyApplied,
      ...presentProductEnablementAdmin(runtime, true),
    });
  });
}

function presentProductEnablementAdmin(
  runtime: ReturnType<typeof getProductSystem>,
  canEdit: boolean,
) {
  const history = runtime.listProductEnablementVersions();
  const resolution = runtime.resolveProductEnablement();
  const labels = runtime.labels();
  const entries = resolution.ok
    ? overlayEnablementLabels(resolution.entries, labels)
    : [];
  return {
    canEdit,
    resolutionOk: resolution.ok,
    source: resolution.ok ? resolution.source : null,
    sourceLabel: resolution.ok ? productEnablementSourceLabel(resolution.source) : null,
    guidance: resolution.ok ? resolution.guidance : resolution.reason,
    activeVersion: resolution.ok ? resolution.version : null,
    products: entries.map((entry) => ({
      templateCode: entry.templateCode,
      label: entry.label,
      enabled: entry.enabled,
    })),
    history: history.map((row) => ({
      version: row.version,
      status: row.status,
      source: row.source,
      sourceLabel: isProductEnablementSource(row.source)
        ? productEnablementSourceLabel(row.source)
        : null,
      createdAt: row.createdAt,
      effectiveFrom: row.effectiveFrom,
      offeredCount: row.enabledTemplateCodes.length,
    })),
  };
}

function readDrafts(body: unknown): ProductEnablementDraft[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const payload = body as Record<string, unknown>;
  if (!Array.isArray(payload.products)) {
    return null;
  }
  const drafts: ProductEnablementDraft[] = [];
  for (const item of payload.products) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.templateCode !== "string" || typeof row.enabled !== "boolean") {
      return null;
    }
    drafts.push({
      templateCode: row.templateCode,
      enabled: row.enabled,
    });
  }
  return drafts;
}
