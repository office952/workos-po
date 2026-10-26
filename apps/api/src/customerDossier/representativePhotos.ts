import {
  readWorkRepresentativeRequest,
  workRepresentativeKey,
  type WorkRepresentativeInvalidationReason,
  type WorkRepresentativeKind,
  type WorkRepresentativeSelection,
} from "@workos-final/domain";
import type { Hono } from "hono";
import type { ApiEnv } from "../cloud/context.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import { customerExists, dossierPlane, recordDossierEvent, requireDossierPermission, subjectBelongsToCustomer } from "./access.js";
import { getCustomerDocument } from "./documents.js";

/**
 * N-021 · the representative photo of a work (a job or a historical work), chosen by an operator
 * and kept in the organization's plane (migration 048). Choosing it is a document action
 * (`editDocuments`). The choice is written only while it is still at the revision the operator saw
 * and only while the photo is still one of the customer's PHOTO documents linked to that work, in
 * one guarded statement; a stale revision gets 409 with the current choice and records nothing.
 */
type SelectionRow = {
  work_kind: WorkRepresentativeKind;
  work_id: string;
  document_id: string | null;
  revision: number;
  updated_at: string;
  invalidated_document_id: string | null;
  invalidated_reason: WorkRepresentativeInvalidationReason | null;
  invalidated_at: string | null;
};

function selectionFromRow(row: SelectionRow): WorkRepresentativeSelection {
  return {
    workKind: row.work_kind,
    workId: row.work_id,
    documentId: row.document_id,
    revision: row.revision,
    updatedAt: row.updated_at,
    invalidated:
      row.invalidated_reason && row.invalidated_document_id && row.invalidated_at
        ? { documentId: row.invalidated_document_id, reason: row.invalidated_reason, at: row.invalidated_at }
        : null,
  };
}

export function listWorkRepresentativeSelections(db: SqliteDatabase, customerId: string): Map<string, WorkRepresentativeSelection> {
  const rows = db.prepare("SELECT * FROM work_representative_photos WHERE customer_id = ?").all(customerId) as SelectionRow[];
  return new Map(rows.map((row) => [workRepresentativeKey(row.work_kind, row.work_id), selectionFromRow(row)]));
}

function readSelection(db: SqliteDatabase, customerId: string, workKind: WorkRepresentativeKind, workId: string): SelectionRow | undefined {
  return db.prepare("SELECT * FROM work_representative_photos WHERE work_kind = ? AND work_id = ? AND customer_id = ?").get(workKind, workId, customerId) as
    | SelectionRow
    | undefined;
}

/** The photo is one of this customer's PHOTO documents and is linked to this very work, now. */
const ELIGIBLE = `EXISTS (
  SELECT 1 FROM customer_documents AS document
  JOIN customer_document_links AS link ON link.document_id = document.document_id
  WHERE document.document_id = ? AND document.customer_id = ? AND document.kind = 'PHOTO'
    AND link.link_kind = ? AND link.subject_id = ?)`;

/**
 * Compare-and-swap of a work's choice. `expectedRevision` 0 means "nothing was ever chosen": the row
 * is created only if it still does not exist. Otherwise the row moves on by one revision only while
 * it is still at `expectedRevision`. A photo is written only while it is eligible (same statement).
 * False when another change got there first or the photo stopped being eligible.
 */
export function writeWorkRepresentativeAtRevision(
  db: SqliteDatabase,
  input: { customerId: string; workKind: WorkRepresentativeKind; workId: string; documentId: string | null; expectedRevision: number; at: string; actorAccountId: string },
): boolean {
  const eligibility = [input.documentId, input.customerId, input.workKind, input.workId];
  if (input.expectedRevision === 0) {
    if (input.documentId === null) return false;
    return (
      db
        .prepare(
          `INSERT INTO work_representative_photos (work_kind, work_id, customer_id, document_id, revision, updated_at, updated_by_account_id)
           SELECT ?, ?, ?, ?, 1, ?, ? WHERE ${ELIGIBLE}
           ON CONFLICT (work_kind, work_id) DO NOTHING`,
        )
        .run(input.workKind, input.workId, input.customerId, input.documentId, input.at, input.actorAccountId, ...eligibility).changes === 1
    );
  }
  const guard = "work_kind = ? AND work_id = ? AND customer_id = ? AND revision = ?";
  const key = [input.workKind, input.workId, input.customerId, input.expectedRevision];
  if (input.documentId === null) {
    return (
      db
        .prepare(
          `UPDATE work_representative_photos SET document_id = NULL, revision = revision + 1, updated_at = ?, updated_by_account_id = ?,
             invalidated_document_id = NULL, invalidated_reason = NULL, invalidated_at = NULL
           WHERE ${guard}`,
        )
        .run(input.at, input.actorAccountId, ...key).changes === 1
    );
  }
  return (
    db
      .prepare(
        `UPDATE work_representative_photos SET document_id = ?, revision = revision + 1, updated_at = ?, updated_by_account_id = ?,
           invalidated_document_id = NULL, invalidated_reason = NULL, invalidated_at = NULL
         WHERE ${guard} AND ${ELIGIBLE}`,
      )
      .run(input.documentId, input.at, input.actorAccountId, ...key, ...eligibility).changes === 1
  );
}

/**
 * Sets aside every choice of `documentId` that is no longer eligible — for one work when the photo is
 * unlinked from it, for every work when the document stops being a photo — inside the caller's
 * transaction, with one event per work. The photo, its file and its other links are untouched.
 */
