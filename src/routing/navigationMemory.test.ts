import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { navigate, setNavigationGuard } from "./navigate";
import {
  currentEntryKey,
  entryOrigin,
  isInternalHref,
  notePopNavigation,
  rememberCurrentEntry,
  resetNavigationMemory,
  settleArrival,
} from "./navigationMemory";

function setScroll(y: number): void {
  Object.defineProperty(window, "scrollY", { configurable: true, value: y });
}

beforeEach(() => {
  resetNavigationMemory();
  window.history.replaceState({}, "", "/clienti");
  document.body.innerHTML = "";
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 5000 });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  setScroll(0);
});

describe("navigation memory", () => {
  it("gives every entry a key and keeps it across replace", () => {
    const first = currentEntryKey();
    navigate("/clienti?client=c-1", "replace");
    expect(currentEntryKey()).toBe(first);
    navigate("/clienti/c-1");
    expect(currentEntryKey()).not.toBe(first);
  });

  it("starts a new page at the top with focus on its title", () => {
    document.body.innerHTML = '<main id="continut-principal" tabindex="-1"><h1>Nord Market</h1></main>';
    navigate("/clienti/c-1");
    settleArrival();
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
    expect(document.activeElement?.textContent).toBe("Nord Market");
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });

  it("restores the window and the register scroll when coming back", () => {
    document.body.innerHTML = '<section data-scroll-memory="registru" style="overflow:auto"></section>';
    const register = document.querySelector<HTMLElement>("[data-scroll-memory]")!;
    Object.defineProperty(register, "scrollHeight", { configurable: true, value: 2000 });
    Object.defineProperty(register, "clientHeight", { configurable: true, value: 500 });
    register.scrollTop = 640;
    setScroll(320);
    rememberCurrentEntry();
    const registryKey = currentEntryKey();
    navigate("/clienti/c-1");
    register.scrollTop = 0;
    // The browser moved back to the registry entry.
    window.history.replaceState({ workosKey: registryKey }, "", "/clienti");
    notePopNavigation();
    settleArrival();
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 320);
    expect(register.scrollTop).toBe(640);
  });

  it("does not inherit another section's scroll", () => {
    document.body.innerHTML = '<div data-section-top></div><div data-scroll-memory="sectiune-continut"></div>';
    const area = document.querySelector<HTMLElement>("[data-scroll-memory]")!;
    area.scrollTop = 300;
    const anchor = document.querySelector<HTMLElement>("[data-section-top]")!;
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({ top: -500 } as DOMRect);
    window.history.replaceState({}, "", "/lucrari/j-1?sectiune=fisiere");
    setScroll(900);
    navigate("/lucrari/j-1?sectiune=oameni");
    settleArrival();
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 400);
    expect(area.scrollTop).toBe(0);
  });
});

