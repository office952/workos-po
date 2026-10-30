import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
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
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";

afterEach(() => {
  cleanupCloudTemps();
});

const painted = {
  templateCode: CANONICAL_PRODUCT_CODE,
  name: "Litere volumetrice — cant aluminiu 80 mm, finisaj vopsit",
  description: "Opțiuni reutilizabile.",
  lifecycle: "PUBLISHED",
  selections: [
    { fieldId: "volume.depthMm", value: "80" },
    { fieldId: "volume.finish", value: "painted" },
  ],
};

describe("organization presets", () => {
  it("keeps published variants inside one organization and rejects members, conflicts and job facts", async () => {
    const fixture = createCloudFixture();
    const orgA = await addOrganization(fixture, "Org A presets");
    const orgB = await addOrganization(fixture, "Org B presets");
    await addUser(fixture, { email: "owner-a@presets.test", password: OWNER_PASSWORD, organizationId: orgA.organization.organizationId, role: "owner" });
    await addUser(fixture, { email: "member-a@presets.test", password: MEMBER_PASSWORD, organizationId: orgA.organization.organizationId, role: "member" });
    await addUser(fixture, { email: "owner-b@presets.test", password: OWNER_PASSWORD, organizationId: orgB.organization.organizationId, role: "owner" });
    const ownerA = await loginCloud(fixture.app, "owner-a@presets.test", OWNER_PASSWORD, orgA.organization.organizationId);
    const memberA = await loginCloud(fixture.app, "member-a@presets.test", MEMBER_PASSWORD, orgA.organization.organizationId);
    const ownerB = await loginCloud(fixture.app, "owner-b@presets.test", OWNER_PASSWORD, orgB.organization.organizationId);
    const cookieA = { cookie: ownerA.cookie ?? "" };
    const cookieMember = { cookie: memberA.cookie ?? "" };
    const cookieB = { cookie: ownerB.cookie ?? "" };

    const db = openSqliteDatabase(orgA.paths.sqlitePath);
    const quotesBefore = db.prepare("SELECT COUNT(*) AS count FROM quote_snapshots").get() as { count: number };
    db.close();

    const created = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieA },
      body: JSON.stringify(painted),
    });
    expect(created.status).toBe(200);
    const createdBody = await created.json() as { preset: { presetId: string; revision: number; selections: unknown[] } };
    expect(createdBody.preset.revision).toBe(1);
    expect(createdBody.preset.selections).toEqual(painted.selections);

    const memberWrite = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieMember },
      body: JSON.stringify(painted),
    });
    expect(memberWrite.status).toBe(403);

    const memberRead = await fixture.app.request(`/api/catalog/presets?templateCode=${CANONICAL_PRODUCT_CODE}`, { headers: cookieMember });
    expect(memberRead.status).toBe(200);
    const memberBody = await memberRead.json() as { canEdit: boolean; presets: Array<{ name: string }> };
    expect(memberBody.canEdit).toBe(false);
    expect(memberBody.presets.map((item) => item.name)).toEqual([painted.name]);

    const otherOrg = await fixture.app.request(`/api/catalog/presets?templateCode=${CANONICAL_PRODUCT_CODE}`, { headers: cookieB });
    expect(await otherOrg.json()).toMatchObject({ presets: [] });

    const conflict = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieA },
      body: JSON.stringify({ ...painted, presetId: createdBody.preset.presetId, expectedRevision: 0 }),
    });
    expect(conflict.status).toBe(409);

    const jobFact = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieA },
      body: JSON.stringify({ ...painted, name: "Text pe lucrare", selections: [{ fieldId: "root.inscription", value: "ACME" }] }),
    });
    expect(jobFact.status).toBe(400);

    const grooved = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers: { "content-type": "application/json", ...cookieA },
      body: JSON.stringify({ ...painted, name: "Cu canal", selections: [{ fieldId: "back.profile", value: "GROOVED" }] }),
    });
    expect(grooved.status).toBe(400);

    const history = await fixture.app.request(`/api/catalog/presets/${createdBody.preset.presetId}`, { headers: cookieA });
    expect(history.status).toBe(200);
    const historyBody = await history.json() as { history: Array<{ revision: number }> };
    expect(historyBody.history.map((item) => item.revision)).toEqual([1]);

    const after = openSqliteDatabase(orgA.paths.sqlitePath);
    expect(after.prepare("SELECT COUNT(*) AS count FROM quote_snapshots").get()).toEqual(quotesBefore);
    const stored = after.prepare("SELECT revision, lifecycle FROM organization_product_preset_revisions WHERE organization_id = ?").all(orgA.organization.organizationId) as Array<{ revision: number; lifecycle: string }>;
    expect(stored).toEqual([{ revision: 1, lifecycle: "PUBLISHED" }]);
    const orders = after.prepare("SELECT COUNT(*) AS count FROM order_snapshots").get() as { count: number };
    const production = after.prepare("SELECT COUNT(*) AS count FROM accepted_production_snapshots").get() as { count: number };
    expect(orders.count).toBe(0);
    expect(production.count).toBe(0);
    after.close();
  });

  it("appends publish and retire without rewriting the earlier revision", async () => {
    const fixture = createCloudFixture();
    const org = await addOrganization(fixture, "Org history");
    await addUser(fixture, { email: "owner-history@presets.test", password: OWNER_PASSWORD, organizationId: org.organization.organizationId, role: "owner" });
    const owner = await loginCloud(fixture.app, "owner-history@presets.test", OWNER_PASSWORD, org.organization.organizationId);
    const headers = { "content-type": "application/json", cookie: owner.cookie ?? "" };
    const draft = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...painted, lifecycle: "DRAFT", organizationId: "client-supplied-org" }),
    });
    expect(draft.status).toBe(200);
    const draftBody = await draft.json() as { preset: { presetId: string; revision: number } };
    const published = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...painted, presetId: draftBody.preset.presetId, expectedRevision: 1, lifecycle: "PUBLISHED" }),
    });
    expect(published.status).toBe(200);
    const retired = await fixture.app.request("/api/catalog/presets", {
      method: "POST",
      headers,
      body: JSON.stringify({ ...painted, presetId: draftBody.preset.presetId, expectedRevision: 2, lifecycle: "RETIRED" }),
    });
    expect(retired.status).toBe(200);
    const history = await fixture.app.request(`/api/catalog/presets/${draftBody.preset.presetId}`, { headers: { cookie: owner.cookie ?? "" } });
    const historyBody = await history.json() as { history: Array<{ revision: number; lifecycle: string }> };
    expect(historyBody.history.map((item) => [item.revision, item.lifecycle])).toEqual([
      [1, "DRAFT"],
      [2, "PUBLISHED"],
      [3, "RETIRED"],
    ]);
    const db = openSqliteDatabase(org.paths.sqlitePath);
    const rows = db.prepare(
      "SELECT revision, lifecycle, organization_id FROM organization_product_preset_revisions ORDER BY revision ASC",
    ).all() as Array<{ revision: number; lifecycle: string; organization_id: string }>;
    expect(rows).toEqual([
      { revision: 1, lifecycle: "DRAFT", organization_id: org.organization.organizationId },
      { revision: 2, lifecycle: "PUBLISHED", organization_id: org.organization.organizationId },
      { revision: 3, lifecycle: "RETIRED", organization_id: org.organization.organizationId },
    ]);
    db.close();
  });

  it("creates the preset table on a fresh database and on an upgrade from the previous migration", () => {
    const freshDir = mkdtempSync(join(tmpdir(), "workos-preset-fresh-"));
    const fresh = openSqliteDatabase(join(freshDir, "product-system.sqlite"));
    expect(fresh.prepare("SELECT name FROM sqlite_master WHERE name = 'organization_product_preset_revisions'").get()).toBeTruthy();
    fresh.close();
    rmSync(freshDir, { recursive: true, force: true });

    const upgradeDir = mkdtempSync(join(tmpdir(), "workos-preset-upgrade-"));
    const upgradePath = join(upgradeDir, "product-system.sqlite");
    const prior = openSqliteDatabaseWithoutMigrations(upgradePath);
    const presetMigration = "050_organization_product_preset_revisions.sql";
    applySelectedMigrations(prior, listOperationalMigrationFiles().filter((file) => file !== presetMigration));
    expect(prior.prepare("SELECT name FROM sqlite_master WHERE name = 'organization_product_preset_revisions'").get()).toBeFalsy();
    expect(prior.prepare("SELECT COUNT(*) AS count FROM quote_snapshots").get()).toEqual({ count: 0 });
    prior.close();

    const upgraded = openSqliteDatabase(upgradePath);
    expect(upgraded.prepare("SELECT name FROM sqlite_master WHERE name = 'organization_product_preset_revisions'").get()).toBeTruthy();
    expect(upgraded.prepare("SELECT COUNT(*) AS count FROM quote_snapshots").get()).toEqual({ count: 0 });
    expect(upgraded.prepare("SELECT COUNT(*) AS count FROM order_snapshots").get()).toEqual({ count: 0 });
    expect(upgraded.prepare("SELECT COUNT(*) AS count FROM accepted_production_snapshots").get()).toEqual({ count: 0 });
    upgraded.prepare(
      `INSERT INTO organization_product_preset_revisions (
        preset_revision_row_id, organization_id, preset_id, template_code, template_version,
        revision, lifecycle, name, description, selections_json, supersedes_revision, created_at, actor_user_id
      ) VALUES ('prv.1', 'org', 'pst.1', 'PRD', '1', 1, 'DRAFT', 'Nume', '', '[]', NULL, '2026-10-30T00:00:00.000Z', NULL)`,
    ).run();
    expect(() => upgraded.prepare(
      `INSERT INTO organization_product_preset_revisions (
        preset_revision_row_id, organization_id, preset_id, template_code, template_version,
        revision, lifecycle, name, description, selections_json, supersedes_revision, created_at, actor_user_id
      ) VALUES ('prv.2', 'org', 'pst.1', 'PRD', '1', 1, 'PUBLISHED', 'Nume', '', '[]', NULL, '2026-10-30T00:00:00.000Z', NULL)`,
    ).run()).toThrow();
    expect(upgraded.prepare("SELECT COUNT(*) AS count FROM organization_product_preset_revisions").get()).toEqual({ count: 1 });
    upgraded.close();
    rmSync(upgradeDir, { recursive: true, force: true });
  });
});
