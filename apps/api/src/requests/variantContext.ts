import { can, type ApiContext } from "../cloud/context.js";
import type { ProductSystemRuntime } from "../productSystem/runtime.js";
import { readVariant, type VariantRecord } from "./variantStore.js";

/**
 * Commercial Continuity V2 · lets the existing confirm, approval and freeze routes work on a saved
 * quote variant. When a request body names a `variantId`, the technical values, the request, the
 * customer and the product price come from the stored variant, never from the client: the server
 * is the only holder of what is being confirmed, approved or issued.
 */

export type VariantRoutePurpose = "CONFIRM" | "APPROVAL" | "ISSUE";

export type VariantRouteContext = {
  variant: VariantRecord;
  expectedVersion: number | null;
  /** The request body the existing route logic reads, rebuilt from the stored variant. */
  body: Record<string, unknown>;
};

export type VariantRouteResolution =
  | null
  | { ok: true; context: VariantRouteContext }
  | { ok: false; status: 400 | 403 | 404 | 409 | 422; body: Record<string, unknown> };

export function presentVariantConflict(current: VariantRecord) {
  return {
    error: "version_conflict",
    reasons: [`${current.updatedByLabel} a modificat această variantă. Valorile tale nu au fost salvate.`],
    current: {
      version: current.version,
      updatedAt: current.updatedAt,
      updatedByLabel: current.updatedByLabel,
    },
  };
}

function readVariantId(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("variantId" in body)) return null;
  const value = (body as { variantId: unknown }).variantId;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readExpectedVersion(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const value = (body as { expectedVersion?: unknown }).expectedVersion;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null;
}

/** Fields of the client body that still belong to the client when a variant is named. */
const PASS_THROUGH_FIELDS = ["rateAcknowledgement", "approvalNote", "commercialIntent", "reviewId"] as const;

export function resolveVariantRouteBody(
  c: ApiContext,
  runtime: ProductSystemRuntime,
  productCode: string,
  rawBody: unknown,
  purpose: VariantRoutePurpose,
): VariantRouteResolution {
  const variantId = readVariantId(rawBody);
  if (!variantId) return null;
  if (!can(c, "quotes.create")) {
    return { ok: false, status: 403, body: { error: "forbidden", reasons: ["Rolul tău nu poate lucra pe variante de ofertă."] } };
  }
  const variant = readVariant(runtime.assemblyPlane().db, variantId);
  const request = variant ? runtime.readCommercialRequest(variant.requestId) : null;
  if (!variant || !request || variant.productCode !== productCode) {
    return { ok: false, status: 404, body: { error: "not_found" } };
  }
  if (variant.quoteSnapshotId) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "variant_issued",
        reasons: ["Oferta acestei variante a fost deja emisă. Pentru o schimbare pornește o variantă nouă."],
        quoteSnapshotId: variant.quoteSnapshotId,
      },
    };
  }
  if (variant.lifecycle === "WITHDRAWN") {
    return { ok: false, status: 409, body: { error: "variant_withdrawn", reasons: ["Varianta este retrasă. Reia-o înainte de a continua."] } };
  }
  const expectedVersion = readExpectedVersion(rawBody);
  const raw = (rawBody ?? {}) as Record<string, unknown>;
  const body: Record<string, unknown> = {
    values: variant.values,
    requestId: variant.requestId,
    customerId: request.customerId,
    variantId: variant.variantId,
  };
  for (const field of PASS_THROUGH_FIELDS) {
    if (field in raw) body[field] = raw[field];
  }

  if (purpose === "CONFIRM") {
    const reviewId = typeof raw.reviewId === "string" ? raw.reviewId : "";
    // Re-reading an already confirmed variant writes nothing, so it needs no version.
    const rereads = reviewId !== "" && reviewId === variant.confirmedReviewId;
    if (!rereads) {
      if (expectedVersion === null) {
        return { ok: false, status: 400, body: { error: "invalid_payload", reasons: ["Versiunea variantei lipsește."] } };
      }
      if (expectedVersion !== variant.version) {
        return { ok: false, status: 409, body: presentVariantConflict(variant) };
      }
    }
    if (variant.productNetPrice !== null && variant.priceReviewId === reviewId) {
      body.manualProductNetPrice = variant.productNetPrice;
    }
    return { ok: true, context: { variant, expectedVersion: rereads ? null : expectedVersion, body } };
  }

  if (expectedVersion === null) {
    return { ok: false, status: 400, body: { error: "invalid_payload", reasons: ["Versiunea variantei lipsește."] } };
  }
  if (expectedVersion !== variant.version) {
    return { ok: false, status: 409, body: presentVariantConflict(variant) };
  }
  if (!variant.confirmedReviewId) {
    return {
      ok: false,
      status: 422,
      body: { error: "variant_not_confirmed", reasons: ["Configurația trebuie confirmată înainte de preț și de ofertă."] },
    };
  }
  if (variant.productNetPrice === null) {
    return { ok: false, status: 422, body: { error: "price_missing", reasons: ["Varianta nu are încă un preț."] } };
  }
  if (variant.priceReviewId !== variant.confirmedReviewId) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "price_for_previous_configuration",
        reasons: ["Prețul a fost stabilit pentru configurația anterioară. Confirmă-l din nou pentru configurația curentă."],
      },
    };
  }
  body.reviewId = variant.confirmedReviewId;
  body.manualProductNetPrice = variant.productNetPrice;
  return { ok: true, context: { variant, expectedVersion, body } };
}
