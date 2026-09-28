import { afterEach, describe, expect, it } from "vitest";
import { navigate, resolveAppHref, sameOriginNavigation } from "./navigate";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("navigate", () => {
  it("keeps the empty path as the landing page", () => {
    expect(resolveAppHref("/")).toBe("/");
    expect(resolveAppHref("/?product=PRD-1")).toBe("/configurator?product=PRD-1");
    navigate("/cereri");
    navigate("/");
    expect(`${window.location.pathname}${window.location.search}`).toBe("/");
  });

  it("ignores modified clicks and hash-only links", () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", "/cereri");
    const modified = new MouseEvent("click", { button: 0, ctrlKey: true });
    expect(sameOriginNavigation(anchor, modified)).toBeNull();
    const hash = document.createElement("a");
    hash.setAttribute("href", "#continut-principal");
    expect(sameOriginNavigation(hash, new MouseEvent("click", { button: 0 }))).toBeNull();
  });
});
