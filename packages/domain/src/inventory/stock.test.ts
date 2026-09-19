import { describe, expect, it } from "vitest";
import { actualConsumptionEntryId } from "../execution/consumption.js";
import {
  MAT_LED_MODULE_ID,
  PLEXIGLAS_3MM_OPAL_ID,
  SVC_CNC_FACE_ID,
} from "../resources/catalog.js";
import {
  buildInventoryAdjustment,
  deriveStockBalance,
  inventoryOutMovementId,
  isStockableResource,
  listStockableResources,
  movementFromActualConsumption,
  projectInventoryItemDetail,
  projectInventoryStock,
} from "./stock.js";

describe("inventory stock identity and movements", () => {
  it("treats only materials as stock items and reuses canonical resource identity", () => {
    const materials = listStockableResources();
    expect(materials.every((item) => item.kind === "MATERIAL")).toBe(true);
    expect(materials.some((item) => item.id === MAT_LED_MODULE_ID)).toBe(true);
    expect(materials.some((item) => item.id === PLEXIGLAS_3MM_OPAL_ID)).toBe(true);
    expect(materials.some((item) => item.id === SVC_CNC_FACE_ID)).toBe(false);
    expect(isStockableResource({ kind: "SERVICE" })).toBe(false);
    expect(isStockableResource({ kind: "LABOR" })).toBe(false);
  });

  it("creates one OUT movement from actual LED consumption and derives a negative balance", () => {
    const entryId = actualConsumptionEntryId("task:led", MAT_LED_MODULE_ID);
    const movement = movementFromActualConsumption(
      {
        entryId,
        taskId: "task:led",
        resourceId: MAT_LED_MODULE_ID,
        resourceLabel: "Modul LED 12V",
        actualQuantity: 127,
        unit: "buc",
        recordedAt: "2026-08-16T18:00:00.000Z",
        note: null,
      },
      { processLabel: "Montare module LED", scopeLabel: "Iluminare" },
    );
    expect(movement).toMatchObject({
      movementId: inventoryOutMovementId(entryId),
      resourceId: MAT_LED_MODULE_ID,
      quantityDelta: -127,
      unit: "buc",
      movementType: "OUT",
      sourceType: "EXECUTION_ACTUAL_CONSUMPTION",
      sourceId: entryId,
      sourceLabel: "Montare module LED — Iluminare",
    });
    expect(deriveStockBalance([movement!])).toBe(-127);

    const projection = projectInventoryStock([movement!]);
    const led = projection.items.find((item) => item.resourceId === MAT_LED_MODULE_ID);
    expect(led?.balance).toBe(-127);
    expect(led?.status).toBe("NEGATIVE");
    expect(led?.statusLabel).toBe("Sold negativ");
    expect(projection.negativeCount).toBe(1);

    const plexi = projection.items.find((item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID);
    expect(plexi?.balance).toBe(0);
    expect(plexi?.status).toBe("NO_MOVEMENTS");
    expect(plexi?.statusLabel).toBe("Fără mișcări");
  });

  it("skips service consumption and zero quantity so they do not invent stock truth", () => {
    expect(
      movementFromActualConsumption(
        {
          entryId: "act:task:cnc:SVC-CNC-FACE",
          taskId: "task:cnc",
          resourceId: SVC_CNC_FACE_ID,
          resourceLabel: "Debitare CNC față",
          actualQuantity: 12.7,
          unit: "m",
          recordedAt: "2026-08-16T18:00:00.000Z",
          note: null,
        },
        { processLabel: "Debitare foaie CNC", scopeLabel: "Față" },
      ),
    ).toBeNull();
    expect(
      movementFromActualConsumption(
        {
          entryId: actualConsumptionEntryId("task:led", MAT_LED_MODULE_ID),
          taskId: "task:led",
          resourceId: MAT_LED_MODULE_ID,
          resourceLabel: "Modul LED 12V",
          actualQuantity: 0,
          unit: "buc",
          recordedAt: "2026-08-16T18:00:00.000Z",
          note: null,
        },
        { processLabel: "Montare module LED", scopeLabel: "Iluminare" },
      ),
    ).toBeNull();
  });

  it("records an owner adjustment as a movement and never mutates a stored balance", () => {
    const created = buildInventoryAdjustment(
      MAT_LED_MODULE_ID,
      200,
      "2026-08-16T17:00:00.000Z",
      "Stoc inițial de dezvoltare",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("expected adjustment");
    }
    const out = movementFromActualConsumption(
      {
        entryId: actualConsumptionEntryId("task:led", MAT_LED_MODULE_ID),
        taskId: "task:led",
        resourceId: MAT_LED_MODULE_ID,
        resourceLabel: "Modul LED 12V",
        actualQuantity: 127,
        unit: "buc",
        recordedAt: "2026-08-16T18:00:00.000Z",
        note: null,
      },
      { processLabel: "Montare module LED", scopeLabel: "Iluminare" },
    );
    const detail = projectInventoryItemDetail(MAT_LED_MODULE_ID, [created.movement, out!]);
    expect(detail?.item.balance).toBe(73);
    expect(detail?.item.status).toBe("IN_STOCK");
    expect(detail?.movements[0]?.movementTypeLabel).toBe("Consum producție");
    expect(detail?.movements[0]?.quantityLabel).toBe("−127 buc");
    expect(JSON.stringify(detail)).not.toMatch(/inventoryEngine|purchaseOrder|reservation|warehouse/);
  });

  it("rejects non-stock resources and invalid adjustment quantities", () => {
    expect(buildInventoryAdjustment(SVC_CNC_FACE_ID, 10, "2026-08-16T17:00:00.000Z")).toEqual({
      ok: false,
      error: "invalid_resource",
    });
    expect(buildInventoryAdjustment("unknown", 10, "2026-08-16T17:00:00.000Z")).toEqual({
      ok: false,
      error: "invalid_resource",
    });
    expect(buildInventoryAdjustment(MAT_LED_MODULE_ID, 0, "2026-08-16T17:00:00.000Z")).toEqual({
      ok: false,
      error: "invalid_quantity",
    });
    expect(
      buildInventoryAdjustment(MAT_LED_MODULE_ID, Number.NaN, "2026-08-16T17:00:00.000Z"),
    ).toEqual({ ok: false, error: "invalid_quantity" });
    expect(projectInventoryItemDetail(SVC_CNC_FACE_ID, [])).toBeNull();
  });
});
