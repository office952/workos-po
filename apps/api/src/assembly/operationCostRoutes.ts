import {
  LAB_WORKSHOP_LABOR_ID,
  SVC_PACK_PRODUCT_ID,
  costEvidenceNeedsVerification,
  getResource,
  isFinalInspectionMode,
  isFinalPackagingMode,
  lookupCostEvidence,
  type CostEvidence,
  type FinalInspectionMode,
  type FinalPackagingMode,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";
import { actorUserId } from "../product.js";
import {
  listAssemblyOperationCostPolicyVersions,
  readCurrentAssemblyOperationCostPolicy,
  saveAssemblyOperationCostPolicy,
} from "./operationCostPolicyStore.js";

const INSPECTION_LABELS: Record<FinalInspectionMode, string> = {
  NOT_CONFIGURED: "Neconfigurat",
  INCLUDED_IN_OTHER_OPERATIONS: "Inclus în alte operații",
  SEPARATE_LABOR: "Manoperă separată (ore estimate)",
};

const PACKAGING_LABELS: Record<FinalPackagingMode, string> = {
  NOT_CONFIGURED: "Neconfigurat",
  PANEL_FACE_AREA: "Suprafața panoului",
};

export function registerAssemblyOperationCostRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/admin/assembly-operation-cost", (c) => {
    const runtime = getProductSystem(c);
    return c.json(presentAssemblyOperationCostAdmin(runtime, isOwner(c)));
  });

  app.post("/api/admin/assembly-operation-cost-policy", requireOwnerRole(), async (c) => {
    const runtime = getProductSystem(c);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const expectedVersion = body?.expectedVersion;
    if (
      !body ||
      !isFinalInspectionMode(body.finalInspectionMode) ||
      !isFinalPackagingMode(body.finalPackagingMode) ||
      !(expectedVersion === null || (Number.isInteger(expectedVersion) && (expectedVersion as number) >= 1))
    ) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const saved = saveAssemblyOperationCostPolicy(runtime.assemblyPlane().db, {
      expectedVersion: expectedVersion as number | null,
      finalInspectionMode: body.finalInspectionMode,
      finalPackagingMode: body.finalPackagingMode,
      updatedBy: actorUserId(c),
    });
    if (!saved.ok) {
      return c.json(
        {
          error: saved.error,
          reasons: ["Politica a fost modificată între timp. Reîncarcă pagina și reverifică valorile."],
          ...presentAssemblyOperationCostAdmin(runtime, true),
        },
        409,
      );
    }
    return c.json({
      alreadyApplied: saved.alreadyApplied,
      ...presentAssemblyOperationCostAdmin(runtime, true),
    });
  });
}

function presentAssemblyOperationCostAdmin(
  runtime: ReturnType<typeof getProductSystem>,
  financialVisible: boolean,
) {
  const db = runtime.assemblyPlane().db;
  const policy = readCurrentAssemblyOperationCostPolicy(db);
  const rows = runtime.listActiveCostEvidence();
  const inspection = policy?.finalInspectionMode ?? "NOT_CONFIGURED";
  const packaging = policy?.finalPackagingMode ?? "NOT_CONFIGURED";
  return {
    canEdit: financialVisible,
    version: policy?.version ?? null,
    updatedAt: policy?.updatedAt ?? null,
    finalInspectionMode: inspection,
    finalPackagingMode: packaging,
    inspectionOptions: Object.entries(INSPECTION_LABELS).map(([value, label]) => ({ value, label })),
    packagingOptions: Object.entries(PACKAGING_LABELS).map(([value, label]) => ({ value, label })),
    history: listAssemblyOperationCostPolicyVersions(db)
      .reverse()
      .map((item) => ({
        version: item.version,
        updatedAt: item.updatedAt,
        finalInspectionLabel: INSPECTION_LABELS[item.finalInspectionMode],
        finalPackagingLabel: PACKAGING_LABELS[item.finalPackagingMode],
      })),
    rates: [
      presentRate(LAB_WORKSHOP_LABOR_ID, rows, financialVisible),
      presentRate(SVC_PACK_PRODUCT_ID, rows, financialVisible),
    ],
    futureOnlyNotice:
      "Modificările se aplică doar ofertelor de ansamblu înghețate de acum înainte. Ofertele și comenzile existente rămân neschimbate.",
  };
}

function presentRate(resourceId: string, rows: readonly CostEvidence[], financialVisible: boolean) {
  const resource = getResource(resourceId);
  const evidence = lookupCostEvidence(rows, resourceId);
  const status = !evidence
    ? "MISSING"
    : costEvidenceNeedsVerification(evidence)
      ? "UNCONFIRMED"
      : "CONFIRMED";
  return {
    resourceId,
    label: resource?.label ?? resourceId,
    unit: resource?.unit ?? null,
    status,
    statusLabel:
      status === "MISSING" ? "Tarif lipsă" : status === "UNCONFIRMED" ? "Tarif neconfirmat" : "Tarif confirmat",
    evidenceRowId: evidence?.evidenceRowId ?? null,
    ...(financialVisible && evidence ? { amount: evidence.amount, currency: evidence.currency } : {}),
  };
}
