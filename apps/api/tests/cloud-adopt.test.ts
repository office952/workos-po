import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MCH_CNC_4020_ID, OWNER_CONFIRMED_SELLER } from "@workos-final/domain";
import {
  adoptOperationalPlane,
  fingerprintSqlite,
  sourceFingerprintsEqual,
} from "../src/cloud/adoptOperationalPlane.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
  trackTempDir,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

function buildSyntheticSource() {
  const root = trackTempDir();
  const sqlitePath = join(root, "product-system.sqlite");
  const documentsRoot = join(root, "documents");
  mkdirSync(documentsRoot, { recursive: true });
  const runtime = createProductSystemRuntime(sqlitePath, { documentsRoot });
  const seller = runtime.updateSellerProfile({
    ...OWNER_CONFIRMED_SELLER,
    legalName: "Atelier Sursa SRL",
    brand: "Sursa",
  });
  if (!seller.ok) {
    throw new Error("seller");
  }
  const person = runtime.createPerson("Ada Adopt");
  if (!person.ok) {
    throw new Error("person");
  }
  const customer = runtime.createCustomer("Client Sursa");
  if (!customer.ok) {
    throw new Error("customer");
  }
  const stock = runtime.recordInventoryAdjustment("plexiglas_3mm_opal", 2, "stoc sursa");
  if (!stock.ok) {
    throw new Error("inventory");
  }
  const request = runtime.createCommercialRequest(
    customer.customer.customerId,
    "Cerere sursa",
    "Documente client",
  );
  if (!request.ok) {
    throw new Error("request");
  }
  const attachment = runtime.createRequestAttachment(request.request.requestId, {
    originalFileName: "brief.txt",
    mimeType: "text/plain",
    bytes: new TextEncoder().encode("brief sursa"),
  });
  if (!attachment.ok) {
    throw new Error("attachment");
  }
  const costs = runtime.listActiveCostEvidence();
  runtime.close();

  const db = new Database(sqlitePath);
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.prepare(
    `INSERT INTO quote_snapshots (
      quote_snapshot_id, product_code, source_review_id, content_hash,
      schema_version, created_at, payload
    ) VALUES (?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    "qts:synthetic-adopt",
    "PRD-LETTERS-FL-PLX-ALU-06",
    "rev:synthetic",
    "hash-synthetic-adopt-001",
    new Date().toISOString(),
    JSON.stringify({ seller: { legalName: "Atelier Sursa SRL" } }),
  );
  const peopleCount = (db.prepare("SELECT COUNT(*) AS n FROM people").get() as { n: number }).n;
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.pragma("journal_mode = DELETE");
  db.close();
  writeFileSync(join(documentsRoot, "extra.txt"), "doc extra");
  return {
    sqlitePath,
    documentsRoot,
    personId: person.person.personId,
    costRowIds: costs.map((row) => row.evidenceRowId),
    peopleCount,
  };
}

describe("ADOPT_EXISTING machinery", () => {
  it("dry-run writes nothing and execute copies without touching the source", async () => {
    const source = buildSyntheticSource();
    const before = fingerprintSqlite(source.sqlitePath);
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Firma Adoptata", "ADOPT_EXISTING");
    try {

    const dry = await adoptOperationalPlane({
      controlPlane: fixture.controlPlane,
      organizationId: org.organization.organizationId,
      sourceSqlite: source.sqlitePath,
      sourceDocumentsRoot: source.documentsRoot,
      mode: "dry-run",
    });
    expect(dry.executed).toBe(false);
    expect(dry.verification).toBeUndefined();
    expect(existsSync(join(fixture.cloudRoot, "backups"))).toBe(false);
    expect(existsSync(org.paths.planeRoot)).toBe(false);
    expect(existsSync(`${org.paths.planeRoot}.staging`)).toBe(false);
    expect(sourceFingerprintsEqual(fingerprintSqlite(source.sqlitePath), before)).toBe(true);
    expect(fixture.controlPlane.listOrganizations()).toEqual([org.organization]);
    expect(fixture.controlPlane.getPlaneByOrganization(org.organization.organizationId)).toEqual(
      org.plane,
    );

    const executed = await adoptOperationalPlane({
      controlPlane: fixture.controlPlane,
      organizationId: org.organization.organizationId,
      sourceSqlite: source.sqlitePath,
      sourceDocumentsRoot: source.documentsRoot,
      mode: "execute",
    });
    expect(executed.executed).toBe(true);
    expect(sourceFingerprintsEqual(executed.sourceAfter, before)).toBe(true);
    expect(executed.verification?.people).toBe(source.peopleCount);
    expect(executed.verification?.customers).toBe(1);
    expect(executed.verification?.quotes).toBe(1);
    expect(executed.verification?.quoteSnapshotId).toBe("qts:synthetic-adopt");
    expect(executed.verification?.quoteContentHash).toBe("hash-synthetic-adopt-001");
    expect(executed.verification?.attachments).toBe(1);
    expect(executed.verification?.documents).toBeGreaterThan(0);

    await addUser(fixture, {
      email: "adopt@example.test",
      password: OWNER_PASSWORD,
      organizationId: org.organization.organizationId,
      role: "owner",
    });
    const login = await loginCloud(
      fixture.app,
      "adopt@example.test",
      OWNER_PASSWORD,
      org.organization.organizationId,
    );
    const headers = { cookie: login.cookie ?? "" };
    const seller = (await (await fixture.app.request("/api/seller", { headers })).json()) as {
      seller: { legalName: string };
    };
    expect(seller.seller.legalName).toBe("Atelier Sursa SRL");
    const people = (await (await fixture.app.request("/api/people", { headers })).json()) as {
      people: Array<{ personId: string; displayName: string }>;
    };
    expect(people.people.map((item) => item.displayName)).toEqual(["Ada Adopt"]);
    expect(people.people[0]?.personId).toBe(source.personId);
    const admin = (await (
      await fixture.app.request("/api/resources-admin", { headers })
    ).json()) as { costEvidence: Array<{ evidenceRowId?: string }> };
    expect(admin.costEvidence.map((row) => row.evidenceRowId)).toEqual(source.costRowIds);
    const after = fingerprintSqlite(source.sqlitePath);
    expect(after.sqliteHash).toBe(before.sqliteHash);
    expect(after.sqliteSize).toBe(before.sqliteSize);
    const sourceDb = new Database(source.sqlitePath, { readonly: true, fileMustExist: true });
    const sourceIdentity = sourceDb
      .prepare("SELECT plane_id FROM operational_plane_identity WHERE id = 'current'")
      .get() as { plane_id: string } | undefined;
    sourceDb.close();
    expect(sourceIdentity).toBeUndefined();
    const workcenters = await (await fixture.app.request("/api/workcenters", { headers })).text();
    expect(workcenters).toContain(MCH_CNC_4020_ID);
    } finally {
      fixture.close();
    }
  });

  it("rejects relative paths, Cloud-root sources, and non-ADOPT planes", async () => {
    const source = buildSyntheticSource();
    const fixture = createCloudFixture();
    try {
    const neu = await addOrganization(fixture, "Firma Noua", "NEW_ORGANIZATION");
    await expect(
      adoptOperationalPlane({
        controlPlane: fixture.controlPlane,
        organizationId: neu.organization.organizationId,
        sourceSqlite: source.sqlitePath,
        sourceDocumentsRoot: source.documentsRoot,
        mode: "dry-run",
      }),
    ).rejects.toMatchObject({ code: "bootstrap_policy_not_adopt_existing" });

    const org = await addOrganization(fixture, "Adopt Rel", "ADOPT_EXISTING");
    await expect(
      adoptOperationalPlane({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        sourceSqlite: "relative.sqlite",
        sourceDocumentsRoot: source.documentsRoot,
        mode: "dry-run",
      }),
    ).rejects.toMatchObject({ code: "relative_source_path" });

    await expect(
      adoptOperationalPlane({
        controlPlane: fixture.controlPlane,
        organizationId: org.organization.organizationId,
        sourceSqlite: join(fixture.cloudRoot, "control", "control-plane.sqlite"),
        sourceDocumentsRoot: source.documentsRoot,
        mode: "dry-run",
      }),
    ).rejects.toMatchObject({ code: "source_inside_cloud_root" });
    } finally {
      fixture.close();
    }
  });

  it("compares WAL and SHM appearance, disappearance, and hash changes", () => {
    const source = buildSyntheticSource();
    const before = fingerprintSqlite(source.sqlitePath);
    expect(before.walHash).toBeNull();
    expect(before.shmHash).toBeNull();
    writeFileSync(`${source.sqlitePath}-wal`, "wal-appeared");
    expect(sourceFingerprintsEqual(before, fingerprintSqlite(source.sqlitePath))).toBe(false);
    writeFileSync(`${source.sqlitePath}-shm`, "shm-appeared");
    const withSidecars = fingerprintSqlite(source.sqlitePath);
    expect(sourceFingerprintsEqual(before, withSidecars)).toBe(false);
    writeFileSync(`${source.sqlitePath}-wal`, "wal-changed");
    expect(sourceFingerprintsEqual(withSidecars, fingerprintSqlite(source.sqlitePath))).toBe(
      false,
    );
    unlinkSync(`${source.sqlitePath}-shm`);
    expect(sourceFingerprintsEqual(withSidecars, fingerprintSqlite(source.sqlitePath))).toBe(
      false,
    );
  });

  it("keeps a backup after an injected failure and does not serve the plane", async () => {
    const source = buildSyntheticSource();
    const before = fingerprintSqlite(source.sqlitePath);
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Adopt Backup Fail", "ADOPT_EXISTING");
      await expect(
        adoptOperationalPlane({
          controlPlane: fixture.controlPlane,
          organizationId: org.organization.organizationId,
          sourceSqlite: source.sqlitePath,
          sourceDocumentsRoot: source.documentsRoot,
          mode: "execute",
          failAt: "after-backup",
        }),
      ).rejects.toMatchObject({ code: "injected_failure" });
      expect(sourceFingerprintsEqual(fingerprintSqlite(source.sqlitePath), before)).toBe(true);
      expect(existsSync(join(fixture.cloudRoot, "backups"))).toBe(true);
      expect(existsSync(org.paths.planeRoot)).toBe(false);
      expect(fixture.controlPlane.getPlaneByOrganization(org.organization.organizationId)).toBeNull();
    } finally {
      fixture.close();
    }
  });

  it("rolls back a failed execute so the incomplete plane is not served", async () => {
    const source = buildSyntheticSource();
    const before = fingerprintSqlite(source.sqlitePath);
    const fixture = createCloudFixture();
    try {
      const org = await addOrganization(fixture, "Adopt Fail", "ADOPT_EXISTING");
      await expect(
        adoptOperationalPlane({
          controlPlane: fixture.controlPlane,
          organizationId: org.organization.organizationId,
          sourceSqlite: source.sqlitePath,
          sourceDocumentsRoot: source.documentsRoot,
          mode: "execute",
          failAt: "after-stage-copy",
        }),
      ).rejects.toMatchObject({ code: "injected_failure" });
      expect(sourceFingerprintsEqual(fingerprintSqlite(source.sqlitePath), before)).toBe(true);
      expect(existsSync(org.paths.planeRoot)).toBe(false);
      expect(existsSync(`${org.paths.planeRoot}.staging`)).toBe(false);
      expect(fixture.controlPlane.getPlaneByOrganization(org.organization.organizationId)).toBeNull();
      expect(existsSync(join(fixture.cloudRoot, "backups"))).toBe(true);
    } finally {
      fixture.close();
    }
  });
});
