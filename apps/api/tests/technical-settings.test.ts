import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  LED_PITCH_SETTING_ID,
  TECHNICAL_SETTINGS_INVALID,
} from "@workos-final/domain";
import { NEW_ORGANIZATION_MARKERS } from "../src/cloud/provision.js";
import { applyOperationalBootstrap } from "../src/cloud/bootstrapPolicy.js";
import { applyMigrations, openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import {
  TECHNICAL_SETTING_STARTERS_MARKER,
  ensureTechnicalSettingStarters,
  listTechnicalSettingVersions,
  persistTechnicalSettingSave,
  resolveStoredTechnicalSettings,
} from "../src/product/technicalSettingStore.js";
import { createApp } from "../src/app.js";
import {
  addOrganization,
  addUser,
  cleanupCloudTemps,
  createCloudFixture,
  loginCloud,
  MEMBER_PASSWORD,
  OWNER_PASSWORD,
} from "./cloud-harness.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temps: string[] = [];

afterEach(() => {
  cleanupCloudTemps();
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-tsv-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

type JsonObject = Record<string, unknown>;

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

const readyValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

describe("technical setting persistence", () => {
  it("creates the typed table without organization_id and seeds only authorized policies", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    applyMigrations(db);
    const columns = db
      .prepare("PRAGMA table_info(technical_setting_versions)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("organization_id");
    expect(columns.map((column) => column.name)).toContain("actor_system_id");

    applyOperationalBootstrap(db, "ADOPT_EXISTING");
    expect(listTechnicalSettingVersions(db)).toEqual([]);
    expect(
      db
        .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
        .get(TECHNICAL_SETTING_STARTERS_MARKER),
    ).toBeUndefined();

    applyOperationalBootstrap(db, "NEW_ORGANIZATION");
    const first = listTechnicalSettingVersions(db);
    expect(first).toHaveLength(3);
    expect(first.every((row) => row.source === "PLATFORM_STARTER")).toBe(true);
    expect(first.every((row) => row.status === "ACTIVE")).toBe(true);
    expect(first.every((row) => row.actorKind === "SYSTEM")).toBe(true);
    applyOperationalBootstrap(db, "NEW_ORGANIZATION");
    expect(listTechnicalSettingVersions(db)).toHaveLength(3);
    const markers = db
      .prepare("SELECT COUNT(*) AS count FROM runtime_bootstrap_markers WHERE marker_id = ?")
      .get(TECHNICAL_SETTING_STARTERS_MARKER) as { count: number };
    expect(markers.count).toBe(1);
    db.close();
  });

  it("keeps the technical starter marker in NEW_ORGANIZATION completeness", () => {
    expect(NEW_ORGANIZATION_MARKERS).toContain(TECHNICAL_SETTING_STARTERS_MARKER);
  });

  it("does not inherit later starter values after first materialization", () => {
    const sqlitePath = tempSqlitePath();
    const first = createProductSystemRuntime(sqlitePath, { bootstrapPolicy: "SYNTHETIC_TEST" });
    const original = first.resolveTechnicalSettings();
    expect(original.ok).toBe(true);
    if (!original.ok) {
      throw new Error(original.reason);
    }
    expect(original.settings.find((item) => item.settingId === LED_PITCH_SETTING_ID)?.value).toBe(100);
    first.close();

    const db = openSqliteDatabase(sqlitePath);
    ensureTechnicalSettingStarters(db, "SYNTHETIC_TEST");
    const again = listTechnicalSettingVersions(db);
    expect(again).toHaveLength(3);
    expect(again.find((row) => row.settingId === LED_PITCH_SETTING_ID)?.value).toBe(100);
    db.close();

    const second = createProductSystemRuntime(sqlitePath, { bootstrapPolicy: "SYNTHETIC_TEST" });
    const resolved = second.resolveTechnicalSettings();
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) {
      throw new Error(resolved.reason);
    }
    expect(resolved.settings.find((item) => item.settingId === LED_PITCH_SETTING_ID)?.value).toBe(100);
    second.close();
  });

  it("fails closed on persisted unknown definition, wrong unit, and invalid actor", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    applyMigrations(db);
    applyOperationalBootstrap(db, "NEW_ORGANIZATION");
    const starters = listTechnicalSettingVersions(db);
    expect(starters).toHaveLength(3);
    expect(resolveStoredTechnicalSettings(db).ok).toBe(true);

    db.prepare(
      `
      INSERT INTO technical_setting_versions (
        technical_setting_version_row_id,
        definition_id,
        type_id,
        setting_id,
        version,
        status,
        value,
        value_type,
        unit,
        scope,
        source,
        effective_from,
        created_at,
        actor_kind,
        actor_user_id,
        actor_system_id,
        supersedes_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    ).run(
      "tsv:unknown:test",
      "UNKNOWN.type.setting",
      "UNKNOWN_TYPE",
      "unknownSetting",
      1,
      "ACTIVE",
      1,
      "number",
      "mm",
      "ORGANIZATION",
      "ORGANIZATION",
      "2026-09-20T00:00:00.000Z",
      "2026-09-20T00:00:00.000Z",
      "SYSTEM",
      null,
      "TECHNICAL_SETTING_STARTER_V1",
      null,
    );
    const withUnknown = listTechnicalSettingVersions(db);
    expect(withUnknown).toHaveLength(4);
    expect(withUnknown.some((row) => row.definitionId === "UNKNOWN.type.setting")).toBe(true);
    const unknownResolution = resolveStoredTechnicalSettings(db);
    expect(unknownResolution).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INVALID,
    });
    expect(unknownResolution.ok ? null : unknownResolution.history).toHaveLength(4);
    db.prepare("DELETE FROM technical_setting_versions WHERE definition_id = ?").run(
      "UNKNOWN.type.setting",
    );

    db.prepare("UPDATE technical_setting_versions SET unit = ? WHERE setting_id = ?").run(
      "W",
      LED_PITCH_SETTING_ID,
    );
    const wrongUnit = listTechnicalSettingVersions(db);
    expect(wrongUnit.find((row) => row.settingId === LED_PITCH_SETTING_ID)?.unit).toBe("W");
    expect(wrongUnit).toHaveLength(3);
    expect(resolveStoredTechnicalSettings(db)).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INVALID,
    });
    db.prepare("UPDATE technical_setting_versions SET unit = ? WHERE setting_id = ?").run(
      "mm",
      LED_PITCH_SETTING_ID,
    );

    db.prepare(
      `
      UPDATE technical_setting_versions
      SET actor_kind = 'USER', actor_user_id = '', actor_system_id = NULL
      WHERE setting_id = ?
    `,
    ).run(LED_PITCH_SETTING_ID);
    const listed = listTechnicalSettingVersions(db);
    expect(listed.find((row) => row.settingId === LED_PITCH_SETTING_ID)).toMatchObject({
      actorKind: "USER",
      actorUserId: "",
      actorSystemId: null,
    });
    expect(resolveStoredTechnicalSettings(db)).toMatchObject({
      ok: false,
      error: TECHNICAL_SETTINGS_INVALID,
    });
    expect(
      persistTechnicalSettingSave(db, [{ settingId: LED_PITCH_SETTING_ID, value: 80 }], {
        kind: "USER",
        userId: "user-1",
      }).ok,
    ).toBe(false);
    db.close();
  });
});

describe("technical settings API", () => {
  it("shows PLATFORM_STARTER values and creates an ORGANIZATION version", async () => {
    const app = createApp();
    const listed = await readBody(await app.request("/api/admin/technical-settings"));
    expect(listed.resolutionOk).toBe(true);
    expect(listed.canEdit).toBe(true);
    const settings = listed.settings as JsonObject[];
    expect(settings.find((item) => item.settingId === "ledPitchMm")).toMatchObject({
      value: 100,
      unit: "mm",
      source: "PLATFORM_STARTER",
      version: 1,
      status: "ACTIVE",
    });

    const saved = await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledPitchMm: 80 }),
    });
    expect(saved.status).toBe(200);
    const savedBody = await readBody(saved);
    expect(savedBody.alreadyApplied).toBe(false);
    expect(
      (savedBody.settings as JsonObject[]).find((item) => item.settingId === "ledPitchMm"),
    ).toMatchObject({
      value: 80,
      source: "ORGANIZATION",
      version: 2,
    });

    const same = await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledPitchMm: 80 }),
    });
    expect((await readBody(same)).alreadyApplied).toBe(true);

    const invalid = await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledPitchMm: 0 }),
    });
    expect(invalid.status).toBe(400);
  });

  it("changes future lighting quantity and invalidates a stale preview review", async () => {
    const app = createApp();
    const preview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    expect(String(preview.reviewId)).toMatch(/^crv1:/);

    await app.request("/api/admin/technical-settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ledPitchMm: 80 }),
    });

    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues, reviewId: preview.reviewId }),
    });
    expect(stale.status).toBe(409);

    const nextPreview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    expect(nextPreview.reviewId).not.toBe(preview.reviewId);
    const confirmed = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues, reviewId: nextPreview.reviewId }),
      }),
    );
    const quantities = ((confirmed.aggregate as JsonObject).quantities as JsonObject[]) ?? [];
    expect(quantities.find((item) => item.id === "ledModuleQuantity")?.value).toBe(157);

    const frozen = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/accepted-production-snapshot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues, reviewId: nextPreview.reviewId }),
      }),
    );
    const used = ((frozen.snapshot as JsonObject).usedTechnicalSettings as JsonObject[]) ?? [];
    expect(used.find((item) => item.id === "ledPitchMm")).toMatchObject({
      value: 80,
      version: 2,
      source: "ORGANIZATION",
      definitionId: "LIGHTING_FRONT_LED.ledPitchMm",
    });
    expect(
      ((frozen.snapshot as JsonObject).usedRecipes as JsonObject[]).some(
        (item) => typeof item.evidenceRowId === "string",
      ),
    ).toBe(true);
  });
});

describe("technical settings tenancy and roles", () => {
  it("isolates two synthetic organizations and blocks member edits", async () => {
    const fixture = createCloudFixture();
    try {
      const first = await addOrganization(fixture, "Firma A", "SYNTHETIC_TEST");
      const second = await addOrganization(fixture, "Firma B", "SYNTHETIC_TEST");
      await addUser(fixture, {
        email: "owner-a@tech.test",
        password: OWNER_PASSWORD,
        organizationId: first.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "member-a@tech.test",
        password: MEMBER_PASSWORD,
        organizationId: first.organization.organizationId,
        role: "member",
      });
      await addUser(fixture, {
        email: "owner-b@tech.test",
        password: OWNER_PASSWORD,
        organizationId: second.organization.organizationId,
        role: "owner",
      });

      const ownerA = await loginCloud(
        fixture.app,
        "owner-a@tech.test",
        OWNER_PASSWORD,
        first.organization.organizationId,
      );
      const memberA = await loginCloud(
        fixture.app,
        "member-a@tech.test",
        MEMBER_PASSWORD,
        first.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app,
        "owner-b@tech.test",
        OWNER_PASSWORD,
        second.organization.organizationId,
      );

      const memberGet = await readBody(
        await fixture.app.request("/api/admin/technical-settings", {
          headers: { cookie: memberA.cookie ?? "" },
        }),
      );
      expect(memberGet.canEdit).toBe(false);
      expect(
        (memberGet.settings as JsonObject[]).find((item) => item.settingId === "ledPitchMm")?.value,
      ).toBe(100);

      const memberPost = await fixture.app.request("/api/admin/technical-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: memberA.cookie ?? "",
        },
        body: JSON.stringify({ ledPitchMm: 80 }),
      });
      expect(memberPost.status).toBe(403);

      const ownerSave = await readBody(
        await fixture.app.request("/api/admin/technical-settings", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: ownerA.cookie ?? "",
          },
          body: JSON.stringify({ ledPitchMm: 80 }),
        }),
      );
      expect(
        (ownerSave.settings as JsonObject[]).find((item) => item.settingId === "ledPitchMm"),
      ).toMatchObject({ value: 80, source: "ORGANIZATION", version: 2 });

      const other = await readBody(
        await fixture.app.request("/api/admin/technical-settings", {
          headers: { cookie: ownerB.cookie ?? "" },
        }),
      );
      expect(
        (other.settings as JsonObject[]).find((item) => item.settingId === "ledPitchMm"),
      ).toMatchObject({ value: 100, source: "PLATFORM_STARTER", version: 1 });
    } finally {
      fixture.close();
    }
  });
});
