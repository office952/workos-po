import { describe, expect, it, vi } from "vitest";
import * as navigateModule from "../../routing/navigate";
import {
  catalogAdminHref,
  catalogReturnFromSearch,
  catalogSelectionHref,
  readCatalogSelection,
  sanitizeCatalogReturn,
  writeCatalogSelection,
} from "./catalogSelection";

describe("catalogSelection", () => {
  it("reads and omits empty product or component params", () => {
    expect(readCatalogSelection("?product=PRD-TEST&component=FACE")).toEqual({
      productCode: "PRD-TEST",
      componentId: "FACE",
      tab: "constructie",
    });
    expect(readCatalogSelection("?product=%20&component=")).toEqual({ productCode: null, componentId: null, tab: "constructie" });
    expect(readCatalogSelection("")).toEqual({ productCode: null, componentId: null, tab: "constructie" });
    expect(readCatalogSelection("?tab=proces")).toEqual({ productCode: null, componentId: null, tab: "proces" });
    expect(readCatalogSelection("?tab=unknown")).toEqual({ productCode: null, componentId: null, tab: "constructie" });
  });

  it("builds stable catalog hrefs", () => {
    expect(catalogSelectionHref({ productCode: "PRD-TEST", componentId: "BACK", tab: "constructie" })).toBe(
      "/catalog?product=PRD-TEST&component=BACK",
    );
    expect(catalogSelectionHref({ productCode: "PRD-TEST", componentId: "LIGHTING", tab: "proces" })).toBe(
      "/catalog?product=PRD-TEST&component=LIGHTING&tab=proces",
    );
    expect(catalogSelectionHref({ productCode: null, componentId: null, tab: "constructie" })).toBe("/catalog");
  });

  it("records user selection with push navigation", () => {
    const navigate = vi.spyOn(navigateModule, "navigate").mockImplementation(() => {});
    writeCatalogSelection({ productCode: "PRD-TEST", componentId: "FACE", tab: "constructie" });
    expect(navigate).toHaveBeenCalledWith("/catalog?product=PRD-TEST&component=FACE", "push");
    navigate.mockRestore();
  });

  it("encodes a catalog return into administration links", () => {
    const href = catalogAdminHref("/admin/technical", "LIGHTING_FRONT_LED", {
      productCode: "PRD-TEST",
      componentId: "LIGHTING",
      tab: "constructie",
    });
    const url = new URL(href, "https://workos.local");
    expect(url.pathname).toBe("/admin/technical");
    expect(url.searchParams.get("component")).toBe("LIGHTING_FRONT_LED");
    expect(url.searchParams.get("return")).toBe("/catalog?product=PRD-TEST&component=LIGHTING");
  });

  it("accepts only in-app catalog return paths", () => {
    expect(sanitizeCatalogReturn("/catalog?product=PRD-TEST&component=LIGHTING&tab=constructie")).toBe(
      "/catalog?product=PRD-TEST&component=LIGHTING",
    );
    expect(sanitizeCatalogReturn("/catalog?product=PRD-TEST&component=LIGHTING&tab=variante")).toBe(
      "/catalog?product=PRD-TEST&component=LIGHTING&tab=variante",
    );
    expect(sanitizeCatalogReturn("/catalog")).toBe("/catalog");
    expect(sanitizeCatalogReturn("/catalog?product=UNKNOWN_CODE")).toBe("/catalog?product=UNKNOWN_CODE");
    expect(sanitizeCatalogReturn("https://example.test/catalog")).toBeNull();
    expect(sanitizeCatalogReturn("//example.test/catalog")).toBeNull();
    expect(sanitizeCatalogReturn("/admin/technical")).toBeNull();
    expect(sanitizeCatalogReturn("/configurator?customer=cus-1&request=req-1&product=PRD-TEST")).toBeNull();
    expect(sanitizeCatalogReturn("catalog?product=PRD-TEST")).toBeNull();
    expect(sanitizeCatalogReturn("/catalog?product=PRD-TEST#https://example.test")).toBeNull();
    expect(sanitizeCatalogReturn("/catalog?product=PRD-TEST&redirect=https://example.test")).toBeNull();
    expect(sanitizeCatalogReturn("/catalog?product=../admin")).toBeNull();
    expect(sanitizeCatalogReturn("/catalog?component=LIGHTING/../admin")).toBeNull();
    expect(sanitizeCatalogReturn("/catalog?tab=unknown")).toBeNull();
    expect(catalogReturnFromSearch("?component=LIGHTING_FRONT_LED&return=/admin")).toBe("/catalog");
    expect(catalogReturnFromSearch("?return=")).toBe("/catalog");
    expect(
      catalogReturnFromSearch(`?return=${encodeURIComponent("/catalog?product=PRD-TEST&component=LIGHTING")}`),
    ).toBe("/catalog?product=PRD-TEST&component=LIGHTING");
    expect(catalogReturnFromSearch(`?return=${encodeURIComponent("//example.test/catalog")}`)).toBe("/catalog");
    expect(catalogReturnFromSearch(`?return=${encodeURIComponent("https://example.test/catalog")}`)).toBe("/catalog");
    expect(catalogReturnFromSearch(`?return=${encodeURIComponent("/\\example.test/catalog")}`)).toBe("/catalog");
  });
});
