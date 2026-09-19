import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";
import { createProductSystemRuntime } from "../src/productSystem/runtime.js";

function app() {
  return createApp({ productSystem: createProductSystemRuntime(":memory:") });
}

describe("display-label write API", () => {
  it("persists a valid rename and reflects it on GET", async () => {
    const runtime = createProductSystemRuntime(":memory:");
    const client = createApp({ productSystem: runtime });
    const patch = await client.request(
      "/api/admin/product-system/entities/PRODUCT_TEMPLATE/PRD-LETTERS-FRONTLIT-PLEXI-AL06/display-label",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayLabel: "  Produs redenumit  ",
          revision: 1,
        }),
      },
    );
    expect(patch.status).toBe(200);
    const written = (await patch.json()) as {
      displayLabel: string;
      entityId: string;
      revision: number;
    };
    expect(written.entityId).toBe(CANONICAL_PRODUCT_CODE);
    expect(written.displayLabel).toBe("Produs redenumit");
    expect(written.revision).toBe(2);

    const catalog = await client.request("/api/product-catalog");
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
    expect(product?.label).toBe("Produs redenumit");
    expect(product?.code).toBe(CANONICAL_PRODUCT_CODE);

    const detail = await client.request(`/api/products/${CANONICAL_PRODUCT_CODE}`);
    const detailBody = (await detail.json()) as { template: { label: string; code: string } };
    expect(detailBody.template.code).toBe(CANONICAL_PRODUCT_CODE);
    expect(detailBody.template.label).toBe("Produs redenumit");
    runtime.close();
  });

  it("rejects invalid labels unknown entities and revision conflicts", async () => {
    const client = app();
    const empty = await client.request(
      "/api/admin/product-system/entities/PRODUCT_FAMILY/LIGHTED_VOLUMETRIC_SIGNS/display-label",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayLabel: "   ", revision: 1 }),
      },
    );
    expect(empty.status).toBe(400);

    const missing = await client.request(
      "/api/admin/product-system/entities/PRODUCT_FAMILY/NOT_A_FAMILY/display-label",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayLabel: "X", revision: 1 }),
      },
    );
    expect(missing.status).toBe(404);

    const kind = await client.request(
      "/api/admin/product-system/entities/TECHNICAL_SETTING/ledPitchMm/display-label",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayLabel: "X", revision: 1 }),
      },
    );
    expect(kind.status).toBe(404);

    const first = await client.request(
      "/api/admin/product-system/entities/COMPONENT_TYPE/PLEXIGLAS_FACE/display-label",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayLabel: "Plexiglas administrat", revision: 1 }),
      },
    );
    expect(first.status).toBe(200);
    const stale = await client.request(
      "/api/admin/product-system/entities/COMPONENT_TYPE/PLEXIGLAS_FACE/display-label",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayLabel: "Altă etichetă", revision: 1 }),
      },
    );
    expect(stale.status).toBe(409);
  });
});
