import { parseCanonicalCalendarDate } from "../calendarDate.js";
import { MAX_REQUEST_ATTACHMENT_BYTES } from "../requests/attachment.js";
import { isRecord, readOptionalNotes, readOptionalText, readRequiredText } from "./text.js";

/**
 * A customer document is one stored file with its own metadata. Links attach it to the
 * customer's site, request, job or historical work; the bytes are stored once, whatever
 * number of views show it. Uploading never means signed, approved or paid.
 */
export const CUSTOMER_DOCUMENT_KINDS = [
  "CONTRACT",
  "ADDENDUM",
  "INVOICE",
  "RECEPTION",
  "PHOTO",
  "OTHER",
] as const;
export type CustomerDocumentKind = (typeof CUSTOMER_DOCUMENT_KINDS)[number];

export const CUSTOMER_PHOTO_STAGES = ["BEFORE", "SIMULATION", "AFTER"] as const;
export type CustomerPhotoStage = (typeof CUSTOMER_PHOTO_STAGES)[number];

export const CUSTOMER_DOCUMENT_LINK_KINDS = ["SITE", "REQUEST", "JOB", "HISTORICAL_WORK"] as const;
export type CustomerDocumentLinkKind = (typeof CUSTOMER_DOCUMENT_LINK_KINDS)[number];

/** Same byte budget as the other uploads of the product (request attachments, job files). */
export const MAX_CUSTOMER_DOCUMENT_BYTES = MAX_REQUEST_ATTACHMENT_BYTES;

export const CUSTOMER_DOCUMENT_TITLE_MAX_LENGTH = 160;
export const CUSTOMER_DOCUMENT_NUMBER_MAX_LENGTH = 60;
export const CUSTOMER_DOCUMENT_DESCRIPTION_MAX_LENGTH = 2000;

export type CustomerDocumentMetadata = {
  kind: CustomerDocumentKind;
  photoStage: CustomerPhotoStage | null;
  title: string;
  documentNumber: string | null;
  documentDate: string | null;
  description: string | null;
};

export type CustomerDocumentLink = {
  kind: CustomerDocumentLinkKind;
  subjectId: string;
  linkedAt: string;
};

export type CustomerDocument = CustomerDocumentMetadata & {
  documentId: string;
  customerId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  uploadedAt: string;
  uploadedByAccountId: string;
  revision: number;
};

export type CustomerDocumentPatch = Partial<CustomerDocumentMetadata>;

export function generateCustomerDocumentId(): string {
  return `cdoc:${crypto.randomUUID()}`;
}

