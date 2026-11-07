import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { presentRequestOverview } from "../adapters/requestAdapter";
import { resetResourceCache, writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { RequestsPage } from "./RequestsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

type Handlers = Record<string, () => Promise<unknown>>;

function respond(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

function stubRequests(requests: unknown[], summary?: unknown, extra: Handlers = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/requests")) return respond(200, { overview: summary ? { summary, requests } : { requests } });
      const match = Object.keys(extra).find((key) => url.endsWith(key));
      return match ? extra[match]!() : respond(200, {});
    }),
  );
}

const journey = (partial: Record<string, unknown> = {}) => ({
  offerSummary: { count: 0, awaitingCustomer: 0, acceptedWithoutOrder: 0, ordered: 0, declined: 0, notPursued: 0, superseded: 0, undecided: 0, summaryLabel: "Fără ofertă" },
  actionable: [],
  waiting: [],
  actionableCount: 0,
  waitingCount: 0,
  orderCount: 0,
  nextAction: "OPEN_REQUEST",
  nextActionLabel: "Deschide cererea",
  nextActionHref: null,
  needsAttention: false,
  attentionLabel: null,
  phase: "NEW",
  phaseLabel: "Nouă",
  phaseAt: null,
  administrativeNote: null,
  ...partial,
});

const manyRequests = (length: number) => Array.from({ length }, (_, index) => ({
  requestId: `page-${index + 1}`,
  title: `Cerere ${String(index + 1).padStart(2, "0")}`,
  reference: `CER-PAGE-${index + 1}`,
  status: "NEW",
  statusLabel: "Nouă",
  createdAt: new Date(Date.UTC(2026, 9, 6, 12) - index * 60_000).toISOString(),
  needsAttention: index % 2 === 0,
  nextAction: "OPEN_REQUEST",
  journey: journey({ needsAttention: index % 2 === 0 }),
}));

const pageStatus = () => within(screen.getByRole("navigation", { name: "Paginare cereri" })).getByRole("status");
const dataRows = () => Array.from(document.querySelectorAll<HTMLElement>("tr[data-row-id]"));
const titles = () => dataRows().map((row) => within(row).getAllByRole("link")[0]!.textContent);

