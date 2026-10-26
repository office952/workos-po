import {
  applyCustomerDocumentPatch,
  customerDocumentPreview,
  generateCustomerDocumentId,
  isCustomerDocumentLinkKind,
  MAX_CUSTOMER_DOCUMENT_BYTES,
  MAX_REQUEST_ATTACHMENT_HTTP_BODY_BYTES,
  readCustomerDocumentMetadata,
  readCustomerDocumentPatch,
  resolveCustomerDocumentMimeType,
  safeAttachmentDownloadAsciiName,
  type CustomerDocument,
  type CustomerDocumentLink,
  type CustomerDocumentLinkKind,
} from "@workos-final/domain";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ApiEnv } from "../cloud/context.js";
import type { SqliteDatabase } from "../persistence/sqlite.js";
import {
  attachmentIntegrityMatches,
  readScopedDocumentBytes,
  removeScopedDocumentFile,
  writeScopedDocumentBytes,
} from "../requests/attachmentStorage.js";
import {
  customerExists,
  dossierPlane,
  recordDossierEvent,
  requireDossierPermission,
  subjectBelongsToCustomer,
  type DossierPlane,
} from "./access.js";

/** Files live once, in the plane's documents root, under customers/<customerId>/. */
export function customerDocumentScope(customerId: string): string[] {
  return ["customers", customerId];
}

export function customerDocumentContentHref(customerId: string, documentId: string, disposition: "inline" | "attachment"): string {
  return `/api/customers/${encodeURIComponent(customerId)}/documents/${encodeURIComponent(documentId)}/content?disposition=${disposition}`;
}

type DocumentRow = {
  document_id: string;
  customer_id: string;
  kind: CustomerDocument["kind"];
  photo_stage: CustomerDocument["photoStage"];
  title: string;
  document_number: string | null;
  document_date: string | null;
  description: string | null;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_key: string;
  uploaded_at: string;
  uploaded_by_account_id: string;
  revision: number;
};

function documentFromRow(row: DocumentRow): CustomerDocument {
  return {
    documentId: row.document_id,
    customerId: row.customer_id,
    kind: row.kind,
    photoStage: row.photo_stage,
    title: row.title,
    documentNumber: row.document_number,
    documentDate: row.document_date,
    description: row.description,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    sha256: row.sha256,
    storageKey: row.storage_key,
    uploadedAt: row.uploaded_at,
    uploadedByAccountId: row.uploaded_by_account_id,
    revision: row.revision,
  };
}

export function listCustomerDocuments(db: SqliteDatabase, customerId: string): CustomerDocument[] {
  const rows = db
    .prepare("SELECT * FROM customer_documents WHERE customer_id = ? ORDER BY uploaded_at DESC, document_id")
    .all(customerId) as DocumentRow[];
  return rows.map(documentFromRow);
}

export function getCustomerDocument(db: SqliteDatabase, customerId: string, documentId: string): CustomerDocument | null {
  const row = db.prepare("SELECT * FROM customer_documents WHERE document_id = ? AND customer_id = ?").get(documentId, customerId) as
    | DocumentRow
    | undefined;
  return row ? documentFromRow(row) : null;
}

export function listCustomerDocumentLinks(db: SqliteDatabase, customerId: string): Map<string, CustomerDocumentLink[]> {
  const rows = db
    .prepare(
      `SELECT link.document_id, link.link_kind, link.subject_id, link.linked_at
       FROM customer_document_links AS link
       JOIN customer_documents AS document ON document.document_id = link.document_id
       WHERE document.customer_id = ?
       ORDER BY link.document_id, link.link_kind, link.subject_id`,
    )
    .all(customerId) as Array<{ document_id: string; link_kind: CustomerDocumentLinkKind; subject_id: string; linked_at: string }>;
  const links = new Map<string, CustomerDocumentLink[]>();
  for (const row of rows) {
    const list = links.get(row.document_id) ?? [];
    list.push({ kind: row.link_kind, subjectId: row.subject_id, linkedAt: row.linked_at });
    links.set(row.document_id, list);
  }
  return links;
}

type LinkInput = { kind: CustomerDocumentLinkKind; subjectId: string };

function readLinks(value: unknown): LinkInput[] | null {
  if (value === undefined || value === null || value === "") return [];
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  const links: LinkInput[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) return null;
    const { kind, subjectId } = item as { kind?: unknown; subjectId?: unknown };
    if (!isCustomerDocumentLinkKind(kind) || typeof subjectId !== "string" || !subjectId) return null;
    if (!links.some((link) => link.kind === kind && link.subjectId === subjectId)) links.push({ kind, subjectId });
  }
  return links;
}

