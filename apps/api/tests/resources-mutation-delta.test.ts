import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ACM_CASSETTE_NONE_PRODUCT_CODE,
  ALUMINIUM_RETURN_PROFILE_ID,
  CANONICAL_PRODUCT_CODE,
  PLEXIGLAS_3MM_OPAL_ID,
  projectResourcesAdministration,
  runWithProductEvaluationTraceAsync,
  type ResourcesAdministrationWriteStats,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { openSqliteDatabase } from "../src/persistence/sqlite.js";
import { createResourcesAdministrationReuse } from "../src/productSystem/resourcesAdministrationReuse.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";
import { ensureCostEvidence } from "../src/resources/store.js";

type JsonObject = Record<string, unknown>;

const SVC_PACK_PRODUCT_ID = "SVC-PACK-PRODUCT";
const ACM_3MM_ID = "acm_3mm";

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const acmValues = {
  "root.inscription": "QTD",
  "root.mountingSystem": "steel_angle",
  "face.widthMm": 1000,
  "face.heightMm": 500,
  "face.cassetteDepthMm": "40",
  "face.foldCount": "2",
};

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-perf3-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

async function readBody(response: Response): Promise<JsonObject> {
  return (await response.json()) as JsonObject;
}

function countedRuntime(
  sqlitePath = ":memory:",
  extras: { now?: () => string } = {},
) {
  const counts = {
    labelLoads: 0,
    presentationBuilds: 0,
    evidenceLoads: 0,
    fullAdminBuilds: 0,
    deltas: [] as ResourcesAdministrationWriteStats[],
  };
  const runtime = createProductSystemRuntime(sqlitePath, {
    now: extras.now,
    observeDisplayLabelCatalogLoad() {
      counts.labelLoads += 1;
    },
    observeProductSystemPresentationBuild() {
      counts.presentationBuilds += 1;
    },
    observeActiveCostEvidenceLoad() {
      counts.evidenceLoads += 1;
    },
    observeResourcesAdministrationBuild() {
      counts.fullAdminBuilds += 1;
    },
    observeResourcesAdministrationDelta(stats) {
      counts.deltas.push(stats);
    },
  });
  return { runtime, counts };
}

function costRows(admin: JsonObject): JsonObject[] {
  return (admin.costEvidence as JsonObject[]) ?? [];
}

function findCost(
  admin: JsonObject,
  resourceId: string,
  qualifierIdentity?: string,
): JsonObject | undefined {
  return costRows(admin).find((item) => {
    if (item.resourceId !== resourceId) {
      return false;
    }
    if (!qualifierIdentity) {
      return true;
    }
    return item.qualifierIdentity === qualifierIdentity;
  });
}

