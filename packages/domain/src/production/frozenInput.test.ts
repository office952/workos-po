import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordQuoteAcceptance } from "../commercial/quoteAcceptance.js";
import { freezeOrderSnapshot } from "../commercial/orderSnapshot.js";
import { freezeQuoteSnapshot } from "../commercial/quoteSnapshot.js";
import { projectCommercialPrice } from "../commercial/price.js";
import { materializeExecutionPlanFromSnapshot } from "../execution/plan.js";
import {
  BOND_LETTER_BODY_ID,
  CLOSE_LETTER_BODY_ID,
  CUT_SHEET_CNC_ID,
  INSPECT_FINISHED_LETTER_ID,
  INSTALL_OR_CONNECT_PSU_ID,
  PACK_PRODUCT_ID,
  PLACE_LED_MODULES_ID,
  TEST_ILLUMINATION_UNIFORMITY_ID,
  TEST_LIGHTING_IGNITION_ID,
  WIRE_LIGHTING_ID,
} from "../processes/catalog.js";
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
  freezeAcceptedProductionSnapshot,
  freezeProductionInput,
  type AcceptedProductionSnapshot,
  type FrozenProductionInput,
} from "./snapshot.js";

const readyValues: DraftValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

function goldenSpine() {
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
  return { truth, aggregate, composition, eic };
}

function frozenAcceptedOrder() {
  const { truth, aggregate, composition, eic } = goldenSpine();
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
  return { quote: quote.snapshot, order: order.snapshot, input: order.snapshot.productionInput };
}

function syntheticReleaseFromOrder(
  order: ReturnType<typeof frozenAcceptedOrder>["order"],
): AcceptedProductionSnapshot {
  return {
    snapshotId: `proof:${order.orderSnapshotId}`,
    schemaVersion: 1,
    status: "ACCEPTED",
    productCode: order.productCode,
    productLabel: order.productLabel,
    inscription: order.inscription,
    sourceReviewId: order.sourceReviewId,
    sourceConfirmedAt: order.sourceAcceptedAt,
    createdAt: order.createdAt,
    contentHash: order.productionInput.contentHash,
    truth: order.truth,
    quantities: order.quantities,
    requirements: order.productionInput.requirements,
    operations: order.productionInput.operations,
    usedTechnicalSettings: order.productionInput.usedTechnicalSettings,
    usedRecipes: order.productionInput.usedRecipes,
    eic: order.eic,
  };
}

