import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  WORKOS_AUTH_GLYPH_CYCLE_SECONDS,
  WORKOS_AUTH_GLYPH_ORDER,
  WORKOS_WORKBENCH_GLYPHS,
} from "./AuthTechnicalFrame";

describe("AuthTechnicalFrame WorkOS glyph loop", () => {
  it("keeps the WorkOS wordmark order and exact case", () => {
    expect(WORKOS_AUTH_GLYPH_ORDER).toEqual(["W", "o", "r", "k", "O", "S"]);
  });

  it("allocates one nine-second repair cycle per glyph", () => {
    expect(WORKOS_AUTH_GLYPH_CYCLE_SECONDS).toBe(
      WORKOS_AUTH_GLYPH_ORDER.length * 9,
    );
  });

  it("defines six historical inspection glyphs in wordmark order", () => {
    expect(WORKOS_WORKBENCH_GLYPHS).toHaveLength(6);
    expect(WORKOS_WORKBENCH_GLYPHS.map((item) => item.glyph)).toEqual([
      ...WORKOS_AUTH_GLYPH_ORDER,
    ]);
  });

  it("keeps exclusive 54s slot animations and does not hide the glyph cycle", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/ui.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).toContain(".auth-workbench-v3__letter--1 { animation: wb3-slot-1 54s linear infinite; }");
    expect(css).toContain(".auth-workbench-v3__letter--6 { animation: wb3-slot-6 54s linear infinite; }");
    expect(css).toContain(".auth-tech__viewport[data-auth-active] .auth-workbench-v3 {\n  opacity: 0.10;\n  filter: saturate(0.72);\n}");
    expect(css).not.toContain(".auth-workbench-v3__letter,\n.auth-workbench-v3__sweep {\n  display: none;\n}");
  });

  it("puts tablet and phone auth in the first visual region without deleting the glyph contract", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/ui.css"), "utf8").replace(/\r\n/g, "\n");
    expect(css).toContain(
      '.auth-gate[data-layout="compact"]:is([data-access="societate"], [data-access="angajat"]) .auth-gate__stage,\n.auth-gate[data-layout="phone"]:is([data-access="societate"], [data-access="angajat"]) .auth-gate__stage {\n  grid-template-areas:\n    "tech"\n    "product";',
    );
    expect(css).toContain(
      '.auth-gate[data-layout="phone"]:is([data-access="societate"], [data-access="angajat"]) .sign-demo,',
    );
    expect(css).toContain(".auth-workbench-v3__letter--1 { animation: wb3-slot-1 54s linear infinite; }");
    expect(css).toContain(
      '.auth-gate[data-layout="compact"] .auth-tech__role span,\n.auth-gate[data-layout="phone"] .auth-tech__role span {\n  display: block;',
    );
  });
});
