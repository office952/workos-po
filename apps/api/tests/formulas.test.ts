import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
  LIGHTING_LED_MODULE_QUANTITY_STARTER_AST,
  FORMULAS_INVALID,
} from "@workos-final/domain";
import { NEW_ORGANIZATION_MARKERS } from "../src/cloud/provision.js";
import { applyOperationalBootstrap } from "../src/cloud/bootstrapPolicy.js";
import { applyMigrations, openSqliteDatabase } from "../src/persistence/sqlite.js";
import {
  FORMULA_STARTERS_MARKER,
  ensureFormulaStarters,
  listFormulaVersions,
  persistFormulaSave,
  resolveStoredFormulas,
} from "../src/product/formulaStore.js";
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
  const dir = mkdtempSync(join(tmpdir(), "workos-fv-"));
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

const structuralQuantityAst = {
  kind: "CEIL",
  operand: {
    kind: "DIVIDE",
    left: {
      kind: "DIVIDE",
      left: { kind: "JOB_REF", inputId: "confirmedPerimeterMm" },
      right: { kind: "CONFIG_REF", settingId: "ledPitchMm" },
    },
    right: { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" },
  },
};

describe("formula persistence", () => {
  it("creates the typed table without organization_id and seeds only authorized policies", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    applyMigrations(db);
    const columns = db
      .prepare("PRAGMA table_info(formula_versions)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).not.toContain("organization_id");
    expect(columns.map((column) => column.name)).toContain("expression_json");

    applyOperationalBootstrap(db, "ADOPT_EXISTING");
    expect(listFormulaVersions(db)).toEqual([]);
    expect(
      db
        .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
        .get(FORMULA_STARTERS_MARKER),
    ).toBeUndefined();

    applyOperationalBootstrap(db, "NEW_ORGANIZATION");
    const first = listFormulaVersions(db);
    expect(first).toHaveLength(3);
    expect(first.every((row) => row.source === "PLATFORM_STARTER")).toBe(true);
    expect(first.every((row) => row.status === "ACTIVE")).toBe(true);
    applyOperationalBootstrap(db, "SYNTHETIC_TEST");
    expect(listFormulaVersions(db)).toHaveLength(3);
    applyOperationalBootstrap(db, "NEW_ORGANIZATION");
    expect(listFormulaVersions(db)).toHaveLength(3);

    const single = openSqliteDatabase(tempSqlitePath());
    applyOperationalBootstrap(single, undefined);
    expect(listFormulaVersions(single)).toHaveLength(3);
    expect(
      single
        .prepare("SELECT marker_id FROM runtime_bootstrap_markers WHERE marker_id = ?")
        .get(FORMULA_STARTERS_MARKER),
    ).toEqual({ marker_id: FORMULA_STARTERS_MARKER });
    single.close();
    db.close();
  });

  it("keeps the formula starter marker in NEW_ORGANIZATION completeness", () => {
    expect(NEW_ORGANIZATION_MARKERS).toContain(FORMULA_STARTERS_MARKER);
  });

  it("does not drop invalid persisted rows", () => {
    const db = openSqliteDatabase(tempSqlitePath());
    applyOperationalBootstrap(db, undefined);
    ensureFormulaStarters(db, "SINGLE_PLANE");
    db.prepare("UPDATE formula_versions SET expression_json = ? WHERE formula_id = ?").run(
      "{not-json",
      LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
    );
    const listed = listFormulaVersions(db);
    expect(listed.find((row) => row.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID)?.expressionJson).toBe(
      "{not-json",
    );
    expect(resolveStoredFormulas(db)).toMatchObject({
      ok: false,
      error: FORMULAS_INVALID,
    });
    expect(
      persistFormulaSave(
        db,
        [
          {
            formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
            expression: LIGHTING_LED_MODULE_QUANTITY_STARTER_AST,
          },
        ],
        { kind: "USER", userId: "user-1" },
      ).ok,
    ).toBe(false);
    db.close();
  });
});

describe("formula API", () => {
  it("shows starter formulas and creates an organization version", async () => {
    const app = createApp();
    const listed = await readBody(await app.request("/api/admin/formulas"));
    expect(listed.resolutionOk).toBe(true);
    expect(listed.canEdit).toBe(true);
    const formulas = listed.formulas as JsonObject[];
    expect(formulas).toHaveLength(3);
    expect(formulas.find((item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID)).toMatchObject({
      source: "PLATFORM_STARTER",
      version: 1,
      status: "ACTIVE",
    });

    const saved = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: structuralQuantityAst,
      }),
    });
    expect(saved.status).toBe(200);
    const savedBody = await readBody(saved);
    expect(savedBody.alreadyApplied).toBe(false);
    expect(
      (savedBody.formulas as JsonObject[]).find(
        (item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
      ),
    ).toMatchObject({
      source: "ORGANIZATION",
      version: 2,
    });

    const same = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: structuralQuantityAst,
      }),
    });
    expect((await readBody(same)).alreadyApplied).toBe(true);

    const invalid = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: { kind: "EVAL", code: "1+1" },
      }),
    });
    expect(invalid.status).toBe(400);

    const unauthorized = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: { kind: "CONFIG_REF", settingId: "ledModulePowerW" },
      }),
    });
    expect(unauthorized.status).toBe(400);

    const cyclic = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: {
          kind: "FORMULA_REF",
          formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        },
      }),
    });
    expect(cyclic.status).toBe(400);
  });

  it("rejects a semantically invalid AST without mutating formula history", async () => {
    const app = createApp();
    const before = await readBody(await app.request("/api/admin/formulas"));
    const beforeQuantity = (before.formulas as JsonObject[]).find(
      (item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
    );
    const beforeHistory = before.history as JsonObject[];
    expect(beforeQuantity).toMatchObject({
      version: 1,
      status: "ACTIVE",
      source: "PLATFORM_STARTER",
    });
    expect(beforeHistory.filter((item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID)).toHaveLength(
      1,
    );

    const previewBefore = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );

    const rejected = await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: {
          kind: "CEIL",
          operand: { kind: "CONFIG_REF", settingId: "ledPitchMm" },
        },
      }),
    });
    expect(rejected.status).toBe(400);
    const rejectedBody = await readBody(rejected);
    expect(rejectedBody.error).toBe("invalid_formulas");

    const after = await readBody(await app.request("/api/admin/formulas"));
    const afterQuantity = (after.formulas as JsonObject[]).find(
      (item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
    );
    const afterHistory = after.history as JsonObject[];
    expect(afterQuantity).toMatchObject({
      version: 1,
      status: "ACTIVE",
      source: "PLATFORM_STARTER",
    });
    expect(afterHistory).toEqual(beforeHistory);
    expect(
      afterHistory.some(
        (item) =>
          item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID && item.status === "RETIRED",
      ),
    ).toBe(false);

    const previewAfter = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    expect(previewAfter.reviewId).toBe(previewBefore.reviewId);
    const customerId = await createCustomer(app, "Client CF4 invalid save");
    const quote = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: readyValues,
          reviewId: previewAfter.reviewId,
          customerId,
        }),
      }),
    );
    expect(
      (((quote.quoteSnapshot as JsonObject).productionInput as JsonObject).usedFormulas as JsonObject[]).find(
        (item) => item.resultId === "ledModuleQuantity",
      ),
    ).toMatchObject({ version: 1, source: "PLATFORM_STARTER", resultValue: 125 });
  });

  it("invalidates review after a structural formula change and freezes formula provenance", async () => {
    const app = createApp();
    const customerId = await createCustomer(app);
    const preview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    expect(String(preview.reviewId)).toMatch(/^crv1:/);

    const firstQuoteResponse = await app.request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: readyValues,
          reviewId: preview.reviewId,
          customerId,
        }),
      },
    );
    expect(firstQuoteResponse.status).toBe(200);
    const firstQuote = await readBody(firstQuoteResponse);
    const firstSnapshot = firstQuote.quoteSnapshot as JsonObject;
    const firstFormulas =
      ((firstSnapshot.productionInput as JsonObject | undefined)?.usedFormulas as JsonObject[]) ??
      [];
    expect(firstFormulas.find((item) => item.resultId === "ledModuleQuantity")).toMatchObject({
      version: 1,
      source: "PLATFORM_STARTER",
      resultValue: 125,
    });

    await app.request("/api/admin/formulas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        expression: structuralQuantityAst,
      }),
    });

    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ values: readyValues, reviewId: preview.reviewId }),
    });
    expect(stale.status).toBe(409);

    const reread = await readBody(
      await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${encodeURIComponent(
          String(firstSnapshot.quoteSnapshotId),
        )}`,
      ),
    );
    const rereadFormulas =
      (((reread.quoteSnapshot as JsonObject).productionInput as JsonObject)
        .usedFormulas as JsonObject[]) ?? [];
    expect(rereadFormulas.find((item) => item.resultId === "ledModuleQuantity")?.version).toBe(1);

    const nextPreview = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: readyValues }),
      }),
    );
    expect(nextPreview.reviewId).not.toBe(preview.reviewId);
    const secondQuote = await readBody(
      await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          values: readyValues,
          reviewId: nextPreview.reviewId,
          customerId,
        }),
      }),
    );
    const secondSnapshot = secondQuote.quoteSnapshot as JsonObject;
    const secondFormulas =
      ((secondSnapshot.productionInput as JsonObject).usedFormulas as JsonObject[]) ?? [];
    expect(secondFormulas.find((item) => item.resultId === "ledModuleQuantity")).toMatchObject({
      version: 2,
      source: "ORGANIZATION",
    });

    const firstOrder = await acceptAndOrder(app, String(firstSnapshot.quoteSnapshotId));
    expect(
      ((firstOrder.productionInput as JsonObject).usedFormulas as JsonObject[]).find(
        (item) => item.resultId === "ledModuleQuantity",
      )?.version,
    ).toBe(1);
    const firstRelease = await releaseOrder(app, String(firstOrder.orderSnapshotId));
    expect(
      ((firstRelease.usedFormulas as JsonObject[]) ?? []).find(
        (item) => item.resultId === "ledModuleQuantity",
      )?.version,
    ).toBe(1);

    const secondOrder = await acceptAndOrder(app, String(secondSnapshot.quoteSnapshotId));
    expect(
      ((secondOrder.productionInput as JsonObject).usedFormulas as JsonObject[]).find(
        (item) => item.resultId === "ledModuleQuantity",
      ),
    ).toMatchObject({ version: 2, source: "ORGANIZATION" });
    const secondRelease = await releaseOrder(app, String(secondOrder.orderSnapshotId));
    expect(
      ((secondRelease.usedFormulas as JsonObject[]) ?? []).find(
        (item) => item.resultId === "ledModuleQuantity",
      ),
    ).toMatchObject({ version: 2, source: "ORGANIZATION" });
  });
});

async function createCustomer(app: ReturnType<typeof createApp>, name = "Client CF4") {
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName: name }),
  });
  return ((await readBody(created)).customer as JsonObject).customerId as string;
}

async function acceptAndOrder(app: ReturnType<typeof createApp>, quoteSnapshotId: string) {
  await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/acceptance`,
    { method: "POST" },
  );
  const created = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/quote-snapshots/${quoteSnapshotId}/order`,
    { method: "POST" },
  );
  expect(created.status).toBe(200);
  return (await readBody(created)).orderSnapshot as JsonObject;
}

async function releaseOrder(app: ReturnType<typeof createApp>, orderSnapshotId: string) {
  const released = await app.request(
    `/api/products/${CANONICAL_PRODUCT_CODE}/orders/${orderSnapshotId}/production-release`,
    { method: "POST" },
  );
  expect(released.status).toBe(200);
  return (await readBody(released)).snapshot as JsonObject;
}

describe("formula tenancy and roles", () => {
  it("isolates two synthetic organizations and blocks member edits", async () => {
    const fixture = createCloudFixture();
    try {
      const first = await addOrganization(fixture, "Firma A", "SYNTHETIC_TEST");
      const second = await addOrganization(fixture, "Firma B", "SYNTHETIC_TEST");
      await addUser(fixture, {
        email: "owner-a@formula.test",
        password: OWNER_PASSWORD,
        organizationId: first.organization.organizationId,
        role: "owner",
      });
      await addUser(fixture, {
        email: "member-a@formula.test",
        password: MEMBER_PASSWORD,
        organizationId: first.organization.organizationId,
        role: "member",
      });
      await addUser(fixture, {
        email: "owner-b@formula.test",
        password: OWNER_PASSWORD,
        organizationId: second.organization.organizationId,
        role: "owner",
      });

      const ownerA = await loginCloud(
        fixture.app,
        "owner-a@formula.test",
        OWNER_PASSWORD,
        first.organization.organizationId,
      );
      const memberA = await loginCloud(
        fixture.app,
        "member-a@formula.test",
        MEMBER_PASSWORD,
        first.organization.organizationId,
      );
      const ownerB = await loginCloud(
        fixture.app,
        "owner-b@formula.test",
        OWNER_PASSWORD,
        second.organization.organizationId,
      );

      const memberGet = await readBody(
        await fixture.app.request("/api/admin/formulas", {
          headers: { cookie: memberA.cookie ?? "" },
        }),
      );
      expect(memberGet.canEdit).toBe(false);

      const memberPost = await fixture.app.request("/api/admin/formulas", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: memberA.cookie ?? "",
        },
        body: JSON.stringify({
          formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
          expression: structuralQuantityAst,
        }),
      });
      expect(memberPost.status).toBe(403);

      const ownerSave = await readBody(
        await fixture.app.request("/api/admin/formulas", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: ownerA.cookie ?? "",
          },
          body: JSON.stringify({
            formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
            expression: structuralQuantityAst,
          }),
        }),
      );
      expect(
        (ownerSave.formulas as JsonObject[]).find(
          (item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        ),
      ).toMatchObject({ source: "ORGANIZATION", version: 2 });

      const other = await readBody(
        await fixture.app.request("/api/admin/formulas", {
          headers: { cookie: ownerB.cookie ?? "" },
        }),
      );
      expect(
        (other.formulas as JsonObject[]).find(
          (item) => item.formulaId === LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
        ),
      ).toMatchObject({ source: "PLATFORM_STARTER", version: 1 });
    } finally {
      fixture.close();
    }
  });
});
