import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordQuoteAcceptance } from "../commercial/quoteAcceptance.js";
import { freezeOrderSnapshot } from "../commercial/orderSnapshot.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import { projectCommercialPrice } from "../commercial/price.js";
import { materializeExecutionPlanFromSnapshot } from "../execution/plan.js";
import { composeProductProcessesFromTruth } from "../processes/composition.js";
import {
  compileAggregate,
  compileDefinition,
  confirmReviewedDefinition,
} from "../product/compiler.js";
import { seededDisplayLabelCatalog } from "../product/displayMetadata.js";
import {
  CANONICAL_PRODUCT_CODE,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
} from "../product/frontlitPlexiAl06.js";
import { LED_PITCH_SETTING_ID } from "../product/technicalSettings.js";
import type { DraftValues } from "../product/types.js";
import { compileEic } from "../resources/eic.js";
import {
  assertOrderReleaseReadyForExecution,
  freezeProductionReleaseFromOrder,
  isOrderProductionRelease,
} from "./release.js";
import { freezeAcceptedProductionSnapshot } from "./snapshot.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function goldenOrder() {
  const definition = compileDefinition(
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    {
      templateCode: CANONICAL_PRODUCT_CODE,
      values: readyValues,
    },
  );
  const truth = confirmReviewedDefinition(definition, definition.reviewId);
  if ("ok" in truth) {
    throw new Error("expected confirmed truth");
  }
  const aggregate = compileAggregate(
    truth,
    frontlitPlexiAl06Template,
    frontlitPlexiAl06FormSchema,
    seededDisplayLabelCatalog(),
  );
  const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
  const eic = compileEic(aggregate, composition);
  const quote = freezeQuoteSnapshot(
    truth,
    aggregate,
    composition,
    eic,
    projectCommercialPrice(eic),
    { createdAt: "2026-08-17T00:00:00.000Z" },
  );
  if (!quote.ok) {
    throw new Error("expected quote");
  }
  const accepted = recordQuoteAcceptance(quote.snapshot, {
    acceptedAt: "2026-08-17T01:00:00.000Z",
  });
  if (!accepted.ok) {
    throw new Error("expected acceptance");
  }
  const order = freezeOrderSnapshot(quote.snapshot, accepted.decision, {
    createdAt: "2026-08-17T02:00:00.000Z",
  });
  if (!order.ok) {
    throw new Error("expected order");
  }
  return {
    truth,
    aggregate,
    composition,
    eic,
    order: order.snapshot,
  };
}

