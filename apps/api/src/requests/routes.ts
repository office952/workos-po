import {
  isCommercialRequestStatus,
  MAX_REQUEST_ATTACHMENT_HTTP_BODY_BYTES,
  safeAttachmentDownloadAsciiName,
  isOperationalServiceProviderMode,
  type CommercialRequestLinkError,
  type CommercialRequestMutationError,
  type CommercialRequestStatus,
  type OperationalServiceProviderMode,
  type RequestAttachmentError,
  type SiteInstallationFactsMutationError,
  type SiteInstallationFactsPatch,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getProductSystem, isOwner, type ApiContext, type ApiEnv } from "../cloud/context.js";
import { requireOwnerRole } from "../cloud/middleware.js";
import { financialAccess, scopedRequestDetail } from "../financial/access.js";
import { httpPathIdentity } from "../httpPathIdentity.js";

function requestDetailFor(c: ApiContext, requestId: string) {
  return scopedRequestDetail(
    getProductSystem(c).readRequestDetail(requestId),
    financialAccess(c, "commercial"),
  );
}

export function registerRequestRoutes(app: Hono<ApiEnv>): void {
  app.get("/api/requests", (c) => {
    const runtime = getProductSystem(c);
    return c.json({ overview: runtime.listRequestOverview() });
  });

  app.post("/api/requests", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const input = readCreateInput(body);
    if (!input) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.createCommercialRequest(
      input.customerId,
      input.title,
      input.description,
    );
    if (!result.ok) {
      return c.json({ error: result.error }, requestMutationStatus(result.error));
    }
    return c.json({ request: result.request, detail: requestDetailFor(c, result.request.requestId) }, 201);
  });

  app.get("/api/requests/:requestId", (c) => {
    const detail = requestDetailFor(c, httpPathIdentity(c.req.path, "/api/requests/"));
    if (!detail) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ detail });
  });

  app.patch("/api/requests/:requestId", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const patch = readUpdateInput(body);
    if (!patch) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.updateCommercialRequest(c.req.param("requestId"), patch);
    if (!result.ok) {
      return c.json({ error: result.error }, requestMutationStatus(result.error));
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      request: result.request,
      detail: requestDetailFor(c, result.request.requestId),
    });
  });

  app.patch("/api/requests/:requestId/installation-facts", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const parsed = readInstallationFactsInput(body);
    if (!parsed.ok) {
      return c.json({ error: parsed.error }, 400);
    }
    const result = runtime.updateInstallationFacts(
      c.req.param("requestId"),
      parsed.patch,
      parsed.expectedVersion,
    );
    if (!result.ok) {
      return c.json({ error: result.error }, factsMutationStatus(result.error));
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      facts: result.facts,
      detail: requestDetailFor(c, c.req.param("requestId")),
    });
  });

  app.patch(
    "/api/requests/:requestId/installation-price",
    requireOwnerRole(),
    async (c) => {
      const runtime = getProductSystem(c);
      const body = await c.req.json().catch(() => null);
      const netPrice = readManualNetPrice(body);
      if (netPrice === false) {
        return c.json({ error: "invalid_payload" }, 400);
      }
      const result = runtime.updateInstallationManualPrice(
        c.req.param("requestId"),
        netPrice,
        isOwner(c),
      );
      if (!result.ok) {
        return c.json({ error: result.error }, priceMutationStatus(result.error));
      }
      return c.json({
        alreadyApplied: result.alreadyApplied,
        request: result.request,
        detail: requestDetailFor(c, result.request.requestId),
      });
    },
  );

  app.post("/api/requests/:requestId/quotes", async (c) => {
    const runtime = getProductSystem(c);
    const body = await c.req.json().catch(() => null);
    const quoteSnapshotId = readQuoteSnapshotId(body);
    if (!quoteSnapshotId) {
      return c.json({ error: "invalid_payload" }, 400);
    }
    const result = runtime.linkRequestQuote(c.req.param("requestId"), quoteSnapshotId);
    if (!result.ok) {
      if (result.error === "incomplete_offer") {
        return c.json(
          { error: result.error, reasons: result.reasons },
          422,
        );
      }
      return c.json({ error: result.error }, requestLinkStatus(result.error));
    }
    return c.json({
      alreadyApplied: result.alreadyApplied,
      link: result.link,
      detail: requestDetailFor(c, c.req.param("requestId")),
    });
  });

  app.get("/api/requests/:requestId/attachments", (c) => {
    const runtime = getProductSystem(c);
    const attachments = runtime.listRequestAttachments(c.req.param("requestId"));
    if (!attachments) {
      return c.json({ error: "not_found" }, 404);
    }
    return c.json({ attachments });
  });

  app.post(
    "/api/requests/:requestId/attachments",
    bodyLimit({
      maxSize: MAX_REQUEST_ATTACHMENT_HTTP_BODY_BYTES,
      onError: (c) => c.json({ error: "file_too_large" }, 413),
    }),
    async (c) => {
      const runtime = getProductSystem(c);
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!(file instanceof File) || file.size === 0) {
        return c.json({ error: "invalid_file" }, 400);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = runtime.createRequestAttachment(c.req.param("requestId"), {
        originalFileName: file.name || "fisier",
        mimeType: file.type || null,
        bytes,
      });
      if (!result.ok) {
        return c.json(
          { error: result.error },
          requestAttachmentStatus(result.error),
        );
      }
      return c.json(
        {
          attachment: result.attachment,
          detail: requestDetailFor(c, c.req.param("requestId")),
        },
        201,
      );
    },
  );

  app.get("/api/requests/:requestId/attachments/:attachmentId/download", (c) => {
    const runtime = getProductSystem(c);
    const result = runtime.readRequestAttachmentDownload(
      c.req.param("requestId"),
      c.req.param("attachmentId"),
    );
    if (!result.ok) {
      return c.json(
        { error: result.error },
        requestAttachmentStatus(result.error),
      );
    }
    const ascii = safeAttachmentDownloadAsciiName(result.attachment.originalFileName);
    const utf8 = encodeURIComponent(result.attachment.originalFileName);
    return c.body(Buffer.from(result.bytes), 200, {
      "Content-Type": result.attachment.mimeType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`,
      "Content-Length": String(result.bytes.byteLength),
    });
  });
}

function readCreateInput(body: unknown): {
  customerId: string;
  title: string;
  description: string;
} | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const payload = body as {
    customerId?: unknown;
    title?: unknown;
    description?: unknown;
  };
  if (
    typeof payload.customerId !== "string" ||
    typeof payload.title !== "string" ||
    typeof payload.description !== "string"
  ) {
    return null;
  }
  const customerId = payload.customerId.trim();
  if (!customerId) {
    return null;
  }
  return {
    customerId,
    title: payload.title,
    description: payload.description,
  };
}

function readUpdateInput(body: unknown): {
  title?: string;
  description?: string;
  status?: CommercialRequestStatus;
  customerId?: string;
    optionalScopeIds?: readonly string[];
    siteInstallationMode?: OperationalServiceProviderMode | null;
    confirmDeleteInstallationFacts?: boolean;
} | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const payload = body as {
    title?: unknown;
    description?: unknown;
    status?: unknown;
    customerId?: unknown;
    optionalScopeIds?: unknown;
    siteInstallationMode?: unknown;
    confirmDeleteInstallationFacts?: unknown;
  };
  const patch: {
    title?: string;
    description?: string;
    status?: CommercialRequestStatus;
    customerId?: string;
    optionalScopeIds?: readonly string[];
    siteInstallationMode?: OperationalServiceProviderMode | null;
    confirmDeleteInstallationFacts?: boolean;
  } = {};
  if (payload.title !== undefined) {
    if (typeof payload.title !== "string") {
      return null;
    }
    patch.title = payload.title;
  }
  if (payload.description !== undefined) {
    if (typeof payload.description !== "string") {
      return null;
    }
    patch.description = payload.description;
  }
  if (payload.status !== undefined) {
    if (typeof payload.status !== "string" || !isCommercialRequestStatus(payload.status)) {
      return null;
    }
    patch.status = payload.status;
  }
  if (payload.customerId !== undefined) {
    if (typeof payload.customerId !== "string" || payload.customerId.trim().length === 0) {
      return null;
    }
    patch.customerId = payload.customerId.trim();
  }
  if (payload.optionalScopeIds !== undefined) {
    if (!Array.isArray(payload.optionalScopeIds)) {
      return null;
    }
    const optionalScopeIds: string[] = [];
    for (const value of payload.optionalScopeIds) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return null;
      }
      optionalScopeIds.push(value.trim());
    }
    patch.optionalScopeIds = optionalScopeIds;
  }
  if (payload.siteInstallationMode !== undefined) {
    if (payload.siteInstallationMode === null) {
      patch.siteInstallationMode = null;
    } else if (
      typeof payload.siteInstallationMode !== "string" ||
      !isOperationalServiceProviderMode(payload.siteInstallationMode)
    ) {
      return null;
    } else {
      patch.siteInstallationMode = payload.siteInstallationMode;
    }
  }
  if (payload.confirmDeleteInstallationFacts !== undefined) {
    if (typeof payload.confirmDeleteInstallationFacts !== "boolean") {
      return null;
    }
    patch.confirmDeleteInstallationFacts = payload.confirmDeleteInstallationFacts;
  }
  if (
    patch.title === undefined &&
    patch.description === undefined &&
    patch.status === undefined &&
    patch.customerId === undefined &&
    patch.optionalScopeIds === undefined &&
    patch.siteInstallationMode === undefined &&
    patch.confirmDeleteInstallationFacts === undefined
  ) {
    return null;
  }
  return patch;
}

function readOptionalString(value: unknown): string | null | undefined | false {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : false;
}

function readOptionalMillimetres(value: unknown): number | null | undefined | false {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : false;
}

function readOptionalNumber(value: unknown): number | null | undefined | false {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : false;
}

function readManualNetPrice(body: unknown): number | null | false {
  if (typeof body !== "object" || body === null || !("netPrice" in body)) {
    return false;
  }
  const value = (body as { netPrice: unknown }).netPrice;
  if (value === null) {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : false;
}

function readInstallationFactsInput(body: unknown):
  | { ok: true; patch: SiteInstallationFactsPatch; expectedVersion: number }
  | { ok: false; error: "invalid_payload" | "expected_version_required" } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_payload" };
  }
  const payload = body as Record<string, unknown>;
  if (payload.expectedVersion === undefined) {
    return { ok: false, error: "expected_version_required" };
  }
  const expectedVersion = payload.expectedVersion;
  if (
    typeof expectedVersion !== "number" ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 0
  ) {
    return { ok: false, error: "invalid_payload" };
  }
  const patch: SiteInstallationFactsPatch = {};
  const siteName = readOptionalString(payload.siteName);
  if (siteName === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (siteName !== undefined) {
    patch.siteName = siteName;
  }
  if (payload.street !== undefined) {
    if (typeof payload.street !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.street = payload.street;
  }
  if (payload.city !== undefined) {
    if (typeof payload.city !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.city = payload.city;
  }
  const county = readOptionalString(payload.county);
  if (county === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (county !== undefined) {
    patch.county = county;
  }
  const postalCode = readOptionalString(payload.postalCode);
  if (postalCode === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (postalCode !== undefined) {
    patch.postalCode = postalCode;
  }
  if (payload.countryCode !== undefined) {
    if (typeof payload.countryCode !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.countryCode = payload.countryCode;
  }
  const contactName = readOptionalString(payload.contactName);
  if (contactName === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (contactName !== undefined) {
    patch.contactName = contactName;
  }
  const contactPhone = readOptionalString(payload.contactPhone);
  if (contactPhone === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (contactPhone !== undefined) {
    patch.contactPhone = contactPhone;
  }
  const accessNotes = readOptionalString(payload.accessNotes);
  if (accessNotes === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (accessNotes !== undefined) {
    patch.accessNotes = accessNotes;
  }
  if (payload.measurementStatus !== undefined) {
    if (typeof payload.measurementStatus !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.measurementStatus = payload.measurementStatus;
  }
  const width = readOptionalMillimetres(payload.mountingSurfaceWidthMm);
  if (width === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (width !== undefined) {
    patch.mountingSurfaceWidthMm = width;
  }
  const height = readOptionalMillimetres(payload.mountingSurfaceHeightMm);
  if (height === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (height !== undefined) {
    patch.mountingSurfaceHeightMm = height;
  }
  const elevation = readOptionalMillimetres(payload.installationElevationMm);
  if (elevation === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (elevation !== undefined) {
    patch.installationElevationMm = elevation;
  }
  const measuredAt = readOptionalString(payload.measuredAt);
  if (measuredAt === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (measuredAt !== undefined) {
    patch.measuredAt = measuredAt;
  }
  const measurementNotes = readOptionalString(payload.measurementNotes);
  if (measurementNotes === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (measurementNotes !== undefined) {
    patch.measurementNotes = measurementNotes;
  }
  if (payload.facadeType !== undefined) {
    if (typeof payload.facadeType !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.facadeType = payload.facadeType;
  }
  const facadeOtherNote = readOptionalString(payload.facadeOtherNote);
  if (facadeOtherNote === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (facadeOtherNote !== undefined) {
    patch.facadeOtherNote = facadeOtherNote;
  }
  if (payload.fixingMethod !== undefined) {
    if (typeof payload.fixingMethod !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.fixingMethod = payload.fixingMethod;
  }
  const fixingOtherNote = readOptionalString(payload.fixingOtherNote);
  if (fixingOtherNote === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (fixingOtherNote !== undefined) {
    patch.fixingOtherNote = fixingOtherNote;
  }
  if (payload.siteElectrical !== undefined) {
    if (typeof payload.siteElectrical !== "string") {
      return { ok: false, error: "invalid_payload" };
    }
    patch.siteElectrical = payload.siteElectrical;
  }
  const crewSize = readOptionalNumber(payload.crewSize);
  if (crewSize === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (crewSize !== undefined) {
    patch.crewSize = crewSize;
  }
  const plannedDurationHours = readOptionalNumber(payload.plannedDurationHours);
  if (plannedDurationHours === false) {
    return { ok: false, error: "invalid_payload" };
  }
  if (plannedDurationHours !== undefined) {
    patch.plannedDurationHours = plannedDurationHours;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "invalid_payload" };
  }
  return { ok: true, patch, expectedVersion };
}

function readQuoteSnapshotId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("quoteSnapshotId" in body)) {
    return null;
  }
  const value = (body as { quoteSnapshotId: unknown }).quoteSnapshotId;
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requestMutationStatus(error: CommercialRequestMutationError): 400 | 404 | 409 {
  switch (error) {
    case "invalid_title":
    case "invalid_description":
    case "invalid_status":
    case "customer_unavailable":
    case "reference_unavailable":
    case "unknown_optional_scope":
    case "service_not_offered":
    case "service_mode_required":
    case "service_mode_unavailable":
    case "invalid_service_mode":
    case "owner_required":
    case "installation_not_selected":
    case "invalid_manual_price":
      return 400;
    case "not_found":
      return 404;
    case "customer_locked":
    case "service_selection_locked":
    case "installation_facts_delete_confirmation_required":
    case "installation_price_locked":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function factsMutationStatus(error: SiteInstallationFactsMutationError): 400 | 404 | 409 {
  switch (error) {
    case "installation_not_selected":
    case "invalid_facade_type":
    case "invalid_fixing_method":
    case "invalid_measurement_status":
    case "invalid_site_electrical":
    case "invalid_dimensions":
    case "invalid_elevation":
    case "invalid_country_code":
    case "invalid_measured_at":
    case "invalid_site_name":
    case "invalid_street":
    case "invalid_city":
    case "invalid_county":
    case "invalid_postal_code":
    case "invalid_contact_name":
    case "invalid_contact_phone":
    case "invalid_access_notes":
    case "invalid_measurement_notes":
    case "invalid_crew_size":
    case "invalid_planned_duration":
    case "other_note_required":
    case "expected_version_required":
      return 400;
    case "not_found":
      return 404;
    case "installation_facts_locked":
    case "version_conflict":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function priceMutationStatus(
  error: CommercialRequestMutationError,
): 400 | 403 | 404 | 409 {
  if (error === "owner_required") {
    return 403;
  }
  return requestMutationStatus(error);
}

function requestLinkStatus(error: CommercialRequestLinkError): 400 | 404 | 409 {
  switch (error) {
    case "customer_mismatch":
    case "request_cancelled":
      return 400;
    case "not_found":
    case "quote_unavailable":
      return 404;
    case "quote_already_linked":
      return 409;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

function requestAttachmentStatus(
  error: RequestAttachmentError,
): 400 | 404 | 409 | 413 | 503 {
  switch (error) {
    case "invalid_file":
    case "request_cancelled":
      return 400;
    case "file_too_large":
      return 413;
    case "not_found":
    case "file_missing":
      return 404;
    case "file_corrupt":
      return 409;
    case "storage_unavailable":
      return 503;
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}
