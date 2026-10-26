import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { navigate } from "../../../routing/navigate";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 GO 10 · resetting a list on purpose ("no filters") is not a return to the section: the
 * remembered context must not come back. Restoring on a return (tab, link without parameters,
 * Back/Forward) keeps working, per client.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const workspace = (customerId: string) => ({
  workspace: {
    customer: { customerId, displayName: customerId === "cus-1" ? "Alpha" : "Beta", status: "ACTIVE" },
    canCreateRequest: true,
    summary: { requestCount: 0, openRequestCount: 0, quoteCount: 0, jobCount: 1, historicalWorkCount: 1, workCount: 2 },
    requests: [],
    quotes: [],
    jobs: [],
  },
});

const photo = {
  documentId: "d1", title: "Releveu", kind: "PHOTO", kindLabel: "Fotografie", photoStage: "BEFORE", photoStageLabel: "Înainte", documentNumber: null,
  documentDate: "2026-10-22", description: null, originalFileName: "r.png", sizeBytes: 1, preview: "IMAGE", uploadedAt: "2026-10-22T00:00:00.000Z",
  revision: 1, links: [], viewHref: "/v/d1", downloadHref: "/d/d1",
};

const dossier = (customerId: string) => ({
  dossier: {
    customerId,
    permissions: { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true },
    vocabulary: { documentKinds: [], photoStages: [{ value: "BEFORE", label: "Înainte" }, { value: "AFTER", label: "După montaj" }], historyStates: [], maxFileBytes: 1 },
    sites: [{ siteId: "site:1", name: "Depozit", address: null, city: null, contactName: null, phone: null, accessNotes: null, status: "ACTIVE", statusLabel: "Activ", revision: 1, usage: { requests: 0, jobs: 0, historicalWorks: 0, documents: 0 } }],
    siteAssignments: [], documents: [photo], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
});

const entry = {
  entryId: "project:r1", kind: "PROJECT", title: "Casetă", reference: null, eventDateLabel: "23 oct. 2026", year: 2026, state: "OFERTARE", stateLabel: "Ofertare",
  provenance: "WORKOS", provenanceLabel: "În WorkOS", site: { siteId: "site:1", name: "Depozit", line: "Depozit", active: true }, siteAtTimeLabel: null, description: null,
  request: null, historicalWorkId: null, states: ["OFERTARE"], branches: [], documents: [photo], photoCount: 1, matchedOn: [],
};

const history = {
  history: {
    total: 1, page: 1, pageCount: 1, entries: [entry],
    totals: { entries: 1, projects: 1, historicalWorks: 0, uploads: 0, documents: 0, photos: 1 },
    facets: {
      years: [2026, 2021], yearCounts: [{ year: 2026, count: 1 }, { year: 2021, count: 0 }],
      states: [{ state: "OFERTARE", label: "Ofertare", count: 1 }],
      provenances: [{ provenance: "WORKOS", label: "În WorkOS", count: 1 }, { provenance: "UPLOAD", label: "Document încărcat", count: 0 }],
      sites: [{ siteId: "site:1", name: "Depozit", active: true, count: 1 }],
    },
  },
};

const works = {
  works: { total: 0, page: 1, pageCount: 1, totals: { all: 2, workos: 1, historical: 1 }, facets: { years: [2026, 2021], states: [], sites: [{ siteId: "site:1", name: "Depozit", active: true }] }, items: [] },
};

let calls: string[] = [];

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
  calls = [];
  sessionStorage.clear();
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    calls.push(url);
    const id = decodeURIComponent(url.split("/api/customers/")[1]?.split("/")[0] ?? "");
    if (url.endsWith("/workspace")) return json(200, workspace(id));
    if (url.endsWith("/dossier")) return json(200, dossier(id));
    if (url.includes("/history")) return json(200, history);
    if (url.includes("/works")) return json(200, works);
    return json(404, {});
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 350)); });
const search = () => new URLSearchParams(window.location.search);
const tab = (name: RegExp) => within(screen.getByRole("navigation", { name: "Secțiuni client" })).getByRole("link", { name });
/** N-020 design final · a filter is cleared from its own menu ("Toate …"), which keeps the others. */
const ALL: Record<string, string> = { An: "Toți anii", Sediu: "Toate sediile", Stare: "Toate stările", Proveniență: "Toate proveniențele" };
async function clearFilter(title: string, value: string) {
  await userEvent.click(await screen.findByRole("button", { name: `${title} · ${value}` }));
  await userEvent.click(screen.getByRole("button", { name: ALL[title] }));
}
const lastList = (part: string) => calls.filter((url) => url.includes("/customers/cus-1/") && url.includes(part) && !url.includes("pageSize=1&") && !url.endsWith("pageSize=1")).at(-1) ?? "";

