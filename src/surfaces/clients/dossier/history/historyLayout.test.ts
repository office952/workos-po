import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Istoric column width (N-020, 360 px)", () => {
  it("keeps the section to one column no wider than its container", () => {
    // jsdom does no layout, so this pins the rule itself: with an implicit `auto` track the filled
    // search row (field + "Șterge" + "Filtre") widened every child of .hist past a 360 px screen.
    const style = document.createElement("style");
    style.textContent = readFileSync("src/styles/surfaces/client-history-timeline.css", "utf8");
    document.head.append(style);
    const section = document.createElement("section");
    section.className = "hist";
    document.body.append(section);
    try {
      expect(getComputedStyle(section).display).toBe("grid");
      expect(getComputedStyle(section).gridTemplateColumns).toBe("minmax(0, 1fr)");
    } finally {
      section.remove();
      style.remove();
    }
  });
});
