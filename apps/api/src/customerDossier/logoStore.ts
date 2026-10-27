import { customerLogoContentHref, type CustomerLogoMimeType, type CustomerLogoRef } from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

/**
 * N-023 · the customer logo revisions (migration 049). A dependency-free module so the product-system
 * runtime can project the active logos without importing the dossier routes.
 */
export type CustomerLogoRevisionRow = {
  customer_id: string;
  revision: number;
  has_logo: 0 | 1;
  storage_key: string | null;
  sha256: string | null;
  mime_type: CustomerLogoMimeType | null;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  original_file_name: string | null;
  provenance: "UPLOAD" | null;
  changed_at: string;
  changed_by_account_id: string;
};

export function customerLogoRef(row: CustomerLogoRevisionRow | undefined | null): CustomerLogoRef | null {
  if (!row || row.has_logo !== 1 || row.width === null || row.height === null) return null;
  return { revision: row.revision, contentHref: customerLogoContentHref(row.customer_id, row.revision), width: row.width, height: row.height };
}

/** The latest revision of one customer's logo (the active state), or undefined when there never was one. */
export function readLatestCustomerLogoRevision(db: SqliteDatabase, customerId: string): CustomerLogoRevisionRow | undefined {
  return db.prepare("SELECT * FROM customer_logo_revisions WHERE customer_id = ? ORDER BY revision DESC LIMIT 1").get(customerId) as
    | CustomerLogoRevisionRow
    | undefined;
}

export function readCustomerLogoRevision(db: SqliteDatabase, customerId: string, revision: number): CustomerLogoRevisionRow | undefined {
  return db.prepare("SELECT * FROM customer_logo_revisions WHERE customer_id = ? AND revision = ?").get(customerId, revision) as
    | CustomerLogoRevisionRow
    | undefined;
}

/** Every customer's active logo in one query (the registry reads hundreds of customers at once). */
export function listActiveCustomerLogos(db: SqliteDatabase): Map<string, CustomerLogoRef> {
  const rows = db
    .prepare(
      `SELECT logo.* FROM customer_logo_revisions AS logo
       JOIN (SELECT customer_id, MAX(revision) AS revision FROM customer_logo_revisions GROUP BY customer_id) AS latest
         ON latest.customer_id = logo.customer_id AND latest.revision = logo.revision
       WHERE logo.has_logo = 1`,
    )
    .all() as CustomerLogoRevisionRow[];
  const logos = new Map<string, CustomerLogoRef>();
  for (const row of rows) {
    const ref = customerLogoRef(row);
    if (ref) logos.set(row.customer_id, ref);
  }
  return logos;
}

export type CustomerLogoFile = {
  storageKey: string;
  sha256: string;
  mimeType: CustomerLogoMimeType;
  width: number;
  height: number;
  sizeBytes: number;
  originalFileName: string;
};

/**
 * Compare-and-swap: the next revision (`expectedRevision + 1`) is created only while the customer's
 * latest revision is still `expectedRevision`, in one statement; the primary key stops a second
 * writer that started from the same revision even across connections. `file` null: back to the
 * monogram. False when another change got there first.
 */
export function insertCustomerLogoRevisionAt(
  db: SqliteDatabase,
  input: { customerId: string; expectedRevision: number; file: CustomerLogoFile | null; at: string; actorAccountId: string },
): boolean {
  const file = input.file;
  return (
    db
      .prepare(
        `INSERT INTO customer_logo_revisions (customer_id, revision, has_logo, storage_key, sha256, mime_type, width, height, size_bytes,
           original_file_name, provenance, changed_at, changed_by_account_id)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE COALESCE((SELECT MAX(revision) FROM customer_logo_revisions WHERE customer_id = ?), 0) = ?
         ON CONFLICT (customer_id, revision) DO NOTHING`,
      )
      .run(
        input.customerId,
        input.expectedRevision + 1,
        file ? 1 : 0,
        file?.storageKey ?? null,
        file?.sha256 ?? null,
        file?.mimeType ?? null,
        file?.width ?? null,
        file?.height ?? null,
        file?.sizeBytes ?? null,
        file?.originalFileName ?? null,
        file ? "UPLOAD" : null,
        input.at,
        input.actorAccountId,
        input.customerId,
        input.expectedRevision,
      ).changes === 1
  );
}
