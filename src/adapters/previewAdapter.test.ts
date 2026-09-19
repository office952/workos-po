import { describe, expect, it } from "vitest";
import { presentPreview } from "./previewAdapter";

describe("presentPreview", () => {
  it("maps a preview transport object without inventing readiness", () => {
    const presented = presentPreview({
      product: { code: "LETTERS", label: "Litere" },
      values: { "root.inscription": "NOVA" },
      formSchema: { id: "form", sections: [] },
      selectedComponents: ["FACE"],
      readiness: "blocked",
      missing: [{ label: "Înălțimea literei" }],
      reviewId: null,
      installation: {
        selected: true,
        prequoteReady: false,
        incompleteReasons: ["Lipsește adresa"],
      },
    });

    expect(presented?.readiness).toBe("blocked");
    expect(presented?.missing).toEqual([{ label: "Înălțimea literei" }]);
    expect(presented?.reviewId).toBeNull();
    expect(presented?.installation.prequoteReady).toBe(false);
    expect(presented?.product.code).toBe("LETTERS");
  });

  it("accepts the live productCode field from workos-final preview", () => {
    const presented = presentPreview({
      product: {
        productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
        label: "Litere volumetrice luminoase",
      },
      values: {},
      formSchema: {
        id: "prd-letters-frontlit-plexi-al06-form-v1",
        sections: [
          {
            id: "product",
            title: "Produs",
            fields: [
              {
                id: "root.inscription",
                label: "Textul literelor",
                type: "text",
                required: true,
              },
            ],
          },
        ],
      },
      selectedComponents: [{ id: "FACE", label: "Față" }],
      readiness: "ready",
      missing: [],
      reviewId: "crv1:abc",
    });

    expect(presented?.product.code).toBe("PRD-LETTERS-FRONTLIT-PLEXI-AL06");
    expect(presented?.reviewId).toBe("crv1:abc");
    expect(presented?.formSchema?.sections[0]?.fields[0]?.label).toBe(
      "Textul literelor",
    );
    expect(presented?.selectedComponents).toEqual([{ id: "FACE", label: "Față" }]);
  });

  it("rejects payloads that are not preview transport", () => {
    expect(presentPreview({ definition: {} })).toBeNull();
  });
});
