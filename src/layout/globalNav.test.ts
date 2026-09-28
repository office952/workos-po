import { describe, expect, it } from "vitest";
import { globalNavItems, primaryNavVisibleCount } from "./globalNav";

describe("global navigation", () => {
  it("keeps seven primary destinations and leaves Catalog out of that row", () => {
    const items = globalNavItems();
    expect(items.map((item) => item.label)).toEqual([
      "Clienți",
      "Cereri",
      "Oferte",
      "Lucrări",
      "Planificare",
      "Atelier",
      "Administrare",
    ]);
    expect(items.some((item) => item.href === "/catalog" || item.label === "Catalog")).toBe(false);
  });

  it("shows every item when two designed wrap rows are enough", () => {
    expect(
      primaryNavVisibleCount({
        containerWidth: 400,
        itemWidths: [80, 80, 80, 80, 80, 80, 80],
        moreWidth: 90,
        gap: 8,
        maxRows: 2,
      }),
    ).toBe(7);
  });

  it("keeps Mai multe only when items exceed the fixed two-row capacity", () => {
    expect(
      primaryNavVisibleCount({
        containerWidth: 200,
        itemWidths: [80, 80, 80, 80, 80, 80, 80],
        moreWidth: 72,
        gap: 8,
        maxRows: 2,
      }),
    ).toBe(3);
  });

  it("keeps the full set when width has not been measured", () => {
    expect(
      primaryNavVisibleCount({
        containerWidth: 0,
        itemWidths: [80, 80, 80],
        moreWidth: 72,
      }),
    ).toBe(3);
  });
});
