import { createInflate } from "node:zlib";
import {
  inspectCustomerLogo,
  MAX_CUSTOMER_LOGO_BYTES,
  MAX_CUSTOMER_LOGO_HTTP_BODY_BYTES,
  readCustomerLogoExpectedRevision,
  type PngImageData,
} from "@workos-final/domain";
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { ApiEnv } from "../cloud/context.js";
import {
  attachmentIntegrityMatches,
  readScopedDocumentBytes,
  removeScopedDocumentFile,
  sha256Hex,
  writeScopedDocumentBytes,
} from "../requests/attachmentStorage.js";
import { customerExists, dossierPlane, recordDossierEvent, requireDossierPermission, type DossierPlane } from "./access.js";
import { customerDocumentScope } from "./documents.js";
import {
  customerLogoRef,
  insertCustomerLogoRevisionAt,
  readCustomerLogoRevision,
  readLatestCustomerLogoRevision,
  type CustomerLogoFile,
  type CustomerLogoRevisionRow,
} from "./logoStore.js";

/**
 * N-023 · the customer's logo. Set, replaced or cleared (back to the monogram) by an explicit action
 * (`editLogo`); read with the dossier (`read`). Every change is a new revision, written only while
 * the customer is still at the revision the operator saw (one guarded statement, see logoStore); a
 * stale change gets 409 with the current logo and records nothing. Files live with the customer's
 * other files (documents/customers/<id>/logo), are never overwritten or deleted by a change, and a
 * new file whose revision could not be recorded is removed again.
 */
export function customerLogoScope(customerId: string): string[] {
  return [...customerDocumentScope(customerId), "logo"];
}

/**
 * PNG image data must inflate to exactly the size its header announces, with a valid filter type at
 * the start of every row (non-interlaced). Streamed, so a bomb is stopped as soon as it overflows.
 */
export function pngImageDataIsSound(png: PngImageData): Promise<boolean> {
  return new Promise((resolve) => {
    const inflate = createInflate();
    let total = 0;
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      inflate.destroy();
      resolve(value);
    };
    const stride = png.rowBytes === null ? null : png.rowBytes + 1;
    inflate.on("data", (chunk: Buffer) => {
      if (settled) return;
      if (total + chunk.byteLength > png.inflatedBytes) return settle(false);
      if (stride !== null) {
        for (let index = (stride - (total % stride)) % stride; index < chunk.byteLength; index += stride) {
          if (chunk[index]! > 4) return settle(false);
        }
      }
      total += chunk.byteLength;
    });
    inflate.on("error", () => settle(false));
    inflate.on("end", () => settle(total === png.inflatedBytes));
    inflate.end(Buffer.from(png.zlib.buffer, png.zlib.byteOffset, png.zlib.byteLength));
  });
}

function present(row: CustomerLogoRevisionRow | undefined) {
  return { logo: customerLogoRef(row), logoRevision: row?.revision ?? 0 };
}

function stale(c: Context<ApiEnv>, plane: DossierPlane, customerId: string) {
  return c.json({ error: "stale_revision", ...present(readLatestCustomerLogoRevision(plane.db, customerId)) }, 409);
}

/**
 * A retry of a change that already landed: the revision right after the one named, by the same
 * actor, with exactly this content. Anything else that moved on is a conflict, never "applied".
 */
function isOwnNextRevision(row: CustomerLogoRevisionRow | undefined, expectedRevision: number, actorAccountId: string, sha256: string | null): boolean {
  return (
    row !== undefined &&
    row.revision === expectedRevision + 1 &&
    row.changed_by_account_id === actorAccountId &&
    (sha256 === null ? row.has_logo === 0 : row.has_logo === 1 && row.sha256 === sha256)
  );
}

