import { useEffect, useState } from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateResources, readResource, resetResourceCache } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { ClientDetailPage } from "./ClientDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function workspace(customerId: string, displayName: string, extras: Record<string, unknown> = {}) {
  return {
    workspace: {
      customer: {
        customerId,
        displayName,
        status: "ACTIVE",
        city: extras.city ?? "Cluj",
      },
      canCreateRequest: true,
      summary: {
        requestCount: Array.isArray(extras.requests) ? extras.requests.length : 0,
        openRequestCount: 0,
        requestNeedsAction: 0,
        quoteCount: 0,
        quoteNeedsAction: 0,
        jobCount: 0,
        jobNeedsAction: 0,
      },
      requests: extras.requests ?? [],
      quotes: extras.quotes ?? [],
      jobs: extras.jobs ?? [],
    },
  };
}

describe("ClientDetailPage", () => {
  it("does not present false zero counts while the client loads", async () => {
    let release!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => new Promise((resolve) => { if (String(input).endsWith("/workspace")) release = resolve; })));
    render(<ClientDetailPage customerId="cus-1" />);
    const sections = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(sections).getByRole("link", { name: "Istoric" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Cereri și oferte" })).toBeInTheDocument();
    expect(screen.queryByText(/0 cereri/)).toBeNull();
    await waitFor(() => expect(release).toBeTypeOf("function"));
    await act(async () => release(await jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    // R1 (846:32109) · short labels: the counts are in each view, never in the navigation.
    expect(within(sections).getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Cereri și oferte" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri");
    expect(within(sections).queryByText(/0 cereri|0 oferte/)).toBeNull();
  });
  it.each([401, 403])("hides an already loaded client after a %i refresh", async (status) => {
    const fetchMock = vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord")));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { name: "Atelier Nord" });
    await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
    fetchMock.mockImplementation(() => jsonResponse(status, { error: "denied" }));
    act(() => invalidateResources(resourceKeys.customerWorkspace("cus-1")));
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atelier Nord" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerere nouă" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readResource(resourceKeys.customerWorkspace("cus-1")).data).toBeUndefined();
  });

  it("explains stale data after a temporary refresh failure and retries", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord")));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { name: "Atelier Nord" });
    fetchMock.mockImplementation(() => jsonResponse(503, {}));
    act(() => invalidateResources(resourceKeys.customerWorkspace("cus-1")));
    expect(await screen.findByText(/Datele afișate sunt de la ultima citire reușită/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerere nouă" })).not.toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(200, workspace("cus-1", "Atelier actualizat")));
    // The first "Reîncearcă" is the client's (the history below has its own).
    await userEvent.click(screen.getAllByRole("button", { name: "Reîncearcă" })[0]!);
    expect(await screen.findByRole("heading", { name: "Atelier actualizat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerere nouă" })).toBeInTheDocument();
  });

  it("does not offer request creation for a retired client", async () => {
    const payload = workspace("cus-1", "Atelier Nord");
    payload.workspace.customer.status = "RETIRED";
    payload.workspace.canCreateRequest = false;
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, payload)));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { name: "Atelier Nord" });
    expect(screen.queryByRole("button", { name: "Cerere nouă" })).not.toBeInTheDocument();
  });
  it("keeps the object workspace and local sections", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/customers/cus-1/workspace")) {
          return jsonResponse(200, workspace("cus-1", "Atelier Nord"));
        }
        return jsonResponse(200, {});
      }),
    );

    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Atelier Nord" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const sections = screen.getByRole("navigation", { name: "Secțiuni client" });
    // N-020 design final (574:2203) · Istoric first, then Cereri și oferte as a section of its own.
    expect(within(sections).getAllByRole("link").map((link) => link.textContent)).toEqual(["Istoric", "Cereri și oferte", "Lucrări", "Documente", "Fotografii", "Sedii", "Date comerciale"]);
    expect(within(sections).getByRole("link", { name: "Istoric" })).toHaveAttribute("aria-current", "page");
    // Sections without a source are not in the tabs.
    expect(within(sections).queryByRole("link", { name: /Portofoliu|Fișiere|Relație/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
  });

  it.each([
    ["/clienti/cus-1?sectiune=prezentare", "istoric"],
    ["/clienti/cus-1?sectiune=prezentare&cerere=req-1", "cereri"],
    ["/clienti/cus-1?cerere=req-1", "cereri"],
  ])("opens a former Relație link %s on its equivalent section (N-020)", async (href, section) => {
    window.history.replaceState({}, "", href);
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
    const { container } = render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    expect(container.querySelector("[data-surface='client-hub']")).toHaveAttribute("data-section", section);
  });

  it("changes section by replacing the history entry, so Back leaves the page (N-018)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord", { requests: [{ requestId: "req-1", title: "Firmă", customerId: "cus-1", statusLabel: "Nouă" }] }))));
    function Live() {
      const [search, setSearch] = useState(window.location.search);
      useEffect(() => {
        const sync = () => setSearch(window.location.search);
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
      }, []);
      return <ClientDetailPage customerId="cus-1" search={search} />;
    }
    render(<Live />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    const before = window.history.length;
    await userEvent.click(screen.getByRole("link", { name: /^Cereri și oferte/ }));
    expect(window.location.search).toBe("?sectiune=cereri");
    expect(await screen.findByRole("region", { name: "Cereri și oferte" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Cereri și oferte/ })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("link", { name: "Lucrări" }));
    expect(window.location.search).toBe("?sectiune=lucrari");
    expect(window.history.length).toBe(before);
  });

  it("marks with a dot only the sections the server flags; the navigation carries no counts (R1)", async () => {
    const payload = workspace("cus-1", "Atelier Nord", {
      quotes: [{ quoteSnapshotId: "q1", productCode: "LIT", reference: "OF-1", requestId: "req-1", needsAttention: true, attentionLabel: "Urmează acceptarea", superseded: false }],
      jobs: [{ jobId: "j1", requestId: "req-1", needsAttention: false, stage: "EXECUTION_IN_PROGRESS", stageLabel: "În lucru", productLabel: "Litere" }],
    });
    Object.assign(payload.workspace.summary, { requestCount: 3, openRequestCount: 2, quoteCount: 2, jobCount: 1, historicalWorkCount: 2, workCount: 3 });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, payload)));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    const sections = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(sections).getByRole("link", { name: "Cereri și oferte · necesită atenție" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri");
    // A work in execution is normal activity: no dot on Lucrări.
    expect(within(sections).getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Istoric" })).toHaveAttribute("href", "/clienti/cus-1");
    expect(within(sections).queryByText(/\d/)).toBeNull();
  });

  it("shows the contacts that exist next to the name and groups the missing ones in one line (N-018)", async () => {
    const payload = workspace("cus-1", "Atelier Nord");
    Object.assign(payload.workspace.customer, { cui: "RO123", contactName: "Ana Pop", phone: "0700 000 111", email: null, address: null });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, payload)));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    // N-020 design final (574:2203) · the status next to the name, then "CUI · localitate".
    expect(screen.getByText("Client activ")).toBeInTheDocument();
    expect(screen.getByText("CUI RO123 · Cluj")).toBeInTheDocument();
    // The principal contact in its own column; the full list and the missing fields open from "Toate contactele".
    expect(screen.getByRole("link", { name: "0700 000 111" })).toHaveAttribute("href", "tel:0700000111");
    expect(screen.getByText("Ana Pop")).toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Toate contactele (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    const panel = screen.getByRole("region", { name: "Contactele clientului" });
    expect(within(panel).getByText("Necompletat în fișa clientului: e-mail, adresă.")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
    expect(screen.queryByText("—")).toBeNull();
  });

  describe("way back to the registry (N-018)", () => {
    function at(state: Record<string, unknown>) {
      window.history.replaceState({}, "", "/clienti");
      window.history.pushState({}, "", "/clienti/cus-1");
      window.history.pushState({}, "", "/clienti/cus-1");
      window.history.replaceState(state, "", "/clienti/cus-1");
    }

    it("returns to the exact registry entry it was opened from", async () => {
      at({ workosKey: "k", workosIndex: 1, workosFrom: "/clienti?client=cus-1", workosFromIndex: 0 });
      vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
      const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
      render(<ClientDetailPage customerId="cus-1" />);
      const back = await screen.findByRole("link", { name: /^Clienți · litera A · rândul Atelier Nord/ });
      expect(back).toHaveAttribute("href", "/clienti?client=cus-1");
      await userEvent.click(back);
      expect(go).toHaveBeenCalledWith(-1);
    });

    it("opens the registry on this client's row when it came from elsewhere or a direct link", async () => {
      at({ workosKey: "k", workosIndex: 1, workosFrom: "/lucrari/job-1", workosFromIndex: 0 });
      vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
      const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
      render(<ClientDetailPage customerId="cus-1" />);
      const back = await screen.findByRole("link", { name: /^Clienți ·/ });
      expect(back).toHaveAttribute("href", "/clienti?client=cus-1");
      await userEvent.click(back);
      expect(go).not.toHaveBeenCalled();
    });

    it.each(["https://example.com/clienti", "//example.com/clienti", "/\\example.com"])("ignores a return context that is not an internal path: %s", async (from) => {
      at({ workosKey: "k", workosIndex: 1, workosFrom: from, workosFromIndex: 0 });
      vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
      render(<ClientDetailPage customerId="cus-1" />);
      expect(await screen.findByRole("link", { name: /^Clienți ·/ })).toHaveAttribute("href", "/clienti?client=cus-1");
    });
  });

  it("opens a WorkOS work on its job sheet from Lucrări, which lists every work of the client (N-020)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    const item = (workId: string, overrides: Record<string, unknown>) => ({
      workId, provenance: "WORKOS", provenanceLabel: "În WorkOS", title: "Litere", detail: null, reference: null, eventDateLabel: "1 oct. 2026", year: 2026,
      state: "ELIBERATA", stateLabel: "Eliberată în producție", site: null, siteAtTimeLabel: null, description: null, job: null, request: null, quote: null,
      historicalWorkId: null, documents: [], photoCount: 0, matchedOn: [], ...overrides,
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (/\/works(\?|$)/.test(url)) {
        return jsonResponse(200, { works: { total: 2, page: 1, pageCount: 1, totals: { all: 2, workos: 1, historical: 1 }, facets: { years: [2026, 2021], states: [], sites: [] }, items: [
          item("job:job-1", { title: "Litere Nord", job: { jobId: "job-1", stageLabel: "Eliberată", progressLabel: null } }),
          item("historical:h1", { provenance: "HISTORICAL_RECORD", provenanceLabel: "Înregistrare istorică", title: "Firmă 2021", historicalWorkId: "h1", state: "FINALIZAT" }),
        ] } });
      }
      return jsonResponse(200, workspace("cus-1", "Atelier Nord"));
    }));
    render(<ClientDetailPage customerId="cus-1" search="?sectiune=lucrari" />);
    // N-020 etapa 4 (644:12426): the way in is the card's own button, named with the work.
    expect(await screen.findByRole("link", { name: "Deschide memoria lucrării: Litere Nord" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&lucrare=job%3Ajob-1");
    expect(screen.getByRole("link", { name: "Deschide înregistrarea: Firmă 2021" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=lucrari&lucrare=h1");
    expect(screen.getByText("2 lucrări · 1 în WorkOS · 1 înregistrare istorică")).toBeInTheDocument();
  });

  it("restores a future section from the URL", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=portofoliu");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))),
    );
    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByText(/portofoliul acestui client/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /încarcă|semnează|emite/i })).not.toBeInTheDocument();
  });

  it("does not keep customer A request after opening customer B", async () => {
    writeConfiguratorSession({
      drafts: { widthMm: "12" },
      draftContext: { productCode: "PRD-ACM-CASSETTE-NONE", requestId: "req-A", customerId: "cus-A" },
      customerId: "cus-A",
      requestId: "req-A",
      productCode: "PRD-ACM-CASSETTE-NONE",
      lastQuote: null,
      customerLabel: "Client A",
      requestLabel: "Cerere A",
    });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-B", "Client B"))));
    render(<ClientDetailPage customerId="cus-B" />);
    await screen.findByRole("heading", { name: "Client B" });
    await waitFor(() => {
      const stored = readConfiguratorSession();
      expect(stored.customerId).toBe("cus-B");
      expect(stored.requestId).toBeNull();
      expect(stored.requestLabel).toBeNull();
      expect(stored.drafts).toEqual({ widthMm: "12" });
    });
  });

  it("keeps customer A request when returning to the same client", async () => {
    writeConfiguratorSession({
      drafts: {},
      draftContext: { productCode: null, requestId: "req-A", customerId: "cus-A" },
      customerId: "cus-A",
      requestId: "req-A",
      productCode: null,
      lastQuote: null,
      customerLabel: "Client A",
      requestLabel: "Cerere A",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(
          200,
          workspace("cus-A", "Client A", {
            requests: [{ requestId: "req-A", title: "Cerere A", customerId: "cus-A", statusLabel: "Nouă" }],
          }),
        ),
      ),
    );
    render(<ClientDetailPage customerId="cus-A" />);
    await screen.findByRole("heading", { name: "Client A" });
    await waitFor(() => {
      expect(readConfiguratorSession().requestId).toBe("req-A");
    });
  });

  it("lists product and assembly quotes with kind-aware links and keeps a superseded version historical", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri");
    const quote = (overrides: Record<string, unknown>) => ({
      kind: "PRODUCT",
      kindLabel: "Produs",
      productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      productLabel: "Litere volumetrice",
      stage: "QUOTE_CREATED",
      stageLabel: "Creată",
      nextAction: "ACCEPT_QUOTE",
      nextActionLabel: "Marchează acceptată",
      needsAttention: true,
      attentionLabel: "Urmează acceptarea",
      superseded: false,
      requestId: "req-1",
      requestReference: "CRQ-104",
      orderSnapshotId: null,
      ...overrides,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(
          200,
          workspace("cus-1", "Atelier Nord", {
            quotes: [
              quote({ quoteSnapshotId: "qts:1", reference: "OF-1" }),
              quote({
                quoteSnapshotId: "asmq:new",
                reference: "OF-NOU",
                kind: "ASSEMBLY",
                kindLabel: "Ansamblu",
                assemblyId: "asm:1",
                productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
                productLabel: "Panou ACM + litere volumetrice",
                stage: "ORDER_CREATED",
                stageLabel: "Cu comandă",
                nextAction: "OPEN_ORDER",
                nextActionLabel: "Deschide comanda",
                needsAttention: false,
                attentionLabel: null,
                orderSnapshotId: "asmo:1",
              }),
              quote({
                quoteSnapshotId: "asmq:old",
                reference: "OF-VECHI",
                kind: "ASSEMBLY",
                kindLabel: "Ansamblu",
                assemblyId: "asm:1",
                productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
                productLabel: "Panou ACM + litere volumetrice",
                nextAction: "OPEN_ASSEMBLY",
                nextActionLabel: "Deschide ansamblul",
                needsAttention: false,
                attentionLabel: "Înlocuită de o versiune mai nouă",
                superseded: true,
              }),
            ],
          }),
        ),
      ),
    );

    render(<ClientDetailPage customerId="cus-1" />);
    const table = await screen.findByRole("region", { name: "Cereri și oferte" });
    expect(within(table).getByRole("link", { name: "Deschide oferta OF-1" })).toHaveAttribute(
      "href",
      "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/qts%3A1",
    );
    expect(within(table).getByRole("link", { name: "Deschide oferta OF-NOU" })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3Anew");
    expect(within(table).getByRole("link", { name: "Deschide oferta OF-VECHI" })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3Aold");
    expect(within(table).getAllByText("Panou ACM + litere volumetrice")).toHaveLength(2);
    // An offer without an amount in the list: neither hidden nor uncalculated is claimed, and it is never 0.
    expect(within(table).getAllByText("Valoare indisponibilă")).toHaveLength(3);
    // A superseded version (608:9487): the server's words, struck through, never the current offer.
    const old = within(table).getByRole("link", { name: "Deschide oferta OF-VECHI" }).closest("li")!;
    expect(old).toHaveAttribute("data-superseded", "true");
    expect(within(old).getByText("Înlocuită de o versiune mai nouă")).toBeInTheDocument();
    expect(within(old).getByText("Nu e oferta curentă")).toBeInTheDocument();
    // An order whose job is not in the list keeps the server's way in.
    expect(screen.getByRole("link", { name: /Deschide comanda/ })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    expect(table.querySelectorAll('a[href^="/quotes/SIGN_ASSEMBLY"]')).toHaveLength(0);
  });

  it("retries a failed hub load", async () => {
    const fetchMock = vi.fn(() => jsonResponse(500, { error: "failed" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByText("Clientul nu a putut fi citit")).toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(200, workspace("cus-1", "Atelier Nord")));
    await userEvent.setup().click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
  });
  it("hands the current customer to the sole request intake without creating a request in the hub", async () => {
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => { void init; return jsonResponse(200, workspace("cus-1", "Atelier Nord")); });
    vi.stubGlobal("fetch", fetchMock); render(<ClientDetailPage customerId="cus-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
    expect(new URLSearchParams(window.location.search).get("customer")).toBe("cus-1");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  describe("Relație (N-018)", () => {
    const REQUEST = {
      requestId: "req-1", title: "Firmă luminoasă", reference: "CRQ-104", customerId: "cus-1", customerDisplayName: "Atelier Nord",
      status: "OPEN", statusLabel: "Deschisă", contextLabel: null, commercialProgress: null, createdAt: null,
      nextAction: "OPEN_REQUEST", nextActionLabel: "Deschide cererea", nextActionHref: null,
      needsAttention: false, attentionLabel: null, linkedQuoteSnapshotId: null, linkedQuoteProductCode: null, linkedAssemblyId: null,
    };
    const QUOTE = {
      quoteSnapshotId: "qts:1", kind: "PRODUCT", kindLabel: "Produs", assemblyId: null, sectionCount: 1, superseded: false,
      grossDisplay: null, currency: null, productCode: "P", productLabel: "Litere volumetrice", reference: "OF-1", inscription: "",
      customerDisplayName: "Atelier Nord", stage: "QUOTE_CREATED", stageLabel: "Creată", createdAt: null,
      nextAction: "ACCEPT_QUOTE", nextActionLabel: "Marchează acceptată", needsAttention: true, attentionLabel: "Urmează acceptarea",
      requestId: "req-1", requestReference: "CRQ-104", orderSnapshotId: null,
    };

    function Harness({ customerId }: { customerId: string }) {
      const [search, setSearch] = useState(window.location.search);
      useEffect(() => {
        const sync = () => setSearch(window.location.search);
        window.addEventListener("popstate", sync);
        return () => window.removeEventListener("popstate", sync);
      }, []);
      return <ClientDetailPage customerId={customerId} search={search} />;
    }

    function serve() {
      vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/workspace")) return jsonResponse(200, workspace("cus-1", "Atelier Nord", { requests: [REQUEST], quotes: [QUOTE] }));
        return jsonResponse(404, {});
      }));
    }

    it("shows every request with its state apart from its commercial progress, and each offer once", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri");
      serve();
      render(<Harness customerId="cus-1" />);
      const view = await screen.findByRole("region", { name: "Cereri și oferte" });
      // Pe cereri (640:11188): the request once, its state as the server sends it, the progress apart.
      const card = within(view).getByRole("heading", { level: 3, name: "Firmă luminoasă" }).closest("li")!;
      expect(within(card).getByText("Deschisă")).toBeInTheDocument();
      expect(within(card).getByText("1 ofertă în așteptare · fără lucrare")).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: "Vezi în Istoric: Firmă luminoasă" })).toHaveAttribute("href", "/clienti/cus-1?deschis=project%3Areq-1");
      expect(within(card).getByRole("link", { name: "Deschide cererea CRQ-104" })).toHaveAttribute("href", "/cereri/req-1");
      // The offer: the server's attention reason, no work yet, its two ways in.
      const offer = within(card).getByRole("link", { name: "Deschide oferta OF-1" }).closest("li")!;
      expect(offer).toHaveAttribute("data-attention", "true");
      expect(within(offer).getByText("Urmează acceptarea")).toBeInTheDocument();
      expect(within(offer).getByText("Fără lucrare · oferta nu are comandă")).toBeInTheDocument();
      expect(within(offer).getByRole("button", { name: "Previzualizează oferta OF-1" })).toBeInTheDocument();
      // Reached directly (not from Istoric), there is no way back to name.
      expect(within(view).queryByRole("link", { name: "← Istoric" })).toBeNull();
      expect(screen.getByRole("link", { name: /^Cereri și oferte/ })).toHaveAttribute("aria-current", "page");
    });

    it("pushes the first offer preview, closes it with Esc through Back and returns focus to the opener", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri");
      serve();
      render(<Harness customerId="cus-1" />);
      const opener = await screen.findByRole("button", { name: "Previzualizează oferta OF-1" });
      const before = window.history.length;
      await userEvent.click(opener);
      expect(window.location.search).toBe("?sectiune=cereri&oferta=qts%3A1");
      expect(window.history.length).toBe(before + 1);
      const dialog = await screen.findByRole("dialog", { name: "Oferta OF-1" });
      // The focus starts on the offer's title (659:14083); the list behind keeps its place.
      await waitFor(() => expect(within(dialog).getByRole("heading", { level: 2, name: "Litere volumetrice" })).toHaveFocus());
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(window.location.search).toBe("?sectiune=cereri"));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(opener).toHaveFocus());
    });

    it("opens a direct link to an offer preview and closes it by replacing the entry", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1?sectiune=cereri&oferta=qts%3A1");
      serve();
      render(<Harness customerId="cus-1" />);
      expect(await screen.findByRole("dialog", { name: "Oferta OF-1" })).toBeInTheDocument();
      const before = window.history.length;
      await userEvent.click(screen.getByRole("button", { name: "Închide" }));
      expect(window.location.pathname).toBe("/clienti/cus-1");
      expect(window.location.search).toBe("?sectiune=cereri");
      expect(window.history.length).toBe(before);
    });

    it("opens a former request-preview link on Cereri și oferte, at that request", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1?cerere=req-1");
      serve();
      render(<Harness customerId="cus-1" />);
      const view = await screen.findByRole("region", { name: "Cereri și oferte" });
      expect(within(view).getByRole("heading", { level: 3, name: "Firmă luminoasă" }).closest("li")).toHaveAttribute("data-arrival-target", "true");
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
  it("says once, right after Client nou, that the client was registered (N-018)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Lumen Signs Demo SRL"))));
    sessionStorage.setItem("workos.client.registered", "cus-1");
    const { unmount } = render(<ClientDetailPage customerId="cus-1" />);
    expect(screen.getByText("Clientul a fost înregistrat.")).toHaveAttribute("role", "status");
    unmount();
    resetResourceCache();
    render(<ClientDetailPage customerId="cus-1" />);
    expect(screen.queryByText("Clientul a fost înregistrat.")).toBeNull();
  });
});
