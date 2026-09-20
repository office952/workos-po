import {
  CODE_DEFAULT_POLICY_GUIDANCE,
  DEFAULT_COMMERCIAL_POLICY,
  commercialPolicySourceLabel,
  type CommercialPolicyDraftValues,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";

export function registerCommercialPolicyRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/commercial-policy", requireOwnerRole(), (c) => {
    const runtime = getProductSystem(c);
    return c.json(presentCommercialPolicyAdmin(runtime, true));
  });

  app.post("/api/admin/commercial-policy", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const values = readDraftValues(await c.req.json().catch(() => null));
    if (!values) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const saved = runtime.saveCommercialPolicy(values);
    if (!saved.ok) {
      return c.json(
        {
          error: saved.error,
          issues: saved.issues ?? [],
          reasons: saved.issues?.map((issue) => issue.reason) ??
            (saved.reason ? [saved.reason] : []),
          ...presentCommercialPolicyAdmin(runtime, true),
        },
        saved.error === "invalid_policy" ? 400 : 409,
      );
    }
    return c.json({
      alreadyApplied: saved.alreadyApplied,
      ...presentCommercialPolicyAdmin(runtime, true),
    });
  });
}

function presentCommercialPolicyAdmin(
  runtime: ReturnType<typeof getProductSystem>,
  canEdit: boolean,
) {
  const history = runtime.listCommercialPolicyVersions();
  const resolution = runtime.resolveCommercialPolicy();
  const policy = resolution.ok ? resolution.policy : null;
  const source = policy?.source ?? null;
  const latest = history[history.length - 1];
  const formSource = policy ?? latest ?? DEFAULT_COMMERCIAL_POLICY;
  return {
    canEdit,
    resolutionOk: resolution.ok,
    source,
    sourceLabel: source ? commercialPolicySourceLabel(source) : null,
    guidance: resolution.ok
      ? source === "CODE_DEFAULT"
        ? CODE_DEFAULT_POLICY_GUIDANCE
        : "Aceste valori sunt folosite ca punct de pornire pentru ofertele noi. Pot fi modificate individual pe fiecare ofertă."
      : resolution.reason,
    policyId: policy?.id ?? DEFAULT_COMMERCIAL_POLICY.id,
    activeVersion: policy && source === "ORGANIZATION" ? policy.version : null,
    resolvedPolicy: policy,
    editable: {
      markupPercent: formSource.markupPercent,
      vatPercent: formSource.vatPercent,
      defaultDiscountPercent: formSource.defaultDiscountPercent,
      defaultAdjustment: formSource.defaultAdjustment,
    },
    readOnly: {
      currency: "EUR",
      rounding: 0.01,
      policyId: policy?.id ?? "DEFAULT_COMMERCIAL_POLICY",
      source,
      activeVersion: policy && source === "ORGANIZATION" ? policy.version : null,
    },
    history: history.map((row) => ({
      version: row.version,
      status: row.status,
      source: row.source,
      createdAt: row.createdAt,
      effectiveFrom: row.effectiveFrom,
      markupPercent: row.markupPercent,
      vatPercent: row.vatPercent,
      defaultDiscountPercent: row.defaultDiscountPercent,
      defaultAdjustment: row.defaultAdjustment,
      currency: row.currency,
      rounding: row.rounding,
    })),
  };
}

function readDraftValues(body: unknown): CommercialPolicyDraftValues | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const payload = body as Record<string, unknown>;
  const markupPercent = asFiniteNumber(payload.markupPercent);
  const vatPercent = asFiniteNumber(payload.vatPercent);
  const defaultDiscountPercent = asFiniteNumber(payload.defaultDiscountPercent);
  const defaultAdjustment = asFiniteNumber(payload.defaultAdjustment);
  if (
    markupPercent === null ||
    vatPercent === null ||
    defaultDiscountPercent === null ||
    defaultAdjustment === null
  ) {
    return null;
  }
  return {
    markupPercent,
    vatPercent,
    defaultDiscountPercent,
    defaultAdjustment,
  };
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}
