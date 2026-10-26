import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../../../data/resourceCache";
import { navigate } from "../../../routing/navigate";
import { ClientDetailPage } from "../../ClientDetailPage";

/**
 * N-020 · etapa 3 · Cereri și oferte (Corecții GO 17, 640:11188 – 640:11942; previzualizare
 * 668:15454): the mode and "În așteptare" apart, a reset that stays a reset, no context crossing
 * clients, and an offer preview that shows only what the server gives.
 */
function json(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

const request = (customerId: string, id: string, title: string) => ({
  requestId: id, title, reference: `CER-${id}`, customerId, customerDisplayName: "Alpha", status: "NEW", statusLabel: "Nouă", contextLabel: null,
  commercialProgress: null, createdAt: "2026-10-23T10:00:00.000Z", nextAction: "OPEN_REQUEST", nextActionLabel: "", nextActionHref: null,
  needsAttention: false, attentionLabel: null, linkedQuoteSnapshotId: null, linkedQuoteProductCode: null, linkedAssemblyId: null,
});
const quote = (id: string, requestId: string, extra: Record<string, unknown> = {}) => ({
  quoteSnapshotId: id, kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false, grossDisplay: "750,20", currency: "EUR",
  productCode: "P", productLabel: "Panou ACM casetat", reference: `OF-${id}`, inscription: "ALPHA DEPOZIT", customerDisplayName: "Alpha", stage: "QUOTE_CREATED",
  stageLabel: "Creată", createdAt: "2026-10-24T03:36:16.699Z", nextAction: "ACCEPT_QUOTE", nextActionLabel: "", needsAttention: false, attentionLabel: null,
  requestId, requestReference: `CER-${requestId}`, orderSnapshotId: null, ...extra,
});
const waiting = { needsAttention: true, attentionLabel: "Urmează acceptarea" };

const workspaces: Record<string, unknown> = {
  "cus-1": {
    customer: { customerId: "cus-1", displayName: "Alpha Clima", status: "ACTIVE", statusLabel: "Activ" },
    canCreateRequest: true,
    summary: { requestCount: 2, openRequestCount: 2, quoteCount: 3, jobCount: 0, historicalWorkCount: 0, workCount: 0 },
    requests: [request("cus-1", "a", "Casetă depozit"), request("cus-1", "b", "Litere recepție")],
    quotes: [quote("q1", "a", waiting), quote("q2", "a", waiting), quote("q3", "b", { stage: "ORDER_CREATED", stageLabel: "Cu comandă", orderSnapshotId: "o3" })],
    jobs: [],
  },
  // A request of December 2025 answered in January 2026, and an offer of 2024 without a request.
  "cus-3": {
    customer: { customerId: "cus-3", displayName: "Gamma Ani", status: "ACTIVE", statusLabel: "Activ" },
    canCreateRequest: true,
    summary: { requestCount: 1, openRequestCount: 1, quoteCount: 2, jobCount: 0, historicalWorkCount: 0, workCount: 0 },
    requests: [{ ...request("cus-3", "dec", "Firmă decembrie"), createdAt: "2025-12-18T09:00:00.000Z" }],
    quotes: [quote("jan", "dec", { createdAt: "2026-01-12T09:00:00.000Z" }), quote("solo", "", { requestId: null, requestReference: null, createdAt: "2024-05-02T09:00:00.000Z" })],
    jobs: [],
  },
  "cus-2": {
    customer: { customerId: "cus-2", displayName: "Beta Print", status: "ACTIVE", statusLabel: "Activ" },
    canCreateRequest: true,
    summary: { requestCount: 1, openRequestCount: 1, quoteCount: 1, jobCount: 0, historicalWorkCount: 0, workCount: 0 },
    requests: [request("cus-2", "z", "Autocolant Beta")],
    quotes: [quote("q9", "z")],
    jobs: [],
  },
};

const dossier = (customerId: string) => ({
  dossier: {
    customerId,
    permissions: { read: true, editSites: false, uploadDocuments: false, editDocuments: false, recordHistoricalWork: false, editCommercialTerms: false },
    vocabulary: { documentKinds: [], photoStages: [], historyStates: [], maxFileBytes: 1000 },
    sites: [{ siteId: "s1", name: "Depozit Ghimbav", status: "ACTIVE", statusLabel: "Activ", revision: 1, usage: { requests: 1, jobs: 0, historicalWorks: 0, documents: 0 } }],
    siteAssignments: [{ subjectKind: "REQUEST", subjectId: "a", siteId: "s1" }],
    documents: [], historicalWorks: [], linkTargets: { requests: [], jobs: [], historicalWorks: [], sites: [] },
  },
});

const snapshot = {
  quoteSnapshot: {
    quoteSnapshotId: "q1", productCode: "P", productLabel: "Panou ACM casetat", inscription: "ALPHA DEPOZIT", lines: [],
    // The owner's internal figures come with it; the preview must never show them.
    commercial: { netPrice: 620, vatPercent: 21, vatAmount: 130.2, grossPrice: 750.2, currency: "EUR", completeness: "COMPLETE", unavailableReasons: [], internalCost: 190.24, marginAmount: 429.76 },
  },
};
const envelope = {
  quote: quote("q1", "a", waiting),
  quoteSnapshot: { truth: { measurements: [
    { label: "Lățime exterioară", value: 2800, unit: "mm", confirmed: true },
    { label: null, value: 320000, unit: "mm2", confirmed: true },
    { label: "Înălțime neconfirmată", value: 700, unit: "mm", confirmed: false },
  ] } },
  acceptance: null,
};

let envelopeFails = false;

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

const search = () => new URLSearchParams(window.location.search);
const tab = (name: RegExp) => screen.getAllByRole("link", { name }).find((link) => link.classList.contains("cdh-tab"))!;

beforeEach(() => {
  sessionStorage.clear();
  envelopeFails = false;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
    const url = String(input);
    const id = decodeURIComponent(url.split("/api/customers/")[1]?.split("/")[0] ?? "");
    if (url.endsWith("/workspace")) return json(200, { workspace: workspaces[id] });
    if (url.endsWith("/dossier")) return json(200, dossier(id));
    if (url.includes("/history")) {
      return json(200, { customerId: id, history: { total: 0, page: 1, pageCount: 1, entries: [], totals: { entries: 0, projects: 0, historicalWorks: 0, uploads: 0, documents: 0, photos: 0 }, facets: { years: [], yearCounts: [], states: [], provenances: [], sites: [] } } });
    }
    if (url.includes("/quote-snapshots/q1")) return json(200, snapshot);
    if (url.endsWith("/api/quotes/q1")) return envelopeFails ? json(500, { error: "unavailable" }) : json(200, envelope);
    return json(404, {});
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("Cereri și oferte · Afișare and În așteptare apart (659:14083)", () => {
  it("keeps the filter across modes and the mode when the filter goes; a reset stays a reset", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&atentie=1");
    const view = render(<Harness />);
    const page = await screen.findByRole("region", { name: "Cereri și oferte" });
    expect(within(page).getByRole("button", { name: "În așteptare · 2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(page).getByText("1 din 2 cereri · 2 oferte în așteptare")).toBeInTheDocument();
    expect(within(page).getByText("Filtru: În așteptare")).toBeInTheDocument();
    expect(within(page).getByText("1 cerere nu are oferte în așteptare: CER-b.")).toBeInTheDocument();
    // Toate ofertele: the filter stays (640:11942).
    await userEvent.click(within(page).getByRole("button", { name: "Toate ofertele · 3 oferte" }));
    await waitFor(() => expect(search().get("selectie")).toBe("oferte"));
    expect(search().get("atentie")).toBe("1");
    expect(within(page).getByText("2 din 3 oferte")).toBeInTheDocument();
    expect(within(page).getByText("Filtru: În așteptare")).toBeInTheDocument();
    // ✕: the filter goes, the mode stays; the bar says the whole list again.
    await userEvent.click(within(page).getByRole("button", { name: "Elimină filtrul În așteptare" }));
    await waitFor(() => expect(search().get("atentie")).toBeNull());
    expect(search().get("selectie")).toBe("oferte");
    expect(within(page).getAllByText("Toate cele 3 oferte").length).toBeGreaterThan(0);
    expect(within(page).queryByRole("list", { name: "Filtre active" })).toBeNull();
    // Refresh and a return by the tab keep the reset.
    view.unmount();
    resetResourceCache();
    render(<Harness />);
    expect(await screen.findByRole("button", { name: "Toate ofertele · 3 oferte" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "În așteptare · 2" })).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Cereri și oferte/));
    await waitFor(() => expect(search().get("selectie")).toBe("oferte"));
    expect(search().get("atentie")).toBeNull();
  });

  it("brings the whole context back by the tab: the search, the mode and every filter, not only the text", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&selectie=oferte&q=panou&an=2026&atentie=1");
    render(<Harness />);
    await screen.findByRole("button", { name: "Toate ofertele · 3 oferte" });
    await userEvent.click(tab(/^Istoric/));
    await waitFor(() => expect(search().get("sectiune")).toBeNull());
    await userEvent.click(tab(/^Cereri și oferte/));
    await waitFor(() => expect(search().get("sectiune")).toBe("cereri"));
    expect(search().get("q")).toBe("panou");
    expect(search().get("an")).toBe("2026");
    expect(search().get("selectie")).toBe("oferte");
    expect(search().get("atentie")).toBe("1");
  });

  it("reads the year of the request in Pe cereri and of the offer in Toate ofertele, keeping the chosen year across modes", async () => {
    window.history.replaceState({}, "", "/clienti/cus-3?sectiune=cereri&an=2025&q=panou");
    const view = render(<Harness />);
    const page = await screen.findByRole("region", { name: "Cereri și oferte" });
    // Anul cererii 2025: the December request, whole, with its January offer.
    expect(await within(page).findByRole("button", { name: "Anul cererii · 2025" })).toBeInTheDocument();
    expect(within(page).getByRole("heading", { level: 3, name: "Firmă decembrie" })).toBeInTheDocument();
    expect(within(page).getByRole("link", { name: "Deschide oferta OF-jan" })).toBeInTheDocument();
    expect(within(page).getByText("Anul cererii: 2025")).toBeInTheDocument();
    expect(within(page).getByText("1 ofertă fără cerere nu are an al cererii; apare în Toate ofertele.")).toBeInTheDocument();

    // Toate ofertele: the same 2025, now the offer's year — no offer of 2025, and the year stays, removable.
    await userEvent.click(within(page).getByRole("button", { name: "Toate ofertele · 2 oferte" }));
    await waitFor(() => expect(search().get("selectie")).toBe("oferte"));
    expect(search().get("an")).toBe("2025");
    expect(search().get("q")).toBe("panou");
    const yearButton = within(page).getByRole("button", { name: "Anul ofertei · 2025" });
    expect(within(page).getByText("Nicio cerere sau ofertă pentru „panou”")).toBeInTheDocument();
    expect(within(page).getByText("Anul ofertei: 2025")).toBeInTheDocument();
    await userEvent.click(yearButton);
    const menu = within(page).getByRole("list", { name: "Anul ofertei" });
    expect(within(menu).getAllByRole("button").map((option) => option.textContent)).toEqual(["Toți anii", "20261", "20250", "20241"]);
    await userEvent.click(within(menu).getAllByRole("button").find((option) => option.textContent === "20261")!);
    await waitFor(() => expect(search().get("an")).toBe("2026"));
    expect(within(page).getByRole("link", { name: "Deschide oferta OF-jan" })).toBeInTheDocument();

    // Back to Pe cereri: 2026 is a request year with no request — kept, said, and removable.
    await userEvent.click(within(page).getByRole("button", { name: "Pe cereri · 1 cerere" }));
    await waitFor(() => expect(search().get("selectie")).toBeNull());
    expect(search().get("an")).toBe("2026");
    expect(within(page).getByRole("button", { name: "Anul cererii · 2026" })).toBeInTheDocument();
    await userEvent.click(within(page).getByRole("button", { name: "Elimină filtrul Anul cererii: 2026" }));
    await waitFor(() => expect(search().get("an")).toBeNull());
    expect(search().get("q")).toBe("panou");

    // The reset survives a refresh and a return by the tab.
    view.unmount();
    resetResourceCache();
    render(<Harness />);
    expect(await screen.findByRole("button", { name: "Anul cererii" })).toBeInTheDocument();
    await userEvent.click(tab(/^Istoric/));
    await userEvent.click(tab(/^Cereri și oferte/));
    await waitFor(() => expect(search().get("sectiune")).toBe("cereri"));
    expect(search().get("an")).toBeNull();
    expect(search().get("q")).toBe("panou");
  });

  it("never carries one client's mode or filter to another client", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&selectie=oferte&atentie=1");
    render(<Harness />);
    await screen.findByRole("button", { name: "Toate ofertele · 3 oferte" });
    act(() => navigate("/clienti/cus-2?sectiune=cereri"));
    const page = await screen.findByRole("region", { name: "Cereri și oferte" });
    await waitFor(() => expect(within(page).getByRole("heading", { level: 3, name: "Autocolant Beta" })).toBeInTheDocument());
    expect(within(page).getByRole("button", { name: "Pe cereri · 1 cerere" })).toHaveAttribute("aria-pressed", "true");
    expect(within(page).getByRole("button", { name: "În așteptare · 0" })).toHaveAttribute("aria-pressed", "false");
    expect(within(page).queryByText(/Casetă depozit/)).toBeNull();
  });
});

describe("Cereri și oferte · previzualizarea ofertei (668:15454)", () => {
  it("shows the server's price, the labelled measurements and the work, never the internal figures", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&oferta=q1");
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "Oferta OF-q1" });
    expect(await within(dialog).findByText("620,00 EUR")).toBeInTheDocument();
    expect(within(dialog).getByText("TVA 21%")).toBeInTheDocument();
    expect(within(dialog).getByText("130,20 EUR")).toBeInTheDocument();
    expect(within(dialog).getByText("750,20 EUR")).toBeInTheDocument();
    expect(await within(dialog).findByText("2800 mm")).toBeInTheDocument();
    // An unlabelled or unconfirmed measurement is not named here (the domain names it, in the PDF).
    expect(within(dialog).queryByText(/mm2/)).toBeNull();
    expect(within(dialog).queryByText("Înălțime neconfirmată")).toBeNull();
    expect(within(dialog).queryByText(/190/)).toBeNull();
    expect(within(dialog).queryByText(/429/)).toBeNull();
    expect(within(dialog).queryByText(/marj/i)).toBeNull();
    expect(within(dialog).getByText("pentru CER-a · Casetă depozit · ⌖ Depozit Ghimbav")).toBeInTheDocument();
    expect(within(dialog).getByText("Încă nu: oferta nu are comandă.")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Deschide oferta completă →" })).toHaveAttribute("href", "/quotes/P/q1");
    expect(within(dialog).getByRole("link", { name: "Deschide cererea →" })).toHaveAttribute("href", "/cereri/a");
  });

  it("keeps a failed read inside the preview, with its own retry; the list behind stays", async () => {
    envelopeFails = true;
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&oferta=q1");
    render(<Harness />);
    const dialog = await screen.findByRole("dialog", { name: "Oferta OF-q1" });
    expect(await within(dialog).findByText("Dimensiunile ofertei nu au putut fi citite.")).toBeInTheDocument();
    // The price read separately is there; the list behind is untouched.
    expect(await within(dialog).findByText("620,00 EUR")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Casetă depozit" })).toBeInTheDocument();
    envelopeFails = false;
    await userEvent.click(within(dialog).getByRole("button", { name: "Reîncearcă" }));
    expect(await within(dialog).findByText("2800 mm")).toBeInTheDocument();
  });
});
