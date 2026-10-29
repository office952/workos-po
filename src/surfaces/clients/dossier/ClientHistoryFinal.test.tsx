import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invalidateResources, resetResourceCache } from "../../../data/resourceCache";
import { resourceKeys } from "../../../data/resourceKeys";
import { navigate } from "../../../routing/navigate";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 design final · stage 1 risk checks: two branches in different states, a quick change of
 * client, menus that close and give the focus back, a late or failing history that does not take
 * the rest of the page with it, the client without any activity (578:2874) and the actions of the
 * header that open their section ready (`actiune`, dropped from the address afterwards).
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const quote = (id: string, extra: Record<string, unknown> = {}) => ({
  quoteSnapshotId: id, kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay: "605,00", currency: "EUR",
  productCode: "P", productLabel: "Panou", reference: `OF-${id}`, inscription: "", customerDisplayName: "Alpha", stage: "QUOTE_CREATED", stageLabel: "Creată",
  createdAt: null, nextAction: "ACCEPT_QUOTE", nextActionLabel: "", needsAttention: false, attentionLabel: null, requestId: "r1", requestReference: "CER-1", orderSnapshotId: null, ...extra,
});

const workspace = (customerId: string) => ({
  workspace: {
    customer: { customerId, displayName: customerId === "cus-1" ? "Alpha Clima" : "Beta Print", status: "ACTIVE", statusLabel: "Activ", cui: "RO1", contactName: "Ana Pop", phone: "0700 000 111", email: null },
    canCreateRequest: true,
    summary: { requestCount: 1, openRequestCount: 1, quoteCount: 2, jobCount: 1, historicalWorkCount: 0, workCount: 1 },
    requests: [{ requestId: "r1", title: "Casetă", reference: "CER-1", customerId, status: "OPEN", statusLabel: "Nouă", needsAttention: false, attentionLabel: null }],
    quotes: [quote("q1", { stageLabel: "Cu comandă", orderSnapshotId: "o1" }), quote("q2", { needsAttention: true, attentionLabel: "Urmează acceptarea" })],
    jobs: [],
  },
});

let permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
const dossier = (customerId: string) => ({
  dossier: {
    customerId, permissions,
    vocabulary: { documentKinds: [{ value: "CONTRACT", label: "Contract" }], photoStages: [], historyStates: [], maxFileBytes: 1000 },
    sites: [], siteAssignments: [], documents: [], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
});

const project = (customerId: string) => ({
  entryId: `project:${customerId}`, kind: "PROJECT", title: customerId === "cus-1" ? "Casetă Alpha" : "Autocolant Beta", reference: null, eventDateLabel: "23 oct. 2026", year: 2026,
  state: null, stateLabel: "Ramuri în stări diferite", provenance: "WORKOS", provenanceLabel: "În WorkOS", site: null, siteAtTimeLabel: null, description: null,
  request: { requestId: "r1", reference: "CER-1", title: "Casetă", statusLabel: "Nouă" }, historicalWorkId: null, states: ["IN_EXECUTIE", "OFERTARE"],
  branches: [
    { branchId: "j1", state: "IN_EXECUTIE", stateLabel: "Execuție în curs", quote: { quoteSnapshotId: "q1", kind: "PRODUCT", productCode: "P", reference: "OF-q1", stageLabel: "Cu comandă", superseded: false }, orderSnapshotId: "o1", job: { jobId: "j1", stageLabel: "În lucru", progressLabel: "0 / 12 finalizate", productLabel: "Panou", inscription: "ALPHA" }, site: null },
    { branchId: "q2", state: "OFERTARE", stateLabel: "Ofertare", quote: { quoteSnapshotId: "q2", kind: "PRODUCT", productCode: "P", reference: "OF-q2", stageLabel: "Creată", superseded: false }, orderSnapshotId: null, job: null, site: null },
  ],
  documents: [], photoCount: 0, matchedOn: [],
});

const historyOf = (customerId: string, entries: unknown[], totalEntries = entries.length) => ({
  history: {
    total: entries.length, page: 1, pageCount: 1, entries,
    totals: { entries: totalEntries, projects: totalEntries, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 },
    facets: { years: [2026, 2021], yearCounts: [{ year: 2026, count: entries.length }, { year: 2021, count: 0 }], states: [], provenances: [{ provenance: "WORKOS", label: "În WorkOS", count: entries.length }], sites: [] },
  },
  customerId,
});

const ghimbav = {
  ...project("cus-1"),
  title: "Litere Ghimbav",
  year: 2021,
  eventDateLabel: "iun. 2021",
};

function yearHistory(customerId: string, entries: unknown[], yearCounts: Array<{ year: number; count: number }>) {
  return {
    history: {
      total: entries.length,
      page: 1,
      pageCount: 1,
      entries,
      totals: { entries: 5, projects: 5, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 },
      facets: {
        years: [2026, 2021],
        yearCounts,
        states: [],
        provenances: [{ provenance: "WORKOS", label: "În WorkOS", count: entries.length }],
        sites: [],
      },
    },
    customerId,
  };
}

/** Totals keep both years. A list filtered to 2026 does not contain „Ghimbav 2021”; the facet still counts 2021. */
function yearSearchReply(url: string, id: string) {
  if (!url.includes("/history")) return undefined;
  const params = new URL(url, "http://x").searchParams;
  if (params.get("pageSize") === "1") return json(200, yearHistory(id, [project(id)], [{ year: 2026, count: 4 }, { year: 2021, count: 2 }]));
  if (params.get("year") === "2026") return json(200, yearHistory(id, [], [{ year: 2026, count: 0 }, { year: 2021, count: 1 }]));
  if (params.get("q")?.includes("Ghimbav") || params.get("year") === "2021") return json(200, yearHistory(id, [ghimbav], [{ year: 2026, count: 0 }, { year: 2021, count: 1 }]));
  return undefined;
}

type Reply = (url: string, id: string) => Promise<unknown> | undefined;
let reply: Reply = () => undefined;

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
  sessionStorage.clear();
  permissions = { read: true, editSites: true, uploadDocuments: true, editDocuments: true, recordHistoricalWork: true, editCommercialTerms: true };
  reply = () => undefined;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    const id = decodeURIComponent(url.split("/api/customers/")[1]?.split("/")[0] ?? "");
    const custom = reply(url, id);
    if (custom) return custom;
    if (url.endsWith("/workspace")) return json(200, workspace(id));
    if (url.endsWith("/dossier")) return json(200, dossier(id));
    if (url.includes("/history")) return json(200, historyOf(id, [project(id)]));
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

describe("Istoric · design final, stage 1", () => {
  it("two branches in different states: both states, each offer and work once, in its own branch", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    const card = (await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" })).closest("article") as HTMLElement;
    // The mixed state is said, with each branch state; never reduced to the most advanced.
    expect(within(card).getByText("Ramuri în stări diferite")).toBeInTheDocument();
    expect(within(card).getByText("Execuție în curs")).toBeInTheDocument();
    expect(within(card).getByText("Ofertare")).toBeInTheDocument();
    // The server marks one of its offers: the card has the warm edge.
    expect(card).toHaveAttribute("data-attention", "true");
    await userEvent.click(within(card).getByRole("button", { name: /Extinde/ }));
    const expanded = (await screen.findByRole("button", { name: /Restrânge/ })).closest("article") as HTMLElement;
    const branches = within(within(expanded).getByRole("region", { name: "Oferte și lucrările lor" })).getAllByRole("listitem");
    expect(branches).toHaveLength(2);
    expect(within(branches[0]!).getByRole("link", { name: "Deschide oferta OF-q1" })).toBeInTheDocument();
    // The work's own state and progress, apart from the offer's tag (813:31490).
    expect(within(branches[0]!).getByRole("link", { name: "Lucrare · Execuție în curs · 0 / 12 finalizate →" })).toHaveAttribute("href", "/lucrari/j1");
    expect(within(branches[0]!).getByText("Cu comandă")).toBeInTheDocument();
    expect(branches[0]).not.toHaveAttribute("data-attention");
    expect(within(branches[1]!).getByRole("link", { name: "Deschide oferta OF-q2" })).toBeInTheDocument();
    expect(within(branches[1]!).getByText("Fără lucrare · oferta nu are comandă")).toBeInTheDocument();
    // Warm only where the server asks for attention, with the server's words.
    expect(within(branches[1]!).getByText("Urmează acceptarea")).toBeInTheDocument();
    expect(branches[1]).toHaveAttribute("data-attention", "true");
    expect(within(branches[1]!).queryByRole("link", { name: /^Lucrare · / })).toBeNull();
    // Restrânge keeps the search and the filters, and the focus goes back to Extinde.
    await userEvent.click(within(expanded).getByRole("button", { name: /Restrânge/ }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(screen.getByRole("button", { name: /Extinde/ })).toHaveFocus();
  });

  it("keeps the request's photos and documents apart from each work's (813:31490)", async () => {
    const link = (subjectId: string) => [{ kind: "JOB", kindLabel: "Lucrare", subjectId, label: "Lucrare" }];
    const file = (documentId: string, title: string, kind: string, kindLabel: string, links: unknown[], photoStage: string | null = null) => ({
      documentId, title, kind, kindLabel, photoStage, photoStageLabel: photoStage ? "Înainte" : null, documentNumber: photoStage ? null : "PV-1", documentDate: "2026-10-30",
      description: null, originalFileName: photoStage ? `${documentId}.png` : `${documentId}.pdf`, sizeBytes: 10, preview: photoStage ? "IMAGE" : "PDF",
      uploadedAt: "2026-10-30T10:00:00.000Z", revision: 1, links, viewHref: `/v/${documentId}`, downloadHref: `/d/${documentId}`,
    });
    reply = (url, id) =>
      url.includes("/history") && url.includes("pageSize=20")
        ? json(200, historyOf(id, [{ ...project(id), documents: [file("ph1", "Fațada", "PHOTO", "Fotografie", [], "BEFORE"), file("pv1", "PV predare parțială", "RECEPTION", "Proces-verbal", link("j1"))], photoCount: 1 }]))
        : undefined;
    window.history.replaceState({}, "", "/clienti/cus-1?deschis=project%3Acus-1");
    render(<Harness />);
    const expanded = (await screen.findByRole("button", { name: /Restrânge/ })).closest("article") as HTMLElement;
    // The request: its photo, and no file of its own (said, not left out).
    expect(within(expanded).getByText("Fotografiile cererii · 1 · Înainte")).toBeInTheDocument();
    expect(within(expanded).getByText("Documentele cererii · 0")).toBeInTheDocument();
    expect(within(expanded).getByText("Niciun fișier atașat")).toBeInTheDocument();
    // The work's PV under that work, named by its offer, its object and its own state; nowhere else.
    const works = within(expanded).getByRole("region", { name: "Documentele lucrărilor" });
    expect(within(works).getByText("Documentele lucrării · OF-q1 · Panou · ALPHA · Execuție în curs")).toBeInTheDocument();
    expect(within(works).getByText("PV predare parțială")).toBeInTheDocument();
    expect(within(expanded).getAllByText("PV predare parțială")).toHaveLength(1);
    // Only the work made from an order has a group: the offer without one has none.
    expect(within(works).queryByText(/OF-q2/)).toBeNull();
  });

  it("previews an offer over the list: Back closes it, the search and the open entry stay, the focus returns", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?q=caseta&deschis=project%3Acus-1");
    render(<Harness />);
    const opener = await screen.findByRole("button", { name: "Previzualizează oferta OF-q1" });
    await userEvent.click(opener);
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("oferta")).toBe("q1"));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("caseta");
    expect(new URLSearchParams(window.location.search).get("deschis")).toBe("project:cus-1");
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("oferta")).toBeNull());
    expect(window.location.search).toBe("?q=caseta&deschis=project%3Acus-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Previzualizează oferta OF-q1" })).toHaveFocus());
  });

  it("moves the focus to Restrânge only when the reader expands the entry, not when the address reopens it", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?deschis=project%3Acus-1");
    const view = render(<Harness />);
    const collapse = await screen.findByRole("button", { name: /Restrânge/ });
    // Reopened from the address (Back, a link, a refresh): the page keeps the focus it restores.
    expect(collapse).not.toHaveFocus();
    await userEvent.click(collapse);
    await userEvent.click(await screen.findByRole("button", { name: /Extinde/ }));
    expect(await screen.findByRole("button", { name: /Restrânge/ })).toHaveFocus();
    view.unmount();
  });

  it("Extinde and Restrânge keep the search and the filters in the address", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?q=caseta&provenienta=WORKOS");
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: /Extinde/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("deschis")).toBe("project:cus-1"));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("caseta");
    expect(new URLSearchParams(window.location.search).get("provenienta")).toBe("WORKOS");
    await userEvent.click(screen.getByRole("button", { name: /Restrânge/ }));
    await waitFor(() => expect(window.location.search).toBe("?q=caseta&provenienta=WORKOS"));
  });

  it("a quick change of client never shows the previous client's history", async () => {
    let releaseAlpha!: () => void;
    reply = (url, id) => {
      if (id === "cus-1" && url.includes("/history") && url.includes("pageSize=20")) {
        return new Promise((resolve) => { releaseAlpha = () => resolve(json(200, historyOf("cus-1", [project("cus-1")]))); });
      }
      return undefined;
    };
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await screen.findByRole("heading", { level: 1, name: "Alpha Clima" });
    act(() => navigate("/clienti/cus-2"));
    expect(await screen.findByRole("heading", { level: 4, name: "Autocolant Beta" })).toBeInTheDocument();
    await act(async () => releaseAlpha());
    await settle();
    expect(screen.getByRole("heading", { level: 1, name: "Beta Print" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 4, name: "Casetă Alpha" })).toBeNull();
  });

  it("a filter menu closes on choice and on Escape, and the focus goes back to its button", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" });
    const button = screen.getByRole("button", { name: "Proveniență" });
    await userEvent.click(button);
    const menu = screen.getByRole("list", { name: "Proveniență" });
    expect(within(menu).getByRole("button", { name: "Toate proveniențele" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("list", { name: "Proveniență" })).toBeNull();
    expect(button).toHaveFocus();
    await userEvent.click(button);
    await userEvent.click(within(screen.getByRole("list", { name: "Proveniență" })).getByRole("button", { name: /În WorkOS/ }));
    expect(screen.queryByRole("list", { name: "Proveniență" })).toBeNull();
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("provenienta")).toBe("WORKOS"));
    expect(screen.getByRole("button", { name: "Proveniență · În WorkOS" })).toHaveFocus();
  });

  it("sends „Ghimbav 2021” to the server as typed: no hidden year filter, no search in the page", async () => {
    const urls: string[] = [];
    reply = (url) => {
      urls.push(url);
      return undefined;
    };
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută în istoric" }), "Ghimbav 2021");
    await settle();
    expect(new URLSearchParams(window.location.search).get("q")).toBe("Ghimbav 2021");
    expect(new URLSearchParams(window.location.search).get("an")).toBeNull();
    const list = urls.filter((url) => url.includes("/history") && url.includes("pageSize=20")).at(-1) ?? "";
    expect(new URL(list, "http://x").searchParams.get("q")).toBe("Ghimbav 2021");
    expect(new URL(list, "http://x").searchParams.get("year")).toBeNull();
    // The page shows what the server returned; it does not filter the entries itself.
    expect(screen.getAllByRole("heading", { level: 4 }).map((heading) => heading.textContent)).toEqual(["Casetă Alpha"]);
  });

  it("explains a match on the card only, compactly, with the full list one keyboard step away", async () => {
    reply = (url, id) =>
      url.includes("/history") && url.includes("pageSize=20")
        ? json(200, historyOf(id, [{ ...project(id), matchedOn: ["Sediu", "Anul 2021", "Titlu", "Fotografie: A (2021)", "Fotografie: B (2021)", "Factură: F-1"] }]))
        : undefined;
    window.history.replaceState({}, "", "/clienti/cus-1?q=Ghimbav%202021&provenienta=WORKOS");
    render(<Harness />);
    const card = (await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" })).closest("article") as HTMLElement;
    // Above the list: the count, the text and the resets, not the fields.
    const line = screen.getByRole("status", { name: "" });
    expect(screen.getByText(/^1 din \d+ (intrare|intrări) pentru „Ghimbav 2021”$/)).toBeInTheDocument();
    expect(line.textContent ?? "").not.toMatch(/găsit în|Factură/);
    // On the card: one grouped line, from matchedOn only.
    expect(within(card).getByText(/^Potrivire:/).closest("p")?.textContent).toBe("Potrivire: sediu · anul 2021 · titlu · fotografii (2) · documente");
    const toggle = within(card).getByRole("button", { name: "Detalii potrivire" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    const before = window.location.search;
    toggle.focus();
    await userEvent.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveFocus();
    const list = within(card).getByRole("list", { name: "Unde s-a găsit textul" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Sediu", "Anul 2021", "Titlu", "Fotografie: A (2021)", "Fotografie: B (2021)", "Factură: F-1"]);
    // Opening and closing the details touches neither the address, nor the search, nor the filters.
    expect(window.location.search).toBe(before);
    expect((screen.getByRole("searchbox", { name: "Caută în istoric" }) as HTMLInputElement).value).toBe("Ghimbav 2021");
    await userEvent.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(card).queryByRole("list", { name: "Unde s-a găsit textul" })).toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("a search dims the years it does not reach, and typing keeps the focus in the field", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" });
    const box = screen.getByRole("searchbox", { name: "Caută în istoric" });
    await userEvent.type(box, "caseta");
    await settle();
    expect(box).toHaveFocus();
    expect(new URLSearchParams(window.location.search).get("q")).toBe("caseta");
    const rail = screen.getByRole("navigation", { name: "Salt la an" });
    expect(within(rail).getByRole("button", { name: /^2021 · niciun rezultat/ })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: /^2026/ })).toBeEnabled();
    expect(screen.getByRole("status", { name: "" })).toBeTruthy();
    expect(screen.getByText(/^1 din \d+ (intrare|intrări) pentru „caseta”$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Elimină căutarea „caseta”" }));
    await waitFor(() => expect(window.location.search).toBe(""));
  });

  it("filtered on a site (712:22460): the years count what the filter shows and De urmărit is not shown", async () => {
    // The unfiltered totals (pageSize=1) know 2026 · 5, 2025 · 2, 2021 · 1; the filtered list reaches 2026 only.
    reply = (url, id) => {
      if (url.includes("/history") && !url.includes("pageSize=20")) {
        const all = historyOf(id, [project(id)], 8);
        return json(200, { history: { ...all.history, facets: { ...all.history.facets, yearCounts: [{ year: 2026, count: 5 }, { year: 2025, count: 2 }, { year: 2021, count: 1 }] } } });
      }
      return undefined;
    };
    window.history.replaceState({}, "", "/clienti/cus-1?sediu=site%3A1");
    render(<Harness />);
    await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" });
    const rail = screen.getByRole("navigation", { name: "Salt la an" });
    expect(within(rail).getByRole("button", { name: /^2026/ })).toHaveTextContent("20261");
    expect(within(rail).getByRole("button", { name: /^2025 · niciun rezultat/ })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: /^2025/ })).toHaveTextContent("20252");
    expect(screen.queryByRole("region", { name: "De urmărit" })).toBeNull();
    // Removing the site chip (a deliberate reset) brings the client-wide situations back.
    await userEvent.click(screen.getByRole("button", { name: /^Elimină filtrul Sediu:/ }));
    await waitFor(() => expect(window.location.search).toBe(""));
    expect(await screen.findByRole("region", { name: "De urmărit" })).toBeInTheDocument();
  });

  it("a late or failing history leaves the header, the counts and De urmărit in place, and retries alone", async () => {
    let fail = true;
    reply = (url) => (url.includes("/history") && url.includes("pageSize=20") && fail ? json(503, {}) : undefined);
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    expect(await screen.findByText("Istoricul nu a putut fi citit")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Alpha Clima" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Cereri și oferte/ })).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri");
    expect(screen.getByRole("region", { name: "De urmărit" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Caută în istoric" })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("heading", { level: 4, name: "Casetă Alpha" })).toBeInTheDocument();
    expect(screen.queryByText("Istoricul nu a putut fi citit")).toBeNull();
  });

  it("a client without any activity (578:2874): no De urmărit, no search, the ways to start by permission", async () => {
    reply = (url, id) => {
      if (url.endsWith("/workspace")) return json(200, { workspace: { ...workspace(id).workspace, requests: [], quotes: [], jobs: [], summary: { requestCount: 0, openRequestCount: 0, quoteCount: 0, jobCount: 0, historicalWorkCount: 0, workCount: 0 } } });
      if (url.includes("/history")) return json(200, { history: { ...historyOf(id, []).history, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } });
      return undefined;
    };
    permissions = { ...permissions, uploadDocuments: false };
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    expect(await screen.findByText("Istoricul se completează singur pe măsură ce lucrezi cu acest client.")).toBeInTheDocument();
    expect(screen.getByText("Nicio activitate documentată încă")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "De urmărit" })).toBeNull();
    expect(screen.queryByRole("searchbox", { name: "Caută în istoric" })).toBeNull();
    const section = screen.getByRole("region", { name: "Istoric" });
    expect(within(section).getByRole("button", { name: "+ Cerere nouă" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Adaugă lucrare istorică" })).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Încarcă document" })).toBeNull();
  });

  it("Alte acțiuni · Încarcă document opens Documente with the upload started, then drops it from the address", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    render(<Harness />);
    await screen.findByRole("heading", { level: 1, name: "Alpha Clima" });
    await userEvent.click(await screen.findByRole("button", { name: "Alte acțiuni" }));
    await userEvent.click(within(screen.getByRole("list", { name: "Alte acțiuni" })).getByRole("button", { name: "Încarcă document" }));
    expect(await screen.findByRole("dialog", { name: /Încarcă document/ })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).toBe("?sectiune=documente"));
  });

  it("a search without a year leaves the years it reaches enabled and the others dimmed", async () => {
    reply = yearSearchReply;
    window.history.replaceState({}, "", "/clienti/cus-1?q=Ghimbav%202021");
    render(<Harness />);
    const rail = await screen.findByRole("navigation", { name: "Salt la an" });
    expect(within(rail).getByRole("button", { name: /^2021 · 1 intrare/ })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: /^2026 · niciun rezultat/ })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: /^2026/ })).toHaveTextContent("20264");
    expect(screen.queryByRole("button", { name: "Caută în toți anii" })).toBeNull();
    expect(await screen.findByRole("heading", { level: 4, name: "Litere Ghimbav" })).toBeInTheDocument();
  });

  it("a search with the matching year keeps that year and still dims the year it does not reach", async () => {
    reply = yearSearchReply;
    window.history.replaceState({}, "", "/clienti/cus-1?q=Ghimbav%202021&an=2021&provenienta=WORKOS");
    render(<Harness />);
    const rail = await screen.findByRole("navigation", { name: "Salt la an" });
    expect(within(rail).getByRole("button", { name: /^2021 · 1 intrare/ })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: /^2026 · niciun rezultat/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Caută în toți anii" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("an")).toBe("2021");
    expect(new URLSearchParams(window.location.search).get("provenienta")).toBe("WORKOS");
  });

  it("a conflicting year stays dimmed, and Caută în toți anii clears only the year", async () => {
    const urls: string[] = [];
    reply = (url, id) => {
      urls.push(url);
      return yearSearchReply(url, id);
    };
    window.history.replaceState({}, "", "/clienti/cus-1?q=pastrat");
    window.history.pushState({}, "", "/clienti/cus-1?q=Ghimbav%202021&an=2026&provenienta=WORKOS");
    const view = render(<Harness />);
    const rail = await screen.findByRole("navigation", { name: "Salt la an" });
    // 2026 is the selected year and has no match; 2021 is the year the search reaches.
    expect(within(rail).getByRole("button", { name: /^2026 · niciun rezultat/ })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: /^2021 · 1 intrare/ })).toBeEnabled();
    expect(within(rail).getByRole("button", { name: /^2021/ })).toHaveTextContent("20211");
    expect(screen.getByText("Nicio intrare nu conține textul căutat cu filtrele alese.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimină filtrul An: 2026" })).toBeInTheDocument();
    const recover = screen.getByRole("button", { name: "Caută în toți anii" });
    recover.focus();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("an")).toBeNull());
    const params = new URLSearchParams(window.location.search);
    expect(params.get("q")).toBe("Ghimbav 2021");
    expect(params.get("provenienta")).toBe("WORKOS");
    expect(screen.getByRole("searchbox", { name: "Caută în istoric" })).toHaveFocus();
    expect(await screen.findByRole("heading", { level: 4, name: "Litere Ghimbav" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Caută în toți anii" })).toBeNull();
    const list = urls.filter((url) => url.includes("/history") && url.includes("pageSize=20")).at(-1) ?? "";
    expect(new URL(list, "http://x").searchParams.get("year")).toBeNull();
    expect(new URL(list, "http://x").searchParams.get("q")).toBe("Ghimbav 2021");
    expect(new URL(list, "http://x").searchParams.get("provenance")).toBe("WORKOS");
    // Refresh reads the recovered address back.
    view.unmount();
    render(<Harness />);
    expect(await screen.findByRole("heading", { level: 4, name: "Litere Ghimbav" })).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("an")).toBeNull();
    expect((screen.getByRole("searchbox", { name: "Caută în istoric" }) as HTMLInputElement).value).toBe("Ghimbav 2021");
    // The recovery replaced the conflicting address, so Back returns to the previous one and Forward to the recovered search.
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    await waitFor(() => expect(window.location.search).toBe("?q=pastrat"));
    await act(async () => {
      window.history.forward();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("q")).toBe("Ghimbav 2021"));
    expect(new URLSearchParams(window.location.search).get("an")).toBeNull();
    expect(new URLSearchParams(window.location.search).get("provenienta")).toBe("WORKOS");
  });

  it("clicking the year the search reaches replaces only the conflicting year", async () => {
    reply = yearSearchReply;
    window.history.replaceState({}, "", "/clienti/cus-1?q=Ghimbav%202021&an=2026&provenienta=WORKOS");
    render(<Harness />);
    const rail = await screen.findByRole("navigation", { name: "Salt la an" });
    await userEvent.click(within(rail).getByRole("button", { name: /^2021 · 1 intrare/ }));
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("an")).toBe("2021"));
    expect(new URLSearchParams(window.location.search).get("q")).toBe("Ghimbav 2021");
    expect(new URLSearchParams(window.location.search).get("provenienta")).toBe("WORKOS");
    expect(await screen.findByRole("heading", { level: 4, name: "Litere Ghimbav" })).toBeInTheDocument();
  });

  it("does not offer Caută în toți anii when the search reaches no year", async () => {
    reply = (url, id) => {
      if (!url.includes("/history")) return undefined;
      const params = new URL(url, "http://x").searchParams;
      const counts = params.get("pageSize") === "1"
        ? [{ year: 2026, count: 4 }, { year: 2021, count: 2 }]
        : [{ year: 2026, count: 0 }, { year: 2021, count: 0 }];
      return json(200, yearHistory(id, [], counts));
    };
    window.history.replaceState({}, "", "/clienti/cus-1?q=nimic&an=2026&provenienta=WORKOS");
    render(<Harness />);
    const rail = await screen.findByRole("navigation", { name: "Salt la an" });
    expect(within(rail).getByRole("button", { name: /^2026 · niciun rezultat/ })).toBeDisabled();
    expect(within(rail).getByRole("button", { name: /^2021 · niciun rezultat/ })).toBeDisabled();
    expect(screen.getByText("Niciun rezultat")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Caută în toți anii" })).toBeNull();
    expect(screen.getByRole("button", { name: "Elimină filtrul An: 2026" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elimină filtrul Proveniență: În WorkOS" })).toBeInTheDocument();
  });

  it("on a phone, the jump row offers the year the search reaches and not the conflicting year", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }));
    reply = yearSearchReply;
    window.history.replaceState({}, "", "/clienti/cus-1?q=Ghimbav%202021&an=2026&provenienta=WORKOS");
    render(<Harness />);
    const jump = await screen.findByRole("group", { name: "Salt la an" });
    expect(within(jump).getByRole("button", { name: "Salt la 2021 · 1 intrare" })).toBeEnabled();
    expect(within(jump).queryByRole("button", { name: /2026/ })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Salt la an" })).toBeNull();
    const recover = screen.getByRole("button", { name: "Caută în toți anii" });
    recover.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(new URLSearchParams(window.location.search).get("an")).toBeNull());
    expect(new URLSearchParams(window.location.search).get("q")).toBe("Ghimbav 2021");
    expect(new URLSearchParams(window.location.search).get("provenienta")).toBe("WORKOS");
    expect(screen.getByRole("searchbox", { name: "Caută în istoric" })).toHaveFocus();
  });

  it("without the permission, an address with actiune does not open the form", async () => {
    permissions = { ...permissions, editSites: false };
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=sedii&actiune=adauga");
    render(<Harness />);
    await screen.findByRole("heading", { level: 1, name: "Alpha Clima" });
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => invalidateResources(resourceKeys.customerDossier("cus-1")));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
