import { render, screen } from "@testing-library/react";
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
  it("keeps the collection workspace and prefers request identity over title", async () => {
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
    expect(document.querySelector(".ui-panel--flush")).not.toBeNull();
    expect(await screen.findByText("CRQ-104")).toBeInTheDocument();
    expect(screen.getByText("Litere vitrină")).toBeInTheDocument();
    expect(document.querySelector(".requests-card")).toBeNull();
    expect(screen.queryByText("Actualizat")).not.toBeInTheDocument();
    expect(screen.getByText("Creată")).toBeInTheDocument();
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