describe("production release from order", () => {
  it("freezes golden LETTERS release from order without live compile", () => {
    const { order } = goldenOrder();
    const first = freezeProductionReleaseFromOrder(order, {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    const second = freezeProductionReleaseFromOrder(order, {
      createdAt: "2026-08-17T12:00:00.000Z",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) {
      return;
    }
    expect(first.snapshot.contentHash).toBe(second.snapshot.contentHash);
    expect(first.snapshot.snapshotId).toBe(second.snapshot.snapshotId);
    expect(first.snapshot.releaseSource).toBe("ORDER");
    expect(first.snapshot.sourceOrderSnapshotId).toBe(order.orderSnapshotId);
    expect(first.snapshot.sourceOrderContentHash).toBe(order.contentHash);
    expect(first.snapshot.sourceProductionInputHash).toBe(order.productionInput.contentHash);
    expect(first.snapshot.operations).toHaveLength(12);
    expect(first.snapshot.eic.total).toBe(382.5);
    expect(first.snapshot.usedTechnicalSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: LED_PITCH_SETTING_ID, value: 100, unit: "mm" }),
        expect.objectContaining({ id: "ledModulePowerW", value: 0.75, unit: "W" }),
        expect.objectContaining({ id: "psuReservePercent", value: 25, unit: "percent" }),
      ]),
    );
    expect(first.snapshot.usedRecipes.length).toBeGreaterThan(0);
    expect(isOrderProductionRelease(first.snapshot)).toBe(true);
  });

  it("keeps the pilot snapshot hash unchanged and distinct from order release", () => {
    const { truth, aggregate, composition, eic, order } = goldenOrder();
    const pilot = freezeAcceptedProductionSnapshot(truth, aggregate, composition, eic, {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    const release = freezeProductionReleaseFromOrder(order, {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    expect(release.ok).toBe(true);
    if (!release.ok) {
      return;
    }
    expect(pilot.sourceOrderSnapshotId).toBeUndefined();
    expect(isOrderProductionRelease(pilot)).toBe(false);
    expect(release.snapshot.contentHash).not.toBe(pilot.contentHash);
    expect(release.snapshot.operations).toEqual(pilot.operations);
    expect(release.snapshot.usedTechnicalSettings).toEqual(pilot.usedTechnicalSettings);
    expect(release.snapshot.eic.total).toBe(pilot.eic.total);
  });

  it("does not change frozen settings recipes or EIC when later values differ", () => {
    const { order } = goldenOrder();
    const frozen = freezeProductionReleaseFromOrder(order);
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const laterOrder = {
      ...order,
      productionInput: {
        ...order.productionInput,
        usedTechnicalSettings: order.productionInput.usedTechnicalSettings.map((item) =>
          item.id === LED_PITCH_SETTING_ID ? { ...item, value: 80 } : item,
        ),
        usedRecipes: order.productionInput.usedRecipes.map((item, index) =>
          index === 0 ? { ...item, rate: 99, cost: 99 } : item,
        ),
      },
      eic: { ...order.eic, total: 999 },
      commercial: { ...order.commercial, grossPrice: 1, markupPercent: 99, vatPercent: 9 },
    };
    const later = freezeProductionReleaseFromOrder(laterOrder);
    expect(later.ok).toBe(true);
    if (!later.ok) {
      return;
    }
    expect(
      frozen.snapshot.usedTechnicalSettings.find((item) => item.id === LED_PITCH_SETTING_ID)?.value,
    ).toBe(100);
    expect(frozen.snapshot.eic.total).toBe(382.5);
    expect(frozen.snapshot.usedRecipes[0]?.rate).not.toBe(99);
    expect(later.snapshot.contentHash).not.toBe(frozen.snapshot.contentHash);
    expect(order.commercial.grossPrice).toBe(624.82);
  });

  it("feeds existing ExecutionPlan materialization without live reads", () => {
    const { order } = goldenOrder();
    const frozen = freezeProductionReleaseFromOrder(order, {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const record = materializeExecutionPlanFromSnapshot(frozen.snapshot, {
      createdAt: "2026-08-17T04:00:00.000Z",
    });
    expect(record.tasks).toHaveLength(12);
    expect(record.plan.eicTotal).toBe(382.5);
    expect(record.plan.sourceSnapshotId).toBe(frozen.snapshot.snapshotId);
    expect(record.plan.sourceSnapshotHash).toBe(frozen.snapshot.contentHash);
    expect(record.tasks.every((task) => task.status === "PLANNED")).toBe(true);
  });

  it("rejects an order that lost its production input", () => {
    const { order } = goldenOrder();
    const stripped = {
      ...order,
      productionInput: {
        ...order.productionInput,
        operations: [],
      },
    };
    expect(freezeProductionReleaseFromOrder(stripped).ok).toBe(false);
  });

  it("creates an ExecutionPlan only from the frozen order release", () => {
    const { order } = goldenOrder();
    const frozen = freezeProductionReleaseFromOrder(order, {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    expect(assertOrderReleaseReadyForExecution(frozen.snapshot, order).ok).toBe(true);
    expect(assertOrderReleaseReadyForExecution(frozen.snapshot, null).ok).toBe(false);
    expect(
      assertOrderReleaseReadyForExecution({ ...frozen.snapshot, operations: [] }, order).ok,
    ).toBe(false);
    const record = materializeExecutionPlanFromSnapshot(frozen.snapshot, {
      createdAt: "2026-08-17T04:00:00.000Z",
    });
    expect(record.plan.sourceSnapshotId).toBe(frozen.snapshot.snapshotId);
    expect(record.plan.sourceSnapshotHash).toBe(frozen.snapshot.contentHash);
    expect(record.tasks).toHaveLength(12);
    expect(record.plan.eicTotal).toBe(382.5);
    expect(record.tasks.every((task) => task.status === "PLANNED")).toBe(true);
  });

  it("refuses Production Release from Order v2", () => {
    const { order } = goldenOrder();
    const refused = freezeProductionReleaseFromOrder({
      ...order,
      schemaVersion: 2,
    });
    expect(refused).toMatchObject({
      ok: false,
      error: "incompatible_order_source",
    });
  });

  it("does not know LETTERS internals and does not import live compilers", () => {
    const source = readFileSync(new URL("./release.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/LETTERS|FACE|VOLUME|ACM|Logo/);
    expect(source).not.toMatch(/compileDefinition|compileAggregate|compileEic/);
    expect(source).not.toMatch(/projectCommercialPrice|composeProductProcesses/);
    expect(source).not.toMatch(/listTypeTechnicalSettings|recipeForProcessScope/);
  });
});
