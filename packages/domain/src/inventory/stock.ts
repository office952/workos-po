import { COMPLETION_NOTE_MAX_LENGTH } from "../execution/plan.js";
import {
  getResource,
  resourceCatalog,
  resourceUnitLabel,
  type ResourceDefinition,
  type ResourceUnit,
} from "../resources/catalog.js";
import type { ActualConsumptionEntry } from "../execution/consumption.js";

export const INVENTORY_MOVEMENT_TYPES = ["OUT", "ADJUSTMENT"] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const INVENTORY_SOURCE_TYPES = [
  "EXECUTION_ACTUAL_CONSUMPTION",
  "OWNER_ADJUSTMENT",
] as const;
export type InventorySourceType = (typeof INVENTORY_SOURCE_TYPES)[number];

export const INVENTORY_MUTATION_ERRORS = [
  "invalid_resource",
  "invalid_quantity",
  "invalid_note",
] as const;
export type InventoryMutationError = (typeof INVENTORY_MUTATION_ERRORS)[number];

export type InventoryMovement = {
  movementId: string;
  resourceId: string;
  resourceLabel: string;
  quantityDelta: number;
  unit: ResourceUnit;
  movementType: InventoryMovementType;
  sourceType: InventorySourceType;
  sourceId: string;
  sourceLabel: string | null;
  recordedAt: string;
  note: string | null;
};

export type InventoryStockItemView = {
  resourceId: string;
  label: string;
  unit: ResourceUnit;
  unitLabel: string;
  balance: number;
  movementCount: number;
  status: "NO_MOVEMENTS" | "IN_STOCK" | "ZERO" | "NEGATIVE";
  statusLabel: string;
};

export type InventoryStockProjection = {
  items: readonly InventoryStockItemView[];
  materialCount: number;
  negativeCount: number;
};

export type InventoryItemDetail = {
  item: InventoryStockItemView;
  movements: readonly InventoryMovementView[];
};

export type InventoryMovementView = InventoryMovement & {
  movementTypeLabel: string;
  quantityLabel: string;
};

export function isStockableResource(
  resource: Pick<ResourceDefinition, "kind">,
): boolean {
  return resource.kind === "MATERIAL";
}

export function listStockableResources(): readonly ResourceDefinition[] {
  return resourceCatalog.filter((item) => isStockableResource(item));
}

export function inventoryOutMovementId(entryId: string): string {
  return `inv:out:${entryId}`;
}

export function inventoryAdjustmentMovementId(
  resourceId: string,
  recordedAt: string,
): string {
  return `inv:adj:${resourceId}:${recordedAt}`;
}

export function movementFromActualConsumption(
  entry: ActualConsumptionEntry,
  task: { processLabel: string; scopeLabel: string },
): InventoryMovement | null {
  const resource = getResource(entry.resourceId);
  if (!resource || !isStockableResource(resource)) {
    return null;
  }
  if (entry.actualQuantity === 0) {
    return null;
  }
  if (entry.unit !== resource.unit) {
    return null;
  }
  return {
    movementId: inventoryOutMovementId(entry.entryId),
    resourceId: resource.id,
    resourceLabel: resource.label,
    quantityDelta: -entry.actualQuantity,
    unit: resource.unit,
    movementType: "OUT",
    sourceType: "EXECUTION_ACTUAL_CONSUMPTION",
    sourceId: entry.entryId,
    sourceLabel: `${task.processLabel} — ${task.scopeLabel}`,
    recordedAt: entry.recordedAt,
    note: entry.note,
  };
}

export function buildInventoryAdjustment(
  resourceId: string,
  quantityDelta: number,
  recordedAt: string,
  note?: string,
):
  | { ok: true; movement: InventoryMovement }
  | { ok: false; error: InventoryMutationError } {
  const resource = getResource(resourceId);
  if (!resource || !isStockableResource(resource)) {
    return { ok: false, error: "invalid_resource" };
  }
  if (!Number.isFinite(quantityDelta) || quantityDelta === 0) {
    return { ok: false, error: "invalid_quantity" };
  }
  const readNote = readInventoryNote(note);
  if (readNote === false) {
    return { ok: false, error: "invalid_note" };
  }
  return {
    ok: true,
    movement: {
      movementId: inventoryAdjustmentMovementId(resource.id, recordedAt),
      resourceId: resource.id,
      resourceLabel: resource.label,
      quantityDelta,
      unit: resource.unit,
      movementType: "ADJUSTMENT",
      sourceType: "OWNER_ADJUSTMENT",
      sourceId: inventoryAdjustmentMovementId(resource.id, recordedAt),
      sourceLabel: null,
      recordedAt,
      note: readNote,
    },
  };
}