describe("Istoric · reset is not a return", () => {
  it("removing the last filter leaves the list without filters (the remembered UPLOAD does not come back)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?provenienta=UPLOAD");
    render(<Harness />);
    await clearFilter("Proveniență", "Document încărcat");
    await settle();
    expect(search().get("provenienta")).toBeNull();
    expect(screen.getByRole("button", { name: "Proveniență" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Proveniență · / })).toBeNull();
    expect(lastList("pageSize=20")).not.toContain("provenance=");
  });

  it("removing one filter keeps the others", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?provenienta=WORKOS&stare=OFERTARE");
    render(<Harness />);
    await clearFilter("Proveniență", "În WorkOS");
    await settle();
    expect(search().get("provenienta")).toBeNull();
    expect(search().get("stare")).toBe("OFERTARE");
  });

  it("Arată toate clears text, year and provenance, and stays cleared after a refresh", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?q=2021&an=2021&provenienta=UPLOAD");
    const view = render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: /^Arată to/ }));
    await settle();
    expect(window.location.search).toBe("");
    // Refresh: a new mount from the URL alone, with the same tab memory.
    view.unmount();
    resetResourceCache();
    render(<Harness />);
    await screen.findByRole("heading", { level: 4, name: "Casetă" });
    await settle();
    expect(window.location.search).toBe("");
    expect((screen.getByRole("searchbox", { name: "Caută în istoric" }) as HTMLInputElement).value).toBe("");
  });

  it("deleting the last searched text clears the search", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?q=casa");
    render(<Harness />);
    const box = (await screen.findByRole("searchbox", { name: "Caută în istoric" })) as HTMLInputElement;
    await userEvent.clear(box);
    await settle();
    await settle();
    expect(search().get("q")).toBeNull();
    expect(box.value).toBe("");
  });

  it("restores the context on a return to the section, and not after a reset", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?provenienta=UPLOAD");
    render(<Harness />);
    await screen.findByRole("button", { name: "Proveniență · Document încărcat" });
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
    await userEvent.click(tab(/^Istoric/));
    await waitFor(() => expect(search().get("provenienta")).toBe("UPLOAD"));
    // Now reset, leave and come back: nothing returns.
    await clearFilter("Proveniență", "Document încărcat");
    await settle();
    await userEvent.click(tab(/^Documente/));
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
    await userEvent.click(tab(/^Istoric/));
    await settle();
    expect(search().get("provenienta")).toBeNull();
  });

  it("Back after leaving the page shows the list as it was left: cleared stays cleared", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?provenienta=UPLOAD");
    render(<Harness />);
    await clearFilter("Proveniență", "Document încărcat");
    await settle();
    act(() => navigate("/cereri/req-1"));
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    await settle();
    expect(window.location.pathname).toBe("/clienti/cus-1");
    expect(search().get("provenienta")).toBeNull();
  });

  it("a reset on one client keeps the other client's remembered context", async () => {
    window.history.replaceState({}, "", "/clienti/cus-2?provenienta=WORKOS");
    render(<Harness />);
    await screen.findByRole("button", { name: "Proveniență · În WorkOS" });
    act(() => navigate("/clienti/cus-1?provenienta=UPLOAD"));
    await clearFilter("Proveniență", "Document încărcat");
    await settle();
    expect(search().get("provenienta")).toBeNull();
    act(() => navigate("/clienti/cus-2"));
    await waitFor(() => expect(search().get("provenienta")).toBe("WORKOS"));
  });
});

describe("Lucrări and Fotografii · back to all", () => {
  it("Lucrări: Toți anii and Toate sediile clear the year and the site", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari&an=2021&sediu=site%3A1");
    render(<Harness />);
    await screen.findByText("2 lucrări · 1 în WorkOS · 1 istorice", { exact: false }).catch(() => undefined);
    // N-020 etapa 4 (644:13352): An and Sediu are menus; "Toți anii" clears only the year.
    await userEvent.click(await screen.findByRole("button", { name: /^An · 2021/ }));
    await userEvent.click(within(screen.getByRole("list", { name: "An" })).getByRole("button", { name: "Toți anii" }));
    await settle();
    expect(search().get("an")).toBeNull();
    expect(search().get("sediu")).toBe("site:1");
    // Choosing the active site again clears it.
    await userEvent.click(screen.getByRole("button", { name: /^Sediu · / }));
    await userEvent.click(within(screen.getByRole("list", { name: "Sediu" })).getByRole("button", { name: /Depozit/ }));
    await settle();
    expect(window.location.search).toBe("?sectiune=lucrari");
  });

  it("Fotografii: Toate etapele and removing the year clear them and stay cleared", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=fotografii&etapa=BEFORE&an=2026");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: /^Etapă/ }));
    await userEvent.click(within(screen.getByRole("list", { name: "Etapă" })).getByRole("button", { name: "Toate etapele" }));
    await settle();
    expect(search().get("etapa")).toBeNull();
    expect(search().get("an")).toBe("2026");
    await userEvent.click(screen.getByRole("button", { name: /^An/ }));
    await userEvent.click(within(screen.getByRole("list", { name: "An" })).getByRole("button", { name: /^2026/ }));
    await settle();
    expect(window.location.search).toBe("?sectiune=fotografii");
  });
});
