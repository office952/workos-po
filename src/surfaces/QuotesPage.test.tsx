import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuotesPage } from "./QuotesPage";
import { invalidateResources, resetResourceCache } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { triggerBrowserDownload } from "../presentation/download";

vi.mock("../presentation/download", () => ({ triggerBrowserDownload: vi.fn() }));

type Reply = { status?: number; body: unknown; pdf?: boolean };
type Route = (url: string) => Reply | Promise<Reply> | undefined;
type SyncRoute = (url: string) => Reply | undefined;

let routes: Route[] = [];

function respond(reply: Reply) {
  const status = reply.status ?? 200;
  const headers = new Headers({ "content-type": reply.pdf ? "application/pdf" : "application/json" });
  return {
    ok: status < 400,
    status,
    headers,
    json: async () => reply.body,
    blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
  } as unknown as Response;
}

function stubApi(quotes: unknown[], extra: Route[] = []) {
  routes = extra;
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    void init;
    const url = String(input);
    for (const route of routes) {
      const reply = await route(url);
      if (reply) return respond(reply);
    }
    if (url.endsWith("/api/quotes")) return respond({ body: { overview: { quotes } } });
    return respond({ status: 404, body: { error: "not_found" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Mirrors App: the page receives the live search string. */
function Routed() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const sync = () => setSearch(window.location.search);
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return <QuotesPage search={search} />;
}

function setLayout(kind: "docked" | "overlay" | "full") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches:
        (query === "(max-width: 1151px)" && kind !== "docked") ||
        (query === "(max-width: 767px)" && kind === "full"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    })),
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/oferte");
  setLayout("docked");
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

const productCode = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";

const standalone = {
  quoteSnapshotId: "q-solo",
  kind: "PRODUCT",
  kindLabel: "Produs",
  sectionCount: 1,
  productCode,
  productLabel: "Litere",
  reference: "OF-SOLO",
  inscription: "NORD",
  customerDisplayName: "Client Simplu",
  stage: "QUOTE_CREATED",
  stageLabel: "Creată",
  grossDisplay: "624,82",
  currency: "EUR",
  createdAt: "2026-09-01T10:00:00.000Z",
  nextAction: "ACCEPT_QUOTE",
  needsAttention: true,
  attentionLabel: "Așteaptă acceptarea clientului",
};

const assembly = {
  quoteSnapshotId: "asmq:1",
  kind: "ASSEMBLY",
  kindLabel: "Ansamblu",
  assemblyId: "asm:1",
  sectionCount: 2,
  productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
  productLabel: "Panou ACM + litere volumetrice",
  reference: "OF-ASM",
  inscription: "PANOU · WORKOS",
  customerDisplayName: "Client Ansamblu",
  requestReference: "CRQ-7",
  stage: "ORDER_CREATED",
  stageLabel: "Cu comandă",
  grossDisplay: "743,48",
  currency: "EUR",
  createdAt: "2026-09-02T10:00:00.000Z",
  nextAction: "OPEN_ORDER",
  nextActionLabel: "Deschide comanda",
  orderSnapshotId: "asmo:1",
};

const productDetail: SyncRoute = (url) =>
  url.includes(`/api/products/${productCode}/quote-snapshots/q-solo`)
    ? {
        body: {
          quoteSnapshot: {
            quoteSnapshotId: "q-solo",
            productCode,
            productLabel: "Litere",
            inscription: "NORD",
            commercial: { netPrice: 516.38, vatPercent: 21, vatAmount: 108.44, grossPrice: 624.82, currency: "EUR", completeness: "COMPLETE", unavailableReasons: [] },
          },
        },
      }
    : undefined;

const assemblyDetail: SyncRoute = (url) =>
  url.endsWith("/api/quotes/asmq%3A1")
    ? {
        body: {
          quote: assembly,
          assemblyQuote: {
            assemblyId: "asm:1",
            label: "Panou ACM + litere volumetrice",
            orderSnapshotId: "asmo:1",
            totals: { netPrice: 614.45, vatAmount: 129.03, grossPrice: 743.48, currency: "EUR" },
            sections: [
              { memberId: "m1", roleLabel: "Litere", productLabel: "Litere volumetrice", inscription: "WORKOS", vatPercent: 21, netPrice: 400, vatAmount: 84, grossPrice: 484, currency: "EUR" },
              { memberId: "m2", roleLabel: "Panou ACM", productLabel: "Panou ACM casetat", inscription: "PANOU", vatPercent: 21, netPrice: 214.45, vatAmount: 45.03, grossPrice: 259.48, currency: "EUR" },
            ],
          },
          acceptance: { canAccept: false, reason: null },
        },
      }
    : undefined;

const jobDetail: SyncRoute = (url) =>
  url.endsWith("/api/jobs/asmo%3A1")
    ? {
        body: {
          job: {
            jobId: "asmo:1",
            kind: "ASSEMBLY",
            productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
            productLabel: "Panou ACM + litere volumetrice",
            inscription: "PANOU · WORKOS",
            customerDisplayName: "Client Ansamblu",
            stage: "EXECUTION_IN_PROGRESS",
            stageLabel: "În lucru",
            priorityLabel: "Ridicată",
            targetDateLabel: "06.11.2026",
            progressLabel: "3 / 17 finalizate",
          },
        },
      }
    : undefined;

function table() {
  return within(screen.getByRole("table", { name: "Lista de oferte" }));
}

function dossier() {
  return within(screen.getByRole("complementary", { name: "Dosarul ofertei" }));
}

function board() {
  return within(screen.getByRole("group", { name: "Filtre registru oferte" }));
}

describe("QuotesPage", () => {
  it("counts server attention flags instead of explanatory labels and filters by them", async () => {
    stubApi([
      { quoteSnapshotId: "q-flag", productCode, reference: "OF-FLAG", needsAttention: true },
      { quoteSnapshotId: "q-copy", productCode, reference: "OF-COPY", needsAttention: false, attentionLabel: "Text explicativ" },
    ]);
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-FLAG" });
    const attention = board().getByRole("button", { name: /Necesită atenție/ });
    expect(attention).toHaveTextContent("01");
    expect(board().getByRole("button", { name: /Toate/ })).toHaveTextContent("02");
    await userEvent.click(attention);
    expect(attention).toHaveAttribute("aria-pressed", "true");
    expect(table().getByRole("link", { name: "OF-FLAG" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "OF-COPY" })).not.toBeInTheDocument();
    expect(screen.getByText("1 din 2")).toBeInTheDocument();
  });

  it("explains a failed refresh of cached offers and retries", async () => {
    stubApi([{ quoteSnapshotId: "q-a", productCode, reference: "OF-A" }]);
    const success = vi.mocked(fetch).getMockImplementation()!;
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-A" });
    vi.mocked(fetch).mockImplementation(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) } as Response));
    act(() => invalidateResources(resourceKeys.quotes()));
    expect(await screen.findByText("Datele afișate sunt de la ultima citire reușită.")).toBeInTheDocument();
    expect(table().getByRole("link", { name: "OF-A" })).toBeInTheDocument();
    vi.mocked(fetch).mockImplementation(success);
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(screen.queryByText("Lista nu a putut fi actualizată")).not.toBeInTheDocument();
  });

  it("keeps created quotes honest and offers no acceptance in the register or dossier", async () => {
    stubApi([{ ...standalone, nextActionLabel: "Marchează acceptată", requestId: "req-1", requestReference: "CRQ-104" }], [productDetail]);
    render(<Routed />);
    expect(await screen.findByRole("link", { name: "OF-SOLO" })).toHaveAttribute("href", `/quotes/${productCode}/q-solo`);
    expect(table().getByRole("link", { name: "Deschide oferta" })).toHaveAttribute("href", `/quotes/${productCode}/q-solo`);
    expect(table().getByText(/CRQ-104/)).toBeInTheDocument();
    expect(screen.queryByText("Marchează acceptată")).not.toBeInTheDocument();
    await userEvent.click(table().getByText("Client Simplu"));
    expect(await dossier().findByText("Așteaptă acceptarea clientului")).toBeInTheDocument();
    expect(dossier().getByText("Confirmarea comenzii se face în pagina ofertei, lângă total.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirmă comanda/ })).not.toBeInTheDocument();
    expect(dossier().getByRole("tab", { name: /Comandă · lucrare/ })).toHaveAttribute("aria-disabled", "true");
  });

  it("opens the quote from its identity and the order from the separate action", async () => {
    stubApi([assembly]);
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-ASM" });
    expect(table().getByRole("link", { name: "OF-ASM" })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    expect(table().getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A1");
  });

  it("lists standalone and assembly offers together, with kind, value and combinable filters", async () => {
    stubApi([standalone, assembly]);
    render(<Routed />);
    const assemblyRow = (await screen.findByRole("link", { name: "OF-ASM" })).closest("tr")!;
    expect(within(assemblyRow).getByText(/Panou ACM \+ litere volumetrice/)).toBeInTheDocument();
    expect(within(assemblyRow).getByText("743,48")).toBeInTheDocument();
    expect(within(assemblyRow).getByText(/CRQ-7/)).toBeInTheDocument();
    const soloRow = table().getByRole("link", { name: "OF-SOLO" }).closest("tr")!;
    expect(soloRow).toHaveAttribute("data-attention", "true");
    expect(within(soloRow).getByText(/^Produs/)).toBeInTheDocument();

    const kind = screen.getByRole("group", { name: "Tip" });
    await userEvent.click(within(kind).getByRole("button", { name: "Ansambluri" }));
    expect(table().getByRole("link", { name: "OF-ASM" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "OF-SOLO" })).not.toBeInTheDocument();

    await userEvent.click(board().getByRole("button", { name: /Creată/ }));
    expect(screen.getByText("Nicio ofertă nu corespunde filtrului.")).toBeInTheDocument();
    expect(dossier().getByText("Nicio ofertă în filtrul curent")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Resetează filtrele/ }));
    expect(table().getByRole("link", { name: "OF-SOLO" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Caută" })).toHaveFocus();

    await userEvent.type(screen.getByRole("searchbox", { name: "Caută" }), "CRQ-7");
    expect(table().getByRole("link", { name: "OF-ASM" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "OF-SOLO" })).not.toBeInTheDocument();
  });

  it("selects a row into the URL without a history entry, shows register data at once and fills the detail", async () => {
    const detail = deferred<Reply>();
    const fetchMock = stubApi([standalone, assembly], [(url) => (url.endsWith("/api/quotes/asmq%3A1") ? detail.promise : undefined), jobDetail]);
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-ASM" });
    expect(dossier().getByText("Nicio ofertă selectată")).toBeInTheDocument();
    const before = window.history.length;

    await userEvent.click(screen.getByRole("row", { name: "Previzualizează oferta OF-ASM" }));
    expect(window.location.search).toBe("?oferta=asmq%3A1");
    expect(window.history.length).toBe(before);
    expect(screen.getByRole("row", { name: "Previzualizează oferta OF-ASM" })).toHaveAttribute("aria-selected", "true");
    expect(dossier().getByText("OF-ASM", { selector: ".offers-sheet-v2__ref" })).toBeInTheDocument();
    expect(dossier().getByText("743,48")).toBeInTheDocument();
    expect(dossier().getByText(/Se citește detaliul ofertei/)).toBeInTheDocument();

    await act(async () => detail.resolve(assemblyDetail("/api/quotes/asmq%3A1")!));
    expect(await dossier().findByText(/Net 614,45 EUR/)).toBeInTheDocument();
    expect(dossier().getByText("Panou ACM")).toBeInTheDocument();
    expect(dossier().getByRole("link", { name: /Deschide comanda/ })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    expect(dossier().getByText(/fișa lucrării, în Lucrări/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.every((call) => ((call[1] as RequestInit | undefined)?.method ?? "GET") === "GET")).toBe(true);
  });

  it("never shows a late detail answer for an offer that is no longer selected", async () => {
    const slow = deferred<Reply>();
    stubApi([standalone, assembly], [(url) => (url.endsWith("/api/quotes/asmq%3A1") ? slow.promise : undefined), productDetail, jobDetail]);
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-ASM" });
    await userEvent.click(screen.getByRole("row", { name: "Previzualizează oferta OF-ASM" }));
    await userEvent.click(screen.getByRole("row", { name: "Previzualizează oferta OF-SOLO" }));
    expect(await dossier().findByText(/Net 516,38 EUR/)).toBeInTheDocument();
    await act(async () => slow.resolve(assemblyDetail("/api/quotes/asmq%3A1")!));
    expect(dossier().queryByText(/614,45/)).not.toBeInTheDocument();
    expect(dossier().getByText("OF-SOLO", { selector: ".offers-sheet-v2__ref" })).toBeInTheDocument();
  });

  it("reads the job separately: a job error keeps the offer and retries only the job", async () => {
    let jobFails = true;
    stubApi([assembly], [assemblyDetail, (url) => (url.endsWith("/api/jobs/asmo%3A1") && jobFails ? { status: 503, body: {} } : undefined), jobDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=asmq%3A1&foaie=comanda");
    render(<Routed />);
    expect(await dossier().findByText("Fișa lucrării nu a putut fi citită")).toBeInTheDocument();
    expect(dossier().getByText("Acceptată — comandă creată")).toBeInTheDocument();
    expect(dossier().getByRole("tab", { name: /Comandă · lucrare/ })).toHaveAttribute("aria-selected", "true");

    await userEvent.click(dossier().getByRole("tab", { name: /Ofertă/ }));
    expect(window.location.search).toBe("?oferta=asmq%3A1");
    expect(await dossier().findByText(/Net 614,45 EUR/)).toBeInTheDocument();

    await userEvent.click(dossier().getByRole("tab", { name: /Comandă · lucrare/ }));
    jobFails = false;
    await userEvent.click(dossier().getByRole("button", { name: "Reîncearcă" }));
    expect(await dossier().findByText("3 / 17 finalizate")).toBeInTheDocument();
    expect(dossier().getByText("Progresul lucrării")).toBeInTheDocument();
    expect(dossier().getByRole("link", { name: /Deschide fișa lucrării/ })).toHaveAttribute("href", "/lucrari/asmo%3A1");
  });

  it("does not read a job for an offer without an order", async () => {
    const fetchMock = stubApi([standalone], [productDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=q-solo&foaie=comanda");
    render(<Routed />);
    expect(await dossier().findByText(/Net 516,38 EUR/)).toBeInTheDocument();
    expect(dossier().getByRole("tab", { name: /Ofertă/ })).toHaveAttribute("aria-selected", "true");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/jobs/"))).toBe(false);
  });

  it("treats an unknown offer in the URL as not found", async () => {
    stubApi([standalone]);
    window.history.replaceState({}, "", "/oferte?oferta=q-missing");
    render(<Routed />);
    expect(await dossier().findByText("Oferta nu este în registru")).toBeInTheDocument();
  });

  it("clears the selection when a filter excludes the selected offer", async () => {
    stubApi([standalone, assembly], [assemblyDetail, jobDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=asmq%3A1");
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-ASM" });
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută" }), "Simplu");
    expect(window.location.search).toBe("");
    expect(dossier().getByText("Nicio ofertă selectată")).toBeInTheDocument();
  });

  it("moves through the register with arrows on rows, but never while typing", async () => {
    stubApi([standalone, assembly], [assemblyDetail, productDetail, jobDetail]);
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-ASM" });
    const first = screen.getAllByRole("row").find((row) => row.hasAttribute("data-quote-id"))!;
    first.focus();
    await userEvent.keyboard("{Enter}");
    const firstId = first.getAttribute("data-quote-id")!;
    expect(window.location.search).toBe(`?oferta=${encodeURIComponent(firstId)}`);
    await userEvent.keyboard("{ArrowDown}");
    const second = document.activeElement as HTMLElement;
    expect(second.getAttribute("data-quote-id")).not.toBe(firstId);
    expect(window.location.search).toBe(`?oferta=${encodeURIComponent(second.getAttribute("data-quote-id")!)}`);

    const searchBox = screen.getByRole("searchbox", { name: "Caută" });
    const selectedBefore = window.location.search;
    searchBox.focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(window.location.search).toBe(selectedBefore);

    searchBox.blur();
    await userEvent.keyboard("/");
    expect(searchBox).toHaveFocus();
    expect(searchBox).toHaveValue("");
  });

  it("switches sheets with arrow keys on the tab list and keeps the offer", async () => {
    stubApi([assembly], [assemblyDetail, jobDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=asmq%3A1");
    render(<Routed />);
    const offerTab = await dossier().findByRole("tab", { name: /Ofertă/ });
    offerTab.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(window.location.search).toBe("?oferta=asmq%3A1&foaie=comanda");
    expect(await dossier().findByText("3 / 17 finalizate")).toBeInTheDocument();
  });

  it("on tablet opens the dossier as a dialog, closes with Escape and returns focus to the card", async () => {
    setLayout("overlay");
    stubApi([standalone, assembly], [assemblyDetail, jobDetail]);
    render(<Routed />);
    const open = await screen.findByRole("button", { name: "Deschide dosarul ofertei OF-ASM" });
    await userEvent.click(open);
    const dialog = await screen.findByRole("dialog", { name: "Dosarul ofertei" });
    expect(window.location.search).toBe("?oferta=asmq%3A1");
    expect(within(dialog).getByRole("button", { name: /Închide dosarul/ })).toHaveFocus();
    expect(screen.getByRole("searchbox", { name: "Caută" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.search).toBe("");
    await waitFor(() => expect(screen.getByRole("button", { name: "Deschide dosarul ofertei OF-ASM" })).toHaveFocus());
  });

  it("gives every phone card a door to the offer and, when there is one, to the order", async () => {
    setLayout("full");
    stubApi([standalone, assembly]);
    render(<Routed />);
    const assemblyCard = (await screen.findByRole("button", { name: "Deschide dosarul ofertei OF-ASM" })).closest("li")!;
    expect(within(assemblyCard).getByRole("link", { name: /Oferta/ })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    expect(within(assemblyCard).getByRole("link", { name: /Comanda/ })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    const soloCard = screen.getByRole("button", { name: "Deschide dosarul ofertei OF-SOLO" }).closest("li")!;
    expect(within(soloCard).queryByRole("link", { name: /Comanda/ })).not.toBeInTheDocument();
    expect(within(soloCard).getByText("Fără comandă încă")).toBeInTheDocument();
  });

  it("ends a PDF download that fails on the network with a clear message and a working retry", async () => {
    let network = false;
    const document: Route = (url) => {
      if (!url.endsWith("/quote-snapshots/q-solo/document")) return undefined;
      if (!network) return Promise.reject(new TypeError("Failed to fetch"));
      return { body: null, pdf: true };
    };
    stubApi([standalone], [document, productDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=q-solo");
    render(<Routed />);
    const pdf = await dossier().findByRole("button", { name: "Descarcă oferta PDF" });
    await userEvent.click(pdf);
    expect(await dossier().findByText(/Documentul ofertei nu a putut fi descărcat/)).toBeInTheDocument();
    expect(pdf).not.toBeDisabled();
    expect(pdf).not.toHaveAttribute("aria-busy");
    expect(triggerBrowserDownload).not.toHaveBeenCalled();

    network = true;
    await userEvent.click(dossier().getByRole("button", { name: "Reîncearcă descărcarea" }));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledTimes(1));
    expect(dossier().queryByText(/Documentul ofertei nu a putut fi descărcat/)).not.toBeInTheDocument();
    expect(pdf).not.toBeDisabled();
  });

  it("drops a PDF answer that arrives after another offer was selected", async () => {
    vi.mocked(triggerBrowserDownload).mockClear();
    const late = deferred<Reply>();
    const document: Route = (url) => (url.endsWith("/quote-snapshots/q-solo/document") ? late.promise.then((reply) => { if (reply.status === 599) throw new TypeError("Failed to fetch"); return reply; }) : undefined);
    stubApi([standalone, assembly], [document, productDetail, assemblyDetail, jobDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=q-solo");
    render(<Routed />);
    await userEvent.click(await dossier().findByRole("button", { name: "Descarcă oferta PDF" }));
    await userEvent.click(screen.getByRole("row", { name: "Previzualizează oferta OF-ASM" }));
    await act(async () => late.resolve({ status: 599, body: null }));
    expect(dossier().getByText("OF-ASM", { selector: ".offers-sheet-v2__ref" })).toBeInTheDocument();
    expect(dossier().queryByText(/Documentul ofertei nu a putut fi descărcat/)).not.toBeInTheDocument();
    expect(dossier().getByRole("button", { name: "Descarcă oferta PDF" })).not.toBeDisabled();
    expect(triggerBrowserDownload).not.toHaveBeenCalled();
  });

  it("keeps the last job read when a refresh fails, says so, and recovers on retry without touching the offer", async () => {
    let jobFails = false;
    stubApi([assembly], [assemblyDetail, (url) => (url.endsWith("/api/jobs/asmo%3A1") && jobFails ? { status: 503, body: {} } : undefined), jobDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=asmq%3A1&foaie=comanda");
    render(<Routed />);
    expect(await dossier().findByText("3 / 17 finalizate")).toBeInTheDocument();

    jobFails = true;
    act(() => invalidateResources(resourceKeys.job("asmo:1")));
    expect(await dossier().findByText("Actualizarea fișei lucrării a eșuat. Se afișează ultima citire reușită.")).toBeInTheDocument();
    expect(dossier().getByText("3 / 17 finalizate")).toBeInTheDocument();

    await userEvent.click(dossier().getByRole("tab", { name: /Ofertă/ }));
    expect(await dossier().findByText(/Net 614,45 EUR/)).toBeInTheDocument();
    expect(dossier().queryByText(/Actualizarea detaliului ofertei a eșuat/)).not.toBeInTheDocument();

    await userEvent.click(dossier().getByRole("tab", { name: /Comandă · lucrare/ }));
    jobFails = false;
    await userEvent.click(dossier().getByRole("button", { name: "Reîncearcă" }));
    await waitFor(() => expect(dossier().queryByText(/Actualizarea fișei lucrării a eșuat/)).not.toBeInTheDocument());
    expect(dossier().getByText("3 / 17 finalizate")).toBeInTheDocument();
  });

  it("keeps the last offer detail when a refresh fails, says so, and recovers on retry without touching the job", async () => {
    let detailFails = false;
    stubApi([assembly], [(url) => (url.endsWith("/api/quotes/asmq%3A1") && detailFails ? { status: 503, body: {} } : undefined), assemblyDetail, jobDetail]);
    window.history.replaceState({}, "", "/oferte?oferta=asmq%3A1");
    render(<Routed />);
    expect(await dossier().findByText(/Net 614,45 EUR/)).toBeInTheDocument();

    detailFails = true;
    act(() => invalidateResources(resourceKeys.assemblyQuote("asmq:1")));
    expect(await dossier().findByText("Actualizarea detaliului ofertei a eșuat. Se afișează ultima citire reușită.")).toBeInTheDocument();
    expect(dossier().getByText(/Net 614,45 EUR/)).toBeInTheDocument();
    expect(dossier().getByText("Panou ACM")).toBeInTheDocument();

    await userEvent.click(dossier().getByRole("tab", { name: /Comandă · lucrare/ }));
    expect(await dossier().findByText("3 / 17 finalizate")).toBeInTheDocument();
    expect(dossier().queryByText(/Actualizarea fișei lucrării a eșuat/)).not.toBeInTheDocument();

    await userEvent.click(dossier().getByRole("tab", { name: /Ofertă/ }));
    detailFails = false;
    await userEvent.click(dossier().getByRole("button", { name: "Reîncearcă" }));
    await waitFor(() => expect(dossier().queryByText(/Actualizarea detaliului ofertei a eșuat/)).not.toBeInTheDocument());
    expect(dossier().getByText(/Net 614,45 EUR/)).toBeInTheDocument();
  });

  it("shows no kind filter for standalone-only registries", async () => {
    stubApi([{ quoteSnapshotId: "q-a", productCode, reference: "OF-A", stageLabel: "Creată" }]);
    render(<Routed />);
    await screen.findByRole("link", { name: "OF-A" });
    expect(screen.queryByRole("group", { name: "Tip" })).not.toBeInTheDocument();
  });
});