export function deriveStockBalance(
  movements: readonly Pick<InventoryMovement, "quantityDelta">[],
): number {
  return movements.reduce((sum, item) => sum + item.quantityDelta, 0);
}

export function projectInventoryStock(
  movements: readonly InventoryMovement[],
): InventoryStockProjection {
  const byResource = groupMovements(movements);
  const items = listStockableResources()
    .map((resource) =>
      projectStockItem(resource, byResource.get(resource.id) ?? []),
    )
    .sort((left, right) => left.label.localeCompare(right.label, "ro"));
  return {
    items,
    materialCount: items.length,
    negativeCount: items.filter((item) => item.status === "NEGATIVE").length,
  };
}

export function projectInventoryItemDetail(
  resourceId: string,
  movements: readonly InventoryMovement[],
): InventoryItemDetail | null {
  const resource = getResource(resourceId);
  if (!resource || !isStockableResource(resource)) {
    return null;
  }
  const related = movements
    .filter((item) => item.resourceId === resource.id)
    .slice()
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt));
  return {
    item: projectStockItem(resource, related),
    movements: related.map(projectMovementView),
  };
}

export function projectMovementView(movement: InventoryMovement): InventoryMovementView {
  return {
    ...movement,
    movementTypeLabel: inventoryMovementTypeLabel(movement.movementType),
    quantityLabel: formatSignedInventoryQuantity(movement.quantityDelta, movement.unit),
  };
}

export function inventoryMovementTypeLabel(type: InventoryMovementType): string {
  switch (type) {
    case "OUT":
      return "Consum producție";
    case "ADJUSTMENT":
      return "Ajustare stoc";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function inventoryStockStatusLabel(
  status: InventoryStockItemView["status"],
): string {
  switch (status) {
    case "NO_MOVEMENTS":
      return "Fără mișcări";
    case "IN_STOCK":
      return "În stoc";
    case "ZERO":
      return "Sold zero";
    case "NEGATIVE":
      return "Sold negativ";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function formatSignedInventoryQuantity(value: number, unit: ResourceUnit): string {
  const abs = formatInventoryQuantity(Math.abs(value));
  const labeled = `${abs} ${resourceUnitLabel(unit)}`;
  if (value > 0) {
    return `+${labeled}`;
  }
  if (value < 0) {
    return `−${labeled}`;
  }
  return labeled;
}

function projectStockItem(
  resource: ResourceDefinition,
  movements: readonly InventoryMovement[],
): InventoryStockItemView {
  const balance = deriveStockBalance(movements);
  const status = stockStatus(movements.length, balance);
  return {
    resourceId: resource.id,
    label: resource.label,
    unit: resource.unit,
    unitLabel: resourceUnitLabel(resource.unit),
    balance,
    movementCount: movements.length,
    status,
    statusLabel: inventoryStockStatusLabel(status),
  };
}

function stockStatus(
  movementCount: number,
  balance: number,
): InventoryStockItemView["status"] {
  if (movementCount === 0) {
    return "NO_MOVEMENTS";
  }
  if (balance < 0) {
    return "NEGATIVE";
  }
  if (balance === 0) {
    return "ZERO";
  }
  return "IN_STOCK";
}

function groupMovements(
  movements: readonly InventoryMovement[],
): Map<string, InventoryMovement[]> {
  const byResource = new Map<string, InventoryMovement[]>();
  for (const movement of movements) {
    const current = byResource.get(movement.resourceId) ?? [];
    current.push(movement);
    byResource.set(movement.resourceId, current);
  }
  return byResource;
}

function formatInventoryQuantity(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("ro-RO", { maximumFractionDigits: 4 });
}

function readInventoryNote(note: string | undefined): string | null | false {
  if (note === undefined) {
    return null;
  }
  if (typeof note !== "string") {
    return false;
  }
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > COMPLETION_NOTE_MAX_LENGTH) {
    return false;
  }
  return trimmed;
}