describe("navigation memory · client page continuity (N-018)", () => {
  it("starts a replaced section at that section, like a pushed one", () => {
    document.body.innerHTML = '<nav data-section-top></nav>';
    const anchor = document.querySelector<HTMLElement>("[data-section-top]")!;
    vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({ top: -300 } as DOMRect);
    window.history.replaceState({}, "", "/clienti/c-1");
    setScroll(700);
    const before = window.history.length;
    navigate("/clienti/c-1?sectiune=cereri", "replace");
    settleArrival();
    expect(window.history.length).toBe(before);
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 400);
  });

  it("keeps the origin across a replaced section, so the way back stays one step", () => {
    window.history.replaceState({}, "", "/clienti?client=c-1");
    navigate("/clienti/c-1");
    navigate("/clienti/c-1?sectiune=lucrari", "replace");
    expect(entryOrigin()).toEqual({ href: "/clienti?client=c-1", steps: 1 });
  });

  it("gives focus back to the control that led away when the reader comes back", () => {
    document.body.innerHTML = '<main id="continut-principal"><h1>Alpha</h1><a href="/cereri/r-1">Cererea</a></main>';
    const link = document.querySelector<HTMLAnchorElement>("a")!;
    link.focus();
    const hubKey = currentEntryKey();
    navigate("/cereri/r-1");
    document.body.innerHTML = '<main id="continut-principal"><h1>CER-1</h1></main>';
    settleArrival();
    expect(document.activeElement?.textContent).toBe("CER-1");
    // Back: the client page renders again with the same link.
    document.body.innerHTML = '<main id="continut-principal"><h1>Alpha</h1><a href="/cereri/r-1">Cererea</a></main>';
    window.history.replaceState({ workosKey: hubKey }, "", "/clienti/c-1");
    notePopNavigation();
    settleArrival();
    expect(document.activeElement?.textContent).toBe("Cererea");
  });

  it("brings the marked row into view after a push, keeping focus on the title", () => {
    document.body.innerHTML = '<main id="continut-principal"><h1>Clienți</h1><div data-arrival-target>Alpha</div></main>';
    const row = document.querySelector<HTMLElement>("[data-arrival-target]")!;
    const reveal = vi.fn();
    row.scrollIntoView = reveal;
    window.history.replaceState({}, "", "/clienti/c-1");
    navigate("/clienti?client=c-1");
    settleArrival();
    expect(reveal).toHaveBeenCalledWith({ block: "center", inline: "nearest" });
    expect(document.activeElement?.textContent).toBe("Clienți");
  });

  it("accepts only internal paths as a return context", () => {
    expect(isInternalHref("/clienti?client=c-1")).toBe(true);
    for (const href of ["https://example.com/x", "//example.com/x", "/\\example.com", "javascript:alert(1)", "clienti"]) {
      expect(isInternalHref(href)).toBe(false);
    }
    window.history.replaceState({ workosKey: "k", workosIndex: 1, workosFrom: "//example.com/x", workosFromIndex: 0 }, "", "/clienti/c-1");
    expect(entryOrigin()).toBeNull();
  });
});

describe("navigation memory · return to a Sedii card (N-020 etapa 7)", () => {
  const sitesPage =
    '<main id="continut-principal"><h1>Alpha</h1>' +
    '<a href="/clienti/c-1?sectiune=fotografii">Fotografii</a>' +
    '<a href="/clienti/c-1?sectiune=fotografii" data-row-id="site:s-1:Fotografii">Fotografii · 4 la Depozit</a></main>';

  it("comes back to the position the page had when the reader left, with focus on the card's link", () => {
    document.body.innerHTML = sitesPage;
    window.history.replaceState({}, "", "/clienti/c-1?sectiune=sedii");
    const sitesKey = currentEntryKey();
    // The reader stopped at 260; the link was below the screen, so it came into view (574) before the
    // click. The position that counts is the one at the moment of leaving.
    setScroll(260);
    setScroll(574);
    document.querySelector<HTMLElement>("[data-row-id]")!.focus();
    navigate("/clienti/c-1?sectiune=fotografii&sediu=s-1");
    document.body.innerHTML = '<main id="continut-principal"><h1>Alpha</h1></main>';
    settleArrival();
    setScroll(0);
    document.body.innerHTML = sitesPage;
    window.history.replaceState({ workosKey: sitesKey }, "", "/clienti/c-1?sectiune=sedii");
    notePopNavigation();
    settleArrival();
    expect(window.scrollTo).toHaveBeenLastCalledWith(0, 574);
    expect(document.activeElement?.getAttribute("data-row-id")).toBe("site:s-1:Fotografii");
  });
});

describe("navigation guard", () => {
  it("holds a navigation until the page lets it proceed", () => {
    let resume: (() => void) | null = null;
    const release = setNavigationGuard((_destination, proceed) => {
      resume = proceed;
      return true;
    });
    navigate("/lucrari");
    expect(window.location.pathname).toBe("/clienti");
    release();
    resume!();
    expect(window.location.pathname).toBe("/lucrari");
  });
});