export function invalidateWorkRepresentativePhotos(
  db: SqliteDatabase,
  input: {
    customerId: string;
    documentId: string;
    reason: WorkRepresentativeInvalidationReason;
    work: { workKind: WorkRepresentativeKind; workId: string } | null;
    at: string;
    actorAccountId: string;
  },
): number {
  const scope = input.work ? " AND work_kind = ? AND work_id = ?" : "";
  const rows = db
    .prepare(
      `UPDATE work_representative_photos SET document_id = NULL, revision = revision + 1, updated_at = ?, updated_by_account_id = ?,
         invalidated_document_id = document_id, invalidated_reason = ?, invalidated_at = ?
       WHERE customer_id = ? AND document_id = ?${scope}
       RETURNING work_kind, work_id, revision`,
    )
    .all(input.at, input.actorAccountId, input.reason, input.at, input.customerId, input.documentId, ...(input.work ? [input.work.workKind, input.work.workId] : [])) as Array<{
    work_kind: WorkRepresentativeKind;
    work_id: string;
    revision: number;
  }>;
  for (const row of rows) {
    recordDossierEvent(db, {
      customerId: input.customerId,
      kind: "WORK_REPRESENTATIVE_PHOTO_INVALIDATED",
      subjectId: row.work_id,
      actorAccountId: input.actorAccountId,
      occurredAt: input.at,
      detail: { workKind: row.work_kind, documentId: input.documentId, reason: input.reason, revision: row.revision },
    });
  }
  return rows.length;
}

export function registerWorkRepresentativePhotoRoutes(app: Hono<ApiEnv>): void {
  /**
   * Choose (documentId), change, or go back to the automatic choice (documentId: null) for one work.
   * 200 `{ selection, alreadyApplied }`; 400 `invalid_payload` with the field; 404 unknown customer;
   * 422 `subject_not_of_customer` / `photo_not_eligible` with `reason`; 409 `stale_revision` with the
   * current `selection` (null when nothing was ever chosen).
   */
  app.put("/api/customers/:customerId/works/representative-photo", requireDossierPermission("editDocuments"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    // Read and validated before the current version is read; no await between that read and the guarded write.
    const read = readWorkRepresentativeRequest(await c.req.json().catch(() => null));
    if (!read.ok) return c.json({ error: "invalid_payload", field: read.field }, 400);
    const { workKind, workId, documentId, expectedRevision } = read.request;
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    if (!subjectBelongsToCustomer(plane, customerId, workKind, workId)) return c.json({ error: "subject_not_of_customer" }, 422);
    const presentCurrent = () => {
      const row = readSelection(plane.db, customerId, workKind, workId);
      return row ? selectionFromRow(row) : null;
    };
    const notEligible = (): { error: "photo_not_eligible"; reason: string } | null => {
      if (documentId === null) return null;
      const document = getCustomerDocument(plane.db, customerId, documentId);
      if (!document) return { error: "photo_not_eligible", reason: "NOT_FOUND" };
      if (document.kind !== "PHOTO") return { error: "photo_not_eligible", reason: "NOT_A_PHOTO" };
      const linked = plane.db
        .prepare("SELECT 1 FROM customer_document_links WHERE document_id = ? AND link_kind = ? AND subject_id = ?")
        .get(documentId, workKind, workId);
      return linked ? null : { error: "photo_not_eligible", reason: "NOT_LINKED" };
    };

    const current = readSelection(plane.db, customerId, workKind, workId);
    if (expectedRevision !== (current?.revision ?? 0)) return c.json({ error: "stale_revision", selection: presentCurrent() }, 409);
    const refused = notEligible();
    if (refused) return c.json(refused, 422);
    // Nothing to change: the same photo, or already automatic with no notice left to acknowledge.
    const unchanged = (current?.document_id ?? null) === documentId && (documentId !== null || !current?.invalidated_reason);
    if (unchanged) return c.json({ selection: presentCurrent(), alreadyApplied: true });

    const at = new Date().toISOString();
    // Another connection may still have written since the read: the guarded write decides.
    const outcome = plane.db.transaction((): "applied" | "stale" | "not_eligible" => {
      if (!writeWorkRepresentativeAtRevision(plane.db, { customerId, workKind, workId, documentId, expectedRevision, at, actorAccountId: plane.actorAccountId })) {
        return (readSelection(plane.db, customerId, workKind, workId)?.revision ?? 0) !== expectedRevision ? "stale" : "not_eligible";
      }
      const document = documentId ? getCustomerDocument(plane.db, customerId, documentId) : null;
      recordDossierEvent(plane.db, {
        customerId,
        kind: documentId ? "WORK_REPRESENTATIVE_PHOTO_SELECTED" : "WORK_REPRESENTATIVE_PHOTO_CLEARED",
        subjectId: workId,
        actorAccountId: plane.actorAccountId,
        occurredAt: at,
        detail: { workKind, documentId, photoStage: document?.photoStage ?? null, previousDocumentId: current?.document_id ?? null, revision: expectedRevision + 1 },
      });
      return "applied";
    })();
    if (outcome === "stale") return c.json({ error: "stale_revision", selection: presentCurrent() }, 409);
    if (outcome === "not_eligible") return c.json(notEligible() ?? { error: "photo_not_eligible", reason: "NOT_LINKED" }, 422);
    return c.json({ selection: presentCurrent(), alreadyApplied: false });
  });
}
