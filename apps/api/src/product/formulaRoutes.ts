import {
  explainFormulaAst,
  isFormulaVersionSource,
  isFormulaVersionStatus,
  isSupportedFormulaId,
  parseFormulaAst,
  requiredFormulaDefinitions,
  formulaSourceLabel,
  formulaStatusLabel,
  type FormulaDraftExpression,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

const SINGLE_PLANE_OWNER_ACTOR = "single-plane:owner";

export function registerFormulaRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/formulas", (c) => {
    const runtime = getProductSystem(c);
    return c.json(presentFormulasAdmin(runtime, isOwner(c)));
  });

  app.post("/api/admin/formulas", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const drafts = readDrafts(await c.req.json().catch(() => null));
    if (!drafts) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const actorUserId = c.get("cloudUser")?.userId ?? SINGLE_PLANE_OWNER_ACTOR;
    const saved = runtime.saveFormulas(drafts, {
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
          ...presentFormulasAdmin(runtime, true),
        },
        saved.error === "invalid_formulas" ? 400 : 409,
      );
    }
    return c.json({
      alreadyApplied: saved.alreadyApplied,
      ...presentFormulasAdmin(runtime, true),
    });
  });
}

function presentFormulasAdmin(
  runtime: ReturnType<typeof getProductSystem>,
  canEdit: boolean,
) {
  const history = runtime.listFormulaVersions();
  const resolution = runtime.resolveFormulas();
  const formulas = requiredFormulaDefinitions().map((definition) => {
    const resolved = resolution.ok
      ? resolution.formulas.find((item) => item.formulaId === definition.formulaId)
      : undefined;
    const latest = [...history].reverse().find((row) => row.formulaId === definition.formulaId);
    const current = resolved ?? latest;
    return {
      formulaId: definition.formulaId,
      resultId: definition.resultId,
      typeId: definition.componentTypeId,
      label: definition.label,
      description: definition.description,
      resultUnit: definition.resultUnit,
      resultValueKind: definition.resultValueKind,
      allowedOperators: definition.allowedOperators,
      allowedReferences: definition.allowedReferences,
      expression: resolved?.expression ?? null,
      explanation: resolved ? explainFormulaAst(resolved.expression) : null,
      source: resolved?.source ?? current?.source ?? null,
      sourceLabel: resolved
        ? formulaSourceLabel(resolved.source)
        : current
          ? persistedSourceLabel(current.source)
          : null,
      version: resolved?.version ?? current?.version ?? null,
      status: resolved?.status ?? current?.status ?? null,
      statusLabel: resolved
        ? formulaStatusLabel(resolved.status)
        : current
          ? persistedStatusLabel(current.status)
          : null,
      astIdentity: resolved?.astIdentity ?? null,
      effectiveFrom: resolved?.effectiveFrom ?? current?.effectiveFrom ?? null,
    };
  });
  return {
    canEdit,
    resolutionOk: resolution.ok,
    guidance: resolution.ok
      ? "Aceste formule sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate."
      : resolution.reason,
    formulas,
    history: history.map((row) => ({
      formulaId: row.formulaId,
      resultId: row.resultId,
      typeId: row.componentTypeId,
      version: row.version,
      status: row.status,
      statusLabel: persistedStatusLabel(row.status),
      source: row.source,
      sourceLabel: persistedSourceLabel(row.source),
      createdAt: row.createdAt,
      effectiveFrom: row.effectiveFrom,
      actorKind: row.actorKind,
    })),
  };
}

function readDrafts(body: unknown): FormulaDraftExpression[] | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const payload = body as Record<string, unknown>;
  const items = Array.isArray(payload.formulas) ? payload.formulas : [payload];
  const drafts: FormulaDraftExpression[] = [];
  for (const item of items) {
    if (typeof item !== "object" || item === null) {
      return null;
    }
    const row = item as Record<string, unknown>;
    const formulaId = typeof row.formulaId === "string" ? row.formulaId : "";
    if (!isSupportedFormulaId(formulaId)) {
      return null;
    }
    const parsed = parseFormulaAst(row.expression);
    if (!parsed.ok) {
      return null;
    }
    drafts.push({ formulaId, expression: parsed.ast });
  }
  return drafts.length > 0 ? drafts : null;
}

function persistedSourceLabel(source: string): string | null {
  return isFormulaVersionSource(source) ? formulaSourceLabel(source) : null;
}

function persistedStatusLabel(status: string): string | null {
  return isFormulaVersionStatus(status) ? formulaStatusLabel(status) : null;
}
