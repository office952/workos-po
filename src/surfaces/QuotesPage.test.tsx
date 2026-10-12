import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuotesPage } from "./QuotesPage";
import { invalidateResources, resetResourceCache } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

function stubQuotes(quotes: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/quotes") && !url.includes("/quotes/")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ overview: { quotes } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    }),
  );
}

const productCode = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";

describe("QuotesPage", () => {
  it("counts server attention flags instead of explanatory labels", async () => {
    stubQuotes([
      { quoteSnapshotId: "q-flag", productCode, reference: "OF-FLAG", needsAttention: true },
      { quoteSnapshotId: "q-copy", productCode, reference: "OF-COPY", needsAttention: false, attentionLabel: "Text explicativ" },
    ]);
    render(<QuotesPage />);
    await screen.findByRole("link", { name: /OF-FLAG/ });
    const metric = screen.getByText("Necesită atenție").parentElement!;
    expect(within(metric).getByText("1")).toBeInTheDocument();
  });

  it("explains a failed refresh of cached offers and retries", async () => {
    stubQuotes([{ quoteSnapshotId: "q-a", productCode, reference: "OF-A" }]);
    const success = vi.mocked(fetch).getMockImplementation()!;
    render(<QuotesPage />);
    await screen.findByRole("link", { name: /OF-A/ });
    vi.mocked(fetch).mockImplementation(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) } as Response));
    act(() => invalidateResources(resourceKeys.quotes()));
    expect(await screen.findByText("Datele afișate sunt de la ultima citire reușită.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OF-A/ })).toBeInTheDocument();
    vi.mocked(fetch).mockImplementation(success);
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(screen.queryByText("Lista nu a putut fi actualizată")).not.toBeInTheDocument();
  });
  it("keeps created quotes honest and does not treat createdAt as updatedAt", async () => {
    stubQuotes([
      {
        quoteSnapshotId: "q-1",
        productCode,
        productLabel: "Litere",
        reference: "OF-1",
        inscription: "NORD",
        customerDisplayName: "Atelier Nord",
        stage: "QUOTE_CREATED",
        stageLabel: "Creată",
        createdAt: "2026-09-01T10:00:00.000Z",
        nextAction: "ACCEPT_QUOTE",
        nextActionLabel: "Marchează acceptată",
        requestId: "req-1",
        requestReference: "CRQ-104",
      },
    ]);

    render(<QuotesPage />);
    expect(await screen.findByRole("link", { name: /OF-1/ })).toBeInTheDocument();
    expect(screen.getAllByText("Creată").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /OF-1/ })).toHaveAttribute(
      "href",
      `/quotes/${productCode}/q-1`,
    );
    expect(screen.getByRole("link", { name: "Deschide oferta" })).toHaveAttribute(
      "href",
      `/quotes/${productCode}/q-1`,
    );
    expect(screen.queryByText("Marchează acceptată")).not.toBeInTheDocument();
    expect(screen.queryByText("Actualizat")).not.toBeInTheDocument();
  });

  it("routes OPEN_ORDER to the resulting job", async () => {
    stubQuotes([
      {
        quoteSnapshotId: "q-2",
        productCode,
        productLabel: "Litere",
        reference: "OF-2",
        inscription: "NORD",
        customerDisplayName: "Atelier Nord",
        stage: "ORDER_CREATED",
        stageLabel: "Cu comandă",
        createdAt: "2026-09-02T10:00:00.000Z",
        nextAction: "OPEN_ORDER",
        nextActionLabel: "Deschide comanda",
        orderSnapshotId: "ord-1",
      },
    ]);

    render(<QuotesPage />);
    expect(await screen.findByRole("link", { name: "Deschide comanda" })).toHaveAttribute(
      "href",
      "/lucrari/ord-1",
    );
    expect(screen.getByRole("link", { name: /OF-2/ })).toHaveAttribute(
      "href",
      `/quotes/${productCode}/q-2`,
    );
  });

  it("lists standalone and assembly offers together and filters by kind", async () => {
    stubQuotes([
      {
        quoteSnapshotId: "q-solo",
        kind: "PRODUCT",
        kindLabel: "Produs",
        sectionCount: 1,
        productCode,
        productLabel: "Litere",
        reference: "OF-SOLO",
        customerDisplayName: "Client Simplu",
        stage: "QUOTE_CREATED",
        stageLabel: "Creată",
        grossDisplay: "624,82",
        currency: "EUR",
        nextAction: "ACCEPT_QUOTE",
      },
      {
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
        stage: "QUOTE_CREATED",
        stageLabel: "Creată",
        grossDisplay: "743,48",
        currency: "EUR",
        nextAction: "OPEN_ASSEMBLY",
        nextActionLabel: "Deschide ansamblul",
      },
    ]);

    render(<QuotesPage />);
    const assembly = await screen.findByRole("link", { name: /OF-ASM/ });
    expect(assembly).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    expect(assembly).toHaveTextContent("Ansamblu · PANOU · WORKOS · CRQ-7");
    expect(screen.getByText("Panou ACM + litere volumetrice · 2 secțiuni")).toBeInTheDocument();
    expect(screen.getByText(/743,48 EUR/)).toBeInTheDocument();
    expect(screen.getByText(/CRQ-7/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide ansamblul" })).toHaveAttribute(
      "href",
      "/ansamblu?assembly=asm%3A1",
    );
    expect(screen.getByRole("link", { name: /OF-SOLO/ })).toHaveAttribute(
      "href",
      `/quotes/${productCode}/q-solo`,
    );

    await userEvent.click(screen.getByRole("button", { name: "Ansambluri" }));
    expect(screen.getByRole("link", { name: /OF-ASM/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /OF-SOLO/ })).not.toBeInTheDocument();
  });

  it("shows no kind filter for standalone-only registries", async () => {
    stubQuotes([{ quoteSnapshotId: "q-a", productCode, reference: "OF-A", stageLabel: "Creată" }]);
    render(<QuotesPage />);
    await screen.findByRole("link", { name: /OF-A/ });
    expect(screen.queryByRole("button", { name: "Ansambluri" })).not.toBeInTheDocument();
  });
});
