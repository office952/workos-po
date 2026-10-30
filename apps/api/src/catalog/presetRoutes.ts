import type { OrganizationPresetLifecycle, OrganizationPresetSelection } from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

const SINGLE_PLANE_OWNER_ACTOR = "single-plane:owner";

export function registerCatalogPresetRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/catalog/presets", (c) => {
    const templateCode = c.req.query("templateCode") ?? null;
    const runtime = getProductSystem(c);
    const role = isOwner(c) ? "owner" : "member";
    return c.json({
      canEdit: role === "owner",
      templateCode,
      presets: runtime.listOrganizationPresets(templateCode, role).map(presentPreset),
    });
  });

  app.get("/api/catalog/presets/:presetId", (c) => {
    const runtime = getProductSystem(c);
    const role = isOwner(c) ? "owner" : "member";
    const history = runtime.readOrganizationPresetHistory(c.req.param("presetId"), role);
    if (history.length === 0) return c.json({ error: "not_found" }, 404);
    return c.json({ canEdit: role === "owner", history: history.map(presentPreset) });
  });

  app.post("/api/catalog/presets", requireOwnerRole(), async (c) => {
    const body = readSave(await c.req.json().catch(() => null));
    if (!body) return c.json({ error: "invalid_payload" }, 400);
    const runtime = getProductSystem(c);
    const saved = runtime.saveOrganizationPreset({
      ...body,
      actorRole: "owner",
      actorUserId: c.get("cloudUser")?.userId ?? SINGLE_PLANE_OWNER_ACTOR,
    });
    if (!saved.ok) {
      return c.json({ error: saved.error, issues: saved.issues, reasons: saved.issues.map((issue) => issue.message) }, saved.status);
    }
    return c.json({
      preset: presentPreset(saved.preset),
      history: saved.history.map(presentPreset),
    });
  });
}

function presentPreset(preset: {
  presetId: string;
  revision: number;
  lifecycle: string;
  name: string;
  description: string;
  templateCode: string;
  templateVersion: string;
  selections: readonly OrganizationPresetSelection[];
  supersedesRevision: number | null;
}) {
  return {
    presetId: preset.presetId,
    revision: preset.revision,
    lifecycle: preset.lifecycle,
    name: preset.name,
    description: preset.description,
    templateCode: preset.templateCode,
    templateVersion: preset.templateVersion,
    selections: preset.selections,
    supersedesRevision: preset.supersedesRevision,
  };
}

function readSave(body: unknown): {
  presetId: string | null;
  expectedRevision: number | null;
  name: string;
  description: string;
  templateCode: string;
  selections: OrganizationPresetSelection[];
  lifecycle: OrganizationPresetLifecycle;
} | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const row = body as Record<string, unknown>;
  if (typeof row.templateCode !== "string" || typeof row.name !== "string") return null;
  if (row.description !== undefined && typeof row.description !== "string") return null;
  if (row.presetId !== undefined && row.presetId !== null && typeof row.presetId !== "string") return null;
  if (row.expectedRevision !== undefined && row.expectedRevision !== null && typeof row.expectedRevision !== "number") return null;
  if (row.lifecycle !== "DRAFT" && row.lifecycle !== "PUBLISHED" && row.lifecycle !== "RETIRED") return null;
  if (!Array.isArray(row.selections)) return null;
  const selections: OrganizationPresetSelection[] = [];
  for (const item of row.selections) {
    if (typeof item !== "object" || item === null) return null;
    const fieldId = (item as { fieldId?: unknown }).fieldId;
    const value = (item as { value?: unknown }).value;
    if (typeof fieldId !== "string" || typeof value !== "string") return null;
    selections.push({ fieldId, value });
  }
  return {
    presetId: typeof row.presetId === "string" ? row.presetId : null,
    expectedRevision: typeof row.expectedRevision === "number" ? row.expectedRevision : null,
    name: row.name,
    description: typeof row.description === "string" ? row.description : "",
    templateCode: row.templateCode,
    selections,
    lifecycle: row.lifecycle,
  };
}