async function compileReady(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
) {
  const response = await app.request(`/api/products/${productCode}/compile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ values }),
  });
  const body = await readBody(response);
  return {
    definition: body.definition as JsonObject,
    reviewId: body.reviewId as string,
  };
}

async function confirmProduct(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
) {
  const reviewed = await compileReady(app, productCode, values);
  const response = await app.request(`/api/products/${productCode}/confirm`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reviewed),
  });
  return { status: response.status, body: await readBody(response) };
}

async function freezeQuote(
  app: ReturnType<typeof createApp>,
  productCode: string,
  values: Record<string, string | number>,
  displayName: string,
) {
  const reviewed = await compileReady(app, productCode, values);
  const created = await app.request("/api/customers", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  const customerId = ((await readBody(created)).customer as JsonObject)
    .customerId as string;
  const response = await app.request(`/api/products/${productCode}/quote-snapshots`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...reviewed,
      customerId,
    }),
  });
  return { status: response.status, body: await readBody(response) };
}

describe("resources administration reuse helper", () => {
  it("reuses one evidence load and one full build across repeated admin()", () => {
    const counts = { loads: 0, builds: 0, deltas: 0 };
    const rows = [
      {
        resourceId: PLEXIGLAS_3MM_OPAL_ID,
        amount: 16,
        currency: "EUR" as const,
        perUnit: "m2" as const,
        source: "OWNER_CONFIRMED_PURCHASE" as const,
        classification: "OWNER_CONFIRMED" as const,
        note: "seed",
        evidenceRowId: "cev:plexi",
        createdAt: "2026-08-18T00:00:00.000Z",
      },
    ];
    const reuse = createResourcesAdministrationReuse({
      loadEvidence() {
        counts.loads += 1;
        return rows;
      },
      project(evidence, asOf) {
        void asOf;
        counts.builds += 1;
        return {
          families: [],
          materials: [],
          services: [],
          labor: [],
          serviceRecipes: [],
          laborRecipes: [],
          missingServiceRecipes: [],
          missingLaborRecipes: [],
          costEvidence: evidence.map((item) => ({
            resourceId: item.resourceId,
            resourceLabel: item.resourceId,
            kindLabel: "Material",
            evidenceRowId: item.evidenceRowId ?? null,
            lastChangedAt: item.createdAt ?? null,
            qualifierIdentity: "unqualified",
            qualifierLabel: null,
            qualifier: null,
            usedBy: [],
            amount: item.amount,
            currency: item.currency,
            unitLabel: "m²",
            sourceLabel: "Owner",
            classificationLabel: "Confirmat de owner",
            note: item.note,
            amountDisplay: `${item.amount}`,
          })),
          templateUsages: [],
          writeState: "READY",
        };
      },
      observeDelta() {
        counts.deltas += 1;
      },
    });
    expect(reuse.admin()).toBe(reuse.admin());
    expect(counts).toEqual({ loads: 1, builds: 1, deltas: 0 });
  });

  it("rebuilds admin from cached evidence when the UTC calendar date rolls over", () => {
    const counts = { loads: 0, builds: 0 };
    let now = "2026-09-04T23:59:00.000Z";
    const rows = [
      {
        resourceId: PLEXIGLAS_3MM_OPAL_ID,
        amount: 16,
        currency: "EUR" as const,
        perUnit: "m2" as const,
        source: "OWNER_CONFIRMED_PURCHASE" as const,
        classification: "OWNER_CONFIRMED" as const,
        note: "seed",
        validUntil: "2026-09-04",
        evidenceRowId: "cev:plexi-until",
        createdAt: "2026-08-18T00:00:00.000Z",
      },
    ];
    const reuse = createResourcesAdministrationReuse({
      loadEvidence() {
        counts.loads += 1;
        return rows;
      },
      project(evidence, asOf) {
        counts.builds += 1;
        return projectResourcesAdministration(evidence, asOf);
      },
      now: () => now,
    });

    const before = reuse.admin();
    expect(
      before.costEvidence.find((item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID)
        ?.validityState,
    ).toBe("current");
    expect(counts).toEqual({ loads: 1, builds: 1 });

    now = "2026-09-05T00:01:00.000Z";
    const after = reuse.admin();
    expect(
      after.costEvidence.find((item) => item.resourceId === PLEXIGLAS_3MM_OPAL_ID)
        ?.validityState,
    ).toBe("expired");
    expect(counts).toEqual({ loads: 1, builds: 2 });
    expect(reuse.admin()).toBe(after);
    expect(counts).toEqual({ loads: 1, builds: 2 });
  });

  it("treats a validFrom boundary as current only after the UTC date rolls over", () => {
    const counts = { loads: 0, builds: 0 };
    let now = "2026-09-04T23:59:00.000Z";
    const rows = [
      {
        resourceId: PLEXIGLAS_3MM_OPAL_ID,
        amount: 16,
        currency: "EUR" as const,
        perUnit: "m2" as const,
        source: "OWNER_CONFIRMED_PURCHASE" as const,
        classification: "OWNER_CONFIRMED" as const,
        note: "seed",
        validFrom: "2026-09-05",
        evidenceRowId: "cev:plexi-from",
        createdAt: "2026-08-18T00:00:00.000Z",
      },
    ];
    const reuse = createResourcesAdministrationReuse({
      loadEvidence() {
        counts.loads += 1;
        return rows;
      },
      project(evidence, asOf) {
        counts.builds += 1;
        return projectResourcesAdministration(evidence, asOf);
      },
      now: () => now,
    });

    const before = reuse.admin();
    const lettersBefore = before.templateUsages.find(
      (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
    );
    expect(lettersBefore?.confirmedTariffCount).toBe(0);
    expect(counts).toEqual({ loads: 1, builds: 1 });

    now = "2026-09-05T00:01:00.000Z";
    const after = reuse.admin();
    const lettersAfter = after.templateUsages.find(
      (item) => item.templateCode === CANONICAL_PRODUCT_CODE,
    );
    expect(lettersAfter?.confirmedTariffCount).toBeGreaterThan(0);
    expect(counts).toEqual({ loads: 1, builds: 2 });
  });
});

describe("PERF_3 resources mutation delta", () => {
  it("reuses the warmed resources admin generation across GET", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const first = await app.request("/api/resources-admin");
    const second = await app.request("/api/resources-admin");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    expect(counts.deltas).toEqual([]);
    runtime.close();
  });

  it("applies a successful plexi write as a delta and leaves presentation reuse intact", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    runtime.present();
    const before = await readBody(await app.request("/api/resources-admin"));
    const plexi = findCost(before, PLEXIGLAS_3MM_OPAL_ID);
    expect(plexi?.amount).toBe(16);
    expect(counts).toMatchObject({
      evidenceLoads: 1,
      fullAdminBuilds: 1,
      presentationBuilds: 1,
    });

    const saved = await app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 18, note: "Plexiglas 18" }),
      },
    );
    expect(saved.status).toBe(200);
    const body = await readBody(saved);
    expect((body.evidence as JsonObject).amount).toBe(18);
    expect(findCost(body.admin as JsonObject, PLEXIGLAS_3MM_OPAL_ID)?.amount).toBe(18);
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    expect(counts.presentationBuilds).toBe(1);
    expect(counts.deltas).toEqual([
      {
        costEvidenceRowsRebuilt: 1,
        resourceRecordsRebuilt: 1,
        recipeRecordsRebuilt: 0,
        templateUsagesRebuilt: 1,
      },
    ]);
    expect(runtime.present()).toBe(runtime.present());
    runtime.close();
  });

  it("changes nothing after a failed write", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const before = await readBody(await app.request("/api/resources-admin"));
    const plexi = findCost(before, PLEXIGLAS_3MM_OPAL_ID);
    const failed = await app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 0, note: "invalid" }),
      },
    );
    expect(failed.status).toBe(400);
    expect((await readBody(failed)).error).toBe("invalid_amount");
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    expect(counts.deltas).toEqual([]);
    const after = await readBody(await app.request("/api/resources-admin"));
    expect(findCost(after, PLEXIGLAS_3MM_OPAL_ID)?.amount).toBe(16);
    expect(findCost(after, PLEXIGLAS_3MM_OPAL_ID)?.evidenceRowId).toBe(
      plexi?.evidenceRowId,
    );
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    runtime.close();
  });

  it("keeps other aluminium depths and ACM when 60 mm changes", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const before = await readBody(await app.request("/api/resources-admin"));
    const aluminium60 = findCost(
      before,
      ALUMINIUM_RETURN_PROFILE_ID,
      "volumeDepthMm=60",
    );
    const saved = await app.request(
      `/api/resources-admin/cost-evidence/${aluminium60?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 4, note: "Doar 60 mm" }),
      },
    );
    expect(saved.status).toBe(200);
    const admin = (await readBody(saved)).admin as JsonObject;
    expect(findCost(admin, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=60")?.amount).toBe(
      4,
    );
    expect(findCost(admin, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=30")?.amount).toBe(
      2,
    );
    expect(findCost(admin, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=80")?.amount).toBe(
      4,
    );
    expect(findCost(admin, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=100")?.amount).toBe(
      5,
    );
    expect(findCost(admin, ACM_3MM_ID)?.amount).toBe(findCost(before, ACM_3MM_ID)?.amount);
    expect(counts.deltas[0]).toMatchObject({
      costEvidenceRowsRebuilt: 1,
      resourceRecordsRebuilt: 1,
      templateUsagesRebuilt: 1,
    });

    const thirty = await confirmProduct(app, CANONICAL_PRODUCT_CODE, {
      ...lettersValues,
      "volume.depthMm": "30",
    });
    const sixty = await confirmProduct(app, CANONICAL_PRODUCT_CODE, lettersValues);
    const eighty = await confirmProduct(app, CANONICAL_PRODUCT_CODE, {
      ...lettersValues,
      "volume.depthMm": "80",
    });
    const hundred = await confirmProduct(app, CANONICAL_PRODUCT_CODE, {
      ...lettersValues,
      "volume.depthMm": "100",
    });
    const acm = await confirmProduct(app, ACM_CASSETTE_NONE_PRODUCT_CODE, acmValues);
    expect((thirty.body.eic as JsonObject).total).toBe(370);
    expect((sixty.body.eic as JsonObject).total).toBe(395);
    expect((eighty.body.eic as JsonObject).total).toBe(395);
    expect((hundred.body.eic as JsonObject).total).toBe(407.5);
    expect((acm.body.commercialPrice as JsonObject).grossPrice).toBe(118.66);
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    runtime.close();
  });

  it("rebuilds both product usages for a shared pack resource", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const before = await readBody(await app.request("/api/resources-admin"));
    const pack = findCost(before, SVC_PACK_PRODUCT_ID);
    const saved = await app.request(
      `/api/resources-admin/cost-evidence/${pack?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 12, note: "Ambalare comună" }),
      },
    );
    expect(saved.status).toBe(200);
    expect(counts.deltas[0]?.templateUsagesRebuilt).toBe(2);
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    runtime.close();
  });

  it("creates a missing aluminium 30 mm slot as a delta", async () => {
    const sqlitePath = tempSqlitePath();
    const db = openSqliteDatabase(sqlitePath);
    ensureCostEvidence(db);
    db.prepare(
      `
      DELETE FROM resource_cost_evidence
      WHERE resource_id = ? AND volume_depth_mm = 30 AND superseded_at IS NULL
    `,
    ).run(ALUMINIUM_RETURN_PROFILE_ID);
    db.close();

    const { runtime, counts } = countedRuntime(sqlitePath);
    const app = createApp({ productSystem: runtime });
    const before = await readBody(await app.request("/api/resources-admin"));
    expect(
      findCost(before, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=30"),
    ).toBeUndefined();
    const created = await app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: ALUMINIUM_RETURN_PROFILE_ID,
        amount: 2,
        note: "Owner 30 mm",
        when: { volumeDepthMm: 30 },
      }),
    });
    expect(created.status).toBe(201);
    const admin = (await readBody(created)).admin as JsonObject;
    expect(findCost(admin, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=30")?.amount).toBe(
      2,
    );
    expect(findCost(admin, ALUMINIUM_RETURN_PROFILE_ID, "volumeDepthMm=60")?.amount).toBe(
      3,
    );
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    expect(counts.deltas[0]?.costEvidenceRowsRebuilt).toBe(1);
    runtime.close();
  });

  it("does not apply a delta when create is rejected", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    await app.request("/api/resources-admin");
    const duplicate = await app.request("/api/resources-admin/cost-evidence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        resourceId: PLEXIGLAS_3MM_OPAL_ID,
        amount: 19,
        note: "duplicate",
      }),
    });
    expect(duplicate.status).toBe(409);
    expect(counts.deltas).toEqual([]);
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(1);
    runtime.close();
  });

  it("keeps PERF_1 confirm counts and frozen quote immutability", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const firstQuote = await freezeQuote(
      app,
      CANONICAL_PRODUCT_CODE,
      lettersValues,
      "Client pin",
    );
    expect(firstQuote.status).toBe(200);
    const frozen = firstQuote.body.quoteSnapshot as JsonObject;
    expect((frozen.eic as JsonObject).total).toBe(382.5);
    expect(typeof frozen.contentHash).toBe("string");
    expect((frozen.contentHash as string).length).toBeGreaterThan(0);

    const admin = await readBody(await app.request("/api/resources-admin"));
    const plexi = findCost(admin, PLEXIGLAS_3MM_OPAL_ID);
    const saved = await app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 18, note: "după ofertă" }),
      },
    );
    expect(saved.status).toBe(200);

    const confirmed = await runWithProductEvaluationTraceAsync(async () =>
      confirmProduct(app, CANONICAL_PRODUCT_CODE, lettersValues),
    );
    expect(confirmed.result.status).toBe(200);
    expect((confirmed.result.body.eic as JsonObject).total).toBe(383);
    expect(confirmed.trace.evaluateProductComponents).toBe(1);
    expect(confirmed.trace.compileEic).toBe(1);
    expect(runtime.readQuoteSnapshot(frozen.quoteSnapshotId as string)?.eic.total).toBe(
      382.5,
    );
    expect(runtime.readQuoteSnapshot(frozen.quoteSnapshotId as string)?.contentHash).toBe(
      frozen.contentHash,
    );
    expect(counts.presentationBuilds).toBeGreaterThanOrEqual(1);
    runtime.close();
  });

  it("rebuilds a coherent day-B admin when a write happens after UTC rollover", async () => {
    let now = "2026-09-04T23:59:00.000Z";
    const { runtime, counts } = countedRuntime(":memory:", { now: () => now });
    const app = createApp({ productSystem: runtime });
    const before = await readBody(await app.request("/api/resources-admin"));
    const plexi = findCost(before, PLEXIGLAS_3MM_OPAL_ID);
    expect(counts).toMatchObject({ evidenceLoads: 1, fullAdminBuilds: 1 });

    now = "2026-09-05T00:01:00.000Z";
    const saved = await app.request(
      `/api/resources-admin/cost-evidence/${plexi?.evidenceRowId as string}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: 18, note: "după rollover" }),
      },
    );
    expect(saved.status).toBe(200);
    const body = await readBody(saved);
    const expected = JSON.parse(
      JSON.stringify(
        projectResourcesAdministration(runtime.listActiveCostEvidence(), now),
      ),
    );
    expect(body.admin).toEqual(expected);
    expect(findCost(body.admin as JsonObject, PLEXIGLAS_3MM_OPAL_ID)?.amount).toBe(18);
    expect(counts.evidenceLoads).toBe(1);
    expect(counts.fullAdminBuilds).toBe(2);
    expect(counts.deltas).toEqual([]);
    runtime.close();
  });
});
