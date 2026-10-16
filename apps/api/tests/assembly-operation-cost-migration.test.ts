import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  listAssemblyOperationCostPolicyVersions,
  readCurrentAssemblyOperationCostPolicy,
  saveAssemblyOperationCostPolicy,
} from "../src/assembly/operationCostPolicyStore.js";
import {
  applyMigrations,
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabaseWithoutMigrations,
  type SqliteDatabase,
} from "../src/persistence/sqlite.js";

const MIGRATION = "041_assembly_operation_cost_policy.sql";
const TABLE = "assembly_operation_cost_policy_versions";
const MIGRATION_SQL = readFileSync(
  fileURLToPath(new URL(`../src/persistence/migrations/${MIGRATION}`, import.meta.url)),
  "utf8",
);
const temps: string[] = [];
const open: SqliteDatabase[] = [];

afterEach(() => {
  for (const db of open.splice(0)) {
    if (db.open) {
      db.close();
    }
  }
  for (const dir of temps.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may briefly keep a handle on a closed SQLite file.
    }
  }
});

function syntheticPlanePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-synthetic-041-"));
  temps.push(dir);
  return join(dir, "plane.sqlite");
}

function openPlane(path: string): SqliteDatabase {
  const db = openSqliteDatabaseWithoutMigrations(path);
  open.push(db);
  return db;
}

function priorMigrations(): string[] {
  return listOperationalMigrationFiles().filter((file) => file < MIGRATION);
}

function schemaObjects(db: SqliteDatabase): { type: string; name: string }[] {
  return db
    .prepare("SELECT type, name FROM sqlite_master WHERE tbl_name = ? ORDER BY type, name")
    .all(TABLE) as { type: string; name: string }[];
}

function registrations(db: SqliteDatabase): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = ?").get(MIGRATION) as { n: number }).n;
}

function dumpUserTables(db: SqliteDatabase): Record<string, unknown[]> {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('schema_migrations', ?) ORDER BY name",
    )
    .all(TABLE) as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all()]),
  );
}

