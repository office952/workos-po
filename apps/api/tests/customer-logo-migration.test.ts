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

describe("migration 049 — customer logo revisions", () => {
  it("upgrades a plane at 048 additively and idempotently: one new table, existing rows untouched", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-049-"));
    temps.push(dir);
    const path = join(dir, "plane.sqlite");
    const seeded = createProductSystemRuntime(path, { documentsRoot: join(dir, "documents") });
    const customer = seeded.createCustomer("Client existent", {});
    if (!customer.ok) throw new Error("customer");
    const customerId = customer.customer.customerId;
    seeded.close();

    // Bring the plane back to its 048 shape, with rows that must survive the upgrade.
    const db = new Database(path);
    db.exec("DROP TABLE customer_logo_revisions");
    db.prepare("DELETE FROM schema_migrations WHERE id = '049_customer_logo.sql'").run();
    db.prepare(
      `INSERT INTO customer_historical_works (work_id, customer_id, title, event_date, provenance, recorded_at, recorded_by_account_id, updated_at, revision)
       VALUES ('hw:1', ?, 'Lucrare 2021', '2021', 'HISTORICAL_RECORD', 'x', 'a', 'x', 1)`,
    ).run(customerId);
    const before = {
      customers: db.prepare("SELECT * FROM customers").all(),
      works: db.prepare("SELECT * FROM customer_historical_works").all(),
      documentKinds: db.prepare("SELECT sql FROM sqlite_master WHERE name = 'customer_documents'").get(),
    };
    db.close();

    // Opened twice: the second open applies nothing again.
    for (let open = 0; open < 2; open += 1) createProductSystemRuntime(path, { documentsRoot: join(dir, "documents") }).close();
    const after = new Database(path, { readonly: true });
    try {
      expect(after.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customer_logo_revisions'").get()).toBeTruthy();
      expect(after.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '049_customer_logo.sql'").get()).toEqual({ n: 1 });
      expect(after.prepare("SELECT * FROM customers").all()).toEqual(before.customers);
      expect(after.prepare("SELECT * FROM customer_historical_works").all()).toEqual(before.works);
      // customer_documents.kind gains no new kind.
      expect(after.prepare("SELECT sql FROM sqlite_master WHERE name = 'customer_documents'").get()).toEqual(before.documentKinds);
      expect(after.prepare("SELECT COUNT(*) AS n FROM customer_logo_revisions").get()).toEqual({ n: 0 });
    } finally {
      after.close();
    }

    // The schema keeps a revision either complete with its file or without any file field.
    const writable = new Database(path);
    try {
      const insert = (revision: number, hasLogo: number, file: { key: string | null; mime: string | null; width: number | null }) =>
        writable
          .prepare(
            `INSERT INTO customer_logo_revisions (customer_id, revision, has_logo, storage_key, sha256, mime_type, width, height, size_bytes,
               original_file_name, provenance, changed_at, changed_by_account_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'x', 'a')`,
          )
          .run(
            customerId,
            revision,
            hasLogo,
            file.key,
            file.key ? "ab" : null,
            file.mime,
            file.width,
            file.width,
            file.key ? 10 : null,
            file.key ? "s.png" : null,
            file.key ? "UPLOAD" : null,
          );
      const complete = { key: "k", mime: "image/png", width: 10 };
      expect(() => insert(1, 1, { key: null, mime: "image/png", width: 10 })).toThrow(/CHECK/);
      expect(() => insert(1, 0, complete)).toThrow(/CHECK/);
      expect(() => insert(1, 1, { ...complete, mime: "image/svg+xml" })).toThrow(/CHECK/);
      expect(() => insert(1, 1, { ...complete, width: 5000 })).toThrow(/CHECK/);
      expect(() => insert(0, 0, { key: null, mime: null, width: null })).toThrow(/CHECK/);
      insert(1, 1, complete);
      insert(2, 0, { key: null, mime: null, width: null });
      expect(() => insert(2, 1, complete)).toThrow(/UNIQUE|PRIMARY/);
      writable.pragma("foreign_keys = ON");
      expect(() =>
        writable
          .prepare("INSERT INTO customer_logo_revisions (customer_id, revision, has_logo, changed_at, changed_by_account_id) VALUES ('nimeni', 1, 0, 'x', 'a')")
          .run(),
      ).toThrow(/FOREIGN KEY/);
    } finally {
      writable.close();
    }
  });
});
