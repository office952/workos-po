import {
  SIGN_ASSEMBLY_ACM_LETTERS_V1,
  type AssemblyDefinition,
  type AssemblyOrderSnapshot,
  type AssemblyProductionSnapshot,
  type AssemblyQuoteSnapshot,
  type AssemblyTruth,
  type ConfirmedChildProduct,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

export function saveAssemblyDefinition(
  db: SqliteDatabase,
  definition: AssemblyDefinition,
): void {
  db.prepare(
    `
    INSERT INTO assembly_definitions (
      assembly_id, organization_id, request_id, kind, status, payload, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(assembly_id) DO UPDATE SET
      status = excluded.status,
      payload = excluded.payload,
      updated_at = excluded.updated_at
    `,
  ).run(
    definition.assemblyId,
    definition.organizationId,
    definition.requestId,
    definition.kind,
    definition.status,
    JSON.stringify(definition),
    definition.createdAt,
    definition.updatedAt,
  );
}

export function readAssemblyDefinition(
  db: SqliteDatabase,
  organizationId: string,
  assemblyId: string,
): AssemblyDefinition | null {
  const row = db
    .prepare(
      `SELECT payload FROM assembly_definitions WHERE assembly_id = ? AND organization_id = ?`,
    )
    .get(assemblyId, organizationId) as { payload: string } | undefined;
  return row ? parseDefinition(row.payload) : null;
}

export function saveConfirmedChild(
  db: SqliteDatabase,
  child: ConfirmedChildProduct,
): void {
  db.prepare(
    `
    INSERT INTO confirmed_child_products (
      truth_id, organization_id, product_code, content_hash, payload, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(truth_id) DO NOTHING
    `,
  ).run(
    child.truthId,
    child.organizationId,
    child.productCode,
    child.truthHash,
    JSON.stringify(child),
    child.confirmedAt,
  );
}

export function readConfirmedChild(
  db: SqliteDatabase,
  organizationId: string,
  truthId: string,
): ConfirmedChildProduct | null {
  const row = db
    .prepare(
      `SELECT payload FROM confirmed_child_products WHERE truth_id = ? AND organization_id = ?`,
    )
    .get(truthId, organizationId) as { payload: string } | undefined;
  if (!row) {
    return null;
  }
  const parsed = JSON.parse(row.payload) as ConfirmedChildProduct;
  return parsed.organizationId === organizationId ? parsed : null;
}

export function saveAssemblyTruth(db: SqliteDatabase, truth: AssemblyTruth): void {
  db.prepare(
    `
    INSERT INTO assembly_truths (
      assembly_truth_id, assembly_id, organization_id, content_hash, payload, confirmed_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(assembly_truth_id) DO NOTHING
    `,
  ).run(
    truth.assemblyTruthId,
    truth.assemblyId,
    truth.organizationId,
    truth.contentHash,
    JSON.stringify(truth),
    truth.confirmedAt,
  );
}

export function readAssemblyTruth(
  db: SqliteDatabase,
  organizationId: string,
  truthId: string,
): AssemblyTruth | null {
  const row = db
    .prepare(
      `SELECT payload FROM assembly_truths WHERE assembly_truth_id = ? AND organization_id = ?`,
    )
    .get(truthId, organizationId) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as AssemblyTruth) : null;
}

export function listAssemblyTruths(
  db: SqliteDatabase,
  organizationId: string,
  assemblyId: string,
): AssemblyTruth[] {
  const rows = db
    .prepare(
      `SELECT payload FROM assembly_truths WHERE organization_id = ? AND assembly_id = ? ORDER BY confirmed_at`,
    )
    .all(organizationId, assemblyId) as { payload: string }[];
  return rows.map((row) => JSON.parse(row.payload) as AssemblyTruth);
}

export function saveAssemblyQuote(
  db: SqliteDatabase,
  quote: AssemblyQuoteSnapshot,
): void {
  db.prepare(
    `
    INSERT INTO assembly_quote_snapshots (
      quote_snapshot_id, organization_id, assembly_id, content_hash, payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(quote_snapshot_id) DO NOTHING
    `,
  ).run(
    quote.quoteSnapshotId,
    quote.organizationId,
    quote.assemblyId,
    quote.contentHash,
    JSON.stringify(quote),
    quote.createdAt,
  );
}

export function readLatestAssemblyQuote(
  db: SqliteDatabase,
  organizationId: string,
  assemblyId: string,
): AssemblyQuoteSnapshot | null {
  const row = db
    .prepare(
      `SELECT payload FROM assembly_quote_snapshots WHERE organization_id = ? AND assembly_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(organizationId, assemblyId) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as AssemblyQuoteSnapshot) : null;
}

export function saveAssemblyOrder(
  db: SqliteDatabase,
  order: AssemblyOrderSnapshot,
): void {
  db.prepare(
    `
    INSERT INTO assembly_order_snapshots (
      order_snapshot_id, organization_id, source_quote_snapshot_id, content_hash, payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(order_snapshot_id) DO NOTHING
    `,
  ).run(
    order.orderSnapshotId,
    order.organizationId,
    order.sourceQuoteSnapshotId,
    order.contentHash,
    JSON.stringify(order),
    order.createdAt,
  );
}

export function readAssemblyOrderByQuote(
  db: SqliteDatabase,
  organizationId: string,
  quoteSnapshotId: string,
): AssemblyOrderSnapshot | null {
  const row = db
    .prepare(
      `SELECT payload FROM assembly_order_snapshots WHERE organization_id = ? AND source_quote_snapshot_id = ?`,
    )
    .get(organizationId, quoteSnapshotId) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as AssemblyOrderSnapshot) : null;
}

export function saveAssemblyProduction(
  db: SqliteDatabase,
  snapshot: AssemblyProductionSnapshot,
): void {
  db.prepare(
    `
    INSERT INTO assembly_production_snapshots (
      snapshot_id, organization_id, source_order_snapshot_id, content_hash, payload, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(snapshot_id) DO NOTHING
    `,
  ).run(
    snapshot.snapshotId,
    snapshot.organizationId,
    snapshot.sourceOrderSnapshotId,
    snapshot.contentHash,
    JSON.stringify(snapshot),
    snapshot.createdAt,
  );
}

export function readAssemblyProductionByOrder(
  db: SqliteDatabase,
  organizationId: string,
  orderSnapshotId: string,
): AssemblyProductionSnapshot | null {
  const row = db
    .prepare(
      `SELECT payload FROM assembly_production_snapshots WHERE organization_id = ? AND source_order_snapshot_id = ?`,
    )
    .get(organizationId, orderSnapshotId) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as AssemblyProductionSnapshot) : null;
}

function parseDefinition(payload: string): AssemblyDefinition | null {
  const value = JSON.parse(payload) as AssemblyDefinition;
  if (value.kind !== SIGN_ASSEMBLY_ACM_LETTERS_V1) {
    return null;
  }
  if (value.status !== "DRAFT" && value.status !== "STALE" && value.status !== "CONFIRMED") {
    return null;
  }
  return value;
}
