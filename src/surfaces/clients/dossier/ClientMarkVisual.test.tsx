import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-024 · the client's mark (N-023) in the dossier header: on the phone the logo or the monogram
 * sits beside the name, a long name still wraps, a logo that fails falls back to the monogram, and
 * the phone's sticky section bar, the actions and the way back stay as they were; desktop and
 * tablet keep their mark. The plate is one neutral tone in both themes (white and black logos).
 */
const LONG = "Producție Publicitară și Construcții Metalice Transilvania Nord-Vest SRL";
const LOGO = { revision: 1, contentHref: "/api/customers/cus-1/logo/content?revision=1", width: 320, height: 120 };

function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function viewport(mode: "desktop" | "tablet" | "phone") {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: mode === "phone" ? query.includes("max-width: 767px") : mode === "tablet" ? query.includes("min-width: 768px") : false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

function serve({ name = "Alpha Clima SRL", logo = LOGO as typeof LOGO | null } = {}) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    if (url.endsWith("/workspace")) {
      return json(200, {
        workspace: {
          customer: { customerId: "cus-1", displayName: name, status: "ACTIVE", statusLabel: "Activ", cui: "RO90000011", contactName: "Ana Pop", phone: "0700 000 111", email: null },
          canCreateRequest: true,
          logo,
          logoRevision: logo ? logo.revision : 0,
          summary: { requestCount: 0, openRequestCount: 0, quoteCount: 0, jobCount: 0, historicalWorkCount: 0, workCount: 0 },
          requests: [], quotes: [], jobs: [],
        },
      });
    }
    if (url.endsWith("/dossier")) {
      return json(200, { dossier: { customerId: "cus-1", permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true, editLogo: true }, vocabulary: { documentKinds: [], photoStages: [], historyStates: [], maxFileBytes: 1 }, sites: [], siteAssignments: [], documents: [], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] } } });
    }
    if (url.includes("/history")) return json(200, { history: { total: 0, page: 1, pageCount: 1, entries: [], totals: { entries: 0, projects: 0, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } });
    return json(404, {});
  }));
}

async function openPage(name = "Alpha Clima SRL") {
  window.history.replaceState({}, "", "/clienti/cus-1");
  render(<ClientDetailPage customerId="cus-1" search="" />);
  return screen.findByRole("heading", { level: 1, name });
}

const headerMark = () => document.querySelector(".cdh .cdh__main > .cdh__mono .client-mark");

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("client mark in the phone header (N-024)", () => {
  it("shows the logo beside the name, decorative, and not in the sticky section bar", async () => {
    viewport("phone");
    serve();
    const heading = await openPage();
    const mark = headerMark();
    expect(mark).not.toBeNull();
    expect(mark).toHaveAttribute("data-logo");
    expect(mark).toHaveAttribute("data-size", "large");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark?.querySelector("img")).toHaveAttribute("src", LOGO.contentHref);
    // The mark and the name share the identity row: the mark first, the name beside it.
    const main = heading.closest(".cdh__main");
    expect(main?.firstElementChild).toHaveClass("cdh__mono");
    expect(main?.contains(mark!)).toBe(true);
    // The phone section bar stays as it was: no mark there.
    expect(document.querySelector(".cdh-band .client-mark")).toBeNull();
    expect(document.querySelector(".cdh-phonenav")).not.toBeNull();
  });

  it("shows the monogram when the client has no logo", async () => {
    viewport("phone");
    serve({ logo: null });
    await openPage();
    const mark = headerMark();
    expect(mark).toHaveTextContent("AC");
    expect(mark).not.toHaveAttribute("data-logo");
    expect(mark?.querySelector("img")).toBeNull();
  });

  it("keeps a long name whole beside the mark", async () => {
    viewport("phone");
    serve({ name: LONG });
    const heading = await openPage(LONG);
    expect(heading).toHaveTextContent(LONG);
    expect(heading).toHaveAttribute("title", LONG);
    expect(heading.closest(".cdh")).toHaveAttribute("data-long-name");
    expect(headerMark()?.querySelector("img")).toHaveAttribute("src", LOGO.contentHref);
  });

  it("falls back to the monogram when the logo does not load", async () => {
    viewport("phone");
    serve();
    await openPage();
    fireEvent.error(headerMark()!.querySelector("img")!);
    expect(headerMark()).toHaveTextContent("AC");
    expect(headerMark()?.querySelector("img")).toBeNull();
  });

  it("leaves the way back, the status, the contact, the actions and Secțiunea · Schimbă in place", async () => {
    viewport("phone");
    serve();
    await openPage();
    expect(screen.getByRole("link", { name: /^Clienți · litera A · rândul Alpha Clima SRL/ })).toBeInTheDocument();
    expect(screen.getByText("Client activ")).toBeInTheDocument();
    expect(screen.getByText("CUI RO90000011")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Toate (1)" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Cerere nouă" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Alte acțiuni" })).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(nav).getByRole("button", { name: /Schimbă/ })).toBeInTheDocument();
    // One mark in the whole header: the identity row only.
    expect(document.querySelectorAll(".cdh .client-mark")).toHaveLength(1);
  });
});

