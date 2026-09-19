import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CANONICAL_PRODUCT_CODE,
  presentProductSystem,
  runWithProductEvaluationTraceAsync,
  seededDisplayLabelCatalog,
} from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemPresentationReuse } from "../src/productSystem/presentationReuse.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

const FAMILY_ID = "LIGHTED_VOLUMETRIC_SIGNS";

const lettersValues = {
  "root.inscription": "WORKOS",
  "face.finish": "none",
  "face.confirmedAreaMm2": 250000,
  "volume.depthMm": "60",
  "volume.finish": "none",
  "volume.confirmedPerimeterMm": 12500,
};

const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempSqlitePath(): string {
  const dir = mkdtempSync(join(tmpdir(), "workos-ps-reuse-"));
  temps.push(dir);
  return join(dir, "product-system.sqlite");
}

function countedReuse() {
  const counts = { labelLoads: 0, presentationBuilds: 0 };
  const reuse = createProductSystemPresentationReuse({
    loadLabels() {
      counts.labelLoads += 1;
      return seededDisplayLabelCatalog();
    },
    present(labels) {
      counts.presentationBuilds += 1;
      return presentProductSystem(labels);
    },
  });
  return { reuse, counts };
}

function countedRuntime(sqlitePath = ":memory:") {
  const counts = { labelLoads: 0, presentationBuilds: 0 };
  const runtime = createProductSystemRuntime(sqlitePath, {
    observeDisplayLabelCatalogLoad() {
      counts.labelLoads += 1;
    },
    observeProductSystemPresentationBuild() {
      counts.presentationBuilds += 1;
    },
  });
  return { runtime, counts };
}

describe("product system presentation reuse helper", () => {
  it("reuses one label catalog and one presentation across repeated present()", () => {
    const { reuse, counts } = countedReuse();
    const first = reuse.present();
    const second = reuse.present();
    expect(second).toBe(first);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
  });

  it("does not reload labels after present()", () => {
    const { reuse, counts } = countedReuse();
    reuse.present();
    expect(reuse.labels().label("PRODUCT_FAMILY", FAMILY_ID)).toBe(
      seededDisplayLabelCatalog().label("PRODUCT_FAMILY", FAMILY_ID),
    );
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
  });

  it("does not build presentation until present() is requested", () => {
    const { reuse, counts } = countedReuse();
    reuse.labels();
    reuse.labels();
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 0 });
    const first = reuse.present();
    const second = reuse.present();
    expect(second).toBe(first);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
  });
});

