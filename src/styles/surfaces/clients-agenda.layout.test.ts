import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("clients agenda compact filters", () => {
  it("wraps 390px filter chips instead of letting Retrași overflow the viewport", () => {
    const css = readFileSync("src/styles/surfaces/clients-agenda.css", "utf8");
    expect(css).toMatch(/\.cagenda-compact__row\s*\{[^}]*flex-wrap:\s*wrap;/);
    expect(css).toMatch(/\.cagenda-compact \.rdesk-filterchips\s*\{[^}]*flex-wrap:\s*wrap;/);
    expect(css).toMatch(/\.cagenda-compact \.rdesk-filterchips\s*\{[^}]*overflow-x:\s*visible;/);
    expect(css).toMatch(/\.cagenda-desk\[data-layout="full"\] \.rdesk__work\s*\{[^}]*max-width:\s*100%;/);
  });
});
