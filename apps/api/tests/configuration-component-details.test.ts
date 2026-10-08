import { describe, expect, it } from "vitest";
import { CANONICAL_PRODUCT_CODE } from "@workos-final/domain";
import { createApp } from "../src/app.js";

const values = { "root.inscription": "NORD", "face.finish": "none", "face.confirmedAreaMm2": 250000, "volume.depthMm": "60", "volume.finish": "none", "volume.confirmedPerimeterMm": 12500 };
type Detail = { componentId: string; inputFields: { fieldId: string; value: string }[]; facts: { id: string; value: string; sourceLabel: string }[] };
async function preview(app: ReturnType<typeof createApp>, input = values) {
  const response = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/preview`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values: input }) });
  expect(response.status).toBe(200);
  return await response.json() as { componentDetails: Detail[]; readiness: string; reviewId: string | null };
}

describe("live component details API", () => {
  it("projects active organization settings and preserves the review contract after a settings change", async () => {
    const app = createApp();
    const first = await preview(app);
    expect(first.componentDetails.find((item) => item.componentId === "LIGHTING")?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "setting:ledPitchMm", value: "100 mm", sourceLabel: "Valoare inițială a platformei · versiunea 1" }),
      expect.objectContaining({ id: "result:ledModuleQuantity", value: "125 buc" }),
    ]));
    const saved = await app.request("/api/admin/technical-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ledPitchMm: 80 }) });
    expect(saved.status).toBe(200);
    const next = await preview(app);
    expect(next.componentDetails.find((item) => item.componentId === "LIGHTING")?.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "setting:ledPitchMm", value: "80 mm", sourceLabel: "Setare organizație · versiunea 2" }),
      expect.objectContaining({ id: "result:ledModuleQuantity", value: "157 buc" }),
    ]));
    expect(next.reviewId).not.toBe(first.reviewId);
    const stale = await app.request(`/api/products/${CANONICAL_PRODUCT_CODE}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ values, reviewId: first.reviewId }) });
    expect(stale.status).toBe(409);
  });

  it("returns explicit dependency targets even when their input is missing, without false zeros", async () => {
    const result = await preview(createApp(), { ...values, "face.confirmedAreaMm2": 0, "volume.confirmedPerimeterMm": 0 });
    expect(result.readiness).toBe("blocked");
    expect(result.reviewId).toBeNull();
    const back = result.componentDetails.find((item) => item.componentId === "BACK")!;
    expect(back.inputFields).toEqual(expect.arrayContaining([expect.objectContaining({ fieldId: "face.confirmedAreaMm2", value: "De completat" })]));
    expect(back.facts).not.toEqual(expect.arrayContaining([expect.objectContaining({ value: "0 m²" })]));
  });
});
