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

  it("shows every item when the row is wide enough and does not reserve Mai multe", () => {
    expect(
      primaryNavVisibleCount({
        containerWidth: 900,
        itemWidths: [80, 80, 80, 80, 80, 80, 80],
        moreWidth: 90,
        gap: 8,
      }),
    ).toBe(7);
  });

  it("moves only the tail into overflow when the measured row is narrow", () => {
    expect(
      primaryNavVisibleCount({
        containerWidth: 280,
        itemWidths: [80, 80, 80, 80, 80, 80, 80],
        moreWidth: 72,
        gap: 8,
      }),
    ).toBe(2);
  });

  it("keeps the full row when width has not been measured", () => {
    expect(
      primaryNavVisibleCount({
        containerWidth: 0,
        itemWidths: [80, 80, 80],
        moreWidth: 72,
      }),
    ).toBe(3);
  });
});