function insertVersion(
  db: SqliteDatabase,
  row: { version: unknown; inspection?: string; packaging?: string; at?: string; by?: string },
) {
  return db
    .prepare(
      `INSERT INTO ${TABLE} (version, final_inspection_mode, final_packaging_mode, updated_at, updated_by)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      row.version,
      row.inspection ?? "INCLUDED_IN_OTHER_OPERATIONS",
      row.packaging ?? "PANEL_FACE_AREA",
      row.at ?? "2026-10-14T08:00:00.000Z",
      row.by ?? "synthetic-owner",
    );
}

function seedHistoricalAssemblySnapshots(db: SqliteDatabase): void {
  const definition = { assemblyId: "asm-synthetic-1", organizationId: "org-synthetic", kind: "V1_PANEL_WITH_LETTERS" };
  db.prepare(
    `INSERT INTO assembly_definitions (assembly_id, organization_id, request_id, kind, status, payload, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run("asm-synthetic-1", "org-synthetic", "req-synthetic", "V1_PANEL_WITH_LETTERS", "CONFIRMED", JSON.stringify(definition), "2026-09-01T08:00:00.000Z", "2026-09-01T08:00:00.000Z");
  const quote = { quoteSnapshotId: "asmq:asmt:legacy", contentHash: "legacy-quote-hash", totals: { grandTotal: 1234.56 } };
  db.prepare(
    `INSERT INTO assembly_quote_snapshots (quote_snapshot_id, organization_id, assembly_id, content_hash, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(quote.quoteSnapshotId, "org-synthetic", "asm-synthetic-1", quote.contentHash, JSON.stringify(quote), "2026-09-01T09:00:00.000Z");
  const order = { orderSnapshotId: "asmo:legacy", sourceQuoteSnapshotId: quote.quoteSnapshotId, contentHash: "legacy-order-hash" };
  db.prepare(
    `INSERT INTO assembly_order_snapshots (order_snapshot_id, organization_id, source_quote_snapshot_id, content_hash, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(order.orderSnapshotId, "org-synthetic", quote.quoteSnapshotId, order.contentHash, JSON.stringify(order), "2026-09-02T09:00:00.000Z");
}

describe("migration 041 assembly operation cost policy (synthetic planes only)", () => {
  it("A creates the append-only table and triggers on a new database", () => {
    const db = openPlane(syntheticPlanePath());
    const through041 = listOperationalMigrationFiles().filter((file) => file <= MIGRATION);
    expect(through041.at(-1)).toBe(MIGRATION);
    applySelectedMigrations(db, through041);
    expect(schemaObjects(db)).toEqual([
      { type: "table", name: TABLE },
      { type: "trigger", name: `${TABLE}_next_only` },
      { type: "trigger", name: `${TABLE}_no_delete` },
      { type: "trigger", name: `${TABLE}_no_update` },
    ]);
    expect(registrations(db)).toBe(1);
    expect(listAssemblyOperationCostPolicyVersions(db)).toEqual([]);
  });

  it("B leaves every existing row of a database migrated through 040 unchanged and backfills nothing", () => {
    const db = openPlane(syntheticPlanePath());
    applySelectedMigrations(db, priorMigrations());
    seedHistoricalAssemblySnapshots(db);
    const before = dumpUserTables(db);
    expect(schemaObjects(db)).toEqual([]);

    applySelectedMigrations(db, [...priorMigrations(), MIGRATION]);

    expect(dumpUserTables(db)).toEqual(before);
    expect(JSON.parse((db.prepare("SELECT payload FROM assembly_quote_snapshots").get() as { payload: string }).payload))
      .not.toHaveProperty("operationCost");
    expect(listAssemblyOperationCostPolicyVersions(db)).toEqual([]);
    expect(registrations(db)).toBe(1);
  });

  it("C is idempotent when the runner opens the database again", () => {
    const path = syntheticPlanePath();
    const first = openPlane(path);
    applyMigrations(first);
    saveAssemblyOperationCostPolicy(first, {
      expectedVersion: null,
      finalInspectionMode: "SEPARATE_LABOR",
      finalPackagingMode: "PANEL_FACE_AREA",
      updatedBy: "synthetic-owner",
      now: "2026-10-14T08:00:00.000Z",
    });
    first.close();
    const second = openPlane(path);
    applyMigrations(second);
    applyMigrations(second);
    expect(registrations(second)).toBe(1);
    expect(listAssemblyOperationCostPolicyVersions(second).map((row) => row.version)).toEqual([1]);
  });

  it("D keeps policies inside each organization plane", () => {
    const orgA = openPlane(syntheticPlanePath());
    const orgB = openPlane(syntheticPlanePath());
    applyMigrations(orgA);
    applyMigrations(orgB);
    saveAssemblyOperationCostPolicy(orgA, {
      expectedVersion: null,
      finalInspectionMode: "INCLUDED_IN_OTHER_OPERATIONS",
      finalPackagingMode: "PANEL_FACE_AREA",
      updatedBy: "owner-a",
    });
    expect(readCurrentAssemblyOperationCostPolicy(orgA)?.version).toBe(1);
    expect(readCurrentAssemblyOperationCostPolicy(orgB)).toBeNull();
  });

  it("E reports no policy as null, never as an invented default", () => {
    const db = openPlane(syntheticPlanePath());
    applyMigrations(db);
    expect(readCurrentAssemblyOperationCostPolicy(db)).toBeNull();
  });

  it("F keeps every version and serves the newest as current", () => {
    const db = openPlane(syntheticPlanePath());
    applyMigrations(db);
    const modes = [
      ["NOT_CONFIGURED", "PANEL_FACE_AREA"],
      ["INCLUDED_IN_OTHER_OPERATIONS", "PANEL_FACE_AREA"],
      ["SEPARATE_LABOR", "NOT_CONFIGURED"],
    ] as const;
    modes.forEach(([finalInspectionMode, finalPackagingMode], index) => {
      const saved = saveAssemblyOperationCostPolicy(db, {
        expectedVersion: index === 0 ? null : index,
        finalInspectionMode,
        finalPackagingMode,
        updatedBy: `owner-${index}`,
      });
      expect(saved).toMatchObject({ ok: true, alreadyApplied: false });
    });
    expect(listAssemblyOperationCostPolicyVersions(db).map((row) => row.version)).toEqual([1, 2, 3]);
    expect(readCurrentAssemblyOperationCostPolicy(db)).toMatchObject({
      version: 3,
      finalInspectionMode: "SEPARATE_LABOR",
      finalPackagingMode: "NOT_CONFIGURED",
      updatedBy: "owner-2",
    });
  });

  it("G refuses UPDATE and DELETE of any version", () => {
    const db = openPlane(syntheticPlanePath());
    applyMigrations(db);
    insertVersion(db, { version: 1 });
    expect(() => db.prepare(`UPDATE ${TABLE} SET final_packaging_mode = 'NOT_CONFIGURED'`).run()).toThrow(/append_only/);
    expect(() => db.prepare(`DELETE FROM ${TABLE}`).run()).toThrow(/append_only/);
    expect(listAssemblyOperationCostPolicyVersions(db)).toHaveLength(1);
  });

  it("H refuses stale, skipped and replayed versions at the database and the store", () => {
    const db = openPlane(syntheticPlanePath());
    applyMigrations(db);
    expect(() => insertVersion(db, { version: 2 })).toThrow(/stale_policy_version/);
    insertVersion(db, { version: 1 });
    expect(() => insertVersion(db, { version: 1 })).toThrow(/stale_policy_version/);
    expect(() => insertVersion(db, { version: 3 })).toThrow(/stale_policy_version/);
    const stale = saveAssemblyOperationCostPolicy(db, {
      expectedVersion: null,
      finalInspectionMode: "SEPARATE_LABOR",
      finalPackagingMode: "PANEL_FACE_AREA",
      updatedBy: "synthetic-owner",
    });
    expect(stale).toMatchObject({ ok: false, error: "stale_policy_version" });
    expect(listAssemblyOperationCostPolicyVersions(db)).toHaveLength(1);
  });

  it("I refuses invalid modes, authors, timestamps and versions", () => {
    const db = openPlane(syntheticPlanePath());
    applyMigrations(db);
    for (const row of [
      { version: 1, inspection: "FREE" },
      { version: 1, packaging: "VOLUME" },
      { version: 1, by: "   " },
      { version: 1, by: "x".repeat(201) },
      { version: 1, at: " " },
      { version: 0 },
      { version: 1.5 },
      { version: "one" },
    ]) {
      expect(() => insertVersion(db, row)).toThrow();
    }
    expect(listAssemblyOperationCostPolicyVersions(db)).toEqual([]);
  });

  it("J recovers after an interruption before registration and keeps data across restart", () => {
    const path = syntheticPlanePath();
    const interrupted = openPlane(path);
    applySelectedMigrations(interrupted, priorMigrations());
    interrupted.exec(MIGRATION_SQL.split("CREATE TRIGGER")[0]!);
    expect(registrations(interrupted)).toBe(0);
    interrupted.close();

    const restarted = openPlane(path);
    applyMigrations(restarted);
    expect(registrations(restarted)).toBe(1);
    expect(schemaObjects(restarted).filter((item) => item.type === "trigger")).toHaveLength(3);
    insertVersion(restarted, { version: 1 });
    expect(() => insertVersion(restarted, { version: 1 })).toThrow(/stale_policy_version/);
    restarted.close();

    const reopened = openPlane(path);
    applyMigrations(reopened);
    expect(readCurrentAssemblyOperationCostPolicy(reopened)?.version).toBe(1);
  });
});
