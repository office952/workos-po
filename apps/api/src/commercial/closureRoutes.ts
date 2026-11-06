import {
  isCommercialOfferDisposition,
  planReopenCommercialRequest,
  planResumeCommercialOffer,
  planSaveCommercialDecisions,
  type CommercialActor,
  type CommercialDecisionGroup,
  type CommercialMutationErrorCode,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";
import { financialAccess, scopedRequestDetail } from "../financial/access.js";
import {
  applyCommercialMutation,
  projectStoredCommercialView,
} from "./closureStore.js";

export function commercialActorFrom(c: ApiContext): CommercialActor {
  const user = c.get("cloudUser");
  return {
    accountId: c.get("cloudUser")?.userId ?? "local",
    role: isOwner(c) ? "owner" : "member",
    displayName: user?.email ?? "Proprietar local",
  };
}

export function registerCommercialClosureRoutes(app: Hono<ApiEnv>): void {
  app.post(
    "/api/requests/:requestId/commercial/decisions",
    requireOwnerRole(),
    async (c) => {
      const body = await c.req.json().catch(() => null);
      const record = asRecord(body);
      const groups = readDecisionGroups(record);
      const operationId = readString(record, "operationId");
      if (!groups || !operationId) {
        return c.json({ error: "invalid_payload" }, 400);
      }
      return respondCommercialMutation(c, operationId, (ctx) =>
        planSaveCommercialDecisions({
          requestId: c.req.param("requestId"),
          ledger: ctx.ledger,
          offers: ctx.offers,
          groups,
          close: record?.close === true,
          closeReason: record?.closeReason ?? null,
          expectedRevision: record?.expectedRevision,
          operationId,
          actor: commercialActorFrom(c),
          existingOperation: ctx.existingOperation,
        }),
      );
    },
  );

  app.post(
    "/api/requests/:requestId/commercial/reopen",
    requireOwnerRole(),
    async (c) => {
      const record = asRecord(await c.req.json().catch(() => null));
      const operationId = readString(record, "operationId");
      if (!operationId) {
        return c.json({ error: "invalid_payload" }, 400);
      }
      return respondCommercialMutation(c, operationId, (ctx) =>
        planReopenCommercialRequest({
          requestId: c.req.param("requestId"),
          ledger: ctx.ledger,
          reason: record?.reason,
          expectedRevision: record?.expectedRevision,
          operationId,
          actor: commercialActorFrom(c),
          existingOperation: ctx.existingOperation,
        }),
      );
    },
  );

  app.post(
    "/api/requests/:requestId/quotes/:quoteSnapshotId/resume",
    requireOwnerRole(),
    async (c) => {
      const record = asRecord(await c.req.json().catch(() => null));
      const operationId = readString(record, "operationId");
      if (!operationId) {
        return c.json({ error: "invalid_payload" }, 400);
      }
      return respondCommercialMutation(c, operationId, (ctx) =>
        planResumeCommercialOffer({
          requestId: c.req.param("requestId"),
          ledger: ctx.ledger,
          offers: ctx.offers,
          quoteSnapshotId: c.req.param("quoteSnapshotId"),
          reason: record?.reason,
          expectedRevision: record?.expectedRevision,
          operationId,
          actor: commercialActorFrom(c),
          existingOperation: ctx.existingOperation,
        }),
      );
    },
  );
}

function respondCommercialMutation(
  c: ApiContext,
  operationId: string,
  planFor: Parameters<typeof applyCommercialMutation>[6],
) {
  const runtime = getProductSystem(c);
  const requestId = c.req.param("requestId");
  if (!requestId) {
    return c.json({ error: "not_found" }, 404);
  }
  const plane = runtime.assemblyPlane();
  const result = applyCommercialMutation(
    plane.db,
    plane.organizationId,
    requestId,
    commercialActorFrom(c),
    new Date().toISOString(),
    operationId,
    planFor,
  );
  if (!result.ok) {
    return c.json(
      {
        error: result.error,
        reasons: result.reasons,
        currentRevision: result.currentRevision,
        blockingQuoteSnapshotIds: result.blockingQuoteSnapshotIds,
        commercial: projectStoredCommercialView(
          plane.db,
          plane.organizationId,
          requestId,
          isOwner(c),
          isOwner(c),
        ),
      },
      commercialHttpStatus(result.error),
    );
  }
  const detail = scopedRequestDetail(
    runtime.readRequestDetail(requestId),
    financialAccess(c, "commercial"),
  );
  return c.json({
    alreadyApplied: result.idempotent,
    commercial: projectStoredCommercialView(
      plane.db,
      plane.organizationId,
      requestId,
      isOwner(c),
      isOwner(c),
    ),
    detail,
  });
}

function commercialHttpStatus(
  error: CommercialMutationErrorCode,
): 400 | 403 | 404 | 409 | 422 {
  switch (error) {
    case "invalid_payload":
    case "reason_required":
    case "homogeneous_reason_required":
    case "close_reason_required":
      return 400;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "commercial_revision_mismatch":
    case "commercial_operation_conflict":
      return 409;
    case "unresolved_offers":
    case "offer_not_eligible":
    case "commercial_request_closed":
    case "commercial_request_open":
    case "accepted_offer_not_declinable":
    case "ordered_offer_not_declinable":
    case "superseded_offer_not_resumable":
    case "offer_not_resumable":
    case "offers_present":
      return 422;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : null;
}

function readString(body: Record<string, unknown> | null, key: string): string | null {
  const value = body?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readDecisionGroups(body: Record<string, unknown> | null): CommercialDecisionGroup[] | null {
  if (!body || !("groups" in body) || body.groups === undefined) {
    return [];
  }
  const groups = body.groups;
  if (!Array.isArray(groups)) {
    return null;
  }
  const parsed: CommercialDecisionGroup[] = [];
  for (const group of groups) {
    if (typeof group !== "object" || group === null) {
      return null;
    }
    const record = group as { disposition?: unknown; reason?: unknown; quoteSnapshotIds?: unknown };
    if (typeof record.disposition !== "string" || !isCommercialOfferDisposition(record.disposition)) {
      return null;
    }
    if (typeof record.reason !== "string") {
      return null;
    }
    if (!Array.isArray(record.quoteSnapshotIds)) {
      return null;
    }
    const quoteSnapshotIds = record.quoteSnapshotIds.filter(
      (id): id is string => typeof id === "string",
    );
    if (quoteSnapshotIds.length !== record.quoteSnapshotIds.length) {
      return null;
    }
    parsed.push({
      disposition: record.disposition,
      reason: record.reason,
      quoteSnapshotIds,
    });
  }
  return parsed;
}