function insertLink(plane: DossierPlane, documentId: string, link: LinkInput, at: string): boolean {
  const result = plane.db
    .prepare(
      `INSERT OR IGNORE INTO customer_document_links (document_id, link_kind, subject_id, linked_at, linked_by_account_id)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(documentId, link.kind, link.subjectId, at, plane.actorAccountId);
  return result.changes > 0;
}

export function registerCustomerDocumentRoutes(app: Hono<ApiEnv>): void {
  app.post(
    "/api/customers/:customerId/documents",
    requireDossierPermission("uploadDocuments"),
    bodyLimit({ maxSize: MAX_REQUEST_ATTACHMENT_HTTP_BODY_BYTES, onError: (c) => c.json({ error: "file_too_large" }, 413) }),
    async (c) => {
      const plane = dossierPlane(c);
      const customerId = c.req.param("customerId");
      if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
      const body = await c.req.parseBody();
      const file = body["file"];
      if (!(file instanceof File) || file.size === 0) return c.json({ error: "invalid_file" }, 400);
      if (file.size > MAX_CUSTOMER_DOCUMENT_BYTES) return c.json({ error: "file_too_large" }, 413);
      const fileName = (file.name || "fisier").slice(0, 200);
      const metadata = readCustomerDocumentMetadata(
        {
          kind: body["kind"],
          photoStage: body["photoStage"],
          title: body["title"],
          documentNumber: body["documentNumber"],
          documentDate: body["documentDate"],
          description: body["description"],
        },
        fileName.replace(/\.[^.]+$/, ""),
      );
      if (!metadata.ok) return c.json({ error: "invalid_metadata" }, 400);
      const links = readLinks(body["links"]);
      if (!links) return c.json({ error: "invalid_links" }, 400);
      for (const link of links) {
        if (!subjectBelongsToCustomer(plane, customerId, link.kind, link.subjectId)) {
          return c.json({ error: "subject_not_of_customer", link }, 422);
        }
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const now = new Date().toISOString();
      let stored: { storageKey: string; sha256: string };
      try {
        stored = writeScopedDocumentBytes({ scopeSegments: customerDocumentScope(customerId), bytes, documentsRoot: plane.documentsRoot });
      } catch {
        return c.json({ error: "storage_unavailable" }, 503);
      }
      const document: CustomerDocument = {
        documentId: generateCustomerDocumentId(),
        customerId,
        ...metadata.metadata,
        originalFileName: fileName,
        mimeType: resolveCustomerDocumentMimeType(file.type || null, fileName),
        sizeBytes: bytes.byteLength,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        uploadedAt: now,
        uploadedByAccountId: plane.actorAccountId,
        revision: 1,
      };
      try {
        plane.db.transaction(() => {
          plane.db
            .prepare(
              `INSERT INTO customer_documents (document_id, customer_id, kind, photo_stage, title, document_number, document_date,
                 description, original_file_name, mime_type, size_bytes, sha256, storage_key, uploaded_at, uploaded_by_account_id, revision)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              document.documentId,
              customerId,
              document.kind,
              document.photoStage,
              document.title,
              document.documentNumber,
              document.documentDate,
              document.description,
              document.originalFileName,
              document.mimeType,
              document.sizeBytes,
              document.sha256,
              document.storageKey,
              now,
              plane.actorAccountId,
              1,
            );
          for (const link of links) insertLink(plane, document.documentId, link, now);
          recordDossierEvent(plane.db, {
            customerId,
            kind: "DOCUMENT_UPLOADED",
            subjectId: document.documentId,
            actorAccountId: plane.actorAccountId,
            occurredAt: now,
            detail: { kind: document.kind, sha256: document.sha256, links },
          });
        })();
      } catch (error) {
        removeScopedDocumentFile(customerDocumentScope(customerId), stored.storageKey, plane.documentsRoot);
        throw error;
      }
      return c.json({ documentId: document.documentId }, 201);
    },
  );

  app.patch("/api/customers/:customerId/documents/:documentId", requireDossierPermission("editDocuments"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const current = getCustomerDocument(plane.db, customerId, c.req.param("documentId"));
    if (!current) return c.json({ error: "not_found" }, 404);
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body && typeof body.expectedRevision === "number" && body.expectedRevision !== current.revision) {
      return c.json({ error: "stale_revision" }, 409);
    }
    const { expectedRevision: _ignored, ...fields } = body ?? {};
    void _ignored;
    const read = readCustomerDocumentPatch(fields);
    if (!read.ok) return c.json({ error: "invalid_metadata" }, 400);
    const next = applyCustomerDocumentPatch(current, read.patch);
    if (!next.ok) return c.json({ error: "invalid_metadata" }, 400);
    if (next.changed) {
      const now = new Date().toISOString();
      const document = next.document;
      plane.db.transaction(() => {
        plane.db
          .prepare(
            `UPDATE customer_documents SET kind = ?, photo_stage = ?, title = ?, document_number = ?, document_date = ?,
               description = ?, revision = ? WHERE document_id = ? AND customer_id = ?`,
          )
          .run(
            document.kind,
            document.photoStage,
            document.title,
            document.documentNumber,
            document.documentDate,
            document.description,
            document.revision,
            document.documentId,
            customerId,
          );
        recordDossierEvent(plane.db, {
          customerId,
          kind: "DOCUMENT_METADATA_UPDATED",
          subjectId: document.documentId,
          actorAccountId: plane.actorAccountId,
          occurredAt: now,
          detail: { revision: document.revision, previous: { title: current.title, kind: current.kind, documentNumber: current.documentNumber } },
        });
      })();
    }
    return c.json({ alreadyApplied: !next.changed, revision: next.document.revision });
  });

  /** Associates an existing document later (same stored file, one more view). */
  app.post("/api/customers/:customerId/documents/:documentId/links", requireDossierPermission("editDocuments"), async (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const document = getCustomerDocument(plane.db, customerId, c.req.param("documentId"));
    if (!document) return c.json({ error: "not_found" }, 404);
    const links = readLinks([await c.req.json().catch(() => null)]);
    const link = links?.[0];
    if (!link) return c.json({ error: "invalid_links" }, 400);
    if (!subjectBelongsToCustomer(plane, customerId, link.kind, link.subjectId)) {
      return c.json({ error: "subject_not_of_customer" }, 422);
    }
    const now = new Date().toISOString();
    let added = false;
    plane.db.transaction(() => {
      added = insertLink(plane, document.documentId, link, now);
      if (added) {
        recordDossierEvent(plane.db, { customerId, kind: "DOCUMENT_LINKED", subjectId: document.documentId, actorAccountId: plane.actorAccountId, occurredAt: now, detail: link });
      }
    })();
    return c.json({ alreadyApplied: !added }, added ? 201 : 200);
  });

  app.delete("/api/customers/:customerId/documents/:documentId/links", requireDossierPermission("editDocuments"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const document = getCustomerDocument(plane.db, customerId, c.req.param("documentId"));
    if (!document) return c.json({ error: "not_found" }, 404);
    const kind = c.req.query("kind");
    const subjectId = c.req.query("subjectId");
    if (!isCustomerDocumentLinkKind(kind) || !subjectId) return c.json({ error: "invalid_links" }, 400);
    const now = new Date().toISOString();
    let removed = false;
    plane.db.transaction(() => {
      removed =
        plane.db
          .prepare("DELETE FROM customer_document_links WHERE document_id = ? AND link_kind = ? AND subject_id = ?")
          .run(document.documentId, kind, subjectId).changes > 0;
      if (removed) {
        recordDossierEvent(plane.db, { customerId, kind: "DOCUMENT_UNLINKED", subjectId: document.documentId, actorAccountId: plane.actorAccountId, occurredAt: now, detail: { kind, subjectId } });
      }
    })();
    return c.json({ alreadyApplied: !removed });
  });

  app.get("/api/customers/:customerId/documents/:documentId/content", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const document = getCustomerDocument(plane.db, customerId, c.req.param("documentId"));
    if (!document) return c.json({ error: "not_found" }, 404);
    let bytes: Uint8Array | null;
    try {
      bytes = readScopedDocumentBytes(customerDocumentScope(customerId), document.storageKey, plane.documentsRoot);
    } catch {
      return c.json({ error: "storage_unavailable" }, 503);
    }
    if (!bytes) return c.json({ error: "file_missing" }, 410);
    if (!attachmentIntegrityMatches(bytes, document.sha256)) return c.json({ error: "file_corrupt" }, 409);
    const inline = c.req.query("disposition") === "inline" && customerDocumentPreview(document.mimeType) !== "NONE";
    const ascii = safeAttachmentDownloadAsciiName(document.originalFileName);
    const utf8 = encodeURIComponent(document.originalFileName);
    return c.body(Buffer.from(bytes), 200, {
      "Content-Type": document.mimeType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${utf8}`,
      "Content-Length": String(bytes.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    });
  });
}
