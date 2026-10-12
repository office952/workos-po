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
  const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
    void init;
    const url = String(input);
    if (url.endsWith("/quotes") && !url.includes("/quotes/")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ overview: { quotes } }),
      });
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

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

function table() {
  return within(screen.getByRole("table", { name: "Lista de oferte" }));
}

describe("QuotesPage", () => {
  it("counts server attention flags instead of explanatory labels and filters by them", async () => {
    stubQuotes([
      { quoteSnapshotId: "q-flag", productCode, reference: "OF-FLAG", needsAttention: true },
      { quoteSnapshotId: "q-copy", productCode, reference: "OF-COPY", needsAttention: false, attentionLabel: "Text explicativ" },
    ]);
    render(<QuotesPage />);
    await screen.findByRole("link", { name: "OF-FLAG" });
    const metric = screen.getByRole("button", { name: /Necesită atenție/ });
    expect(metric).toHaveTextContent("01");
    expect(screen.getByRole("button", { name: /Oferte/ })).toHaveTextContent("02");
    await userEvent.click(metric);
    expect(metric).toHaveAttribute("aria-pressed", "true");
    expect(table().getByRole("link", { name: "OF-FLAG" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "OF-COPY" })).not.toBeInTheDocument();
    expect(screen.getByText("1 din 2")).toBeInTheDocument();
  });

  it("explains a failed refresh of cached offers and retries", async () => {
    stubQuotes([{ quoteSnapshotId: "q-a", productCode, reference: "OF-A" }]);
    const success = vi.mocked(fetch).getMockImplementation()!;
    render(<QuotesPage />);
    await screen.findByRole("link", { name: "OF-A" });
    vi.mocked(fetch).mockImplementation(() => Promise.resolve({ ok: false, status: 503, json: async () => ({}) } as Response));
    act(() => invalidateResources(resourceKeys.quotes()));
    expect(await screen.findByText("Datele afișate sunt de la ultima citire reușită.")).toBeInTheDocument();
    expect(table().getByRole("link", { name: "OF-A" })).toBeInTheDocument();
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
    expect(await screen.findByRole("link", { name: "OF-1" })).toHaveAttribute("href", `/quotes/${productCode}/q-1`);
    expect(table().getByRole("link", { name: "Deschide oferta" })).toHaveAttribute("href", `/quotes/${productCode}/q-1`);
    expect(table().getByText("CRQ-104")).toBeInTheDocument();
    expect(screen.queryByText("Marchează acceptată")).not.toBeInTheDocument();
    expect(screen.queryByText("Actualizat")).not.toBeInTheDocument();
  });

  it("opens the quote from its identity and the order from the separate action", async () => {
    stubQuotes([
      {
        quoteSnapshotId: "q-2",
        productCode,
        productLabel: "Litere",
        reference: "OF-2",
        customerDisplayName: "Atelier Nord",
        stage: "ORDER_CREATED",
        stageLabel: "Cu comandă",
        nextAction: "OPEN_ORDER",
        nextActionLabel: "Deschide comanda",
        orderSnapshotId: "ord-1",
      },
    ]);

    render(<QuotesPage />);
    await screen.findByRole("link", { name: "OF-2" });
    expect(table().getByRole("link", { name: "OF-2" })).toHaveAttribute("href", `/quotes/${productCode}/q-2`);
    expect(table().getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/ord-1");
  });

  it("lists standalone and assembly offers together, with kind, value and combinable filters", async () => {
    stubQuotes([standalone, assembly]);
    render(<QuotesPage />);
    const assemblyLink = await screen.findByRole("link", { name: "OF-ASM" });
    expect(assemblyLink).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    const assemblyRow = assemblyLink.closest("tr")!;
    expect(within(assemblyRow).getByText("Ansamblu · 2 secțiuni")).toBeInTheDocument();
    expect(within(assemblyRow).getByText("Panou ACM + litere volumetrice")).toBeInTheDocument();
    expect(within(assemblyRow).getByText("743,48 EUR")).toBeInTheDocument();
    expect(within(assemblyRow).getByText("CRQ-7")).toBeInTheDocument();
    expect(within(assemblyRow).getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    const soloRow = table().getByRole("link", { name: "OF-SOLO" }).closest("tr")!;
    expect(soloRow).toHaveAttribute("data-attention", "true");
    expect(within(soloRow).getByText("Produs")).toBeInTheDocument();
    expect(within(soloRow).getByText("624,82 EUR")).toBeInTheDocument();

    const kind = screen.getByRole("group", { name: "Tip" });
    await userEvent.click(within(kind).getByRole("button", { name: "Ansambluri" }));
    expect(table().getByRole("link", { name: "OF-ASM" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "OF-SOLO" })).not.toBeInTheDocument();

    const stage = screen.getByRole("group", { name: "Stare" });
    await userEvent.click(within(stage).getByRole("button", { name: "Creată" }));
    expect(screen.getByText("Nicio ofertă nu corespunde filtrului.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Resetează filtrele/ }));
    expect(table().getByRole("link", { name: "OF-SOLO" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Caută" })).toHaveFocus();

    await userEvent.type(screen.getByRole("searchbox", { name: "Caută" }), "CRQ-7");
    expect(table().getByRole("link", { name: "OF-ASM" })).toBeInTheDocument();
    expect(table().queryByRole("link", { name: "OF-SOLO" })).not.toBeInTheDocument();
  });

  it("previews the latest quote and switches the sheet to a selected row without mutating", async () => {
    const fetchMock = stubQuotes([standalone, assembly]);
    render(<QuotesPage />);
    await screen.findByRole("link", { name: "OF-ASM" });
    const sheet = within(screen.getByLabelText("Fișă ofertă"));
    expect(sheet.getByText("Ultima ofertă")).toBeInTheDocument();
    expect(sheet.getByText("OF-ASM")).toBeInTheDocument();
    expect(sheet.getByRole("link", { name: "Deschide oferta" })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A1");
    expect(sheet.getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A1");

    const soloRow = screen.getByRole("row", { name: "Previzualizează oferta OF-SOLO" });
    await userEvent.click(within(soloRow).getByText("Client Simplu"));
    expect(soloRow).toHaveAttribute("aria-selected", "true");
    expect(sheet.getByText("Ofertă selectată")).toBeInTheDocument();
    expect(sheet.getByText("OF-SOLO")).toBeInTheDocument();
    expect(sheet.queryByRole("link", { name: "Deschide comanda" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every((call) => (call[1]?.method ?? "GET") === "GET")).toBe(true);
  });

  it("shows no kind filter for standalone-only registries", async () => {
    stubQuotes([{ quoteSnapshotId: "q-a", productCode, reference: "OF-A", stageLabel: "Creată" }]);
    render(<QuotesPage />);
    await screen.findByRole("link", { name: "OF-A" });
    expect(screen.queryByRole("group", { name: "Tip" })).not.toBeInTheDocument();
  });
});
