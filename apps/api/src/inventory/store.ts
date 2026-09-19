import {
  buildInventoryAdjustment,
  movementFromActualConsumption,
  projectInventoryItemDetail,
  projectInventoryStock,
  type ExecutionTask,
  type InventoryItemDetail,
  type InventoryMovement,
  type InventoryMutationError,
  type InventoryStockProjection,
} from "@workos-final/domain";
import type { SqliteDatabase } from "../persistence/sqlite.js";

type MovementRow = {
  movement_id: string;
  resource_id: string;
  resource_label: string;
  quantity_delta: number;
  unit: InventoryMovement["unit"];
  movement_type: InventoryMovement["movementType"];
  source_type: InventoryMovement["sourceType"];
  source_id: string;
  source_label: string | null;
  recorded_at: string;
  note: string | null;
};

export type InventoryAdjustmentResult =
  | { ok: true; movement: InventoryMovement; projection: InventoryStockProjection }
  | { ok: false; error: InventoryMutationError };

export function listInventoryMovements(db: SqliteDatabase): InventoryMovement[] {
  const rows = db
    .prepare(
      `
      SELECT *
      FROM inventory_movements
      ORDER BY recorded_at ASC, movement_id ASC
    `,
    )
    .all() as MovementRow[];
  return rows.map(movementFromRow);
}

export function readInventoryProjection(db: SqliteDatabase): InventoryStockProjection {
  return projectInventoryStock(listInventoryMovements(db));
}

export function readInventoryItem(
  db: SqliteDatabase,
  resourceId: string,
): InventoryItemDetail | null {
  return projectInventoryItemDetail(resourceId, listInventoryMovements(db));
}

export function persistInventoryAdjustment(
  db: SqliteDatabase,
  resourceId: string,
  quantityDelta: number,
  recordedAt: string,
  note?: string,
): InventoryAdjustmentResult {
  const built = buildInventoryAdjustment(resourceId, quantityDelta, recordedAt, note);
  if (!built.ok) {
    return built;
  }
  insertInventoryMovement(db, built.movement);
  return {
    ok: true,
    movement: built.movement,
    projection: readInventoryProjection(db),
  };
}

export function writeInventoryOutFromTask(db: SqliteDatabase, task: ExecutionTask): void {
  const insert = db.prepare(
    `
      INSERT OR IGNORE INTO inventory_movements (
        movement_id,
        resource_id,
        resource_label,
        quantity_delta,
        unit,
        movement_type,
        source_type,
        source_id,
        source_label,
        recorded_at,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  );
  for (const entry of task.actualConsumption) {
    const movement = movementFromActualConsumption(entry, task);
    if (!movement) {
      continue;
    }
    insert.run(
      movement.movementId,
      movement.resourceId,
      movement.resourceLabel,
      movement.quantityDelta,
      movement.unit,
      movement.movementType,
      movement.sourceType,
      movement.sourceId,
      movement.sourceLabel,
      movement.recordedAt,
      movement.note,
    );
  }
}

function insertInventoryMovement(db: SqliteDatabase, movement: InventoryMovement): void {
  db.prepare(
    `
      INSERT INTO inventory_movements (
        movement_id,
        resource_id,
        resource_label,
        quantity_delta,
        unit,
        movement_type,
        source_type,
        source_id,
        source_label,
        recorded_at,
        note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    movement.movementId,
    movement.resourceId,
    movement.resourceLabel,
    movement.quantityDelta,
    movement.unit,
    movement.movementType,
    movement.sourceType,
    movement.sourceId,
    movement.sourceLabel,
    movement.recordedAt,
    movement.note,
  );
}

function movementFromRow(row: MovementRow): InventoryMovement {
  return {
    movementId: row.movement_id,
    resourceId: row.resource_id,
    resourceLabel: row.resource_label,
    quantityDelta: row.quantity_delta,
    unit: row.unit,
    movementType: row.movement_type,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceLabel: row.source_label,
    recordedAt: row.recorded_at,
    note: row.note,
  };
}
