import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssemblyQuotePage } from "./AssemblyQuotePage";
import { resetResourceCache } from "../data/resourceCache";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

const item = {
  quoteSnapshotId: "asmq:1",
  kind: "ASSEMBLY",
  kindLabel: "Ansamblu",
  assemblyId: "asm:1",
  sectionCount: 2,
  superseded: false,
  productCode: "SIGN_ASSEMBLY_ACM_LETTERS_V1",
  productLabel: "Panou ACM + litere volumetrice",
  reference: "OF-ASM",
  customerDisplayName: "Client Ansamblu",
  requestId: "crq:1",
  requestReference: "CRQ-7",
  stage: "ORDER_CREATED",
  stageLabel: "Cu comandă",
  nextAction: "OPEN_ORDER",
  orderSnapshotId: "asmo:1",
};

function section(memberId: string, roleLabel: string, netPrice: number, vatAmount: number) {
  return {
    memberId,
    roleLabel,
    productLabel: roleLabel,
    inscription: "WORKOS",
    netPrice,
    vatPercent: 21,
    vatAmount,
    grossPrice: Math.round((netPrice + vatAmount) * 100) / 100,
    currency: "EUR",
  };
}

const assemblyQuote = {
  label: "Panou ACM + litere volumetrice",
  assemblyId: "asm:1",
  requestId: "crq:1",
  superseded: false,
  sections: [section("m-acm", "Panou ACM", 98.07, 20.59), section("m-letters", "Litere", 516.38, 108.44)],
  serviceSection: null,
  totals: { netPrice: 614.45, vatAmount: 129.03, grossPrice: 743.48, currency: "EUR" },
  orderSnapshotId: "asmo:1",
  productionSnapshotId: "asmp:1",
};

const unacceptedEnvelope = {
  quote: { ...item, stage: "QUOTE_CREATED", stageLabel: "Creată", nextAction: "OPEN_ASSEMBLY", orderSnapshotId: null },
  assemblyQuote: { ...assemblyQuote, orderSnapshotId: null, productionSnapshotId: null },
};

function stub(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => body })),
  );
}

type AcceptResponse = { ok: boolean; status: number; json: () => Promise<unknown> };