describe("RequestsPage", () => {
  it("paginates all results with correct boundaries and resets page size", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Cerere 01" });
    expect(dataRows()).toHaveLength(10);
    expect(pageStatus()).toHaveTextContent("1–10 din 23 cereri");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Următor" }));
    expect(screen.getByRole("link", { name: "Cerere 11" })).toBeInTheDocument();
    expect(pageStatus()).toHaveTextContent("11–20 din 23 cereri");
    await user.click(screen.getByRole("button", { name: "Următor" }));
    expect(dataRows()).toHaveLength(3);
    expect(pageStatus()).toHaveTextContent("21–23 din 23 cereri");
    expect(screen.getByRole("button", { name: "Pagina 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Următor" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(pageStatus()).toHaveTextContent("11–20 din 23 cereri");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pe pagină" }), "20");
    expect(dataRows()).toHaveLength(20);
    expect(pageStatus()).toHaveTextContent("1–20 din 23 cereri");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pe pagină" }), "50");
    expect(dataRows()).toHaveLength(23);
    expect(screen.getByRole("button", { name: "Următor" })).toBeDisabled();
  });

  it("groups entries by day on a time axis without giving up the title and client", async () => {
    stubRequests([
      { requestId: "a", title: "Caseta recepție", reference: "CER-A", customerDisplayName: "Quartz Clinic", statusLabel: "Nouă", createdAt: "2026-10-22T09:15:00Z", nextAction: "OPEN_REQUEST" },
      { requestId: "b", title: "Meniu luminos", reference: "CER-B", customerDisplayName: "Meadow Café", statusLabel: "Nouă", createdAt: "2026-10-21T09:15:00Z", nextAction: "OPEN_REQUEST" },
    ]);
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Caseta recepție" });
    const days = screen.getAllByRole("rowheader");
    expect(days).toHaveLength(2);
    expect(days[0]).toHaveTextContent(/22\.10\.2026/);
    expect(days[0]).toHaveTextContent("1 intrare");
    const row = dataRows()[0]!;
    expect(within(row).getByText("Quartz Clinic · CER-A")).toBeInTheDocument();
    expect(row.querySelector("time")).toHaveAttribute("dateTime", "2026-10-22T09:15:00Z");
  });

  it("counts the preparation trays from the server summary and filters by request status", async () => {
    stubRequests(
      [
        { requestId: "n", title: "Nouă", status: "NEW", statusLabel: "Nouă", createdAt: "2026-10-01T10:00:00Z", nextAction: "OPEN_REQUEST" },
        { requestId: "w", title: "La client", status: "WAITING_CUSTOMER", statusLabel: "Așteaptă clientul", createdAt: "2026-10-02T10:00:00Z", nextAction: "OPEN_REQUEST" },
      ],
      { total: 2, needsAttention: 0, newCount: 1, inReview: 0, waitingCustomer: 1, readyForQuote: 0, blocked: 0 },
    );
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "La client" });
    const trays = screen.getByRole("group", { name: "Tăvi de pregătire: filtru pe starea cererii" });
    expect(within(trays).getByRole("button", { name: "Noi: 1" })).toBeInTheDocument();
    expect(within(trays).getByRole("button", { name: "Blocate: 0" })).toBeInTheDocument();
    await user.click(within(trays).getByRole("button", { name: "Așteaptă clientul: 1" }));
    expect(titles()).toEqual(["La client"]);
    await user.click(within(trays).getByRole("button", { name: "Așteaptă clientul: 1" }));
    expect(titles()).toHaveLength(2);
  });

  it("does not count the trays from the list when the server sends no summary", async () => {
    stubRequests(manyRequests(3));
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Cerere 01" });
    const trays = screen.getByRole("group", { name: "Tăvi de pregătire: filtru pe starea cererii" });
    expect(within(trays).getByRole("button", { name: "Noi: —" })).toBeInTheDocument();
  });

  it("searches beyond the current page and applies sort and attention before pagination", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Cerere 01" });
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    await user.type(screen.getByRole("searchbox", { name: "Caută" }), "Cerere 02");
    expect(pageStatus()).toHaveTextContent("1–1 din 1 cereri");
    expect(screen.getByRole("button", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
    await user.clear(screen.getByRole("searchbox", { name: "Caută" }));
    await user.click(screen.getByRole("button", { name: "Pagina 2" }));
    await user.click(screen.getByRole("button", { name: /Ordine/ }));
    expect(titles()[0]).toBe("Cerere 23");
    expect(screen.getByRole("button", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Pagina 2" }));
    await user.click(screen.getByRole("button", { name: /De rezolvat/ }));
    expect(pageStatus()).toHaveTextContent("1–10 din 12 cereri");
  });

  it("clamps a page when the refreshed collection shrinks and removes pagination when empty", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Cerere 01" });
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    act(() => writeResource(resourceKeys.requests(), presentRequestOverview({ overview: { requests: manyRequests(4) } })));
    expect(pageStatus()).toHaveTextContent("1–4 din 4 cereri");
    expect(screen.getByRole("button", { name: "Următor" })).toBeDisabled();
    act(() => writeResource(resourceKeys.requests(), presentRequestOverview({ overview: { requests: manyRequests(23) } })));
    expect(pageStatus()).toHaveTextContent("1–10 din 23 cereri");
    act(() => writeResource(resourceKeys.requests(), presentRequestOverview({ overview: { requests: [] } })));
    expect(screen.queryByRole("navigation", { name: "Paginare cereri" })).not.toBeInTheDocument();
  });

  it("sorts chronologically in both directions and keeps unknown dates last", async () => {
    stubRequests([
      { requestId: "old", title: "Veche", statusLabel: "Nouă", createdAt: "2026-09-01T10:00:00Z", nextAction: "OPEN_REQUEST" },
      { requestId: "unknown", title: "Fără dată", statusLabel: "Nouă", createdAt: "invalid", nextAction: "OPEN_REQUEST" },
      { requestId: "new", title: "Recentă", statusLabel: "Nouă", createdAt: "2026-10-01T10:00:00Z", nextAction: "OPEN_REQUEST" },
    ]);
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Recentă" });
    expect(titles()).toEqual(["Recentă", "Veche", "Fără dată"]);
    await userEvent.setup().click(screen.getByRole("button", { name: /Ordine/ }));
    expect(titles()).toEqual(["Veche", "Recentă", "Fără dată"]);
    expect(screen.getByRole("button", { name: /Ordine/ })).toHaveTextContent("Cele mai vechi");
  });

  it("combines attention and search and resets a filtered empty result", async () => {
    stubRequests([
      { requestId: "a", title: "Litere", customerDisplayName: "Nord", statusLabel: "Nouă", nextAction: "OPEN_REQUEST", journey: journey({ needsAttention: true }) },
      { requestId: "b", title: "Totem", customerDisplayName: "Nord", statusLabel: "Nouă", nextAction: "OPEN_REQUEST", journey: journey() },
    ]);
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Litere" });
    await user.click(screen.getByRole("button", { name: /De rezolvat/ }));
    await user.type(screen.getByRole("searchbox", { name: "Caută" }), "Totem");
    expect(screen.getByText("Nicio cerere nu corespunde filtrului.")).toBeInTheDocument();
    expect(screen.getByText("0 din 2")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Resetează filtrele/ }));
    expect(screen.getByRole("searchbox", { name: "Caută" })).toHaveValue("");
    expect(screen.getByRole("searchbox", { name: "Caută" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Totem" })).toBeInTheDocument();
    expect(pageStatus()).toHaveTextContent("1–2 din 2 cereri");
  });

  it("does not present a failed load as an empty registry", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Offline"))));
    render(<RequestsPage />);
    expect((await screen.findAllByRole("alert")).some((node) => node.textContent?.includes("Cererile nu au putut fi citite"))).toBe(true);
    expect(screen.queryByRole("link", { name: "Alege produs" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nu există cereri")).not.toBeInTheDocument();
  });

  it("shows zero counts and the request entry point for a successfully empty registry", async () => {
    stubRequests([], { total: 0, needsAttention: 0, newCount: 0, inReview: 0, waitingCustomer: 0, readyForQuote: 0, blocked: 0 });
    render(<RequestsPage />);
    expect(await screen.findByText("Nu există cereri")).toBeInTheDocument();
    expect(screen.getByText("0 din 0")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Creează o cerere" })).toHaveAttribute("href", "/cereri/noua");
    expect(screen.getByRole("link", { name: "Cerere nouă" })).toHaveAttribute("href", "/cereri/noua");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the server's commercial phase and offer summary, with the administrative status only as a note", async () => {
    stubRequests([
      {
        requestId: "req-3", title: "Caseta", reference: "CER-C4D4C0E8", customerId: "cus-2", customerDisplayName: "NORD MARKET DEMO SRL",
        status: "WAITING_CUSTOMER", statusLabel: "Așteaptă clientul", createdAt: "2026-09-21T19:27:00.000Z", nextAction: "OPEN_REQUEST",
        journey: journey({
          phase: "OPEN",
          phaseLabel: "Deschisă",
          administrativeNote: "Administrativ: așteaptă clientul",
          offerSummary: { count: 1, awaitingCustomer: 1, acceptedWithoutOrder: 0, ordered: 0, declined: 0, notPursued: 0, superseded: 0, undecided: 0, summaryLabel: "1 ofertă · 1 așteaptă clientul" },
        }),
      },
      {
        requestId: "req-4", title: "Încheiată", status: "IN_REVIEW", statusLabel: "În analiză", createdAt: "2026-09-20T19:27:00.000Z", nextAction: "OPEN_REQUEST",
        journey: journey({ phase: "CLOSED", phaseLabel: "Încheiată comercial", phaseAt: "2026-10-04T10:00:00.000Z" }),
      },
    ]);
    render(<RequestsPage />);
    const row = (await screen.findByRole("link", { name: "Caseta" })).closest("tr")!;
    expect(within(row).getByText("Deschisă")).toHaveAttribute("data-phase", "OPEN");
    expect(within(row).getByText("Administrativ: așteaptă clientul")).toBeInTheDocument();
    expect(within(row).getByText("1 ofertă · 1 așteaptă clientul")).toBeInTheDocument();
    const other = screen.getByRole("link", { name: "Încheiată" }).closest("tr")!;
    expect(within(other).getByText("Încheiată comercial · 04.10")).toBeInTheDocument();
    expect(within(other).getByText("Fără ofertă")).toBeInTheDocument();
  });

  it("filters on the server's commercial counts and journey, not on the administrative status", async () => {
    stubRequests(
      [
        { requestId: "a", title: "Cu obligație", statusLabel: "Nouă", nextAction: "OPEN_REQUEST", journey: journey({ phase: "OPEN", needsAttention: true, offerSummary: { count: 1, awaitingCustomer: 0, acceptedWithoutOrder: 1, ordered: 0, declined: 0, notPursued: 0, superseded: 0, undecided: 0, summaryLabel: "1 ofertă · 1 acceptată fără comandă" } }) },
        { requestId: "b", title: "Fără ofertă încă", statusLabel: "Nouă", nextAction: "OPEN_REQUEST", journey: journey() },
        { requestId: "c", title: "Închisă", statusLabel: "Nouă", nextAction: "OPEN_REQUEST", journey: journey({ phase: "CLOSED", phaseLabel: "Încheiată comercial", offerSummary: { count: 1, awaitingCustomer: 0, acceptedWithoutOrder: 0, ordered: 0, declined: 1, notPursued: 0, superseded: 0, undecided: 0, summaryLabel: "1 ofertă · 1 refuzată" } }) },
      ],
      { total: 3, needsAttention: 1, noOffer: 1, commerciallyOpen: 2, commerciallyClosed: 1, newCount: 3, inReview: 0, waitingCustomer: 0, readyForQuote: 0, blocked: 0, cancelled: 0 },
    );
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Cu obligație" });
    await user.click(screen.getByRole("button", { name: /De rezolvat/ }));
    expect(titles()).toEqual(["Cu obligație"]);
    await user.click(screen.getByRole("button", { name: /Fără ofertă/ }));
    expect(titles()).toEqual(["Fără ofertă încă"]);
    await user.click(screen.getByRole("button", { name: /Încheiate/ }));
    expect(titles()).toEqual(["Închisă"]);
  });

  it("selects into the URL, supports Enter and Space, and reads the slip's offers independently", async () => {
    window.history.replaceState({}, "", "/cereri");
    let fail = true;
    stubRequests(manyRequests(3), undefined, {
      "/api/requests/page-2": () => (fail ? respond(503, {}) : respond(200, {
        request: {
          requestId: "page-2", title: "Cerere 02", reference: "CER-PAGE-2", description: "", customerId: "cus-1", statusLabel: "Nouă", nextAction: "OPEN_REQUEST",
        },
        linkedOffers: [{ quoteSnapshotId: "q-9", kind: "PRODUCT", kindLabel: "Produs", productCode: "P", productLabel: "Panou", reference: "OF-9", stageLabel: "Creată", superseded: false }],
      })),
    });
    const user = userEvent.setup();
    const { rerender } = render(<RequestsPage search="" />);
    const row = await screen.findByRole("row", { name: "Previzualizează cererea Cerere 02" });
    row.focus();
    await user.keyboard("{Enter}");
    expect(window.location.search).toBe("?cerere=page-2");
    rerender(<RequestsPage search="?cerere=page-2" />);
    const slip = screen.getByRole("article", { name: "Bonul de intrare: Cerere 02" });
    expect(await within(slip).findByText("Ofertele legate nu au putut fi citite")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cerere 01" })).toBeInTheDocument();
    fail = false;
    await user.click(within(slip).getByRole("button", { name: "Reîncearcă" }));
    expect(await within(slip).findByRole("link", { name: "OF-9" })).toHaveAttribute("href", "/oferte?oferta=q-9");
    screen.getByRole("row", { name: "Previzualizează cererea Cerere 03" }).focus();
    await user.keyboard(" ");
    expect(window.location.search).toBe("?cerere=page-3");
  });

  it("opens request identity while the journey's OPEN_QUOTE opens the named offer", async () => {
    const item = { kind: "CONFIRM_ORDER", key: "offer:q-1", quoteSnapshotId: "q-1", quoteKind: "PRODUCT", productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06", assemblyId: null, title: "Confirmarea comenzii", detail: "", hint: null, actionLabel: "Confirmă comanda", href: "/quotes/q-1", action: "OPEN_QUOTE" };
    stubRequests([
      {
        requestId: "req-1", title: "Litere vitrină", reference: "CRQ-104", customerId: "cus-1", customerDisplayName: "Atelier Nord",
        statusLabel: "Gata de ofertă", createdAt: "2026-09-01T10:00:00.000Z", nextAction: "OPEN_QUOTE",
        journey: journey({ phase: "OPEN", nextAction: "OPEN_QUOTE", nextActionLabel: "Confirmă comanda", nextActionHref: "/quotes/q-1", actionable: [item], actionableCount: 1, needsAttention: true }),
      },
    ]);
    render(<RequestsPage />);
    expect(await screen.findByRole("link", { name: "Litere vitrină" })).toHaveAttribute("href", "/cereri/req-1");
    expect(screen.getByText("Atelier Nord · CRQ-104")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Confirmă comanda/ })).toHaveAttribute("href", "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1");
  });

  it("preserves customer and request context for CHOOSE_PRODUCT", async () => {
    stubRequests([
      { requestId: "req-2", title: "Litere", reference: "CRQ-105", customerId: "cus-9", customerDisplayName: "Client Nord", statusLabel: "Gata de ofertă", createdAt: "2026-09-01T10:00:00.000Z", nextAction: "CHOOSE_PRODUCT", journey: journey({ nextAction: "CHOOSE_PRODUCT", nextActionLabel: "Alege produsul" }) },
    ]);
    render(<RequestsPage />);
    expect(await screen.findByRole("link", { name: /Alege produsul/ })).toHaveAttribute("href", "/cereri/req-2?alege-produs=1#alege-produs");
    expect(screen.getByRole("link", { name: "Litere" })).toHaveAttribute("href", "/cereri/req-2");
  });

  it("only opens the request when the server sent no journey", async () => {
    stubRequests([
      { requestId: "req-3", title: "Caseta", statusLabel: "Nouă", createdAt: "2026-09-21T19:27:00.000Z", nextAction: "OPEN_QUOTE", nextActionLabel: "Deschide oferta", nextActionHref: "/quotes/qts%3AP%3Aabc" },
    ]);
    render(<RequestsPage />);
    expect(await screen.findByRole("link", { name: "Caseta" })).toHaveAttribute("href", "/cereri/req-3");
    expect(screen.queryByRole("link", { name: /Deschide oferta/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Deschide cererea/ })).toHaveAttribute("href", "/cereri/req-3");
  });

  it("keeps search and filters when the register is shown again", async () => {
    stubRequests(manyRequests(3));
    const { unmount } = render(<RequestsPage />);
    await userEvent.setup().type(await screen.findByLabelText("Caută"), "Cerere 02");
    unmount();
    render(<RequestsPage />);
    expect(await screen.findByLabelText("Caută")).toHaveValue("Cerere 02");
  });
});

/** Mirrors App: the page receives the live search string, also on Back/Forward. */
function Routed() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return <RequestsPage search={search} />;
}

function phone() {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query === "(max-width: 1151px)" || query === "(max-width: 767px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })));
}

async function popTo(href: string) {
  await act(async () => {
    window.history.pushState({}, "", href);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}

describe("RequestsPage page and selection context", () => {
  it("restores the page left when the register is shown again", async () => {
    window.history.replaceState({}, "", "/cereri");
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    const { unmount } = render(<Routed />);
    await screen.findByRole("link", { name: "Cerere 01" });
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    expect(pageStatus()).toHaveTextContent("21–23 din 23 cereri");
    unmount();
    render(<Routed />);
    await screen.findByRole("link", { name: "Cerere 21" });
    expect(pageStatus()).toHaveTextContent("21–23 din 23 cereri");
    expect(screen.getByRole("button", { name: "Pagina 3" })).toHaveAttribute("aria-current", "page");
  });

  it("shows the page that holds a directly linked request, and lets the page be changed by hand afterwards", async () => {
    window.history.replaceState({}, "", "/cereri?cerere=page-21");
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<Routed />);
    const row = await screen.findByRole("row", { name: "Previzualizează cererea Cerere 21" });
    expect(row).toHaveAttribute("data-selected");
    expect(pageStatus()).toHaveTextContent("21–23 din 23 cereri");
    await user.click(screen.getByRole("button", { name: "Pagina 1" }));
    expect(pageStatus()).toHaveTextContent("1–10 din 23 cereri");
    expect(window.location.search).toBe("?cerere=page-21");
  });

  it("follows the selection on Back and Forward", async () => {
    window.history.replaceState({}, "", "/cereri?cerere=page-2");
    stubRequests(manyRequests(23));
    render(<Routed />);
    await screen.findByRole("link", { name: "Cerere 02" });
    await popTo("/cereri?cerere=page-15");
    expect(screen.getByRole("row", { name: "Previzualizează cererea Cerere 15" })).toHaveAttribute("data-selected");
    expect(pageStatus()).toHaveTextContent("11–20 din 23 cereri");
    await act(async () => {
      window.history.back();
      await new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
    });
    expect(screen.getByRole("row", { name: "Previzualizează cererea Cerere 02" })).toHaveAttribute("data-selected");
    expect(pageStatus()).toHaveTextContent("1–10 din 23 cereri");
  });

  it("on the phone restores the opener's page before returning focus to it", async () => {
    phone();
    window.history.replaceState({}, "", "/cereri");
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<Routed />);
    const opener = await screen.findByRole("button", { name: "Deschide dosarul cererii Cerere 10" });
    await user.click(opener);
    const dialog = await screen.findByRole("dialog", { name: "Bonul de intrare al cererii" });
    await user.click(within(dialog).getByRole("button", { name: "Cererea următoare" }));
    expect(window.location.search).toBe("?cerere=page-11");
    expect(pageStatus()).toHaveTextContent("11–20 din 23 cereri");
    await user.click(within(dialog).getByRole("button", { name: "Registru" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement?.getAttribute("data-row-id")).toBe("page-10"));
    expect(pageStatus()).toHaveTextContent("1–10 din 23 cereri");
  });

  it("falls back to a present row when the opener disappeared from the data", async () => {
    phone();
    window.history.replaceState({}, "", "/cereri");
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<Routed />);
    await user.click(await screen.findByRole("button", { name: "Deschide dosarul cererii Cerere 10" }));
    const dialog = await screen.findByRole("dialog", { name: "Bonul de intrare al cererii" });
    // The refreshed register no longer holds the opener (Cerere 10).
    act(() => writeResource(resourceKeys.requests(), presentRequestOverview({ overview: { requests: manyRequests(23).filter((item) => item.requestId !== "page-10") } })));
    await user.click(within(dialog).getByRole("button", { name: "Registru" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(document.activeElement?.hasAttribute("data-row-id") || document.activeElement?.getAttribute("type") === "search").toBe(true));
  });

  it("still resets the page on purpose when filters, sort or page size change", async () => {
    window.history.replaceState({}, "", "/cereri");
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<Routed />);
    await screen.findByRole("link", { name: "Cerere 01" });
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    await user.click(screen.getByRole("button", { name: /De rezolvat/ }));
    expect(screen.getByRole("button", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: /De rezolvat/ }));
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    await user.click(screen.getByRole("button", { name: /Ordine/ }));
    expect(screen.getByRole("button", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Pagina 2" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Pe pagină" }), "20");
    expect(pageStatus()).toHaveTextContent("1–20 din 23 cereri");
  });
});