describe("product system runtime presentation reuse", () => {
  it("reuses the current generation on a live runtime", () => {
    const { runtime, counts } = countedRuntime();
    const first = runtime.present();
    const second = runtime.present();
    runtime.labels();
    expect(second).toBe(first);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
    runtime.close();
  });

  it("invalidates exactly once after a successful display-label write", () => {
    const { runtime, counts } = countedRuntime();
    const warmed = runtime.present();
    const seedLabel = warmed.admin.families[0]?.label;
    const written = runtime.updateDisplayLabel(
      "PRODUCT_FAMILY",
      FAMILY_ID,
      "Familie actualizată",
      warmed.admin.families[0]?.displayRevision,
    );
    expect(written.ok).toBe(true);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });

    expect(runtime.labels().label("PRODUCT_FAMILY", FAMILY_ID)).toBe(
      "Familie actualizată",
    );
    const next = runtime.present();
    expect(next).not.toBe(warmed);
    expect(next.admin.families[0]?.label).toBe("Familie actualizată");
    expect(next.admin.families[0]?.displayRevision).toBe(2);
    expect(next.admin.families[0]?.label).not.toBe(seedLabel);
    expect(counts).toEqual({ labelLoads: 2, presentationBuilds: 2 });
    runtime.close();
  });

  it("does not invalidate after a failed display-label write", () => {
    const { runtime, counts } = countedRuntime();
    const warmed = runtime.present();
    const failed = runtime.updateDisplayLabel(
      "PRODUCT_FAMILY",
      FAMILY_ID,
      "   ",
      warmed.admin.families[0]?.displayRevision,
    );
    expect(failed).toMatchObject({ ok: false, error: "invalid_label" });
    expect(runtime.present()).toBe(warmed);
    expect(runtime.labels().label("PRODUCT_FAMILY", FAMILY_ID)).toBe(
      warmed.admin.families[0]?.label,
    );
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });

    const conflict = runtime.updateDisplayLabel(
      "PRODUCT_FAMILY",
      FAMILY_ID,
      "Altă etichetă",
      99,
    );
    expect(conflict).toMatchObject({ ok: false, error: "revision_conflict" });
    expect(runtime.present()).toBe(warmed);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
    runtime.close();
  });

  it("rebuilds a current generation after reopen on persisted labels", () => {
    const sqlitePath = tempSqlitePath();
    const first = countedRuntime(sqlitePath);
    const written = first.runtime.updateDisplayLabel(
      "PRODUCT_FAMILY",
      FAMILY_ID,
      "Familie persistată",
      1,
    );
    expect(written.ok).toBe(true);
    first.runtime.close();

    const second = countedRuntime(sqlitePath);
    expect(second.counts).toEqual({ labelLoads: 0, presentationBuilds: 0 });
    expect(second.runtime.present().admin.families[0]?.label).toBe(
      "Familie persistată",
    );
    expect(second.runtime.present().admin.families[0]?.displayRevision).toBe(2);
    expect(second.runtime.labels().label("PRODUCT_FAMILY", FAMILY_ID)).toBe(
      "Familie persistată",
    );
    expect(second.counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
    second.runtime.close();
  });

  it("does not share a presentation generation across runtimes", () => {
    const alpha = countedRuntime();
    const beta = countedRuntime();
    alpha.runtime.present();
    const written = alpha.runtime.updateDisplayLabel(
      "PRODUCT_FAMILY",
      FAMILY_ID,
      "Doar Alpha",
      1,
    );
    expect(written.ok).toBe(true);
    expect(alpha.runtime.present().admin.families[0]?.label).toBe("Doar Alpha");
    expect(beta.counts).toEqual({ labelLoads: 0, presentationBuilds: 0 });
    expect(beta.runtime.present().admin.families[0]?.label).not.toBe("Doar Alpha");
    expect(beta.runtime.present()).not.toBe(alpha.runtime.present());
    expect(beta.counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
    alpha.runtime.close();
    beta.runtime.close();
  });

  it("returns a fresh admin projection on the display-label PATCH response", async () => {
    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const before = await app.request("/api/product-system-admin");
    expect(before.status).toBe(200);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });

    const patch = await app.request(
      `/api/admin/product-system/entities/PRODUCT_TEMPLATE/${CANONICAL_PRODUCT_CODE}/display-label`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayLabel: "  Produs reutilizat  ",
          revision: 1,
        }),
      },
    );
    expect(patch.status).toBe(200);
    const written = (await patch.json()) as {
      displayLabel: string;
      revision: number;
      admin: {
        products: Array<{ code: string; label: string; displayRevision: number }>;
      };
    };
    expect(written.displayLabel).toBe("Produs reutilizat");
    expect(written.revision).toBe(2);
    const patchedProduct = written.admin.products.find(
      (item) => item.code === CANONICAL_PRODUCT_CODE,
    );
    expect(patchedProduct?.label).toBe("Produs reutilizat");
    expect(patchedProduct?.displayRevision).toBe(2);
    expect(counts).toEqual({ labelLoads: 2, presentationBuilds: 2 });

    const catalog = await app.request("/api/product-catalog");
    const catalogBody = (await catalog.json()) as {
      tree: Array<{
        children: Array<{
          children: Array<{ kind: string; label: string; code?: string }>;
        }>;
      }>;
    };
    const product = catalogBody.tree[0]?.children[0]?.children.find(
      (item) => item.kind === "product",
    );
    expect(product?.label).toBe("Produs reutilizat");
    expect(counts).toEqual({ labelLoads: 2, presentationBuilds: 2 });

    const detail = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}`);
    const detailBody = (await detail.json()) as { template: { label: string } };
    expect(detailBody.template.label).toBe("Produs reutilizat");

    const components = await app.request("/api/components");
    expect(components.status).toBe(200);
    expect(counts).toEqual({ labelLoads: 2, presentationBuilds: 2 });
    runtime.close();
  });

  it("keeps one presentation generation across two accepted LETTERS confirms", async () => {
    const reviewedResponse = await createApp().request(
      `/api/products/${CANONICAL_PRODUCT_CODE}/compile`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ values: lettersValues }),
      },
    );
    const reviewed = (await reviewedResponse.json()) as {
      definition: unknown;
      reviewId: string;
    };

    const { runtime, counts } = countedRuntime();
    const app = createApp({ productSystem: runtime });
    const first = await runWithProductEvaluationTraceAsync(async () => {
      const response = await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            definition: reviewed.definition,
            reviewId: reviewed.reviewId,
          }),
        },
      );
      return {
        status: response.status,
        body: (await response.json()) as {
          eic: { total: number };
          commercialPrice: { grossPrice: number };
        },
      };
    });
    expect(first.result.status).toBe(200);
    expect(first.result.body.eic.total).toBe(382.5);
    expect(first.result.body.commercialPrice.grossPrice).toBe(624.82);
    expect(first.trace.evaluateProductComponents).toBe(1);
    expect(first.trace.compileEic).toBe(1);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });

    const second = await runWithProductEvaluationTraceAsync(async () => {
      const response = await app.request(
        `/api/products/${CANONICAL_PRODUCT_CODE}/confirm`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            definition: reviewed.definition,
            reviewId: reviewed.reviewId,
          }),
        },
      );
      return { status: response.status };
    });
    expect(second.result.status).toBe(200);
    expect(second.trace.evaluateProductComponents).toBe(1);
    expect(second.trace.compileEic).toBe(1);
    expect(counts).toEqual({ labelLoads: 1, presentationBuilds: 1 });
    runtime.close();
  });
});
