import type { CustomerDocumentProjection } from "./history.js";

/**
 * N-021 · the representative photo of a work, chosen by an operator. A work is a WorkOS job or a
 * historical work; at most one photo is chosen for it. The photo must be a PHOTO of the same
 * customer, linked explicitly to that work: a photo of the work's request is not the work's own and
 * can be chosen only after it has been linked to the work. Without a valid choice the automatic rule
 * applies (after → simulation → before). The choice never changes the photo, its stage, its links,
 * the work's state or anything commercial; a simulation chosen stays a simulation.
 */
export const WORK_REPRESENTATIVE_KINDS = ["JOB", "HISTORICAL_WORK"] as const;
export type WorkRepresentativeKind = (typeof WORK_REPRESENTATIVE_KINDS)[number];

export const WORK_REPRESENTATIVE_INVALIDATION_REASONS = ["UNLINKED", "NOT_A_PHOTO"] as const;
export type WorkRepresentativeInvalidationReason = (typeof WORK_REPRESENTATIVE_INVALIDATION_REASONS)[number];

/** What is stored for one work. `documentId` null: the automatic choice applies. */
export type WorkRepresentativeSelection = {
  workKind: WorkRepresentativeKind;
  workId: string;
  documentId: string | null;
  revision: number;
  updatedAt: string;
  /** The chosen photo stopped being eligible and the choice was set aside, with why and when. */
  invalidated: { documentId: string; reason: WorkRepresentativeInvalidationReason; at: string } | null;
};

/**
 * - `AUTOMATIC`: nothing chosen; the automatic rule applies.
 * - `MANUAL`: a chosen photo, still one of the work's own photos.
 * - `INVALIDATED`: the chosen photo was unlinked from the work or stopped being a photo; recorded.
 * - `UNAVAILABLE`: a stored choice no longer found among the work's photos when read.
 * In every state but MANUAL the automatic rule applies.
 */
export type WorkRepresentativeStatus = "AUTOMATIC" | "MANUAL" | "INVALIDATED" | "UNAVAILABLE";

export type WorkRepresentativePhotoProjection = {
  /** The revision the next change must name; 0 while nothing was ever chosen for the work. */
  revision: number;
  status: WorkRepresentativeStatus;
  /** The chosen photo when `status` is MANUAL, else null. */
  documentId: string | null;
  invalidatedReason: WorkRepresentativeInvalidationReason | null;
  invalidatedAt: string | null;
};

export function workRepresentativeKey(workKind: WorkRepresentativeKind, workId: string): string {
  return `${workKind}:${workId}`;
}

export function isWorkRepresentativeKind(value: unknown): value is WorkRepresentativeKind {
  return typeof value === "string" && (WORK_REPRESENTATIVE_KINDS as readonly string[]).includes(value);
}

/**
 * The stored choice, checked against the work's own documents as projected now. A choice whose photo
 * is no longer among them (or no longer a photo) is never shown as the work's.
 */
export function projectWorkRepresentativePhoto(
  selection: WorkRepresentativeSelection | undefined,
  ownDocuments: readonly CustomerDocumentProjection[],
): WorkRepresentativePhotoProjection {
  if (!selection) return { revision: 0, status: "AUTOMATIC", documentId: null, invalidatedReason: null, invalidatedAt: null };
  const base = { revision: selection.revision, invalidatedReason: null, invalidatedAt: null };
  if (selection.documentId === null) {
    return selection.invalidated
      ? { ...base, status: "INVALIDATED", documentId: null, invalidatedReason: selection.invalidated.reason, invalidatedAt: selection.invalidated.at }
      : { ...base, status: "AUTOMATIC", documentId: null };
  }
  const eligible = ownDocuments.some((document) => document.documentId === selection.documentId && document.kind === "PHOTO");
  return eligible ? { ...base, status: "MANUAL", documentId: selection.documentId } : { ...base, status: "UNAVAILABLE", documentId: null };
}

export type WorkRepresentativeRequest = {
  workKind: WorkRepresentativeKind;
  workId: string;
  /** null: back to the automatic choice. */
  documentId: string | null;
  /** The revision the change is based on; 0 when nothing was ever chosen for the work. */
  expectedRevision: number;
};

/** The body of `PUT …/works/representative-photo`; the first invalid field is named. */
export function readWorkRepresentativeRequest(body: unknown): { ok: true; request: WorkRepresentativeRequest } | { ok: false; field: string } {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isWorkRepresentativeKind(record.workKind)) return { ok: false, field: "workKind" };
  if (typeof record.workId !== "string" || !record.workId) return { ok: false, field: "workId" };
  const documentId = record.documentId;
  if (documentId !== null && (typeof documentId !== "string" || !documentId)) return { ok: false, field: "documentId" };
  const expected = record.expectedRevision;
  if (typeof expected !== "number" || !Number.isInteger(expected) || expected < 0) return { ok: false, field: "expectedRevision" };
  return { ok: true, request: { workKind: record.workKind, workId: record.workId, documentId, expectedRevision: expected } };
}