describe("client mark on desktop and tablet (N-024, unchanged)", () => {
  it.each(["desktop", "tablet"] as const)("%s: the large mark beside the name, the band without one until it folds", async (mode) => {
    viewport(mode);
    serve();
    await openPage();
    expect(headerMark()?.querySelector("img")).toHaveAttribute("src", LOGO.contentHref);
    expect(headerMark()).toHaveAttribute("data-size", "large");
    expect(document.querySelectorAll(".cdh .client-mark")).toHaveLength(1);
    expect(document.querySelector(".cdh-band .client-mark")).toBeNull();
    expect(screen.getByRole("button", { name: "Alte acțiuni" })).toBeInTheDocument();
  });
});

describe("the mark's plate (N-024)", () => {
  // jsdom does no layout and ignores media queries, so these pin the rules themselves.
  function withSheet(file: string, run: () => void) {
    const style = document.createElement("style");
    style.textContent = readFileSync(file, "utf8");
    document.head.append(style);
    try {
      run();
    } finally {
      style.remove();
      document.documentElement.removeAttribute("data-resolved-theme");
    }
  }

  it("uses one mid-neutral plate in Lumină and Noapte, with an edge and an inner ring, the logo contained", () => {
    withSheet("src/styles/surfaces/client-mark.css", () => {
      const root = document.documentElement;
      const plate = () => getComputedStyle(root).getPropertyValue("--client-mark-plate").trim();
      const light = plate();
      root.setAttribute("data-resolved-theme", "dark");
      const night = plate();
      expect(light).toBe("#8c8780");
      expect(night).toBe(light);
      // Not the light plates that hid white logos.
      expect([light, night]).not.toContain("#ffffff");
      expect([light, night]).not.toContain("#f1eee8");

      // jsdom does not resolve var() in computed values: read the plate rule from the sheet.
      const sheet = [...document.styleSheets].at(-1)!;
      const plateRule = [...sheet.cssRules].find((rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && rule.selectorText.includes(".cagenda-mono.client-mark[data-logo]"))!;
      expect(plateRule.style.getPropertyValue("background")).toBe("var(--client-mark-plate)");
      expect(plateRule.style.getPropertyValue("border")).toContain("var(--client-mark-edge)");
      expect(plateRule.style.getPropertyValue("box-shadow")).toBe("inset 0 0 0 1px var(--client-mark-ring)");

      const mark = document.createElement("span");
      mark.className = "cagenda-mono client-mark";
      mark.setAttribute("data-logo", "");
      const image = document.createElement("img");
      mark.append(image);
      document.body.append(mark);
      try {
        expect(getComputedStyle(mark).display).toBe("block");
        expect(getComputedStyle(image).objectFit).toBe("contain");
      } finally {
        mark.remove();
      }
    });
  });

  it("gives the phone header a compact 44 px mark", () => {
    const css = readFileSync("src/styles/surfaces/client-dossier-header.css", "utf8");
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"), css.indexOf("@media (max-width: 379px)"));
    expect(phone).toMatch(/\.cdh__mono \.cagenda-mono\[data-size="large"\]\s*\{[^}]*width: 44px;[^}]*height: 44px;/);
    expect(phone).toMatch(/\.cdh__mono\s*\{[^}]*flex: none;/);
  });
});
