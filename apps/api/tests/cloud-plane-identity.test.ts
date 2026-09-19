import { copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resetCloudLoginAttemptGuard } from "../src/cloud/controlPlane.js";
import { PlaneIdentityError } from "../src/cloud/planeIdentity.js";
import { derivePlanePaths } from "../src/cloud/paths.js";
import {
  applySelectedMigrations,
  listOperationalMigrationFiles,
  openSqliteDatabase,
  openSqliteDatabaseWithoutMigrations,
} from "../src/persistence/sqlite.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

function readMigrationIds(sqlitePath: string): string[] {
  const db = openSqliteDatabaseWithoutMigrations(sqlitePath);
  try {
    return db
      .prepare("SELECT id FROM schema_migrations ORDER BY id")
      .all()
      .map((row) => (row as { id: string }).id);
  } finally {
    db.close();
  }
}

afterEach(() => {
  resetCloudLoginAttemptGuard();
  cleanupCloudTemps();
});

describe("operational plane identity", () => {
  it("fails closed when the bound organization does not match", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    const paths = derivePlanePaths(fixture.cloudRoot, alpha.plane.planeKey);
    const db = openSqliteDatabase(paths.sqlitePath);
    db.prepare(
      `UPDATE operational_plane_identity
       SET organization_id = ?
       WHERE id = 'current'`,
    ).run("org:other");
    db.close();

    const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    expect(login.response.status).toBe(200);
    const response = await fixture.app.request("/api/resources-admin", {
      headers: { cookie: login.cookie ?? "" },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "plane_identity_mismatch" });
    fixture.close();
  });

  it("fails closed when plane identity is missing", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });
    const paths = derivePlanePaths(fixture.cloudRoot, alpha.plane.planeKey);
    const db = openSqliteDatabase(paths.sqlitePath);
    db.prepare(`DELETE FROM operational_plane_identity WHERE id = 'current'`).run();
    db.close();

    const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    const response = await fixture.app.request("/api/resources-admin", {
      headers: { cookie: login.cookie ?? "" },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "plane_identity_missing" });
    fixture.close();
  });

  it("does not apply operational migrations before plane identity PASS", async () => {
    const fixture = createCloudFixture();
    const alpha = await addOrganization(fixture, "Atelier Alpha");
    await addUser(fixture, {
      email: "owner@example.test",
      password: OWNER_PASSWORD,
      organizationId: alpha.organization.organizationId,
      role: "owner",
    });

    const files = listOperationalMigrationFiles();
    const pending = files.filter((name) => name >= "023_");
    expect(pending.length).toBeGreaterThan(0);
    const applied = files.filter((name) => name < "023_");

    const wrongPath = join(fixture.cloudRoot, "wrong-plane.sqlite");
    const wrongDb = openSqliteDatabaseWithoutMigrations(wrongPath);
    applySelectedMigrations(wrongDb, applied);
    wrongDb.exec(`
      CREATE TABLE operational_plane_identity (
        id TEXT PRIMARY KEY NOT NULL CHECK (id = 'current'),
        plane_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        bound_at TEXT NOT NULL
      );
    `);
    wrongDb
      .prepare(
        `INSERT INTO operational_plane_identity (id, plane_id, organization_id, bound_at)
         VALUES ('current', ?, ?, ?)`,
      )
      .run("pln:other", "org:other", new Date().toISOString());
    wrongDb.close();

    const before = readMigrationIds(wrongPath);
    expect(before).toEqual(applied);
    expect(before).not.toContain(pending[0]);

    const trusted = derivePlanePaths(fixture.cloudRoot, alpha.plane.planeKey);
    rmSync(trusted.sqlitePath, { force: true });
    rmSync(`${trusted.sqlitePath}-wal`, { force: true });
    rmSync(`${trusted.sqlitePath}-shm`, { force: true });
    copyFileSync(wrongPath, trusted.sqlitePath);

    const login = await loginCloud(fixture.app, "owner@example.test", OWNER_PASSWORD);
    expect(login.response.status).toBe(200);
    const response = await fixture.app.request("/api/resources-admin", {
      headers: { cookie: login.cookie ?? "" },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "plane_identity_mismatch" });

    expect(() =>
      fixture.registry.getOrOpen(
        fixture.controlPlane.getPlaneByOrganization(alpha.organization.organizationId)!,
        fixture.cloudRoot,
      ),
    ).toThrow(PlaneIdentityError);

    expect(readMigrationIds(trusted.sqlitePath)).toEqual(before);
    expect(readMigrationIds(trusted.sqlitePath)).not.toContain(pending[0]);
    fixture.close();
  });
});
