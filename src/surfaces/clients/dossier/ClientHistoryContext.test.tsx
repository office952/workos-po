import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { navigate } from "../../../routing/navigate";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 review: the Istoric search context (text, filters, page) survives a change of section,
 * Back/Forward and a refresh, and stays separate between two clients.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const workspace = (customerId: string, displayName: string) => ({
  workspace: {
    customer: { customerId, displayName, status: "ACTIVE" },
    canCreateRequest: true,
    summary: { requestCount: 0, openRequestCount: 0, requestNeedsAction: 0, quoteCount: 0, quoteNeedsAction: 0, jobCount: 0, jobNeedsAction: 0 },
    requests: [],
    quotes: [],
    jobs: [],
  },
});

const dossier = (customerId: string) => ({
  dossier: {
    customerId,
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [], photoStages: [], historyStates: [], maxFileBytes: 1 },
    sites: [],
    siteAssignments: [],
    documents: [],
    historicalWorks: [],
    linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
});

const history = (page: number) => ({
  history: {
    total: 25,
    page,
    pageCount: 3,
    entries: [],
    facets: { years: [2026, 2021], yearCounts: [{ year: 2026, count: 20 }, { year: 2021, count: 5 }], states: [{ state: "FINALIZAT", label: "Finalizată", count: 1 }], sites: [] },
    // The client has 25 entries in all (the list itself is not under test here).
    totals: { entries: 25, projects: 0, historicalWorks: 0, documents: 0, photos: 0 },
  },
});

let historyCalls: string[] = [];
/** The list requests of the Istoric section (the client page also reads the unfiltered totals for its tabs). */
const listCalls = () => historyCalls.filter((url) => url.includes("/customers/cus-1/") && url.includes("pageSize=20"));

/** The app passes the current location to the client page and re-renders on popstate; so does this harness. */
function Harness() {
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    const update = () => setLocation(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  const customerId = decodeURIComponent(location.split("?")[0]?.split("/")[2] ?? "");
  return <ClientDetailPage key={customerId} customerId={customerId} search={window.location.search} />;
}

beforeEach(() => {
  historyCalls = [];
  sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);
      const id = decodeURIComponent(url.split("/api/customers/")[1]?.split("/")[0] ?? "");
      if (url.endsWith("/workspace")) return json(200, workspace(id, id === "cus-1" ? "Alpha" : "Beta"));
      if (url.endsWith("/dossier")) return json(200, dossier(id));
      if (url.includes("/history")) {
        historyCalls.push(url);
        const page = Number(new URL(url, "http://x").searchParams.get("page") ?? "1");
        return json(200, history(page));
      }
      return json(404, {});
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function typeSearch(text: string) {
  const box = await screen.findByRole("searchbox", { name: "Caută în istoric" });
  await userEvent.type(box, text);
  await waitFor(() => expect(window.location.search).toContain(`q=${text}`), { timeout: 2000 });
}

const searchbox = () => screen.findByRole("searchbox", { name: "Caută în istoric" }) as Promise<HTMLInputElement>;
const tab = (name: RegExp) => within(screen.getByRole("navigation", { name: "Secțiuni client" })).getByRole("link", { name });

describe("Istoric search context", () => {
  it("survives a change of section: search 2021, open Documente, come back to Istoric", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=istoric");
    render(<Harness />);
    await typeSearch("2021");
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
    await userEvent.click(tab(/^Istoric/));
    expect((await searchbox()).value).toBe("2021");
    expect(window.location.search).toContain("q=2021");
    await waitFor(() => expect(listCalls().at(-1)).toContain("q=2021"));
  });

  it("restores text, filters and page with Back/Forward and on refresh, without resetting the page", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=istoric");
    const view = render(<Harness />);
    await typeSearch("2021");
    // N-020 design final · the year is a filter menu (An ▾ · 2021).
    await userEvent.click(await screen.findByRole("button", { name: "An" }));
    await userEvent.click(within(screen.getByRole("list", { name: "An" })).getByRole("button", { name: /^2021/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Mai vechi →" }));
    await waitFor(() => expect(window.location.search).toContain("pagina=2"));
    // Leave to another page, then Back.
    act(() => navigate("/cereri/req-1"));
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    expect((await searchbox()).value).toBe("2021");
    expect(await screen.findByRole("button", { name: "An · 2021" })).toBeInTheDocument();
    await waitFor(() => expect(listCalls().at(-1)).toMatch(/q=2021.*year=2021.*page=2/));
    // Refresh: a new mount from the URL alone keeps page 2.
    const url = `${window.location.pathname}${window.location.search}`;
    view.unmount();
    resetResourceCache();
    historyCalls = [];
    window.history.replaceState({}, "", url);
    render(<Harness />);
    expect((await searchbox()).value).toBe("2021");
    await waitFor(() => expect(listCalls()[0]).toMatch(/page=2/));
    // A manual filter change resets the page on purpose.
    await userEvent.click(await screen.findByRole("button", { name: "An · 2021" }));
    await userEvent.click(screen.getByRole("button", { name: "Toți anii" }));
    await waitFor(() => expect(window.location.search).not.toContain("pagina="));
  });

  it("keeps the context of each client apart", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=istoric");
    render(<Harness />);
    await typeSearch("2021");
    await userEvent.click(tab(/^Documente/));
    act(() => navigate("/clienti/cus-2?sectiune=istoric"));
    expect((await searchbox()).value).toBe("");
    await typeSearch("beta");
    act(() => navigate("/clienti/cus-1?sectiune=documente"));
    await screen.findByRole("navigation", { name: "Secțiuni client" });
    await userEvent.click(tab(/^Istoric/));
    expect((await searchbox()).value).toBe("2021");
  });
});
