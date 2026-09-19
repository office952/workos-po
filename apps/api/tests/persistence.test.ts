import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  compileAggregate,
  compileDefinition,
  compileEic,
  composeProductProcessesFromTruth,
  confirmReviewedDefinition,
  freezeAcceptedProductionSnapshot,
  freezeOrderSnapshot,
  freezeProductionReleaseFromOrder,
  freezeQuoteSnapshot,
  LAB_SITE_INSTALL_ID,
  projectCommercialPrice,
  projectManualFixedServicePrice,
  recordQuoteAcceptance,
  frontlitPlexiAl06FormSchema,
  frontlitPlexiAl06Template,
  materializeExecutionPlanFromSnapshot,
  MCH_CNC_4020_ID,
  PLACE_LED_MODULES_ID,
  SITE_INSTALLATION_SCOPE_ID,
  seedDisplayLabelRecords,
  siteInstallationFreezeRefusal,
} from "@workos-final/domain";
import { persistCreatedCustomer } from "../src/customers/store.js";
import { persistOrganizationServiceOffer } from "../src/operationalServices/store.js";
import { applyMigrations, listOperationalMigrationFiles, openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  persistCreatedCommercialRequest,
  persistUpdatedCommercialRequest,
} from "../src/requests/store.js";

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-ps-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

