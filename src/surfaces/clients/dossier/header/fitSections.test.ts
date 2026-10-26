import { describe, expect, it } from "vitest";
import { fitSections } from "./fitSections";

const order = ["istoric", "cereri", "lucrari", "documente", "fotografii", "sedii", "comercial"] as const;
// Widths measured in the folded band (Alpha Clima, 2026-10-25): the current tab is wider (17 px brand font).
const widths = { istoric: 101, cereri: 289, lucrari: 100, documente: 125, fotografii: 129, sedii: 85, comercial: 150 };

describe("folded band tabs (N-020, 768 px)", () => {
  it("keeps the current tab and adds the next ones in order only while they fit with the menu", () => {
    // 768 folded: 321 px for the tabs, which used to run 590–671 px, under "Cerere nouă".
    expect(fitSections({ order, current: "istoric", widths, moreWidth: 112, available: 321 })).toEqual({ visible: ["istoric"], tight: false });
    expect(fitSections({ order, current: "istoric", widths, moreWidth: 112, available: 520 })).toEqual({ visible: ["istoric", "cereri"], tight: false });
  });

  it("stops at the first section that does not fit, so the visible tabs keep the order of the page", () => {
    // Lucrări (100) would fit after Istoric, but Cereri (289) does not: nothing is skipped over.
    const fit = fitSections({ order, current: "istoric", widths, moreWidth: 112, available: 330 });
    expect(fit.visible).toEqual(["istoric"]);
  });

  it("shows a current section from the end of the list in its place, the others in the menu", () => {
    expect(fitSections({ order, current: "comercial", widths, moreWidth: 112, available: 400 })).toEqual({ visible: ["istoric", "comercial"], tight: false });
  });

  it("drops the menu when every section fits", () => {
    const all = Object.values(widths).reduce((sum, width) => sum + width, 0);
    expect(fitSections({ order, current: "sedii", widths, moreWidth: 112, available: all }).visible).toEqual([...order]);
  });

  it("says when even the current tab and the menu do not fit, so the name gives up its room", () => {
    // 768 folded on Cereri și oferte: 289 + 112 > 321.
    expect(fitSections({ order, current: "cereri", widths, moreWidth: 112, available: 321 })).toEqual({ visible: ["cereri"], tight: true });
  });
});
