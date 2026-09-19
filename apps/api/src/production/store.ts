import type { AcceptedProductionSnapshot } from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type StoredRow = {
  snapshot_id: string;
  payload: string;
};

export function insertAcceptedProductionSnapshot(
  db: SqliteDatabase,
  snapshot: AcceptedProductionSnapshot,
): { created: boolean; snapshot: AcceptedProductionSnapshot } {
  if (snapshot.sourceOrderSnapshotId) {
    const byOrder = getAcceptedProductionSnapshotByOrder(db, snapshot.sourceOrderSnapshotId);
    if (byOrder) {
      return { created: false, snapshot: byOrder };
    }
  }
  const existing = getAcceptedProductionSnapshotByHash(db, snapshot.contentHash);
  if (existing) {
    return { created: false, snapshot: existing };
  }

  db.prepare(
    `
    INSERT INTO accepted_production_snapshots (
      snapshot_id,
      product_code,
      source_review_id,
      content_hash,
      schema_version,
      created_at,
      payload,
      source_order_snapshot_id,
      source_order_content_hash,
      source_production_input_hash,
      release_source
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    snapshot.snapshotId,
    snapshot.productCode,
    snapshot.sourceReviewId,
    snapshot.contentHash,
    snapshot.schemaVersion,
    snapshot.createdAt,
    JSON.stringify(snapshot),
    snapshot.sourceOrderSnapshotId ?? null,
    snapshot.sourceOrderContentHash ?? null,
    snapshot.sourceProductionInputHash ?? null,
    snapshot.releaseSource ?? null,
  );

  return { created: true, snapshot };
}

export function getAcceptedProductionSnapshot(
  db: SqliteDatabase,
  snapshotId: string,
): AcceptedProductionSnapshot | null {
  const row = db
    .prepare(
      `
      SELECT snapshot_id, payload
      FROM accepted_production_snapshots
      WHERE snapshot_id = ?
    `,
    )
    .get(snapshotId) as StoredRow | undefined;
  return row ? parseSnapshot(row.payload) : null;
}

export function getAcceptedProductionSnapshotByHash(
  db: SqliteDatabase,
  contentHash: string,
): AcceptedProductionSnapshot | null {
  const row = db
    .prepare(
      `
      SELECT snapshot_id, payload
      FROM accepted_production_snapshots
      WHERE content_hash = ?
    `,
    )
    .get(contentHash) as StoredRow | undefined;
  return row ? parseSnapshot(row.payload) : null;
}

export function getAcceptedProductionSnapshotByOrder(
  db: SqliteDatabase,
  orderSnapshotId: string,
): AcceptedProductionSnapshot | null {
  const row = db
    .prepare(
      `
      SELECT snapshot_id, payload
      FROM accepted_production_snapshots
      WHERE source_order_snapshot_id = ?
    `,
    )
    .get(orderSnapshotId) as StoredRow | undefined;
  return row ? parseSnapshot(row.payload) : null;
}

function parseSnapshot(payload: string): AcceptedProductionSnapshot {
  return JSON.parse(payload) as AcceptedProductionSnapshot;
}
