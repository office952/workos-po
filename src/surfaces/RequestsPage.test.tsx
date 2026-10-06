import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestsPage } from "./RequestsPage";

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
  it("sorts chronologically in both directions and keeps unknown dates last", async () => {
    stubRequests([
      { requestId: "old", title: "Veche", statusLabel: "Nouă", createdAt: "2026-09-01T10:00:00Z", nextAction: "OPEN_REQUEST" },
      { requestId: "unknown", title: "Fără dată", statusLabel: "Nouă", createdAt: "invalid", nextAction: "OPEN_REQUEST" },
      { requestId: "new", title: "Recentă", statusLabel: "Nouă", createdAt: "2026-10-01T10:00:00Z", nextAction: "OPEN_REQUEST" },
    ]);
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Recentă" });
    const titles = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("link")[0].textContent);
    expect(titles()).toEqual(["Recentă", "Veche", "Fără dată"]);
    await userEvent.setup().selectOptions(screen.getByRole("combobox", { name: "Ordine" }), "oldest");
    expect(titles()).toEqual(["Veche", "Recentă", "Fără dată"]);
    expect(screen.getByRole("columnheader", { name: /Creată/ })).toHaveAttribute("aria-sort", "ascending");
  });

  it("combines attention and search and resets a filtered empty result", async () => {
    stubRequests([
      { requestId: "a", title: "Litere", customerDisplayName: "Nord", statusLabel: "Nouă", needsAttention: true, nextAction: "OPEN_REQUEST" },
      { requestId: "b", title: "Totem", customerDisplayName: "Nord", statusLabel: "Nouă", needsAttention: false, nextAction: "OPEN_REQUEST" },
    ]);
    const user = userEvent.setup();
    render(<RequestsPage />);
    await screen.findByRole("link", { name: "Litere" });
    await user.click(screen.getByRole("button", { name: /Necesită acțiune/ }));
    await user.type(screen.getByRole("searchbox", { name: "Caută" }), "Totem");
    expect(screen.getByText("Nicio cerere nu corespunde filtrului.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("0 din 2");
    await user.click(screen.getByRole("button", { name: /Resetează filtrele/ }));
    expect(screen.getByRole("searchbox", { name: "Caută" })).toHaveValue("");
    expect(screen.getByRole("link", { name: "Totem" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 din 2");
  });

  it("keeps failures and empty registries distinct from business counts", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Offline"))));
    render(<RequestsPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Cererile nu au putut fi citite");
    expect(screen.queryByRole("link", { name: "Alege produs" })).not.toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
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
    expect(screen.getByRole("heading", { name: "Cereri de ofertă" })).toBeInTheDocument();
    expect(await screen.findByText("CRQ-104")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Lista de cereri" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Litere vitrină.*CRQ-104/ })).toHaveAttribute("href", "/cereri/req-1");
    expect(screen.getByText("Litere vitrină")).toBeInTheDocument();
    expect(document.querySelector(".requests-card")).toBeNull();
    expect(screen.queryByText("Actualizat")).not.toBeInTheDocument();
    expect(screen.getByText("Creată")).toBeInTheDocument();
    expect(screen.getByText("Progres comercial")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cerere nouă" })).toHaveAttribute("href", "/clienti");
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Necesită acțiune", { selector: ".requests-instrument__metric-label" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 din 1");
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
    expect(await screen.findByText("Nouă", { selector: ".status" })).toBeInTheDocument();
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
    expect(await screen.findByText("CRQ-1")).toBeInTheDocument();
    expect(screen.getByText("CRQ-2")).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: /Necesită acțiune/ }));
    expect(screen.getByText("CRQ-1")).toBeInTheDocument();
    expect(screen.queryByText("CRQ-2")).not.toBeInTheDocument();
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
    expect(await screen.findByRole("link", { name: /CRQ-104/ })).toHaveAttribute(
      "href",
      "/cereri/req-1",
    );
    expect(screen.getByRole("link", { name: "Deschide oferta" })).toHaveAttribute(
      "href",
      "/quotes/PRD-LETTERS-FRONTLIT-PLEXI-AL06/q-1",
    );
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
    expect(await screen.findByRole("link", { name: "Alege produs" })).toHaveAttribute(
      "href",
      "/catalog?customer=cus-9&request=req-2",
    );
    expect(screen.getByRole("link", { name: /CRQ-105/ })).toHaveAttribute("href", "/cereri/req-2");
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
    expect(await screen.findByRole("link", { name: /CER-C4D4C0E8/ })).toHaveAttribute(
      "href",
      "/cereri/req-3",
    );
    expect(screen.getByRole("link", { name: "Deschide oferta" })).toHaveAttribute(
      "href",
      "/quotes/PRD-ACM-CASSETTE-NONE/qts%3APRD-ACM-CASSETTE-NONE%3Aabffbb338a5a65fc2f9c69d41798d58f4fb73d27e4941df6a05052bddb2ca6d4",
    );
  });
});
