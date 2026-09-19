import { describe, expect, it } from "vitest";
import {
  matchesSearchFields,
  normalizeSearchText,
  searchTextIncludes,
} from "./searchNormalize.js";

describe("normalizeSearchText", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeSearchText("  HUB   Light  ")).toBe("hub light");
  });

  it("is case-insensitive for Romanian locale", () => {
    expect(normalizeSearchText("CÎMPEAN")).toBe(normalizeSearchText("cîmpean"));
  });

  it("folds Romanian diacritics", () => {
    expect(normalizeSearchText("Cîmpean")).toBe(normalizeSearchText("Cimpean"));
    expect(normalizeSearchText("Ștefan")).toBe(normalizeSearchText("Stefan"));
    expect(normalizeSearchText("țară")).toBe(normalizeSearchText("tara"));
  });

  it("returns empty for blank input", () => {
    expect(normalizeSearchText("   ")).toBe("");
  });
});

describe("matchesSearchFields", () => {
  it("matches partial strings", () => {
    expect(matchesSearchFields(["Litere plexi HUB"], "hub")).toBe(true);
    expect(matchesSearchFields(["Litere plexi HUB"], "xyz")).toBe(false);
  });

  it("treats empty query as match-all", () => {
    expect(matchesSearchFields(["Alpha"], "")).toBe(true);
    expect(matchesSearchFields(["Alpha"], "  ")).toBe(true);
  });

  it("ignores null fields", () => {
    expect(matchesSearchFields([null, "RO123", undefined], "ro123")).toBe(true);
    expect(matchesSearchFields([null, undefined], "x")).toBe(false);
  });

  it("matches diacritic-insensitive needles", () => {
    expect(matchesSearchFields(["Cîmpean SRL"], "cimpean")).toBe(true);
  });
});

describe("searchTextIncludes", () => {
  it("returns true for empty needle", () => {
    expect(searchTextIncludes("anything", "")).toBe(true);
  });
});
