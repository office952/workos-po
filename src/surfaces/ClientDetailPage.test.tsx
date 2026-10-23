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
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = resolve; })));
    render(<ClientDetailPage customerId="cus-1" />);
    const sections = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(sections).getByRole("link", { name: "Cereri și oferte" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Lucrări" })).toBeInTheDocument();
    expect(screen.queryByText(/cereri? deschis/i)).toBeNull();
    await waitFor(() => expect(release).toBeTypeOf("function"));
    await act(async () => release(await jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Cereri 0, Oferte 0" })).toBeInTheDocument();
    expect(within(sections).getByRole("link", { name: "Lucrări 0" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nicio cerere deschisă" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri");
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
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
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
    expect(within(sections).getAllByRole("link").map((link) => link.textContent)).toEqual(["Relație", "Cereri 0, · Oferte 0", "Lucrări 0"]);
    // Sections without a source are only listed, under "Mai multe", and are not links.
    expect(within(sections).queryByRole("link", { name: /Documente|Fotografii|Portofoliu|Fișiere/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
  });

  it("lists the sections in preparation under Mai multe and closes the list with Escape (N-018)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    const more = screen.getByRole("button", { name: /Mai multe/ });
    expect(more).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    const list = document.getElementById(more.getAttribute("aria-controls")!)!;
    expect(list).toBeVisible();
    expect(within(list).getByText("În pregătire")).toBeInTheDocument();
    for (const name of ["Documente", "Fotografii", "Portofoliu", "Fișiere"]) expect(within(list).getByText(name)).toBeInTheDocument();
    expect(within(list).getAllByText("în pregătire")).toHaveLength(4);
    expect(within(list).queryByRole("link")).toBeNull();
    expect(within(list).getByText(/se găsesc în fișa fiecărei lucrări/)).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveFocus();
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
    await userEvent.click(screen.getByRole("link", { name: "Cereri 1, Oferte 0" }));
    expect(window.location.search).toBe("?sectiune=cereri");
    expect(await screen.findByRole("table", { name: "Cereri" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cereri 1, Oferte 0" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("link", { name: "Lucrări 0" }));
    expect(window.location.search).toBe("?sectiune=lucrari");
    expect(window.history.length).toBe(before);
  });

  it("counts requests and offers apart in the section tab, from the server summary (N-018)", async () => {
    const payload = workspace("cus-1", "Atelier Nord");
    Object.assign(payload.workspace.summary, { requestCount: 3, quoteCount: 2, jobCount: 1 });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, payload)));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    const sections = screen.getByRole("navigation", { name: "Secțiuni client" });
    expect(within(sections).getByRole("link", { name: "Cereri 3, Oferte 2" })).toHaveAttribute("href", "/clienti/cus-1?sectiune=cereri");
    expect(within(sections).getByRole("link", { name: "Lucrări 1" })).toBeInTheDocument();
    expect(within(sections).queryByText(/· 5|5/)).toBeNull();
  });

  it("shows the contacts that exist next to the name and groups the missing ones in one line (N-018)", async () => {
    const payload = workspace("cus-1", "Atelier Nord");
    Object.assign(payload.workspace.customer, { cui: "RO123", contactName: "Ana Pop", phone: "0700 000 111", email: null, address: null });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, payload)));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { level: 1, name: "Atelier Nord" });
    expect(screen.getByText("CUI RO123")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "0700 000 111" })).toHaveAttribute("href", "tel:0700000111");
    expect(screen.getByText("Ana Pop")).toBeInTheDocument();
    expect(screen.getByText("Necompletat: e-mail, adresă.")).toBeInTheDocument();
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
      const back = await screen.findByRole("link", { name: /← Clienți · litera A · rândul Atelier Nord/ });
      expect(back).toHaveAttribute("href", "/clienti?client=cus-1");
      await userEvent.click(back);
      expect(go).toHaveBeenCalledWith(-1);
    });

    it("opens the registry on this client's row when it came from elsewhere or a direct link", async () => {
      at({ workosKey: "k", workosIndex: 1, workosFrom: "/lucrari/job-1", workosFromIndex: 0 });
      vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
      const go = vi.spyOn(window.history, "go").mockImplementation(() => undefined);
      render(<ClientDetailPage customerId="cus-1" />);
      const back = await screen.findByRole("link", { name: /← Clienți/ });
      expect(back).toHaveAttribute("href", "/clienti?client=cus-1");
      await userEvent.click(back);
      expect(go).not.toHaveBeenCalled();
    });

    it.each(["https://example.com/clienti", "//example.com/clienti", "/\\example.com"])("ignores a return context that is not an internal path: %s", async (from) => {
      at({ workosKey: "k", workosIndex: 1, workosFrom: from, workosFromIndex: 0 });
      vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
      render(<ClientDetailPage customerId="cus-1" />);
      expect(await screen.findByRole("link", { name: /← Clienți/ })).toHaveAttribute("href", "/clienti?client=cus-1");
    });
  });

  it("names a frontend step to the job sheet Fișa lucrării and keeps the server's own labels (N-018)", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=lucrari");
    const job = (overrides: Record<string, unknown>) => ({
      jobId: "job-1", kind: "PRODUCT", productCode: "PRD-1", inscription: "NORD", productLabel: "Litere", customerId: "cus-1", customerDisplayName: "Atelier Nord",
      stage: "RELEASED", stageLabel: "Eliberată", priorityLabel: "Standard", targetDateLabel: "Fără termen", progressLabel: "",
      nextAction: "RELEASE_TO_PRODUCTION", nextActionLabel: "Trimite în producție", needsAttention: false, attentionLabel: null, planId: null, requestId: null,
      ...overrides,
    });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord", {
      jobs: [job({}), job({ jobId: "job-2", inscription: "GATA", nextAction: "VIEW_COMPLETED", nextActionLabel: "Lucrare finalizată", stageLabel: "Finalizată" })],
    }))));
    render(<ClientDetailPage customerId="cus-1" search="?sectiune=lucrari" />);
    const table = await screen.findByRole("table", { name: "Lucrări" });
    expect(within(table).getByRole("link", { name: /Fișa lucrării/ })).toHaveAttribute("href", "/lucrari/job-1");
    expect(within(table).getByRole("link", { name: /Lucrare finalizată/ })).toHaveAttribute("href", "/lucrari/job-2");
  });

  it("restores a future section from the URL", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))),
    );
    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByText(/Facturile, contractele și anexele/)).toBeInTheDocument();
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
    const table = await screen.findByRole("table", { name: "Oferte" });
    const rows = table.querySelectorAll("tbody tr");
    expect(rows).toHaveLength(3);
    expect(screen.getByRole("link", { name: /OF-1/ })).toHaveAttribute(
      "href",
      "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/qts%3A1",
    );
    expect(screen.getByRole("link", { name: /OF-NOU/ })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3Anew");
    expect(screen.getByRole("link", { name: /OF-VECHI/ })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3Aold");
    expect(screen.getAllByText("Ansamblu · Panou ACM + litere volumetrice · CRQ-104")).toHaveLength(2);
    expect(screen.getByText("Înlocuită de o versiune mai nouă")).toBeInTheDocument();
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

    it("shows what waits now with the server step, threads by request and an honest journal note", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1");
      serve();
      render(<Harness customerId="cus-1" />);
      const now = await screen.findByRole("region", { name: "Acum" });
      expect(within(now).getByText("Urmează acceptarea")).toBeInTheDocument();
      expect(within(now).getByRole("link", { name: /Marchează acceptată|Acceptă|ofert/i })).toBeInTheDocument();
      const threads = screen.getByRole("region", { name: "Fire pe cerere" });
      const thread = within(threads).getByRole("button", { name: "Previzualizează cererea Firmă luminoasă" }).closest("li")!;
      expect(within(thread).getByRole("link", { name: "OF-1" })).toBeInTheDocument();
      // No journal source: a quiet note after the content, not a section or a reserved column.
      const note = screen.getByText("Jurnalul relației nu este disponibil în această etapă.");
      expect(note.tagName).toBe("P");
      expect(screen.queryByRole("heading", { name: "Jurnalul relației" })).toBeNull();
      expect(threads.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByRole("link", { name: "Relație" })).toHaveAttribute("aria-current", "page");
    });

    it("pushes the first preview, closes with Esc through Back and returns focus to the opener", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1");
      serve();
      render(<Harness customerId="cus-1" />);
      const opener = await screen.findByRole("button", { name: "Previzualizează cererea Firmă luminoasă" });
      const before = window.history.length;
      await userEvent.click(opener);
      expect(window.location.search).toBe("?cerere=req-1");
      expect(window.history.length).toBe(before + 1);
      expect(await screen.findByRole("dialog", { name: "Previzualizare cerere" })).toBeInTheDocument();
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(window.location.search).toBe(""));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      await waitFor(() => expect(opener).toHaveFocus());
    });

    it("opens a direct link to a preview and closes it by replacing the entry", async () => {
      window.history.replaceState({}, "", "/clienti/cus-1?cerere=req-1");
      serve();
      render(<Harness customerId="cus-1" />);
      expect(await screen.findByRole("dialog", { name: "Previzualizare cerere" })).toBeInTheDocument();
      const before = window.history.length;
      await userEvent.click(screen.getByRole("button", { name: /Închide dosarul|Registru/ }));
      expect(window.location.pathname).toBe("/clienti/cus-1");
      expect(window.location.search).toBe("");
      expect(window.history.length).toBe(before);
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