/** Owner view of an acceptable quote; `null` simulates a network failure on acceptance. */
function acceptanceServer(acceptResponse: AcceptResponse | null) {
  const fetchMock = vi.fn((_path: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return acceptResponse ? Promise.resolve(acceptResponse) : Promise.reject(new TypeError("Failed to fetch"));
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ ...unacceptedEnvelope, acceptance: { canAccept: true, reason: null } }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function posts(fetchMock: ReturnType<typeof acceptanceServer>) {
  return fetchMock.mock.calls
    .filter(([, init]) => init?.method === "POST")
    .map(([path, init]) => [path, JSON.parse(String(init?.body))]);
}

describe("AssemblyQuotePage", () => {
  it("shows two traceable sections, totals and links without mutation commands", async () => {
    stub({ quote: item, assemblyQuote });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    const summary = await screen.findByRole("region", { name: "Rezumat comercial" });
    expect(within(summary).getByTestId("quote-total")).toHaveTextContent("743,48 EUR");
    expect(within(summary).getByTestId("quote-total")).toHaveTextContent("Net 614,45 EUR");
    expect(within(summary).getByTestId("quote-total")).toHaveTextContent("TVA 21% 129,03 EUR");
    expect(within(summary).getByText("Cu comandă")).toBeInTheDocument();
    expect(within(summary).getByText("Acceptată — comandă creată")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A1");

    const sections = within(screen.getByRole("table", { name: "Secțiuni ofertă" }));
    const acm = within(sections.getByRole("row", { name: "Panou ACM" }));
    expect(acm.getByText("98,07 EUR")).toBeInTheDocument();
    expect(acm.getByText("118,66 EUR")).toBeInTheDocument();
    expect(within(sections.getByRole("row", { name: "Litere" })).getByText("624,82 EUR")).toBeInTheDocument();
    expect(within(sections.getByRole("row", { name: /Total ofertă/ })).getByText("743,48 EUR")).toBeInTheDocument();

    const links = within(screen.getByRole("navigation", { name: "Legături ofertă" }));
    expect(links.getByRole("link", { name: "Deschide cererea" })).toHaveAttribute("href", "/cereri/crq%3A1");
    expect(links.getByText("CRQ-7")).toBeInTheDocument();
    expect(links.getByRole("link", { name: "Deschide ansamblul" })).toHaveAttribute("href", "/ansamblu?assembly=asm%3A1");
    expect(links.getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A1");
    expect(screen.queryByRole("button", { name: /Accept|Creează|Pregătește/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cost intern/)).not.toBeInTheDocument();
  });

  it("lets a member consult an unaccepted quote without an acceptance mutation", async () => {
    stub({
      ...unacceptedEnvelope,
      acceptance: { canAccept: false, reason: "Doar proprietarul poate accepta oferta și crea comanda." },
    });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    const summary = await screen.findByRole("region", { name: "Rezumat comercial" });
    expect(within(summary).getByText("Neacceptată")).toBeInTheDocument();
    expect(within(summary).getByText("Doar proprietarul poate accepta oferta și crea comanda.")).toBeInTheDocument();
    expect(within(summary).getByRole("link", { name: "Deschide ansamblul" })).toHaveAttribute("href", "/ansamblu?assembly=asm%3A1");
    expect(within(summary).getByRole("button", { name: "Descarcă oferta PDF" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Acceptă/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deschide comanda" })).not.toBeInTheDocument();
  });

  it("fails closed when the server does not project acceptance", async () => {
    stub(unacceptedEnvelope);
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    await screen.findByRole("region", { name: "Rezumat comercial" });
    expect(screen.queryByRole("button", { name: /Acceptă/ })).not.toBeInTheDocument();
  });

  it("never offers acceptance on a superseded version even if a stale projection allows it", async () => {
    stub({
      quote: { ...unacceptedEnvelope.quote, superseded: true },
      assemblyQuote: { ...unacceptedEnvelope.assemblyQuote, superseded: true },
      acceptance: { canAccept: true, reason: null },
    });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    expect(await screen.findByText("Versiune înlocuită")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Acceptă/ })).not.toBeInTheDocument();
  });

  it("accepts the exact reviewed snapshot after an in-page confirmation and shows the created order", async () => {
    const fetchMock = acceptanceServer({
      ok: true,
      status: 200,
      json: async () => ({ assembly: { orderId: "asmo:9" }, order: { orderSnapshotId: "asmo:9", sourceQuoteSnapshotId: "asmq:1" } }),
    });
    const user = userEvent.setup();
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    const accept = await screen.findByRole("button", { name: "Acceptă oferta și creează comanda" });

    await user.click(accept);
    const confirmation = screen.getByRole("region", { name: "Confirmi acceptarea ofertei OF-ASM?" });
    expect(confirmation).toHaveFocus();
    expect(within(confirmation).getByText(/creează comanda din această ofertă înghețată, la 743,48 EUR cu TVA/)).toBeInTheDocument();
    await user.click(within(confirmation).getByRole("button", { name: "Renunță" }));
    expect(screen.queryByRole("region", { name: /Confirmi acceptarea/ })).not.toBeInTheDocument();
    expect(accept).toHaveFocus();
    expect(posts(fetchMock)).toHaveLength(0);

    await user.click(accept);
    const confirm = screen.getByRole("button", { name: "Confirmă acceptarea" });
    await user.dblClick(confirm);

    expect(await screen.findByText("Oferta a fost acceptată")).toBeInTheDocument();
    expect(posts(fetchMock)).toEqual([
      ["/api/assemblies/asm%3A1/accept", { quoteSnapshotId: "asmq:1" }],
    ]);
    const summary = screen.getByRole("region", { name: "Rezumat comercial" });
    expect(within(summary).getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A9");
    expect(within(summary).getByText("Acceptată — comandă creată")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Acceptă/ })).not.toBeInTheDocument();
    const reads = () => fetchMock.mock.calls.filter(([path, init]) => path === "/api/quotes/asmq%3A1" && !init?.method?.match(/POST/)).length;
    await waitFor(() => expect(reads()).toBeGreaterThan(1));
  });

  it("refuses a replaced quote with recovery to the current one and creates no order", async () => {
    acceptanceServer({
      ok: false,
      status: 409,
      json: async () => ({
        error: "assembly_quote_superseded",
        reasons: ["Oferta deschisă nu mai este oferta curentă a ansamblului."],
        currentQuoteSnapshotId: "asmq:2",
      }),
    });
    const user = userEvent.setup();
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    await user.click(await screen.findByRole("button", { name: "Acceptă oferta și creează comanda" }));
    await user.click(screen.getByRole("button", { name: "Confirmă acceptarea" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Oferta nu mai este curentă");
    expect(within(alert).getByRole("link", { name: "Deschide oferta curentă" })).toHaveAttribute("href", "/oferte/ansamblu/asmq%3A2");
    expect(screen.queryByText("Oferta a fost acceptată")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Deschide comanda" })).not.toBeInTheDocument();
  });

  it("shows the existing order when the quote was accepted in another tab", async () => {
    acceptanceServer({
      ok: false,
      status: 409,
      json: async () => ({
        error: "assembly_quote_already_accepted",
        reasons: ["Oferta este deja acceptată și are comandă."],
        orderSnapshotId: "asmo:7",
      }),
    });
    const user = userEvent.setup();
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    await user.click(await screen.findByRole("button", { name: "Acceptă oferta și creează comanda" }));
    await user.click(screen.getByRole("button", { name: "Confirmă acceptarea" }));
    expect(await screen.findByText("Oferta este deja acceptată")).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "Rezumat comercial" });
    expect(within(summary).getByRole("link", { name: "Deschide comanda" })).toHaveAttribute("href", "/lucrari/asmo%3A7");
    expect(screen.queryByRole("button", { name: /Acceptă/ })).not.toBeInTheDocument();
  });

  it("surfaces a permission refusal and a network failure without claiming acceptance", async () => {
    acceptanceServer({ ok: false, status: 403, json: async () => ({ error: "forbidden" }) });
    const user = userEvent.setup();
    const { unmount } = render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    await user.click(await screen.findByRole("button", { name: "Acceptă oferta și creează comanda" }));
    await user.click(screen.getByRole("button", { name: "Confirmă acceptarea" }));
    expect(await screen.findByText("Doar proprietarul poate accepta oferta și crea comanda.")).toBeInTheDocument();
    expect(screen.queryByText("Oferta a fost acceptată")).not.toBeInTheDocument();
    unmount();
    resetResourceCache();

    acceptanceServer(null);
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    await user.click(await screen.findByRole("button", { name: "Acceptă oferta și creează comanda" }));
    await user.click(screen.getByRole("button", { name: "Confirmă acceptarea" }));
    expect(await screen.findByText(/Serverul nu a putut fi contactat/)).toBeInTheDocument();
    expect(screen.queryByText("Oferta a fost acceptată")).not.toBeInTheDocument();
  });

  it("shows owner cost evidence as PARTIAL with the missing inputs", async () => {
    stub({
      quote: item,
      assemblyQuote,
      internalCost: {
        sourceLabel: "Comanda înghețată",
        sections: [
          { memberId: "m-acm", roleLabel: "Panou ACM", total: 72.64, currency: "EUR", completeness: "COMPLETE", completenessLabel: "Complet" },
        ],
        production: {
          total: 440.14,
          currency: "EUR",
          completeness: "PARTIAL",
          completenessLabel: "Parțial",
          unpricedOperations: [
            { processLabel: "Montaj litere pe panou", missingInputs: ["Rețetă de cost pentru operație"] },
          ],
        },
        productionPending: false,
      },
    });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    expect(await screen.findByText(/Cost intern · evidență/)).toBeInTheDocument();
    expect(screen.getByText("Costul intern nu este preț de vânzare.")).toBeInTheDocument();
    const production = screen.getByText("Cost intern de producție").parentElement!;
    expect(within(production).getByText("440,14 EUR")).toBeInTheDocument();
    expect(within(production).getByText("Parțial")).toBeInTheDocument();
    expect(screen.getByText(/Montaj litere pe panou: lipsește rețetă de cost pentru operație/)).toBeInTheDocument();
  });

  it("downloads the server document and surfaces its refusal", async () => {
    const fetchMock = vi.fn((path: string) =>
      Promise.resolve(
        path.endsWith("/document")
          ? {
              ok: false,
              status: 422,
              headers: { get: () => "application/json" },
              json: async () => ({
                error: "assembly_document_unavailable",
                reasons: ["Configurația confirmată a unei secțiuni nu mai poate fi citită pentru document."],
              }),
            }
          : { ok: true, status: 200, json: async () => ({ quote: item, assemblyQuote }) },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Descarcă oferta PDF" }));
    expect(
      await screen.findByText("Configurația confirmată a unei secțiuni nu mai poate fi citită pentru document."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0]))).toContain(
      "/api/assembly-quotes/asmq%3A1/document",
    );
  });

  it("flags a superseded version", async () => {
    stub({ quote: { ...item, superseded: true }, assemblyQuote: { ...assemblyQuote, superseded: true } });
    render(<AssemblyQuotePage quoteSnapshotId="asmq:1" />);
    expect(await screen.findByText("Versiune înlocuită")).toBeInTheDocument();
  });
});
