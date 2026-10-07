import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestsPage } from "./RequestsPage";
import { writeResource } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import { presentRequestList } from "../adapters/requestAdapter";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubRequests(requests: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/requests")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ overview: { requests } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }),
  );
}

describe("RequestsPage", () => {
  const manyRequests = (length: number) => Array.from({ length }, (_, index) => ({
    requestId: `page-${index + 1}`,
    title: `Cerere ${String(index + 1).padStart(2, "0")}`,
    reference: `CER-PAGE-${index + 1}`,
    statusLabel: "Nouă",
    createdAt: new Date(Date.UTC(2026, 9, 6, 12) - index * 60_000).toISOString(),
    needsAttention: index % 2 === 0,
    nextAction: "OPEN_REQUEST",
  }));

  it("previews an explicitly selected row without changing navigation or reacting to hover", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Ultima intrare: Cerere 01" });
    const row = screen.getByRole("row", { name: "Previzualizează cererea: Cerere 02" });
    await user.hover(row);
    expect(screen.getByRole("link", { name: "Ultima intrare: Cerere 01" })).toBeInTheDocument();
    await user.click(within(row).getByText("Fără client"));
    expect(screen.getByRole("link", { name: "Cerere selectată: Cerere 02" })).toHaveAttribute("href", "/cereri/page-2");
    expect(row).toHaveAttribute("aria-selected", "true");
    const first = screen.getByRole("row", { name: "Previzualizează cererea: Cerere 01" });
    const identity = within(first).getByRole("link", { name: /Cerere 01/ });
    identity.addEventListener("click", (event) => event.preventDefault());
    await user.click(identity);
    const next = within(first).getByRole("link", { name: "Deschide" });
    next.addEventListener("click", (event) => event.preventDefault());
    await user.click(next);
    expect(identity).toHaveAttribute("href", "/cereri/page-1");
    expect(next).toHaveAttribute("href", "/cereri/page-1");
    expect(screen.getByRole("link", { name: "Cerere selectată: Cerere 02" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Următor" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Ordine" }), "oldest");
    await user.type(screen.getByRole("searchbox", { name: "Caută" }), "Cerere 23");
    expect(screen.getByRole("link", { name: "Cerere selectată: Cerere 02" })).toBeInTheDocument();
    act(() => writeResource(resourceKeys.requests(), presentRequestList({ overview: { requests: manyRequests(1) } })));
    expect(screen.getByRole("link", { name: "Ultima intrare: Cerere 01" })).toBeInTheDocument();
    act(() => writeResource(resourceKeys.requests(), presentRequestList({ overview: { requests: manyRequests(23) } })));
    expect(screen.queryByRole("link", { name: "Cerere selectată: Cerere 02" })).not.toBeInTheDocument();
  });

  it("supports Enter and Space on a row while preserving its table semantics", async () => {
    stubRequests(manyRequests(3));
    const user = userEvent.setup();
    render(<RequestsPage />);
    const row = await screen.findByRole("row", { name: "Previzualizează cererea: Cerere 02" });
    row.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("link", { name: "Cerere selectată: Cerere 02" })).toBeInTheDocument();
    screen.getByRole("row", { name: "Previzualizează cererea: Cerere 03" }).focus();
    await user.keyboard(" ");
    expect(screen.getByRole("link", { name: "Cerere selectată: Cerere 03" })).toBeInTheDocument();
  });

  it("does not mount decorative images or invisible row actions on a phone and responds to viewport changes", async () => {
    const media = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("matchMedia", vi.fn(() => media));
    stubRequests(manyRequests(2));
    render(<RequestsPage />);
    await screen.findByRole("link", { name: /Cerere 01.*CER-PAGE-1/ });
    expect(document.querySelector(".requests-intake img")).toBeNull();
    const row = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(row).not.toHaveAttribute("tabindex");
    act(() => { media.matches = true; media.addEventListener.mock.calls[0][1](); });
    expect(document.querySelector(".requests-intake img")).not.toBeNull();
    expect(row).toHaveAttribute("tabindex", "0");
    act(() => { media.matches = false; media.addEventListener.mock.calls[0][1](); });
    expect(document.querySelector(".requests-intake img")).toBeNull();
  });

  it("paginates all results with correct boundaries and resets page size", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: /Cerere 01.*CER-PAGE-1/ });
    const table = within(screen.getByRole("table"));
    expect(table.getAllByRole("row")).toHaveLength(11);
    expect(screen.getByRole("status")).toHaveTextContent("1–10 din 23 cereri");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Următor" }));
    expect(table.getByRole("link", { name: /Cerere 11.*CER-PAGE-11/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("11–20 din 23 cereri");
    await user.click(screen.getByRole("button", { name: "Următor" }));
    expect(table.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent("21–23 din 23 cereri");
    expect(screen.getByRole("button", { name: "Pagina 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Următor" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("status")).toHaveTextContent("11–20 din 23 cereri");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pe pagină" }), "20");
    expect(table.getAllByRole("row")).toHaveLength(21);
    expect(screen.getByRole("status")).toHaveTextContent("1–20 din 23 cereri");
    await user.selectOptions(screen.getByRole("combobox", { name: "Pe pagină" }), "50");
    expect(table.getAllByRole("row")).toHaveLength(24);
    expect(screen.getByRole("button", { name: "Următor" })).toBeDisabled();
  });

  it("searches beyond the current page and applies sort and attention before pagination", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: /Cerere 01.*CER-PAGE-1/ });
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    await user.type(screen.getByRole("searchbox", { name: "Caută" }), "Cerere 02");
    expect(screen.getByRole("status")).toHaveTextContent("1–1 din 1 cereri");
    expect(screen.getByRole("button", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
    await user.clear(screen.getByRole("searchbox", { name: "Caută" }));
    await user.click(screen.getByRole("button", { name: "Pagina 2" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Ordine" }), "oldest");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Cerere 23");
    expect(screen.getByRole("button", { name: "Pagina 1" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Pagina 2" }));
    await user.click(screen.getByRole("button", { name: /Necesită acțiune/ }));
    expect(screen.getByRole("status")).toHaveTextContent("1–10 din 12 cereri");
    expect(screen.getByRole("link", { name: "Ultima intrare: Cerere 01" })).toHaveAttribute("href", "/cereri/page-1");
  });

  it("clamps a page when the refreshed collection shrinks and removes pagination when empty", async () => {
    stubRequests(manyRequests(23));
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: /Cerere 01.*CER-PAGE-1/ });
    await user.click(screen.getByRole("button", { name: "Pagina 3" }));
    act(() => writeResource(resourceKeys.requests(), presentRequestList({ overview: { requests: manyRequests(4) } })));
    expect(screen.getByRole("status")).toHaveTextContent("1–4 din 4 cereri");
    expect(screen.getByRole("button", { name: "Următor" })).toBeDisabled();
    act(() => writeResource(resourceKeys.requests(), presentRequestList({ overview: { requests: manyRequests(23) } })));
    expect(screen.getByRole("status")).toHaveTextContent("1–10 din 23 cereri");
    act(() => writeResource(resourceKeys.requests(), []));
    expect(screen.queryByRole("navigation", { name: "Paginare cereri" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Ultima intrare/ })).not.toBeInTheDocument();
  });

  it("sorts chronologically in both directions and keeps unknown dates last", async () => {
    stubRequests([
      {
        requestId: "old",
        title: "Veche",
        statusLabel: "Nouă",
        createdAt: "2026-09-01T10:00:00Z",
        nextAction: "OPEN_REQUEST",
      },
      {
        requestId: "unknown",
        title: "Fără dată",
        statusLabel: "Nouă",
        createdAt: "invalid",
        nextAction: "OPEN_REQUEST",
      },
      {
        requestId: "new",
        title: "Recentă",
        statusLabel: "Nouă",
        createdAt: "2026-10-01T10:00:00Z",
        nextAction: "OPEN_REQUEST",
      },
    ]);
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Recentă" });
    const titles = () =>
      within(screen.getByRole("table"))
        .getAllByRole("row")
        .slice(1)
        .map((row) => within(row).getAllByRole("link")[0].textContent);
    expect(titles()).toEqual(["Recentă", "Veche", "Fără dată"]);
    await userEvent
      .setup()
      .selectOptions(
        screen.getByRole("combobox", { name: "Ordine" }),
        "oldest",
      );
    expect(titles()).toEqual(["Veche", "Recentă", "Fără dată"]);
    expect(
      screen.getByRole("columnheader", { name: /Creată/ }),
    ).toHaveAttribute("aria-sort", "ascending");
  });

  it("combines attention and search and resets a filtered empty result", async () => {
    stubRequests([
      {
        requestId: "a",
        title: "Litere",
        customerDisplayName: "Nord",
        statusLabel: "Nouă",
        needsAttention: true,
        nextAction: "OPEN_REQUEST",
      },
      {
        requestId: "b",
        title: "Totem",
        customerDisplayName: "Nord",
        statusLabel: "Nouă",
        needsAttention: false,
        nextAction: "OPEN_REQUEST",
      },
    ]);
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Litere" });
    await user.click(screen.getByRole("button", { name: /Necesită acțiune/ }));
    await user.type(screen.getByRole("searchbox", { name: "Caută" }), "Totem");
    expect(
      screen.getByText("Nicio cerere nu corespunde filtrului."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 din 2");
    await user.click(
      screen.getByRole("button", { name: /Resetează filtrele/ }),
    );
    expect(screen.getByRole("searchbox", { name: "Caută" })).toHaveValue("");
    expect(screen.getByRole("link", { name: "Totem" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1–2 din 2 cereri");
  });

  it("does not present a failed load as an empty registry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Offline"))),
    );
    render(<RequestsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cererile nu au putut fi citite",
    );
    expect(
      screen.queryByRole("link", { name: "Alege produs" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows zero counts and the client entry point for a successfully empty registry", async () => {
    stubRequests([]);
    render(<RequestsPage />);
    expect(await screen.findByText("Nu există cereri")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 din 0");
    expect(screen.getAllByText("00")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Începe de la un client" })).toHaveAttribute("href", "/clienti");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("presents the work title and reference in an accessible register", async () => {
    stubRequests([
      {
        requestId: "req-1",
        title: "Litere vitrină",
        reference: "CRQ-104",
        customerId: "cus-1",
        customerDisplayName: "Atelier Nord",
        statusLabel: "Deschisă",
        commercialProgressLabel: "Fără ofertă",
        createdAt: "2026-09-01T10:00:00.000Z",
        nextAction: "OPEN_REQUEST",
        nextActionLabel: "Deschide",
      },
    ]);

    render(<RequestsPage />);
    expect(document.querySelector(".page-workspace--stack")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Cereri de ofertă" }),
    ).toBeInTheDocument();
    expect(await within(screen.getByRole("table")).findByText("CRQ-104")).toBeInTheDocument();
    expect(
      screen.getByRole("table", { name: "Lista de cereri" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Litere vitrină.*CRQ-104/ }),
    ).toHaveAttribute("href", "/cereri/req-1");
    expect(within(screen.getByRole("table")).getByText("Litere vitrină")).toBeInTheDocument();
    expect(document.querySelector(".requests-card")).toBeNull();
    expect(screen.queryByText("Actualizat")).not.toBeInTheDocument();
    expect(screen.getByText("Creată")).toBeInTheDocument();
    expect(screen.getByText("Progres comercial")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cerere nouă" })).toHaveAttribute(
      "href",
      "/clienti",
    );
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(
      screen.getByText("Necesită acțiune", {
        selector: ".requests-instrument__metric-label",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1–1 din 1 cereri");
  });

  it("keeps canonical Request state separate from commercial progress", async () => {
    stubRequests([
      {
        requestId: "req-3",
        title: "Caseta",
        reference: "CER-C4D4C0E8",
        customerId: "cus-2",
        customerDisplayName: "NORD MARKET DEMO SRL",
        status: "NEW",
        statusLabel: "Nouă",
        commercialProgressLabel: "Ofertă creată",
        createdAt: "2026-09-21T19:27:00.000Z",
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        nextActionHref:
          "/quotes/qts%3APRD-ACM-CASSETTE-NONE%3Aabffbb338a5a65fc2f9c69d41798d58f4fb73d27e4941df6a05052bddb2ca6d4",
      },
    ]);

    render(<RequestsPage />);
    expect(
      await screen.findByText("Nouă", { selector: ".status" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ofertă creată")).toBeInTheDocument();
  });

  it("filters Necesită acțiune from canonical needsAttention", async () => {
    stubRequests([
      {
        requestId: "req-1",
        title: "Atenție",
        reference: "CRQ-1",
        customerId: "cus-1",
        customerDisplayName: "Client A",
        statusLabel: "Nouă",
        createdAt: "2026-09-01T10:00:00.000Z",
        nextAction: "OPEN_REQUEST",
        nextActionLabel: "Deschide",
        needsAttention: true,
      },
      {
        requestId: "req-2",
        title: "Calm",
        reference: "CRQ-2",
        customerId: "cus-2",
        customerDisplayName: "Client B",
        statusLabel: "Nouă",
        createdAt: "2026-09-01T11:00:00.000Z",
        nextAction: "OPEN_REQUEST",
        nextActionLabel: "Deschide",
        needsAttention: false,
      },
    ]);

    render(<RequestsPage />);
    expect(await within(screen.getByRole("table")).findByText("CRQ-1")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("CRQ-2")).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Necesită acțiune/ }));
    expect(within(screen.getByRole("table")).getByText("CRQ-1")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("CRQ-2")).not.toBeInTheDocument();
  });

  it("opens request identity while OPEN_QUOTE opens the quote", async () => {
    stubRequests([
      {
        requestId: "req-1",
        title: "Litere vitrină",
        reference: "CRQ-104",
        customerId: "cus-1",
        customerDisplayName: "Atelier Nord",
        statusLabel: "Gata de ofertă",
        createdAt: "2026-09-01T10:00:00.000Z",
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        needsAttention: true,
        attentionLabel: "Urmează oferta",
        linkedQuoteSnapshotId: "q-1",
        linkedQuoteProductCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      },
    ]);

    render(<RequestsPage />);
    expect(
      await screen.findByRole("link", { name: /CRQ-104/ }),
    ).toHaveAttribute("href", "/cereri/req-1");
    expect(
      screen.getByRole("link", { name: "Deschide oferta" }),
    ).toHaveAttribute("href", "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1");
    expect(screen.getByText(/Urmează oferta/)).toBeInTheDocument();
  });

  it("preserves customer and request context for CHOOSE_PRODUCT", async () => {
    stubRequests([
      {
        requestId: "req-2",
        title: "Litere",
        reference: "CRQ-105",
        customerId: "cus-9",
        customerDisplayName: "Client Nord",
        statusLabel: "Gata de ofertă",
        createdAt: "2026-09-01T10:00:00.000Z",
        nextAction: "CHOOSE_PRODUCT",
        nextActionLabel: "Alege produs",
      },
    ]);

    render(<RequestsPage />);
    expect(
      await screen.findByRole("link", { name: "Alege produs" }),
    ).toHaveAttribute("href", "/catalog?customer=cus-9&request=req-2");
    expect(screen.getByRole("link", { name: /CRQ-105/ })).toHaveAttribute(
      "href",
      "/cereri/req-2",
    );
  });

  it("maps OPEN_QUOTE from current-main nextActionHref", async () => {
    stubRequests([
      {
        requestId: "req-3",
        title: "Caseta",
        reference: "CER-C4D4C0E8",
        customerId: "cus-2",
        customerDisplayName: "NORD MARKET DEMO SRL",
        status: "NEW",
        statusLabel: "Nouă",
        commercialProgressLabel: "Ofertă creată",
        createdAt: "2026-09-21T19:27:00.000Z",
        nextAction: "OPEN_QUOTE",
        nextActionLabel: "Deschide oferta",
        nextActionHref:
          "/quotes/qts%3APRD-ACM-CASSETTE-NONE%3Aabffbb338a5a65fc2f9c69d41798d58f4fb73d27e4941df6a05052bddb2ca6d4",
      },
    ]);

    render(<RequestsPage />);
    expect(
      await screen.findByRole("link", { name: /CER-C4D4C0E8/ }),
    ).toHaveAttribute("href", "/cereri/req-3");
    expect(
      screen.getByRole("link", { name: "Deschide oferta" }),
    ).toHaveAttribute(
      "href",
      "/quotes/PRD-ACM-CASSETTE-NONE/qts%3APRD-ACM-CASSETTE-NONE%3Aabffbb338a5a65fc2f9c69d41798d58f4fb73d27e4941df6a05052bddb2ca6d4",
    );
  });
});
