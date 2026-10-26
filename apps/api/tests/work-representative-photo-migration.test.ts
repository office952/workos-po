import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("migration 048 — work representative photos", () => {
  it("upgrades a plane at 047 additively: one new table, dossier rows untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-048-"));
    temps.push(dir);
    const path = join(dir, "plane.sqlite");
    const seeded = createProductSystemRuntime(path, { documentsRoot: join(dir, "documents") });
    const customer = seeded.createCustomer("Client existent", {});
    if (!customer.ok) throw new Error("customer");
    seeded.close();

    // Bring the plane back to its 047 shape, with a dossier row that must survive the upgrade.
    const db = new Database(path);
    db.exec("DROP TABLE work_representative_photos");
    db.prepare("DELETE FROM schema_migrations WHERE id = '048_work_representative_photos.sql'").run();
    db.prepare(
      `INSERT INTO customer_historical_works (work_id, customer_id, title, event_date, provenance, recorded_at, recorded_by_account_id, updated_at, revision)
       VALUES ('hw:1', ?, 'Lucrare 2021', '2021', 'HISTORICAL_RECORD', 'x', 'a', 'x', 1)`,
    ).run(customer.customer.customerId);
    const before = db.prepare("SELECT * FROM customer_historical_works").all();
    db.close();

    const upgraded = createProductSystemRuntime(path, { documentsRoot: join(dir, "documents") });
    upgraded.close();
    const after = new Database(path, { readonly: true });
    try {
      expect(after.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_representative_photos'").get()).toBeTruthy();
      expect(after.prepare("SELECT id FROM schema_migrations WHERE id = '048_work_representative_photos.sql'").get()).toBeTruthy();
      expect(after.prepare("SELECT * FROM customer_historical_works").all()).toEqual(before);
      expect(after.prepare("SELECT COUNT(*) AS n FROM work_representative_photos").get()).toEqual({ n: 0 });
    } finally {
      after.close();
    }
    // One choice per work, and never a chosen photo together with an invalidation notice.
    const writable = new Database(path);
    try {
      const row = (documentId: string | null, reason: string | null) =>
        writable
          .prepare(
            `INSERT INTO work_representative_photos (work_kind, work_id, customer_id, document_id, revision, updated_at, updated_by_account_id, invalidated_document_id, invalidated_reason, invalidated_at)
             VALUES ('HISTORICAL_WORK', 'hw:1', ?, ?, 1, 'x', 'a', ?, ?, ?)`,
          )
          .run(customer.customer.customerId, documentId, reason ? "doc" : null, reason, reason ? "x" : null);
      writable.pragma("foreign_keys = OFF");
      expect(() => row("doc", "UNLINKED")).toThrow(/CHECK/);
      expect(() => row(null, "OTHER")).toThrow(/CHECK/);
      row(null, "UNLINKED");
      expect(() => row(null, null)).toThrow(/UNIQUE|PRIMARY/);
    } finally {
      writable.close();
    }
  });
});
