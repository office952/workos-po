import {
  isSupportedTechnicalSettingId,
  requiredTechnicalSettingDefinitions,
  technicalSettingDefinitionId,
  technicalSettingSourceLabel,
  technicalSettingStatusLabel,
  type TechnicalSettingDraftValue,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

const SINGLE_PLANE_OWNER_ACTOR = "single-plane:owner";

export function registerTechnicalSettingRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/technical-settings", (c) => {
    const runtime = getProductSystem(c);
    return c.json(presentTechnicalSettingsAdmin(runtime, isOwner(c)));
  });

  app.post("/api/admin/technical-settings", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const drafts = readDrafts(await c.req.json().catch(() => null));
    if (!drafts) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const actorUserId = c.get("cloudUser")?.userId ?? SINGLE_PLANE_OWNER_ACTOR;
    const saved = runtime.saveTechnicalSettings(drafts, {
      kind: "USER",
      userId: actorUserId,
    });
    if (!saved.ok) {
      return c.json(
        {
          error: saved.error,
          issues: saved.issues ?? [],
          reasons: saved.issues?.map((issue) => issue.reason) ??
            (saved.reason ? [saved.reason] : []),
          ...presentTechnicalSettingsAdmin(runtime, true),
        },
        saved.error === "invalid_settings" ? 400 : 409,
      );
    }
    return c.json({
      alreadyApplied: saved.alreadyApplied,
      ...presentTechnicalSettingsAdmin(runtime, true),
    });
  });
}

function presentTechnicalSettingsAdmin(
  runtime: ReturnType<typeof getProductSystem>,
  canEdit: boolean,
) {
  const history = runtime.listTechnicalSettingVersions();
  const resolution = runtime.resolveTechnicalSettings();
  const settings = requiredTechnicalSettingDefinitions().map((definition) => {
    const definitionId = technicalSettingDefinitionId(definition.typeId, definition.id);
    const resolved = resolution.ok
      ? resolution.settings.find((item) => item.definitionId === definitionId)
      : undefined;
    const latest = [...history].reverse().find((row) => row.definitionId === definitionId);
    const current = resolved ?? latest;
    return {
      definitionId,
      settingId: definition.id,
      typeId: definition.typeId,
      label: definition.label,
      description: definition.description,
      value: current?.value ?? null,
      unit: definition.unit,
      source: resolved?.source ?? current?.source ?? null,
      sourceLabel: resolved
        ? technicalSettingSourceLabel(resolved.source)
        : current
          ? technicalSettingSourceLabel(current.source)
          : null,
      version: resolved?.version ?? current?.version ?? null,
      status: resolved?.status ?? current?.status ?? null,
      statusLabel: resolved
        ? technicalSettingStatusLabel(resolved.status)
        : current
          ? technicalSettingStatusLabel(current.status)
          : null,
      effectiveFrom: resolved?.effectiveFrom ?? current?.effectiveFrom ?? null,
    };
  });
  return {
    canEdit,
    resolutionOk: resolution.ok,
    guidance: resolution.ok
      ? "Aceste valori sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate."
      : resolution.reason,
    settings,
    history: history.map((row) => ({
      definitionId: row.definitionId,
      settingId: row.settingId,
      typeId: row.typeId,
      version: row.version,
      status: row.status,
      statusLabel: technicalSettingStatusLabel(row.status),
      source: row.source,
      sourceLabel: technicalSettingSourceLabel(row.source),
      value: row.value,
      unit: row.unit,
      createdAt: row.createdAt,
      effectiveFrom: row.effectiveFrom,
      actorKind: row.actorKind,
    })),
  };
}

function readDrafts(body: unknown): TechnicalSettingDraftValue[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const payload = body as Record<string, unknown>;
  if (Array.isArray(payload.settings)) {
    const drafts: TechnicalSettingDraftValue[] = [];
    for (const item of payload.settings) {
      if (typeof item !== "object" || item === null) {
        return null;
      }
      const row = item as Record<string, unknown>;
      const settingId = typeof row.settingId === "string" ? row.settingId : "";
      const value = asFiniteNumber(row.value);
      if (!isSupportedTechnicalSettingId(settingId) || value === null) {
        return null;
      }
      drafts.push({ settingId, value });
    }
    return drafts.length > 0 ? drafts : null;
  }

  const drafts: TechnicalSettingDraftValue[] = [];
  for (const settingId of [
    "ledPitchMm",
    "ledModulePowerW",
    "psuReservePercent",
  ] as const) {
    if (!(settingId in payload)) {
      continue;
    }
    const value = asFiniteNumber(payload[settingId]);
    if (value === null) {
      return null;
    }
    drafts.push({ settingId, value });
  }
  return drafts.length > 0 ? drafts : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
