import { describe, expect, it, vi } from "vitest";
import * as navigateModule from "../../routing/navigate";
import { catalogSelectionHref, readCatalogSelection, writeCatalogSelection } from "./catalogSelection";

describe("catalogSelection", () => {
  it("reads and omits empty product or component params", () => {
    expect(readCatalogSelection("?product=PRD-TEST&component=FACE")).toEqual({
      productCode: "PRD-TEST",
      componentId: "FACE",
    });
    expect(readCatalogSelection("?product=%20&component=")).toEqual({ productCode: null, componentId: null });
    expect(readCatalogSelection("")).toEqual({ productCode: null, componentId: null });
  });

  it("builds stable catalog hrefs", () => {
    expect(catalogSelectionHref({ productCode: "PRD-TEST", componentId: "BACK" })).toBe(
      "/catalog?product=PRD-TEST&component=BACK",
    );
    expect(catalogSelectionHref({ productCode: null, componentId: null })).toBe("/catalog");
  });

  it("records user selection with push navigation", () => {
    const navigate = vi.spyOn(navigateModule, "navigate").mockImplementation(() => {});
    writeCatalogSelection({ productCode: "PRD-TEST", componentId: "FACE" });
    expect(navigate).toHaveBeenCalledWith("/catalog?product=PRD-TEST&component=FACE", "push");
    navigate.mockRestore();
  });
});
