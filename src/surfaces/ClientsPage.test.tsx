import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateResources, resetResourceCache } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { readClientsRegistryMemory } from "../session/clientsRegistryMemory";
import { navigate } from "../routing/navigate";
import { ClientsPage } from "./ClientsPage";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

const registry = (customers: unknown[], summary = { total: customers.length, active: customers.length, retired: 0, needsAttention: 0 }) => ({
  registry: { summary, customers },
});

const ALPHA = {
  customerId: "cus-a", displayName: "Alpha Clima SRL", status: "ACTIVE", statusLabel: "Activ",
  openRequestCount: 1, quoteCount: 2, jobCount: 3, needsAttention: true, attentionLabel: "1 lucrare necesită acțiune",
};
const LUMEN = {
  customerId: "cus-l", displayName: "Lumen Signs SRL", status: "ACTIVE", statusLabel: "Activ",
  cui: "RO41234567", city: "Cluj-Napoca", contactName: "Ioana Marin", phone: "0722 000 111", email: "ioana@lumen.test", address: "Str. Demo 10",
  openRequestCount: 0, quoteCount: 0, jobCount: 0, needsAttention: false, attentionLabel: null,
};

function workspace(customer: Record<string, unknown>, lists: { requests?: unknown[]; quotes?: unknown[]; jobs?: unknown[] } = {}, canCreateRequest = true) {
  return { workspace: { customer, canCreateRequest, requests: lists.requests ?? [], quotes: lists.quotes ?? [], jobs: lists.jobs ?? [] } };
}

function route(handlers: Record<string, () => Promise<unknown>>) {
  return vi.fn((input: RequestInfo) => {
    const url = String(input);
    const match = Object.keys(handlers).find((key) => url.endsWith(key));
    return match ? handlers[match]!() : jsonResponse(404, {});
  });
}