describe("frozen production input alignment", () => {
  it("freezes golden LETTERS operations settings and recipes once", () => {
    const { aggregate, composition } = goldenSpine();
    const first = freezeProductionInput(aggregate, composition);
    const second = freezeProductionInput(aggregate, composition);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.operations).toHaveLength(12);
    expect(
      first.operations.filter((item) => item.providerRequirement === "NOT_REQUIRED").map(
        (item) => item.processId,
      ),
    ).toEqual([
      PLACE_LED_MODULES_ID,
      WIRE_LIGHTING_ID,
      INSTALL_OR_CONNECT_PSU_ID,
      TEST_LIGHTING_IGNITION_ID,
      BOND_LETTER_BODY_ID,
      CLOSE_LETTER_BODY_ID,
      TEST_ILLUMINATION_UNIFORMITY_ID,
      INSPECT_FINISHED_LETTER_ID,
      PACK_PRODUCT_ID,
    ]);
    expect(
      first.operations.find((item) => item.processId === CUT_SHEET_CNC_ID)?.providerRequirement,
    ).toBe("REQUIRED");
    expect(first.requirements.length).toBeGreaterThan(0);
    expect(first.usedTechnicalSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: LED_PITCH_SETTING_ID, value: 100, unit: "mm" }),
        expect.objectContaining({ id: "ledModulePowerW", value: 0.75, unit: "W" }),
        expect.objectContaining({ id: "psuReservePercent", value: 25, unit: "percent" }),
      ]),
    );
    expect(first.usedRecipes.length).toBeGreaterThan(0);
    expect(first.usedRecipes.every((item) => item.currency === "EUR")).toBe(true);
  });

  it("keeps the same production input on Quote and Order", () => {
    const { quote, order, input } = frozenAcceptedOrder();
    expect(quote.productionInput.contentHash).toBe(input.contentHash);
    expect(order.productionInput.contentHash).toBe(input.contentHash);
    expect(order.eic.total).toBe(382.5);
    expect(order.commercial.grossPrice).toBe(624.82);
  });

  it("does not change a frozen input when later settings differ", () => {
    const { aggregate, composition } = goldenSpine();
    const frozen = freezeProductionInput(aggregate, composition);
    const mutated = frozen.usedTechnicalSettings.map((item) =>
      item.id === LED_PITCH_SETTING_ID ? { ...item, value: 80 } : item,
    );
    const later = freezeProductionInput(aggregate, composition, {
      technicalSettings: mutated,
    });
    expect(frozen.usedTechnicalSettings.find((item) => item.id === LED_PITCH_SETTING_ID)?.value).toBe(
      100,
    );
    expect(later.usedTechnicalSettings.find((item) => item.id === LED_PITCH_SETTING_ID)?.value).toBe(
      80,
    );
    expect(later.contentHash).not.toBe(frozen.contentHash);
    expect(frozen.operations).toHaveLength(12);
  });

  it("matches the pilot production snapshot operations without becoming that snapshot", () => {
    const { truth, aggregate, composition, eic } = goldenSpine();
    const input = freezeProductionInput(aggregate, composition);
    const snapshot = freezeAcceptedProductionSnapshot(truth, aggregate, composition, eic);
    expect(input.operations).toEqual(snapshot.operations);
    expect(input.requirements).toEqual(snapshot.requirements);
    expect(input.usedTechnicalSettings).toEqual(snapshot.usedTechnicalSettings);
    expect(input.usedRecipes).toEqual(snapshot.usedRecipes);
    expect(snapshot.snapshotId.startsWith("aps:")).toBe(true);
  });

  it("can feed existing ExecutionPlan materialization without live recompile", () => {
    const { order } = frozenAcceptedOrder();
    const record = materializeExecutionPlanFromSnapshot(syntheticReleaseFromOrder(order), {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    expect(record.tasks).toHaveLength(12);
    expect(record.plan.eicTotal).toBe(382.5);
    expect(record.plan.productCode).toBe(CANONICAL_PRODUCT_CODE);
    expect(record.tasks.every((task) => task.status === "PLANNED")).toBe(true);
    expect(record.tasks.some((task) => task.dependsOnTaskIds.length > 0)).toBe(true);
    expect(
      record.tasks
        .filter((task) => task.providerRequirement === "NOT_REQUIRED")
        .map((task) => task.processId),
    ).toEqual([
      PLACE_LED_MODULES_ID,
      WIRE_LIGHTING_ID,
      INSTALL_OR_CONNECT_PSU_ID,
      TEST_LIGHTING_IGNITION_ID,
      BOND_LETTER_BODY_ID,
      CLOSE_LETTER_BODY_ID,
      TEST_ILLUMINATION_UNIFORMITY_ID,
      INSPECT_FINISHED_LETTER_ID,
      PACK_PRODUCT_ID,
    ]);
  });

  it("does not know LETTERS internals in the frozen-input contract", () => {
    const source = readFileSync(new URL("./snapshot.ts", import.meta.url), "utf8");
    const start = source.indexOf("export type FrozenProductionInput");
    const end = source.indexOf("export function copyFrozenProductionInput");
    expect(source.slice(start, end)).not.toMatch(/LETTERS|FACE|VOLUME|ACM|Logo/);
  });

  it("does not import live compilers on the order copy path", () => {
    const source = readFileSync(new URL("../commercial/orderSnapshot.ts", import.meta.url), "utf8");
    expect(source).toContain("copyFrozenProductionInput");
    expect(source).not.toMatch(/compileDefinition|compileAggregate|compileEic/);
    expect(source).not.toMatch(/projectCommercialPrice|composeProductProcesses|freezeProductionInput/);
  });

  it("rejects an accepted quote that lost its production input", () => {
    const { quote, order } = frozenAcceptedOrder();
    const stripped = {
      ...quote,
      productionInput: {
        ...quote.productionInput,
        operations: [],
      } satisfies FrozenProductionInput,
    };
    expect(freezeOrderSnapshot(stripped, {
      acceptanceId: `qad:${quote.quoteSnapshotId}`,
      schemaVersion: 1,
      quoteSnapshotId: quote.quoteSnapshotId,
      quoteContentHash: quote.contentHash,
      acceptedAt: "2026-08-17T01:00:00.000Z",
    }).ok).toBe(false);
    expect(order.productionInput.operations).toHaveLength(12);
  });
});
