import { describe, expect, it } from "vitest";
import { floorplanForLayout } from "./floorplan";
import { STRUCTURAL_LAYOUTS, type StructuralLayoutId } from "./pageLayout";

const expected: Record<StructuralLayoutId, string> = {
  START_CONTINUATION: "launchpad",
  REGISTRY: "list-report",
  OBJECT_DETAIL: "object-detail",
  WORKBENCH: "form-configuration",
  OPERATIONAL: "operational-workspace",
  ADMIN_MASTER_DETAIL: "admin-settings",
};

describe("floorplanForLayout", () => {
  it("derives the compatibility floorplan from each structural layout", () => {
    expect(STRUCTURAL_LAYOUTS).toHaveLength(6);
    for (const layout of STRUCTURAL_LAYOUTS) {
      expect(floorplanForLayout(layout)).toBe(expected[layout]);
    }
  });
});