export function customerDocumentKindLabel(kind: CustomerDocumentKind): string {
  switch (kind) {
    case "CONTRACT":
      return "Contract";
    case "ADDENDUM":
      return "Act adițional";
    case "INVOICE":
      return "Factură";
    case "RECEPTION":
      return "Proces-verbal de recepție";
    case "PHOTO":
      return "Fotografie";
    case "OTHER":
      return "Alt document";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function customerPhotoStageLabel(stage: CustomerPhotoStage): string {
  switch (stage) {
    case "BEFORE":
      return "Înainte";
    case "SIMULATION":
      return "Simulare";
    case "AFTER":
      return "După montaj";
    default: {
      const _exhaustive: never = stage;
      return _exhaustive;
    }
  }
}

export function customerDocumentLinkKindLabel(kind: CustomerDocumentLinkKind): string {
  switch (kind) {
    case "SITE":
      return "Sediu";
    case "REQUEST":
      return "Cerere";
    case "JOB":
      return "Lucrare";
    case "HISTORICAL_WORK":
      return "Lucrare istorică";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** Inline preview only for formats a browser renders safely; everything else downloads. */
export function customerDocumentPreview(mimeType: string): "IMAGE" | "PDF" | "NONE" {
  if (/^image\/(png|jpeg|gif|webp)$/.test(mimeType)) return "IMAGE";
  if (mimeType === "application/pdf") return "PDF";
  return "NONE";
}

/** The stored type comes from the declared type, falling back to the file extension. */
export function resolveCustomerDocumentMimeType(declared: string | null, fileName: string): string {
  const clean = (declared ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  if (clean && clean !== "application/octet-stream") return clean;
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const byExtension: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    dxf: "image/vnd.dxf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return byExtension[extension] ?? "application/octet-stream";
}

function isKind(value: unknown): value is CustomerDocumentKind {
  return typeof value === "string" && (CUSTOMER_DOCUMENT_KINDS as readonly string[]).includes(value);
}

function isPhotoStage(value: unknown): value is CustomerPhotoStage {
  return typeof value === "string" && (CUSTOMER_PHOTO_STAGES as readonly string[]).includes(value);
}

export function isCustomerDocumentLinkKind(value: unknown): value is CustomerDocumentLinkKind {
  return typeof value === "string" && (CUSTOMER_DOCUMENT_LINK_KINDS as readonly string[]).includes(value);
}

function readDocumentDate(value: unknown): { ok: true; value: string | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const parsed = parseCanonicalCalendarDate(value.trim());
  return parsed.ok ? { ok: true, value: parsed.date } : { ok: false };
}

/**
 * Upload metadata. A photo needs a stage; any other kind has none. A blank title falls back
 * to the file name. Number and date stay empty when unknown.
 */
export function readCustomerDocumentMetadata(
  body: unknown,
  fallbackTitle: string,
): { ok: true; metadata: CustomerDocumentMetadata } | { ok: false } {
  if (!isRecord(body) || !isKind(body.kind)) return { ok: false };
  const titleSource = typeof body.title === "string" && body.title.trim() ? body.title : fallbackTitle;
  const title = readRequiredText(titleSource, CUSTOMER_DOCUMENT_TITLE_MAX_LENGTH);
  const documentNumber = readOptionalText(body.documentNumber, CUSTOMER_DOCUMENT_NUMBER_MAX_LENGTH);
  const documentDate = readDocumentDate(body.documentDate);
  const description = readOptionalNotes(body.description, CUSTOMER_DOCUMENT_DESCRIPTION_MAX_LENGTH);
  if (!title.ok || !documentNumber.ok || !documentDate.ok || !description.ok) return { ok: false };
  const photoStage = body.kind === "PHOTO" ? body.photoStage : null;
  if (body.kind === "PHOTO" && !isPhotoStage(photoStage)) return { ok: false };
  return {
    ok: true,
    metadata: {
      kind: body.kind,
      photoStage: body.kind === "PHOTO" ? (photoStage as CustomerPhotoStage) : null,
      title: (title.value ?? "").slice(0, CUSTOMER_DOCUMENT_TITLE_MAX_LENGTH),
      documentNumber: documentNumber.value,
      documentDate: documentDate.value,
      description: description.value,
    },
  };
}

export function readCustomerDocumentPatch(body: unknown): { ok: true; patch: CustomerDocumentPatch } | { ok: false } {
  if (!isRecord(body)) return { ok: false };
  const patch: CustomerDocumentPatch = {};
  if ("kind" in body) {
    if (!isKind(body.kind)) return { ok: false };
    patch.kind = body.kind;
  }
  if ("photoStage" in body) {
    if (body.photoStage !== null && !isPhotoStage(body.photoStage)) return { ok: false };
    patch.photoStage = body.photoStage as CustomerPhotoStage | null;
  }
  if ("title" in body) {
    const title = readRequiredText(body.title, CUSTOMER_DOCUMENT_TITLE_MAX_LENGTH);
    if (!title.ok) return { ok: false };
    patch.title = title.value ?? "";
  }
  if ("documentNumber" in body) {
    const read = readOptionalText(body.documentNumber, CUSTOMER_DOCUMENT_NUMBER_MAX_LENGTH);
    if (!read.ok) return { ok: false };
    patch.documentNumber = read.value;
  }
  if ("documentDate" in body) {
    const read = readDocumentDate(body.documentDate);
    if (!read.ok) return { ok: false };
    patch.documentDate = read.value;
  }
  if ("description" in body) {
    const read = readOptionalNotes(body.description, CUSTOMER_DOCUMENT_DESCRIPTION_MAX_LENGTH);
    if (!read.ok) return { ok: false };
    patch.description = read.value;
  }
  return Object.keys(patch).length ? { ok: true, patch } : { ok: false };
}

/** Applies a metadata patch; refuses a result where a photo has no stage or a document has one. */
export function applyCustomerDocumentPatch(
  document: CustomerDocument,
  patch: CustomerDocumentPatch,
): { ok: true; document: CustomerDocument; changed: boolean } | { ok: false } {
  const next: CustomerDocument = { ...document, ...patch };
  if (next.kind !== "PHOTO") next.photoStage = null;
  if (next.kind === "PHOTO" && !next.photoStage) return { ok: false };
  const changed = (["kind", "photoStage", "title", "documentNumber", "documentDate", "description"] as const).some(
    (key) => document[key] !== next[key],
  );
  return changed
    ? { ok: true, document: { ...next, revision: document.revision + 1 }, changed: true }
    : { ok: true, document, changed: false };
}
