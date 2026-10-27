import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

const DOSSIER_TABLES = [
  "customer_commercial_terms_revisions",
  "customer_document_links",
  "customer_documents",
  "customer_dossier_events",
  "customer_historical_works",
  "customer_site_assignments",
  "customer_sites",
];

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tables(path: string): string[] {
  const db = new Database(path, { readonly: true });
  try {
    return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'customer_%' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
  } finally {
    db.close();
  }
}

describe("migration 047 — customer dossier", () => {
  it("upgrades a plane at 046 additively and keeps existing customers, requests and snapshots", () => {
    const dir = mkdtempSync(join(tmpdir(), "workos-047-"));
    temps.push(dir);
    const path = join(dir, "plane.sqlite");
    const seeded = createProductSystemRuntime(path, { documentsRoot: join(dir, "documents") });
    const customer = seeded.createCustomer("Client existent", { address: "Str. Existentă 1" });
    if (!customer.ok) throw new Error("customer");
    const request = seeded.createCommercialRequest(customer.customer.customerId, "Cerere existentă", "Înainte de 047");
    if (!request.ok) throw new Error("request");
    seeded.close();

    // Bring the plane back to its 046 shape: no dossier tables, 047 not recorded.
    const db = new Database(path);
    for (const table of DOSSIER_TABLES) db.exec(`DROP TABLE ${table}`);
    db.prepare("DELETE FROM schema_migrations WHERE id = '047_customer_dossier.sql'").run();
    // A plane at 046 has no later customer table either (N-023 · 049 references customers too).
    db.exec("DROP TABLE customer_logo_revisions");
    db.prepare("DELETE FROM schema_migrations WHERE id = '049_customer_logo.sql'").run();
    const before = {
      customers: db.prepare("SELECT * FROM customers ORDER BY customer_id").all(),
      requests: db.prepare("SELECT * FROM commercial_requests ORDER BY request_id").all(),
    };
    db.close();
    expect(tables(path)).toEqual(["customers"]);

    const upgraded = createProductSystemRuntime(path, { documentsRoot: join(dir, "documents") });
    upgraded.close();
    expect(tables(path)).toEqual(["customers", ...DOSSIER_TABLES, "customer_logo_revisions"].sort());
    const after = new Database(path, { readonly: true });
    try {
      expect(after.prepare("SELECT * FROM customers ORDER BY customer_id").all()).toEqual(before.customers);
      expect(after.prepare("SELECT * FROM commercial_requests ORDER BY request_id").all()).toEqual(before.requests);
      expect(after.prepare("SELECT 1 FROM schema_migrations WHERE id = '047_customer_dossier.sql'").get()).toBeTruthy();
    } finally {
      after.close();
    }
    // The schema refuses a photo without a stage, a stage on a non-photo and an unknown kind.
    const writable = new Database(path);
    try {
      writable.pragma("foreign_keys = ON");
      const base = [customer.customer.customerId, "Titlu", "f.png", "image/png", 1, "x", "2026-10-23T00:00:00.000Z", "local", 1];
      const row = (id: string, kind: string, stage: string | null, key: string) =>
        writable
          .prepare(
            `INSERT INTO customer_documents (document_id, customer_id, kind, photo_stage, title, original_file_name, mime_type, size_bytes, sha256, storage_key, uploaded_at, uploaded_by_account_id, revision)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(id, base[0], kind, stage, base[1], base[2], base[3], base[4], base[5], key, base[6], base[7], base[8]);
      expect(() => row("d1", "PHOTO", null, "k1")).toThrow();
      expect(() => row("d2", "INVOICE", "BEFORE", "k2")).toThrow();
      expect(() => row("d3", "RECEIPT", null, "k3")).toThrow();
      expect(() => row("d4", "PHOTO", "AFTER", "k4")).not.toThrow();
    } finally {
      writable.close();
    }
  });
});