describe("ClientsPage", () => {
  it.each([401, 403])("hides a cached registry and its create form after a %i refresh", async (status) => {
    const fetchMock = vi.fn(() => jsonResponse(200, registry([{ customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE" }])));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsPage />);
    await screen.findByRole("link", { name: "Atelier Nord" });
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(status, {}));
    act(() => invalidateResources(resourceKeys.customers()));
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    expect(screen.queryByText("Atelier Nord")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Înregistrează clientul" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Client nou" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("files clients alphabetically under letter groups with monograms and an index of present letters", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, registry([LUMEN, ALPHA, { customerId: "cus-s", displayName: "Șantier Est SRL", status: "ACTIVE" }]))));
    render(<ClientsPage />);
    await screen.findByRole("link", { name: "Alpha Clima SRL" });
    const groups = screen.getAllByRole("rowheader").map((cell) => cell.textContent);
    expect(groups).toEqual(["A", "L", "S"]);
    const rows = screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-id"));
    expect(rows.map((row) => row.getAttribute("data-row-id"))).toEqual(["cus-a", "cus-l", "cus-s"]);
    expect(within(rows[0]!).getByText("AC")).toBeInTheDocument();
    const index = screen.getByRole("navigation", { name: "Index alfabetic al clienților" });
    expect(within(index).getByRole("button", { name: "Clienți la litera A" })).toBeEnabled();
    expect(within(index).getByRole("button", { name: "Niciun client la litera B" })).toBeDisabled();
  });

  it("separates open requests from offer and job totals", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, registry([ALPHA]))));
    render(<ClientsPage />);
    const row = (await screen.findByRole("link", { name: "Alpha Clima SRL" })).closest("tr")!;
    expect(within(row).getByText(/Cereri deschise/)).toHaveTextContent("Cereri deschise 1");
    expect(within(row).getByText(/oferte/)).toHaveTextContent("Total oferte 2 · lucrări 3");
  });

  it("selects a row into the URL and restores the selection from a direct link", async () => {
    window.history.replaceState({}, "", "/clienti");
    vi.stubGlobal("fetch", route({
      "/api/customers": () => jsonResponse(200, registry([ALPHA, LUMEN])),
      "/api/customers/cus-l/workspace": () => jsonResponse(200, workspace(LUMEN)),
    }));
    const { rerender } = render(<ClientsPage search="" />);
    const row = (await screen.findByRole("link", { name: "Lumen Signs SRL" })).closest("tr")!;
    await userEvent.click(row);
    expect(window.location.search).toBe("?client=cus-l");
    rerender(<ClientsPage search="?client=cus-l" />);
    expect(row).toHaveAttribute("data-selected");
    const card = await screen.findByRole("article", { name: "Cartela clientului Lumen Signs SRL" });
    expect(within(card).getByText("CUI RO41234567")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "0722 000 111" })).toHaveAttribute("href", "tel:0722000111");
    expect(within(card).getByRole("link", { name: "ioana@lumen.test" })).toHaveAttribute("href", "mailto:ioana@lumen.test");
    expect(await within(card).findByText("Clientul nu are încă cereri, oferte sau lucrări în WorkOS.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Cerere nouă/ })).toHaveAttribute("href", "/cereri/noua?customer=cus-l");
  });

  it("keeps the accepted keyboard model: arrows select, Enter opens the card, Escape returns to the row (N-018)", async () => {
    window.history.replaceState({}, "", "/clienti");
    vi.stubGlobal("fetch", route({
      "/api/customers": () => jsonResponse(200, registry([ALPHA, LUMEN])),
      "/api/customers/cus-a/workspace": () => jsonResponse(200, workspace(ALPHA)),
      "/api/customers/cus-l/workspace": () => jsonResponse(200, workspace(LUMEN)),
    }));
    const { rerender } = render(<ClientsPage search="" />);
    expect(await screen.findByText("↑ ↓ selectează · Enter deschide cartela · / caută")).toBeInTheDocument();
    const alpha = (await screen.findByRole("link", { name: "Alpha Clima SRL" })).closest("tr")!;
    alpha.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(window.location.search).toBe("?client=cus-l");
    rerender(<ClientsPage search="?client=cus-l" />);
    const lumen = screen.getAllByRole("row").find((row) => row.getAttribute("data-row-id") === "cus-l")!;
    expect(lumen).toHaveFocus();
    expect(lumen).toHaveAttribute("data-arrival-target");
    await userEvent.keyboard("{Enter}");
    const dossier = document.getElementById("clienti-dosar")!;
    await waitFor(() => expect(dossier).toHaveFocus());
    expect(window.location.pathname).toBe("/clienti");
    await userEvent.keyboard("{Escape}");
    expect(lumen).toHaveFocus();
    // The full client page stays one explicit action away.
    expect(within(lumen).getByRole("link", { name: "Deschide clientul" })).toHaveAttribute("href", "/clienti/cus-l");
  });

  it("groups the missing contact fields in one quiet line and keeps the card's attention and recent documents apart", async () => {
    vi.stubGlobal("fetch", route({
      "/api/customers": () => jsonResponse(200, registry([ALPHA])),
      "/api/customers/cus-a/workspace": () => jsonResponse(200, workspace(ALPHA, {
        requests: [{ requestId: "req-1", title: "Litere recepție", reference: "CER-1", status: "NEW", statusLabel: "Nouă", createdAt: "2026-10-20T10:00:00Z", needsAttention: false }],
        jobs: [{ jobId: "job-1", productCode: "P", productLabel: "Litere", inscription: "ALPHA", stage: "EXECUTION_PLANNED", stageLabel: "Plan de execuție", needsAttention: true, attentionLabel: "Lipsă utilaj dedicat", createdAt: "2026-10-21T10:00:00Z" }],
      }, false)),
    }));
    render(<ClientsPage search="?client=cus-a" />);
    const card = await screen.findByRole("article", { name: "Cartela clientului Alpha Clima SRL" });
    expect(within(card).getByText("Date de contact necompletate: CUI, persoană de contact, telefon, e-mail, localitate, adresă.")).toBeInTheDocument();
    expect(within(card).queryByText("necompletat")).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: /necompletat/i })).not.toBeInTheDocument();
    expect(await within(card).findByText("Necesită acțiune · 1")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "ALPHA" })).toHaveAttribute("href", "/lucrari?lucrare=job-1");
    expect(within(card).getByText("Ultimele documente · 1")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "CER-1" })).toHaveAttribute("href", "/cereri?cerere=req-1");
    // Without the server's permission the card offers no new request.
    expect(screen.queryByRole("link", { name: /Cerere nouă/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fișa clientului" })).toHaveAttribute("href", "/clienti/cus-a");
  });

  it("reads the card independently: a failed workspace read keeps the register and offers a retry", async () => {
    let fail = true;
    vi.stubGlobal("fetch", route({
      "/api/customers": () => jsonResponse(200, registry([ALPHA])),
      "/api/customers/cus-a/workspace": () => (fail ? jsonResponse(503, {}) : jsonResponse(200, workspace(ALPHA))),
    }));
    render(<ClientsPage search="?client=cus-a" />);
    expect(await screen.findByText("Documentele clientului nu au putut fi citite")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Alpha Clima SRL" })).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByText("Clientul nu are încă cereri, oferte sau lucrări în WorkOS.")).toBeInTheDocument();
  });

  it("never shows a late card answer for a client that is no longer selected", async () => {
    let releaseAlpha!: () => void;
    vi.stubGlobal("fetch", route({
      "/api/customers": () => jsonResponse(200, registry([ALPHA, LUMEN])),
      "/api/customers/cus-a/workspace": () => new Promise((resolve) => {
        releaseAlpha = () => resolve(jsonResponse(200, workspace(ALPHA, { quotes: [{ quoteSnapshotId: "q-late", productCode: "P", reference: "OF-LATE", needsAttention: true }] })));
      }).then((value) => value),
      "/api/customers/cus-l/workspace": () => jsonResponse(200, workspace(LUMEN)),
    }));
    const { rerender } = render(<ClientsPage search="?client=cus-a" />);
    await screen.findByText("Se citesc documentele clientului…");
    rerender(<ClientsPage search="?client=cus-l" />);
    const card = await screen.findByRole("article", { name: "Cartela clientului Lumen Signs SRL" });
    expect(await within(card).findByText("Clientul nu are încă cereri, oferte sau lucrări în WorkOS.")).toBeInTheDocument();
    await act(async () => { releaseAlpha(); });
    expect(screen.queryByText("OF-LATE")).not.toBeInTheDocument();
    expect(screen.getByRole("article", { name: "Cartela clientului Lumen Signs SRL" })).toBeInTheDocument();
  });

  it("filters by the signal board and clears a selection the filter hides", async () => {
    window.history.replaceState({}, "", "/clienti?client=cus-l");
    vi.stubGlobal("fetch", route({
      "/api/customers": () => jsonResponse(200, registry([ALPHA, LUMEN], { total: 2, active: 2, retired: 0, needsAttention: 1 })),
      "/api/customers/cus-l/workspace": () => jsonResponse(200, workspace(LUMEN)),
    }));
    render(<ClientsPage search="?client=cus-l" />);
    await screen.findByRole("article", { name: /Lumen Signs SRL/ });
    await userEvent.click(screen.getByRole("button", { name: /Necesită acțiune/ }));
    expect(screen.queryByRole("link", { name: "Lumen Signs SRL" })).not.toBeInTheDocument();
    expect(window.location.search).toBe("");
    expect(readClientsRegistryMemory().statusChip).toBe("attention");
  });

  it("creates a customer through the public customers API", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/customers") && init?.method === "POST") {
        return jsonResponse(201, { customer: { customerId: "cus-new", displayName: "Atelier Nord" } });
      }
      return jsonResponse(200, { customers: [], registry: { summary: { total: 0, active: 0, retired: 0, needsAttention: 0 }, customers: [] } });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsPage />);
    expect(document.querySelector('[data-surface="clients-registry"]')).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.setup().type(screen.getByLabelText("Denumire"), "Atelier Nord");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/customers",
        expect.objectContaining({ method: "POST", body: expect.stringContaining("Atelier Nord") }),
      );
    });
  });

  it("opens the hub by customerId when two clients share a name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(200, registry([
          { customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE", city: "Cluj" },
          { customerId: "cus-2", displayName: "Atelier Nord", status: "ACTIVE", city: "Iași" },
        ])),
      ),
    );
    render(<ClientsPage />);
    const links = await screen.findAllByRole("link", { name: "Atelier Nord" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(expect.arrayContaining(["/clienti/cus-1", "/clienti/cus-2"]));
    expect(screen.getByText(/^Cluj/)).toBeInTheDocument();
    expect(screen.getByText(/^Iași/)).toBeInTheDocument();
  });

  it("keeps search when the registry is shown again", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, registry([{ customerId: "cus-1", displayName: "Atelier Nord", status: "ACTIVE", city: "Cluj" }]))));
    const { unmount } = render(<ClientsPage />);
    await userEvent.setup().type(await screen.findByLabelText("Caută"), "Nord");
    unmount();
    render(<ClientsPage />);
    expect(await screen.findByLabelText("Caută")).toHaveValue("Nord");
  });

  it("retries after a denied registry read", async () => {
    const fetchMock = vi.fn(() => jsonResponse(403, { error: "forbidden" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientsPage />);
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(200, registry([])));
    await userEvent.setup().click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByText("Nu există încă clienți")).toBeInTheDocument();
  });

  it("asks before abandoning a typed name: staying keeps it, Renunță closes and discards (N-018)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, { registry: { customers: [] } })));
    render(<ClientsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.type(screen.getByLabelText("Denumire"), "Atelier nou");
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    const question = screen.getByRole("alertdialog", { name: "Renunți la clientul nou?" });
    expect(within(question).getByText("Denumirea introdusă nu este salvată.")).toBeInTheDocument();
    await userEvent.click(within(question).getByRole("button", { name: "Rămân în formular" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByLabelText("Denumire")).toHaveValue("Atelier nou");
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Renunță" }));
    expect(screen.queryByLabelText("Denumire")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Client nou" }));
    expect(screen.getByLabelText("Denumire")).toHaveValue("");
    // Without text, closing asks nothing.
    await userEvent.click(screen.getByRole("button", { name: "Închide formularul" }));
    expect(screen.queryByLabelText("Denumire")).not.toBeInTheDocument();
  });

  it("holds an in-app navigation while a name is typed and resumes it after Renunță (N-018)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, { registry: { customers: [] } })));
    window.history.replaceState({}, "", "/clienti");
    render(<ClientsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.type(screen.getByLabelText("Denumire"), "Atelier nou");
    act(() => navigate("/cereri"));
    expect(window.location.pathname).toBe("/clienti");
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Renunță" }));
    expect(window.location.pathname).toBe("/cereri");
  });

  it("does not navigate after a pending customer creation has left the page", async () => {
    let release!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo, init?: RequestInit) =>
      init?.method === "POST" ? new Promise((resolve) => { release = resolve; }) : jsonResponse(200, { registry: { customers: [] } }),
    ));
    window.history.replaceState({}, "", "/clienti");
    const { unmount } = render(<ClientsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Client nou" }));
    await userEvent.type(screen.getByLabelText("Denumire"), "Atelier nou");
    await userEvent.click(screen.getByRole("button", { name: "Înregistrează clientul" }));
    await waitFor(() => expect(release).toBeTypeOf("function"));
    unmount();
    window.history.replaceState({}, "", "/cereri");
    await act(async () => { release(await jsonResponse(201, { customer: { customerId: "cus-new", displayName: "Atelier nou" } })); });
    expect(window.location.pathname).toBe("/cereri");
  });

  describe("on a phone (compact agenda)", () => {
    function phone() {
      vi.stubGlobal("matchMedia", (query: string) => ({
        matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {},
      }));
    }

    it("puts Client nou in the header, filters as chips and the A–Z index behind a toggle", async () => {
      phone();
      vi.stubGlobal("fetch", route({ "/customers": () => jsonResponse(200, registry([ALPHA, LUMEN], { total: 2, active: 2, retired: 0, needsAttention: 1 })) }));
      render(<ClientsPage />);
      await screen.findByText("Alpha Clima SRL");

      const header = screen.getByRole("heading", { level: 1, name: "Clienți" }).closest("header")!;
      expect(within(header).getByRole("button", { name: "Client nou" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Client nou" })).toHaveLength(1);

      const toggle = screen.getByRole("button", { name: /Index alfabetic, litera curentă A/ });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(document.getElementById("clienti-index-compact")).toBeNull();
      await userEvent.click(toggle);
      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(document.getElementById("clienti-index-compact")).not.toBeNull();

      const attention = document.querySelector<HTMLButtonElement>('.rdesk-filterchips [data-signal-id="attention"]')!;
      // jsdom has no layout: the row is 200px wide and the chip sits past its right edge.
      const rect = (left: number, right: number) => ({ left, right, top: 0, bottom: 40, width: right - left, height: 40, x: left, y: 0, toJSON: () => ({}) });
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        if (this.classList.contains("rdesk-filterchips")) return rect(0, 200) as DOMRect;
        if (this.getAttribute("data-signal-id") === "attention") {
          const shift = document.querySelector(".rdesk-filterchips")?.scrollLeft ?? 0;
          return rect(250 - shift, 330 - shift) as DOMRect;
        }
        return rect(0, 0) as DOMRect;
      });
      await userEvent.click(attention);
      expect(attention).toHaveAttribute("aria-pressed", "true");
      expect(document.querySelector(".rdesk-filterchips")!.scrollLeft).toBe(130);
      expect(screen.queryByText("Lumen Signs SRL")).toBeNull();
    });
  });
});