describe("product system persistence", () => {
  it("bootstraps seeds on an empty store and does not overwrite edits on reopen", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    expect(first.present().admin.families[0]?.label).toBe(
      seedDisplayLabelRecords().find((item) => item.entityKind === "PRODUCT_FAMILY")
        ?.displayLabel,
    );
    const written = first.updateDisplayLabel(
      "PRODUCT_FAMILY",
      "LIGHTED_VOLUMETRIC_SIGNS",
      "Familie persistată",
      1,
    );
    expect(written.ok).toBe(true);
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    expect(second.present().admin.families[0]?.label).toBe("Familie persistată");
    expect(second.present().admin.families[0]?.id).toBe("LIGHTED_VOLUMETRIC_SIGNS");
    expect(second.present().admin.families[0]?.displayRevision).toBe(2);
    second.close();
  });

  it("applies migrations from empty and again without drift", () => {
    const sqlitePath = tempSqlitePath();
    const first = openSqliteDatabase(sqlitePath);
    applyMigrations(first);
    const count = first
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };
    expect(count.count).toBe(listOperationalMigrationFiles().length);
    first.close();

    const second = openSqliteDatabase(sqlitePath);
    applyMigrations(second);
    const again = second
      .prepare("SELECT COUNT(*) AS count FROM schema_migrations")
      .get() as { count: number };
    expect(again.count).toBe(listOperationalMigrationFiles().length);
    second.close();
  });

  it("persists an accepted production snapshot without an update path", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const snapshot = freezeAcceptedProductionSnapshot(
      truth,
      aggregate,
      composition,
      compileEic(aggregate, composition),
      { createdAt: "2026-08-15T14:00:00.000Z" },
    );
    const created = first.acceptProductionSnapshot(snapshot);
    const again = first.acceptProductionSnapshot({
      ...snapshot,
      createdAt: "2026-08-15T18:00:00.000Z",
    });
    expect(created.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.snapshot.createdAt).toBe("2026-08-15T14:00:00.000Z");
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readProductionSnapshot(snapshot.snapshotId);
    expect(stored?.eic.total).toBe(382.5);
    expect(stored?.usedTechnicalSettings.find((item) => item.id === "ledPitchMm")?.value).toBe(
      100,
    );
    expect(stored?.createdAt).toBe("2026-08-15T14:00:00.000Z");
    expect(second).not.toHaveProperty("updateProductionSnapshot");
    second.close();
  });

  it("persists a quote snapshot without rewriting historical commercial values", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const eic = compileEic(aggregate, composition);
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
      { createdAt: "2026-08-17T00:00:00.000Z" },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const created = first.persistQuoteSnapshot(frozen.snapshot);
    const again = first.persistQuoteSnapshot({
      ...frozen.snapshot,
      createdAt: "2026-08-17T12:00:00.000Z",
    });
    expect(created.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.snapshot.createdAt).toBe("2026-08-17T00:00:00.000Z");
    expect(first.readExecutionPlanBySnapshot("missing")).toBeNull();
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId);
    expect(stored?.eic.total).toBe(382.5);
    expect(stored?.commercial.grossPrice).toBe(624.82);
    expect(stored?.commercial.policyVersion).toBe(1);
    expect(stored?.productionInput.operations).toHaveLength(12);
    expect(stored?.productionInput.contentHash).toBe(frozen.snapshot.productionInput.contentHash);
    expect(stored?.createdAt).toBe("2026-08-17T00:00:00.000Z");
    expect(second).not.toHaveProperty("updateQuoteSnapshot");
    expect(stored?.customer).toBeUndefined();
    second.close();
  });

  it("keeps frozen quote customer after the live customer is renamed", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const createdCustomer = first.createCustomer("SC Exemplu SRL");
    expect(createdCustomer.ok).toBe(true);
    if (!createdCustomer.ok) {
      return;
    }
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const eic = compileEic(aggregate, composition);
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
      {
        createdAt: "2026-08-17T00:00:00.000Z",
        customer: {
          customerId: createdCustomer.customer.customerId,
          displayName: createdCustomer.customer.displayName,
        },
      },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    first.persistQuoteSnapshot(frozen.snapshot);
    first.renameCustomer(createdCustomer.customer.customerId, "SC Exemplu Nou SRL");
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId);
    expect(stored?.customer).toEqual({
      customerId: createdCustomer.customer.customerId,
      displayName: "SC Exemplu SRL",
    });
    expect(second.getCustomer(createdCustomer.customer.customerId)?.displayName).toBe(
      "SC Exemplu Nou SRL",
    );
    second.close();
  });

  it("persists one quote acceptance without mutating the frozen quote", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const eic = compileEic(aggregate, composition);
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
      { createdAt: "2026-08-17T00:00:00.000Z" },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    first.persistQuoteSnapshot(frozen.snapshot);
    const recorded = recordQuoteAcceptance(frozen.snapshot, {
      acceptedAt: "2026-08-17T01:00:00.000Z",
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) {
      return;
    }
    const created = first.persistQuoteAcceptance(recorded.decision);
    const again = first.persistQuoteAcceptance({
      ...recorded.decision,
      acceptedAt: "2026-08-17T12:00:00.000Z",
    });
    expect(created.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.decision.acceptedAt).toBe("2026-08-17T01:00:00.000Z");
    expect(first.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId)?.status).toBe(
      "FROZEN",
    );
    expect(first.readProductionSnapshot("missing")).toBeNull();
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readQuoteAcceptance(frozen.snapshot.quoteSnapshotId);
    expect(stored?.quoteContentHash).toBe(frozen.snapshot.contentHash);
    expect(stored?.acceptedAt).toBe("2026-08-17T01:00:00.000Z");
    expect(second.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId)?.commercial.grossPrice).toBe(
      624.82,
    );
    expect(second).not.toHaveProperty("updateQuoteAcceptance");
    second.close();
  });

  it("persists one order snapshot from accepted quote without side effects", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const eic = compileEic(aggregate, composition);
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
      { createdAt: "2026-08-17T00:00:00.000Z" },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    first.persistQuoteSnapshot(frozen.snapshot);
    const recorded = recordQuoteAcceptance(frozen.snapshot, {
      acceptedAt: "2026-08-17T01:00:00.000Z",
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) {
      return;
    }
    first.persistQuoteAcceptance(recorded.decision);
    const order = freezeOrderSnapshot(frozen.snapshot, recorded.decision, {
      createdAt: "2026-08-17T02:00:00.000Z",
    });
    expect(order.ok).toBe(true);
    if (!order.ok) {
      return;
    }
    const created = first.persistOrderSnapshot(order.snapshot);
    const again = first.persistOrderSnapshot({
      ...order.snapshot,
      createdAt: "2026-08-17T12:00:00.000Z",
    });
    expect(created.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.snapshot.createdAt).toBe("2026-08-17T02:00:00.000Z");
    expect(again.snapshot.orderSnapshotId).toBe(order.snapshot.orderSnapshotId);
    expect(first.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId)?.status).toBe(
      "FROZEN",
    );
    expect(first.readQuoteAcceptance(frozen.snapshot.quoteSnapshotId)?.acceptedAt).toBe(
      "2026-08-17T01:00:00.000Z",
    );
    expect(first.readProductionSnapshot("missing")).toBeNull();
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readOrderSnapshot(order.snapshot.orderSnapshotId);
    const byQuote = second.readOrderSnapshotByQuote(frozen.snapshot.quoteSnapshotId);
    expect(stored?.eic.total).toBe(382.5);
    expect(stored?.commercial.grossPrice).toBe(624.82);
    expect(stored?.commercial.markupPercent).toBe(35);
    expect(stored?.commercial.vatPercent).toBe(21);
    expect(stored?.productionInput.operations).toHaveLength(12);
    expect(stored?.productionInput.contentHash).toBe(frozen.snapshot.productionInput.contentHash);
    expect(stored?.sourceAcceptanceId).toBe(recorded.decision.acceptanceId);
    expect(byQuote?.orderSnapshotId).toBe(order.snapshot.orderSnapshotId);
    expect(second.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId)?.status).toBe(
      "FROZEN",
    );
    expect(second).not.toHaveProperty("updateOrderSnapshot");
    const db = openSqliteDatabase(sqlitePath);
    const counts = {
      orders: (db.prepare("SELECT COUNT(*) AS count FROM order_snapshots").get() as { count: number })
        .count,
      production: (
        db.prepare("SELECT COUNT(*) AS count FROM accepted_production_snapshots").get() as {
          count: number;
        }
      ).count,
      plans: (db.prepare("SELECT COUNT(*) AS count FROM execution_plans").get() as { count: number })
        .count,
      tasks: (db.prepare("SELECT COUNT(*) AS count FROM execution_tasks").get() as { count: number })
        .count,
      movements: (
        db.prepare("SELECT COUNT(*) AS count FROM inventory_movements").get() as { count: number }
      ).count,
      actuals: (
        db.prepare("SELECT COUNT(*) AS count FROM execution_task_actual_consumption").get() as {
          count: number;
        }
      ).count,
    };
    db.close();
    expect(counts).toEqual({
      orders: 1,
      production: 0,
      plans: 0,
      tasks: 0,
      movements: 0,
      actuals: 0,
    });
    second.close();
  });

  it("round-trips Order v2 lines and jobCommercial through the existing store", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const eic = compileEic(aggregate, composition);
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
      {
        createdAt: "2026-09-04T00:00:00.000Z",
        installation: {
          label: "Montaj la locație",
          providerMode: "INTERNAL",
          requestId: "req:os-s7-persist",
          technicalConfiguration: {
            measurementStatus: "OFFICE_MEASURED",
            facadeType: "CONCRETE",
            fixingMethod: "MECHANICAL_ANCHOR",
            siteElectrical: "NOT_APPLICABLE",
            crewSize: 3,
            plannedDurationHours: 4,
          },
          evidence: {
            resourceId: LAB_SITE_INSTALL_ID,
            amount: 25,
            currency: "EUR",
            perUnit: "person_hour",
            source: "OWNER_CONFIRMED_WORKSHOP",
            classification: "OWNER_CONFIRMED",
            note: "Tarif intern sintetic.",
          },
          eic: {
            completeness: "COMPLETE",
            completenessReasons: [],
            geometryLabel: null,
            currency: "EUR",
            lines: [
              {
                resourceId: LAB_SITE_INSTALL_ID,
                label: "Manoperă montaj la locație",
                quantity: 12,
                unit: "person_hour",
                rate: 25,
                currency: "EUR",
                cost: 300,
                kind: "LABOR",
                group: "labor",
              },
            ],
            total: 300,
            excludedComponentLabels: [],
          },
          commercial: projectManualFixedServicePrice({ netPrice: 200 }),
        },
      },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    const acceptance = {
      acceptanceId: `qad:${frozen.snapshot.quoteSnapshotId}`,
      schemaVersion: 1 as const,
      quoteSnapshotId: frozen.snapshot.quoteSnapshotId,
      quoteContentHash: frozen.snapshot.contentHash,
      acceptedAt: "2026-09-04T01:00:00.000Z",
    };
    const order = freezeOrderSnapshot(frozen.snapshot, acceptance, {
      createdAt: "2026-09-04T02:00:00.000Z",
    });
    expect(order.ok).toBe(true);
    if (!order.ok) {
      return;
    }
    first.persistQuoteSnapshot(frozen.snapshot);
    first.persistQuoteAcceptance(acceptance);
    first.persistOrderSnapshot(order.snapshot);
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readOrderSnapshot(order.snapshot.orderSnapshotId);
    const byQuote = second.readOrderSnapshotByQuote(frozen.snapshot.quoteSnapshotId);
    expect(stored?.schemaVersion).toBe(2);
    expect(stored?.contentHash).toBe(order.snapshot.contentHash);
    expect(stored?.lines).toEqual(order.snapshot.lines);
    expect(stored?.jobCommercial).toEqual(order.snapshot.jobCommercial);
    expect(byQuote?.orderSnapshotId).toBe(order.snapshot.orderSnapshotId);
    expect(second.readQuoteSnapshot(frozen.snapshot.quoteSnapshotId)?.schemaVersion).toBe(2);
    second.close();
  });

  it("persists one production release from order without execution side effects", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const eic = compileEic(aggregate, composition);
    const frozen = freezeQuoteSnapshot(
      truth,
      aggregate,
      composition,
      eic,
      projectCommercialPrice(eic),
      { createdAt: "2026-08-17T00:00:00.000Z" },
    );
    expect(frozen.ok).toBe(true);
    if (!frozen.ok) {
      return;
    }
    first.persistQuoteSnapshot(frozen.snapshot);
    const recorded = recordQuoteAcceptance(frozen.snapshot, {
      acceptedAt: "2026-08-17T01:00:00.000Z",
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) {
      return;
    }
    first.persistQuoteAcceptance(recorded.decision);
    const order = freezeOrderSnapshot(frozen.snapshot, recorded.decision, {
      createdAt: "2026-08-17T02:00:00.000Z",
    });
    expect(order.ok).toBe(true);
    if (!order.ok) {
      return;
    }
    first.persistOrderSnapshot(order.snapshot);
    const release = freezeProductionReleaseFromOrder(order.snapshot, {
      createdAt: "2026-08-17T03:00:00.000Z",
    });
    expect(release.ok).toBe(true);
    if (!release.ok) {
      return;
    }
    const created = first.acceptProductionSnapshot(release.snapshot);
    const again = first.acceptProductionSnapshot({
      ...release.snapshot,
      createdAt: "2026-08-17T12:00:00.000Z",
    });
    expect(created.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.snapshot.createdAt).toBe("2026-08-17T03:00:00.000Z");
    expect(first.readProductionReleaseByOrder(order.snapshot.orderSnapshotId)?.snapshotId).toBe(
      release.snapshot.snapshotId,
    );
    expect(first.readExecutionPlanBySnapshot(release.snapshot.snapshotId)).toBeNull();
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readProductionReleaseByOrder(order.snapshot.orderSnapshotId);
    expect(stored?.releaseSource).toBe("ORDER");
    expect(stored?.operations).toHaveLength(12);
    expect(stored?.eic.total).toBe(382.5);
    expect(stored?.sourceOrderSnapshotId).toBe(order.snapshot.orderSnapshotId);
    expect(stored?.usedTechnicalSettings.find((item) => item.id === "ledPitchMm")?.value).toBe(100);
    expect(second.readOrderSnapshot(order.snapshot.orderSnapshotId)?.commercial.grossPrice).toBe(
      624.82,
    );
    const db = openSqliteDatabase(sqlitePath);
    const counts = {
      orders: (db.prepare("SELECT COUNT(*) AS count FROM order_snapshots").get() as { count: number })
        .count,
      production: (
        db.prepare("SELECT COUNT(*) AS count FROM accepted_production_snapshots").get() as {
          count: number;
        }
      ).count,
      plans: (db.prepare("SELECT COUNT(*) AS count FROM execution_plans").get() as { count: number })
        .count,
      tasks: (db.prepare("SELECT COUNT(*) AS count FROM execution_tasks").get() as { count: number })
        .count,
      movements: (
        db.prepare("SELECT COUNT(*) AS count FROM inventory_movements").get() as { count: number }
      ).count,
    };
    db.close();
    expect(counts).toEqual({
      orders: 1,
      production: 1,
      plans: 0,
      tasks: 0,
      movements: 0,
    });
    second.close();
  });

  it("persists an execution plan atomically and returns the same plan for one snapshot", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const snapshot = freezeAcceptedProductionSnapshot(
      truth,
      aggregate,
      composition,
      compileEic(aggregate, composition),
      { createdAt: "2026-08-15T14:00:00.000Z" },
    );
    first.acceptProductionSnapshot(snapshot);
    const created = first.persistExecutionPlan(
      materializeExecutionPlanFromSnapshot(snapshot, {
        createdAt: "2026-08-15T15:00:00.000Z",
      }),
    );
    const again = first.persistExecutionPlan(
      materializeExecutionPlanFromSnapshot(snapshot, {
        createdAt: "2026-08-15T18:00:00.000Z",
      }),
    );
    expect(created.created).toBe(true);
    expect(created.record.tasks).toHaveLength(12);
    expect(again.created).toBe(false);
    expect(again.record.plan.planId).toBe(created.record.plan.planId);
    expect(again.record.plan.createdAt).toBe("2026-08-15T15:00:00.000Z");
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readExecutionPlan(created.record.plan.planId);
    expect(stored?.tasks).toHaveLength(12);
    expect(stored?.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    expect(stored?.tasks.every((item) => item.assignedProvider === null)).toBe(true);
    expect(second).not.toHaveProperty("updateExecutionPlan");
    second.close();
  });

  it("persists provider assignment and start/complete timestamps", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const snapshot = freezeAcceptedProductionSnapshot(
      truth,
      aggregate,
      composition,
      compileEic(aggregate, composition),
      { createdAt: "2026-08-15T14:00:00.000Z" },
    );
    first.acceptProductionSnapshot(snapshot);
    const created = first.persistExecutionPlan(
      materializeExecutionPlanFromSnapshot(snapshot, {
        createdAt: "2026-08-15T15:00:00.000Z",
      }),
    );
    const backCnc = created.record.tasks.find(
      (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    );
    if (!backCnc) {
      throw new Error("missing back cnc task");
    }
    const person = first.createPerson("Executor test");
    expect(person.ok).toBe(true);
    if (!person.ok) {
      throw new Error("expected person");
    }
    const assigned = first.assignExecutionTaskProvider(backCnc.taskId, MCH_CNC_4020_ID);
    expect(assigned.ok).toBe(true);
    const executor = first.assignExecutionTaskExecutor(backCnc.taskId, person.person.personId);
    expect(executor.ok).toBe(true);
    const started = first.startExecutionTask(backCnc.taskId);
    expect(started.ok).toBe(true);
    const completed = first.completeExecutionTask(backCnc.taskId, {
      completedQuantity: 12.5,
      note: "Executat conform fișei",
      actualConsumption: backCnc.resourceDemands.map((demand) => ({
        resourceId: demand.resourceId,
        actualQuantity: demand.quantity + 0.2,
      })),
    });
    expect(completed.ok).toBe(true);
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const stored = second.readExecutionPlan(created.record.plan.planId);
    const task = stored?.tasks.find((item) => item.taskId === backCnc.taskId);
    expect(task?.assignedProvider?.label).toBe("CNC 4020");
    expect(task?.assignedExecutor?.label).toBe("Executor test");
    expect(task?.status).toBe("COMPLETED");
    expect(task?.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(task?.completedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(task?.completion).toEqual({
      outcome: "COMPLETED_AS_PLANNED",
      completedQuantity: 12.5,
      completedQuantityUnit: "m",
      note: "Executat conform fișei",
    });
    expect(task?.quantities[0]?.value).toBe(12.5);
    expect(task?.resourceDemands[0]?.quantity).toBe(backCnc.resourceDemands[0]?.quantity);
    expect(task?.actualConsumption).toEqual(
      backCnc.resourceDemands.map((demand) => ({
        entryId: `act:${backCnc.taskId}:${demand.resourceId}`,
        taskId: backCnc.taskId,
        resourceId: demand.resourceId,
        resourceLabel: demand.label,
        actualQuantity: demand.quantity + 0.2,
        unit: demand.unit,
        recordedAt: task?.completedAt,
        note: null,
      })),
    );
    expect(stored?.plan.eicTotal).toBe(382.5);
    expect(stored?.plan.sourceSnapshotHash).toBe(snapshot.contentHash);
    const afterService = second.readInventory().items.find(
      (item) => item.resourceId === "MAT-LED-MODULE",
    );
    expect(afterService?.movementCount).toBe(0);
    expect(afterService?.status).toBe("NO_MOVEMENTS");
    second.close();
  });

  it("writes one inventory OUT from LED actual consumption and keeps it after reopen and retry", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath);
    const definition = compileDefinition(
      frontlitPlexiAl06Template,
      frontlitPlexiAl06FormSchema,
      {
        templateCode: CANONICAL_PRODUCT_CODE,
        values: {
          "root.inscription": "WORKOS",
          "face.finish": "none",
          "face.confirmedAreaMm2": 250000,
          "volume.depthMm": "60",
          "volume.finish": "none",
          "volume.confirmedPerimeterMm": 12500,
        },
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
      first.labels(),
    );
    const composition = composeProductProcessesFromTruth(truth, frontlitPlexiAl06Template);
    const snapshot = freezeAcceptedProductionSnapshot(
      truth,
      aggregate,
      composition,
      compileEic(aggregate, composition),
      { createdAt: "2026-08-15T14:00:00.000Z" },
    );
    first.acceptProductionSnapshot(snapshot);
    const created = first.persistExecutionPlan(
      materializeExecutionPlanFromSnapshot(snapshot, {
        createdAt: "2026-08-15T15:00:00.000Z",
      }),
    );
    const backCnc = created.record.tasks.find(
      (item) => item.processLabel === "Debitare foaie CNC" && item.scopeLabel === "Spate",
    );
    const lighting = created.record.tasks.find((item) => item.processId === PLACE_LED_MODULES_ID);
    if (!backCnc || !lighting) {
      throw new Error("missing tasks");
    }
    const person = first.createPerson("Executor test");
    if (!person.ok) {
      throw new Error("expected person");
    }
    first.assignExecutionTaskProvider(backCnc.taskId, MCH_CNC_4020_ID);
    first.assignExecutionTaskExecutor(backCnc.taskId, person.person.personId);
    first.startExecutionTask(backCnc.taskId);
    first.completeExecutionTask(backCnc.taskId, { completedQuantity: 12.5 });
    first.assignExecutionTaskExecutor(lighting.taskId, person.person.personId);
    first.startExecutionTask(lighting.taskId);
    const completed = first.completeExecutionTask(lighting.taskId, {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: "MAT-LED-MODULE", actualQuantity: 127 }],
    });
    expect(completed.ok).toBe(true);
    const retry = first.completeExecutionTask(lighting.taskId, {
      completedQuantity: 125,
      actualConsumption: [{ resourceId: "MAT-LED-MODULE", actualQuantity: 200 }],
    });
    expect(retry.ok).toBe(true);
    if (retry.ok) {
      expect(retry.alreadyApplied).toBe(true);
    }
    first.close();

    const second = createProductSystemRuntime(sqlitePath);
    const led = second.readInventoryItem("MAT-LED-MODULE");
    expect(led?.item.balance).toBe(-127);
    expect(led?.item.status).toBe("NEGATIVE");
    expect(led?.movements).toHaveLength(1);
    expect(led?.movements[0]).toMatchObject({
      resourceId: "MAT-LED-MODULE",
      quantityDelta: -127,
      unit: "buc",
      movementType: "OUT",
      sourceType: "EXECUTION_ACTUAL_CONSUMPTION",
      movementTypeLabel: "Consum producție",
    });
    const storedTask = second
      .readExecutionPlan(created.record.plan.planId)
      ?.tasks.find((item) => item.taskId === lighting.taskId);
    expect(storedTask?.actualConsumption[0]?.actualQuantity).toBe(127);
    expect(storedTask?.quantities[0]?.value).toBe(125);
    expect(second.readExecutionPlan(created.record.plan.planId)?.plan.eicTotal).toBe(382.5);
    second.close();
  });

  it("keeps existing CER references and retries when the human reference already exists", () => {
    const sqlitePath = tempSqlitePath();
    const db = openSqliteDatabase(sqlitePath);
    const createdCustomer = persistCreatedCustomer(db, "Client CER");
    expect(createdCustomer.ok).toBe(true);
    if (!createdCustomer.ok) {
      return;
    }
    const first = persistCreatedCommercialRequest(
      db,
      createdCustomer.customer,
      "Prima cerere",
      "Descriere existentă.",
      { requestId: "crq:11111111-2222-3333-4444-555555555555" },
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.request.reference).toBe("CER-11111111");
    const colliding = persistCreatedCommercialRequest(
      db,
      createdCustomer.customer,
      "A doua cerere",
      "Aceeași referință umană.",
      { requestId: "crq:11111111-aaaa-bbbb-cccc-dddddddddddd" },
    );
    expect(colliding.ok).toBe(true);
    if (!colliding.ok) {
      return;
    }
    expect(colliding.request.reference).toMatch(/^CER-[0-9A-F]{8}$/);
    expect(colliding.request.reference).not.toBe("CER-11111111");
    expect(colliding.request.requestId).not.toBe(first.request.requestId);
    const stored = db
      .prepare("SELECT request_id, reference FROM commercial_requests ORDER BY created_at")
      .all() as Array<{ request_id: string; reference: string }>;
    expect(stored[0]).toEqual({
      request_id: "crq:11111111-2222-3333-4444-555555555555",
      reference: "CER-11111111",
    });
    expect(new Set(stored.map((row) => row.reference)).size).toBe(2);
    expect(() =>
      db
        .prepare(
          `
          INSERT INTO commercial_requests (
            request_id, reference, customer_id, title, description, status, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          "crq:99999999-0000-4000-8000-000000000001",
          "CER-11111111",
          createdCustomer.customer.customerId,
          "Coliziune",
          "Nu trebuie să treacă.",
          "NEW",
          "2026-08-17T12:00:00.000Z",
          "2026-08-17T12:00:00.000Z",
        ),
    ).toThrow(/UNIQUE constraint failed/);
    expect(first.request.optionalScopeIds).toEqual([]);
    expect(first.request.siteInstallationMode).toBeNull();
    expect(
      persistUpdatedCommercialRequest(db, first.request.requestId, {
        optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      }),
    ).toEqual({ ok: false, error: "service_not_offered" });
    expect(
      persistOrganizationServiceOffer(db, SITE_INSTALLATION_SCOPE_ID, "INTERNAL").ok,
    ).toBe(true);
    const selected = persistUpdatedCommercialRequest(db, first.request.requestId, {
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
    });
    expect(selected.ok).toBe(true);
    if (selected.ok) {
      expect(selected.request.optionalScopeIds).toEqual([SITE_INSTALLATION_SCOPE_ID]);
      expect(selected.request.siteInstallationMode).toBe("INTERNAL");
    }
    const rows = db
      .prepare(
        "SELECT request_id, scope_id, provider_mode FROM commercial_request_optional_scopes",
      )
      .all() as Array<{ request_id: string; scope_id: string; provider_mode: string | null }>;
    expect(rows).toEqual([
      {
        request_id: first.request.requestId,
        scope_id: SITE_INSTALLATION_SCOPE_ID,
        provider_mode: "INTERNAL",
      },
    ]);
    const again = persistUpdatedCommercialRequest(db, first.request.requestId, {
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
    });
    expect(again).toMatchObject({ ok: true, alreadyApplied: true });
    const cleared = persistUpdatedCommercialRequest(db, first.request.requestId, {
      optionalScopeIds: [],
    });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.request.optionalScopeIds).toEqual([]);
    }
    expect(
      db
        .prepare("SELECT COUNT(*) AS count FROM commercial_request_optional_scopes")
        .get() as { count: number },
    ).toEqual({ count: 0 });
    db.close();
  });

  it("keeps a persisted installation selection visible without inferring mode", () => {
    const sqlitePath = tempSqlitePath();
    const db = openSqliteDatabase(sqlitePath);
    const createdCustomer = persistCreatedCustomer(db, "Client păstrat");
    expect(createdCustomer.ok).toBe(true);
    if (!createdCustomer.ok) {
      return;
    }
    const created = persistCreatedCommercialRequest(
      db,
      createdCustomer.customer,
      "Cerere existentă",
      "Selecție Phase 1 fără config org.",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    db.prepare(
      `
      INSERT INTO commercial_request_optional_scopes (
        request_id, scope_id, selected_at, provider_mode
      ) VALUES (?, ?, ?, ?)
    `,
    ).run(
      created.request.requestId,
      SITE_INSTALLATION_SCOPE_ID,
      "2026-08-20T10:00:00.000Z",
      null,
    );
    const stored = persistUpdatedCommercialRequest(db, created.request.requestId, {
      title: "Cerere existentă",
    });
    expect(stored.ok).toBe(true);
    if (!stored.ok) {
      return;
    }
    expect(stored.alreadyApplied).toBe(true);
    expect(stored.request.optionalScopeIds).toEqual([SITE_INSTALLATION_SCOPE_ID]);
    expect(stored.request.siteInstallationMode).toBeNull();
    expect(siteInstallationFreezeRefusal(stored.request.optionalScopeIds)).not.toBeNull();
    expect(
      persistUpdatedCommercialRequest(db, created.request.requestId, {
        optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
        siteInstallationMode: "INTERNAL",
      }),
    ).toEqual({ ok: false, error: "service_mode_unavailable" });
    db.close();
  });

  it("adds operational service schema without seeding and keeps locked writes atomic", () => {
    const sqlitePath = tempSqlitePath();
    const first = openSqliteDatabase(sqlitePath);
    const migrationIds = first
      .prepare("SELECT id FROM schema_migrations ORDER BY id")
      .all() as Array<{ id: string }>;
    expect(migrationIds.map((item) => item.id)).toContain(
      "026_operational_service_organization_and_mode.sql",
    );
    const columns = first
      .prepare("PRAGMA table_info(commercial_request_optional_scopes)")
      .all() as Array<{ name: string }>;
    expect(columns.map((item) => item.name)).toContain("provider_mode");
    expect(
      (
        first
          .prepare("SELECT COUNT(*) AS count FROM organization_operational_service_capabilities")
          .get() as { count: number }
      ).count,
    ).toBe(0);
    first.close();
    const again = openSqliteDatabase(sqlitePath);
    expect(
      (
        again
          .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?")
          .get("026_operational_service_organization_and_mode.sql") as { count: number }
      ).count,
    ).toBe(1);
    again.close();

    const db = openSqliteDatabase(tempSqlitePath());
    const createdCustomer = persistCreatedCustomer(db, "Client atomic");
    expect(createdCustomer.ok).toBe(true);
    if (!createdCustomer.ok) {
      return;
    }
    const created = persistCreatedCommercialRequest(
      db,
      createdCustomer.customer,
      "Cerere blocată",
      "Selecție existentă cu ofertă legată.",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(persistOrganizationServiceOffer(db, SITE_INSTALLATION_SCOPE_ID, "BOTH").ok).toBe(true);
    const selected = persistUpdatedCommercialRequest(db, created.request.requestId, {
      optionalScopeIds: [SITE_INSTALLATION_SCOPE_ID],
      siteInstallationMode: "INTERNAL",
    });
    expect(selected.ok).toBe(true);
    db.prepare(
      `
      INSERT INTO quote_snapshots (
        quote_snapshot_id, product_code, source_review_id, content_hash,
        schema_version, created_at, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      "qts:locked-selection",
      CANONICAL_PRODUCT_CODE,
      "rev:locked-selection",
      "hash-locked-selection",
      1,
      "2026-08-30T00:00:00.000Z",
      "{}",
    );
    db.prepare(
      `
      INSERT INTO commercial_request_quote_links (request_id, quote_snapshot_id, linked_at)
      VALUES (?, ?, ?)
    `,
    ).run(
      created.request.requestId,
      "qts:locked-selection",
      "2026-08-30T00:00:00.000Z",
    );
    const before = db
      .prepare(
        "SELECT request_id, scope_id, provider_mode FROM commercial_request_optional_scopes",
      )
      .all() as Array<{ request_id: string; scope_id: string; provider_mode: string | null }>;
    expect(
      persistUpdatedCommercialRequest(db, created.request.requestId, {
        siteInstallationMode: "SUBCONTRACTED",
      }),
    ).toEqual({ ok: false, error: "service_selection_locked" });
    const after = db
      .prepare(
        "SELECT request_id, scope_id, provider_mode FROM commercial_request_optional_scopes",
      )
      .all() as Array<{ request_id: string; scope_id: string; provider_mode: string | null }>;
    expect(after).toEqual(before);
    expect(after).toEqual([
      {
        request_id: created.request.requestId,
        scope_id: SITE_INSTALLATION_SCOPE_ID,
        provider_mode: "INTERNAL",
      },
    ]);
    db.close();
  });

  it("adds installation facts schema additively without seed or backfill", () => {
    const sqlitePath = tempSqlitePath();
    const first = openSqliteDatabase(sqlitePath);
    const createdCustomer = persistCreatedCustomer(first, "Client facts");
    expect(createdCustomer.ok).toBe(true);
    if (!createdCustomer.ok) {
      return;
    }
    const created = persistCreatedCommercialRequest(
      first,
      createdCustomer.customer,
      "Cerere existentă",
      "Fără fapte de montaj.",
    );
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }
    expect(
      (
        first
          .prepare("SELECT COUNT(*) AS count FROM commercial_request_installation_facts")
          .get() as { count: number }
      ).count,
    ).toBe(0);
    expect(
      first
        .prepare("SELECT id FROM schema_migrations ORDER BY id")
        .all()
        .map((item) => (item as { id: string }).id),
    ).toContain("028_first_real_letters_prequote.sql");
    expect(() =>
      first
        .prepare(
          `
          INSERT INTO commercial_request_installation_facts (
            request_id, version, street, city, country_code, measurement_status,
            facade_type, fixing_method, site_electrical, created_at, updated_at
          ) VALUES ('crq:missing', 1, 'Strada', 'Oraș', 'RO', 'UNCONFIRMED',
            'UNCONFIRMED', 'UNCONFIRMED', 'UNCONFIRMED', '2026-08-29T10:00:00.000Z',
            '2026-08-29T10:00:00.000Z')
        `,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
    first.close();
    const again = openSqliteDatabase(sqlitePath);
    expect(
      (
        again
          .prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE id = ?")
          .get("028_first_real_letters_prequote.sql") as { count: number }
      ).count,
    ).toBe(1);
    expect(
      (
        again
          .prepare("SELECT COUNT(*) AS count FROM commercial_request_installation_facts")
          .get() as { count: number }
      ).count,
    ).toBe(0);
    again.close();
  });
});
