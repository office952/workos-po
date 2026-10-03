import { describe, expect, it } from "vitest";
import { applyColorScheme, readColorSchemePreference, resolveColorScheme } from "./colorScheme";

describe("color scheme", () => {
  it("resolves light, dark, and system without inventing a fourth mode", () => {
    expect(resolveColorScheme("light", true)).toBe("light");
    expect(resolveColorScheme("dark", false)).toBe("dark");
    expect(resolveColorScheme("system", false)).toBe("light");
    expect(resolveColorScheme("system", true)).toBe("dark");
  });

  it("ignores an unknown stored preference", () => {
    const storage = { getItem: () => "neon" };
    expect(readColorSchemePreference(storage)).toBe("light");
  });

  it("applies the resolved theme on the document", () => {
    expect(applyColorScheme("dark", false)).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.resolvedTheme).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
});