function recordLogoEvent(plane: DossierPlane, customerId: string, at: string, revision: number, file: CustomerLogoFile | null, previous: CustomerLogoRevisionRow | undefined) {
  recordDossierEvent(plane.db, {
    customerId,
    kind: file ? "CUSTOMER_LOGO_SET" : "CUSTOMER_LOGO_CLEARED",
    subjectId: customerId,
    actorAccountId: plane.actorAccountId,
    occurredAt: at,
    detail: {
      revision,
      sha256: file?.sha256 ?? null,
      mimeType: file?.mimeType ?? null,
      width: file?.width ?? null,
      height: file?.height ?? null,
      sizeBytes: file?.sizeBytes ?? null,
      previousRevision: previous?.revision ?? 0,
      previousSha256: previous?.has_logo === 1 ? previous.sha256 : null,
    },
  });
}

export function registerCustomerLogoRoutes(app: Hono<ApiEnv>): void {
  /**
   * Set or replace the logo: multipart `file` + `expectedRevision`. 200 `{ logo, logoRevision,
   * alreadyApplied }`; 400 `invalid_payload` with the field; 413 `file_too_large`; 422 `invalid_logo`
   * with `reason`; 404 unknown customer; 409 `stale_revision` with the current logo; 503 storage.
   */
  app.put(
    "/api/customers/:customerId/logo",
    requireDossierPermission("editLogo"),
    bodyLimit({ maxSize: MAX_CUSTOMER_LOGO_HTTP_BODY_BYTES, onError: (c) => c.json({ error: "file_too_large" }, 413) }),
    async (c) => {
      const plane = dossierPlane(c);
      const customerId = c.req.param("customerId");
      const body = await c.req.parseBody().catch(() => null);
      if (!body) return c.json({ error: "invalid_payload", field: "file" }, 400);
      const expectedRevision = readCustomerLogoExpectedRevision(body["expectedRevision"]);
      if (expectedRevision === null) return c.json({ error: "invalid_payload", field: "expectedRevision" }, 400);
      const upload = body["file"];
      if (!(upload instanceof File)) return c.json({ error: "invalid_payload", field: "file" }, 400);
      if (upload.size > MAX_CUSTOMER_LOGO_BYTES) return c.json({ error: "file_too_large" }, 413);
      if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
      const bytes = new Uint8Array(await upload.arrayBuffer());
      const fileName = (upload.name || "sigla").slice(0, 200);
      const inspected = inspectCustomerLogo(bytes, { mimeType: upload.type || null, fileName });
      if (!inspected.ok) {
        return inspected.reason === "TOO_LARGE" ? c.json({ error: "file_too_large" }, 413) : c.json({ error: "invalid_logo", reason: inspected.reason }, 422);
      }
      const { image } = inspected;
      if (image.png && !(await pngImageDataIsSound(image.png))) return c.json({ error: "invalid_logo", reason: "MALFORMED" }, 422);

      // From here on nothing is awaited until the guarded write decides.
      const sha256 = sha256Hex(bytes);
      const current = readLatestCustomerLogoRevision(plane.db, customerId);
      const currentRevision = current?.revision ?? 0;
      if (expectedRevision !== currentRevision) {
        if (isOwnNextRevision(current, expectedRevision, plane.actorAccountId, sha256)) return c.json({ ...present(current), alreadyApplied: true });
        return stale(c, plane, customerId);
      }
      // The same logo is already the active one: no second revision for no real change.
      if (current?.has_logo === 1 && current.sha256 === sha256) return c.json({ ...present(current), alreadyApplied: true });

      let stored: { storageKey: string; sha256: string };
      try {
        stored = writeScopedDocumentBytes({ scopeSegments: customerLogoScope(customerId), bytes, documentsRoot: plane.documentsRoot });
      } catch {
        return c.json({ error: "storage_unavailable" }, 503);
      }
      const file: CustomerLogoFile = {
        storageKey: stored.storageKey,
        sha256: stored.sha256,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        sizeBytes: bytes.byteLength,
        originalFileName: fileName,
      };
      const at = new Date().toISOString();
      let applied: boolean;
      try {
        applied = plane.db.transaction(() => {
          if (!insertCustomerLogoRevisionAt(plane.db, { customerId, expectedRevision, file, at, actorAccountId: plane.actorAccountId })) return false;
          recordLogoEvent(plane, customerId, at, expectedRevision + 1, file, current);
          return true;
        })();
      } catch (error) {
        // Nothing recorded: the new file must not stay behind.
        removeScopedDocumentFile(customerLogoScope(customerId), stored.storageKey, plane.documentsRoot);
        throw error;
      }
      if (!applied) {
        removeScopedDocumentFile(customerLogoScope(customerId), stored.storageKey, plane.documentsRoot);
        return stale(c, plane, customerId);
      }
      return c.json({ ...present(readCustomerLogoRevision(plane.db, customerId, expectedRevision + 1)), alreadyApplied: false });
    },
  );

  /** Back to the monogram: `?expectedRevision=N`. A revision without a file; earlier files are kept. */
  app.delete("/api/customers/:customerId/logo", requireDossierPermission("editLogo"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const expectedRevision = readCustomerLogoExpectedRevision(c.req.query("expectedRevision"));
    if (expectedRevision === null) return c.json({ error: "invalid_payload", field: "expectedRevision" }, 400);
    if (!customerExists(plane.db, customerId)) return c.json({ error: "not_found" }, 404);
    const current = readLatestCustomerLogoRevision(plane.db, customerId);
    const currentRevision = current?.revision ?? 0;
    if (expectedRevision !== currentRevision) {
      if (isOwnNextRevision(current, expectedRevision, plane.actorAccountId, null)) return c.json({ ...present(current), alreadyApplied: true });
      return stale(c, plane, customerId);
    }
    if (current?.has_logo !== 1) return c.json({ ...present(current), alreadyApplied: true });
    const at = new Date().toISOString();
    const applied = plane.db.transaction(() => {
      if (!insertCustomerLogoRevisionAt(plane.db, { customerId, expectedRevision, file: null, at, actorAccountId: plane.actorAccountId })) return false;
      recordLogoEvent(plane, customerId, at, expectedRevision + 1, null, current);
      return true;
    })();
    if (!applied) return stale(c, plane, customerId);
    return c.json({ ...present(readCustomerLogoRevision(plane.db, customerId, expectedRevision + 1)), alreadyApplied: false });
  });

  /**
   * The bytes of one revision (default: the active one) of this customer's logo, only after the
   * session, the organization (plane) and the customer are checked, with the SHA-256 verified.
   * The URL names the revision, so its content never changes: revalidated by ETag, cached privately.
   */
  app.get("/api/customers/:customerId/logo/content", requireDossierPermission("read"), (c) => {
    const plane = dossierPlane(c);
    const customerId = c.req.param("customerId");
    const requested = c.req.query("revision");
    let row: CustomerLogoRevisionRow | undefined;
    if (requested === undefined) {
      row = readLatestCustomerLogoRevision(plane.db, customerId);
    } else {
      const revision = readCustomerLogoExpectedRevision(requested);
      if (revision === null || revision < 1) return c.json({ error: "invalid_payload", field: "revision" }, 400);
      row = readCustomerLogoRevision(plane.db, customerId, revision);
    }
    if (!row || row.has_logo !== 1 || !row.storage_key || !row.sha256 || !row.mime_type) return c.json({ error: "not_found" }, 404);
    const etag = `"${row.sha256}"`;
    const headers = {
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
      ETag: etag,
    };
    let bytes: Uint8Array | null;
    try {
      bytes = readScopedDocumentBytes(customerLogoScope(customerId), row.storage_key, plane.documentsRoot);
    } catch {
      return c.json({ error: "storage_unavailable" }, 503);
    }
    if (!bytes) return c.json({ error: "file_missing" }, 410);
    if (!attachmentIntegrityMatches(bytes, row.sha256)) return c.json({ error: "file_corrupt" }, 409);
    if (c.req.header("if-none-match") === etag) return c.body(null, 304, headers);
    const extension = row.mime_type === "image/jpeg" ? "jpg" : row.mime_type.slice("image/".length);
    return c.body(Buffer.from(bytes), 200, {
      ...headers,
      "Content-Type": row.mime_type,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="sigla-${row.revision}.${extension}"`,
    });
  });
}
