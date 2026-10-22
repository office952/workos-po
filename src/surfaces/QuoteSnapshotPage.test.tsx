import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { QuoteSnapshotPage } from "./QuoteSnapshotPage";

const productCode = "PRD-LETTERS-FRONTLIT-PLEXI-AL06";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
});

describe("QuoteSnapshotPage", () => {
  it("keeps partial unknown internal cost distinct from zero and does not require a letter profile", async () => {
    stubQuotePage({ envelope: createdEnvelope(), snapshot: { ...frozenSnapshot(), eic: { completeness: "PARTIAL", currency: "EUR", total: 0, lines: [] } } });
    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    expect(await screen.findByTestId("internal-cost")).toHaveTextContent("Incomplet");
    expect(screen.getByTestId("internal-cost")).not.toHaveTextContent("0,00 EUR");
    expect(screen.queryByText("Linie de profil indisponibilă")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarcă oferta PDF" })).toBeEnabled();
  });
  it("uses envelope stage and nextAction without passive acceptance or order GETs", async () => {
    const fetchMock = stubQuotePage({
      envelope: createdEnvelope(),
      snapshot: frozenSnapshot(),
    });

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);

    expect(await screen.findByTestId("frozen-profile-cost")).toHaveTextContent(
      "12,5 m × 3,00 EUR/m = 37,50 EUR",
    );
    const summary = within(screen.getByRole("region", { name: "Rezumat comercial" }));
    expect(summary.getByTestId("quote-total")).toHaveTextContent("Total cu TVA61,26 EUR");
    expect(summary.getByTestId("quote-total")).toHaveTextContent("Net 50,63 EUR");
    expect(summary.getByText("Creată")).toBeInTheDocument();
    const product = within(screen.getByRole("row", { name: "Litere volumetrice luminoase" }));
    expect(product.getByText("Text: synthetic reference text")).toBeInTheDocument();
    expect(product.getByText("61,26 EUR")).toBeInTheDocument();
    expect(screen.queryByTestId("customer-price")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmă comanda" })).toBeEnabled();
    expect(screen.getByText("Neacceptată")).toBeInTheDocument();
    expect(screen.queryByText("Înghețată")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarcă oferta PDF" })).toBeEnabled();
    expect(document.querySelector(".lifecycle")).toBeNull();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
  });

  it("shows the frozen job total of a product with site installation, as the quote document does", async () => {
    const { eic: _eic, ...withoutCost } = frozenSnapshot();
    void _eic;
    stubQuotePage({
      envelope: createdEnvelope(),
      snapshot: {
        ...withoutCost,
        commercial: { ...frozenSnapshot().commercial, vatPercent: 21, vatAmount: 10.63 },
        lines: [
          { kind: "PRODUCT", commercial: { netPrice: 50.63, currency: "EUR" } },
          { kind: "SITE_INSTALLATION", commercial: { netPrice: 100, currency: "EUR" } },
        ],
        jobCommercial: { netPrice: 150.63, vatAmount: 31.63, grossPrice: 182.26, currency: "EUR", completeness: "COMPLETE" },
      },
    });
    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    const total = await screen.findByTestId("quote-total");
    expect(total).toHaveTextContent("182,26 EUR");
    expect(total).toHaveTextContent("Net 150,63 EUR");
    expect(total).toHaveTextContent("TVA 21% 31,63 EUR");
    const lines = within(screen.getByRole("table", { name: "Ce se ofertează" }));
    expect(within(lines.getByRole("row", { name: "Litere volumetrice luminoase" })).getByText("50,63 EUR")).toBeInTheDocument();
    expect(within(lines.getByRole("row", { name: "Montaj la locație" })).getByText("100,00 EUR")).toBeInTheDocument();
    expect(within(lines.getByRole("row", { name: /Total ofertă/ })).getByText("150,63 EUR")).toBeInTheDocument();
    expect(screen.queryByText(/Cost intern/)).not.toBeInTheDocument();
  });

  it("presents customer and request links only when the snapshot transport has them", async () => {
    stubQuotePage({
      envelope: createdEnvelope(),
      snapshot: {
        quoteSnapshotId: "q-a",
        productCode,
        productLabel: "Litere",
        inscription: "NORD",
        customerId: "cus-1",
        customerDisplayName: "Atelier Nord",
        requestId: "req-1",
        eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
      },
    });

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);

    expect(await screen.findByText("Atelier Nord")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Rezumat comercial" })).getByText(
        "Prețul pentru client nu este complet în această ofertă.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide clientul" })).toHaveAttribute(
      "href",
      "/clienti/cus-1",
    );
    expect(screen.getByRole("link", { name: "Deschide cererea" })).toHaveAttribute(
      "href",
      "/cereri/req-1",
    );
    expect(document.querySelector(".lifecycle")).toBeNull();
  });

  it("opens the existing job from the envelope OPEN_ORDER action", async () => {
    const fetchMock = stubQuotePage({
      envelope: {
        quoteSnapshotId: "q-a",
        productCode,
        stage: "ORDER_CREATED",
        stageLabel: "Cu comandă",
        nextAction: "OPEN_ORDER",
        nextActionLabel: "Deschide comanda",
        orderSnapshotId: "ord-1",
      },
      snapshot: {
        quoteSnapshotId: "q-a",
        productCode,
        productLabel: "Litere",
        inscription: "NORD",
        eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
      },
    });

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);

    const links = await screen.findAllByRole("link", { name: "Deschide comanda" });
    expect(links[0]).toHaveAttribute("href", "/lucrari/ord-1");
    expect(links.every((link) => link.getAttribute("href") === "/lucrari/ord-1")).toBe(true);
    expect(screen.queryByRole("button", { name: "Confirmă comanda" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Creează comanda" })).not.toBeInTheDocument();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
  });

  it("confirms the exact quote and opens its job in one command", async () => {
    let stage: "QUOTE_CREATED" | "QUOTE_ACCEPTED" = "QUOTE_CREATED";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/confirm-order") && init?.method === "POST") {
        stage = "QUOTE_ACCEPTED";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            created: true,
            orderSnapshot: { orderSnapshotId: "ord-1" },
          }),
        });
      }
      if (url.endsWith("/api/quotes/q-a")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quote:
              stage === "QUOTE_CREATED"
                ? createdEnvelope()
                : {
                    quoteSnapshotId: "q-a",
                    productCode,
                    stage: "QUOTE_ACCEPTED",
                    stageLabel: "Acceptată",
                    nextAction: "CREATE_ORDER",
                    nextActionLabel: "Creează comanda",
                  },
          }),
        });
      }
      if (url.includes("/quote-snapshots/q-a") && !url.endsWith("/document")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ quoteSnapshot: frozenSnapshot() }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Confirmă comanda" }));
    await user.click(screen.getByRole("button", { name: "Da, confirm comanda" }));
    await waitFor(() => expect(window.location.pathname).toBe("/lucrari/ord-1"));
    const acceptCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/confirm-order") && call[1]?.method === "POST",
    );
    expect(acceptCall?.[1]?.body).toBeUndefined();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
    expect(
      fetchMock.mock.calls.filter(
        (call) => String(call[0]).endsWith("/confirm-order") && call[1]?.method === "POST",
      ),
    ).toHaveLength(1);
  });

  it("shows quote identity before acceptance and does not post on cancel or escape", async () => {
    const fetchMock = stubQuotePage({
      envelope: {
        ...createdEnvelope(),
        reference: "OF-104",
        customerDisplayName: "Atelier Nord",
        requestReference: "CRQ-104",
      },
      snapshot: {
        ...frozenSnapshot(),
        customerDisplayName: "Atelier Nord",
        requestReference: "CRQ-104",
      },
    });
    const user = userEvent.setup();
    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    const accept = await screen.findByRole("button", { name: "Confirmă comanda" });
    expect(screen.queryByRole("region", { name: /Confirmi acceptarea/ })).not.toBeInTheDocument();

    await user.click(accept);
    const confirmation = screen.getByRole("region", { name: "Confirmi acceptarea ofertei OF-104?" });
    expect(confirmation).toHaveFocus();
    expect(within(confirmation).getByText(/acceptarea comunicată de client/)).toBeInTheDocument();
    expect(within(confirmation).getByText(/Client: Atelier Nord/)).toBeInTheDocument();
    expect(within(confirmation).getByText(/Cerere: CRQ-104/)).toBeInTheDocument();
    expect(within(confirmation).getByText(/Net 50,63 EUR/)).toBeInTheDocument();
    expect(within(confirmation).getByText(/Total cu TVA 61,26 EUR/)).toBeInTheDocument();
    expect(acceptancePosts(fetchMock)).toEqual([]);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: /Confirmi acceptarea/ })).not.toBeInTheDocument();
    expect(accept).toHaveFocus();
    expect(acceptancePosts(fetchMock)).toEqual([]);

    await user.click(accept);
    expect(screen.getByRole("region", { name: "Confirmi acceptarea ofertei OF-104?" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Anulează" }));
    expect(screen.queryByRole("region", { name: /Confirmi acceptarea/ })).not.toBeInTheDocument();
    expect(accept).toHaveFocus();
    expect(acceptancePosts(fetchMock)).toEqual([]);
  });

  it("posts the combined confirmation once even if confirmation is activated twice", async () => {
    let releaseAcceptance: (value: unknown) => void = () => undefined;
    let stage: "QUOTE_CREATED" | "QUOTE_ACCEPTED" = "QUOTE_CREATED";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/confirm-order") && init?.method === "POST") {
        stage = "QUOTE_ACCEPTED";
        return new Promise((resolve) => {
          releaseAcceptance = resolve;
        });
      }
      if (url.endsWith("/api/quotes/q-a")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quote:
              stage === "QUOTE_CREATED"
                ? { ...createdEnvelope(), reference: "OF-104" }
                : {
                    quoteSnapshotId: "q-a",
                    productCode,
                    reference: "OF-104",
                    stage: "QUOTE_ACCEPTED",
                    stageLabel: "Acceptată",
                    nextAction: "CREATE_ORDER",
                    nextActionLabel: "Creează comanda",
                  },
          }),
        });
      }
      if (url.includes("/quote-snapshots/q-a") && !url.endsWith("/document")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ quoteSnapshot: frozenSnapshot() }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    await user.click(await screen.findByRole("button", { name: "Confirmă comanda" }));
    const confirm = screen.getByRole("button", { name: "Da, confirm comanda" });
    await user.dblClick(confirm);
    expect(acceptancePosts(fetchMock)).toHaveLength(1);
    releaseAcceptance({
      ok: true,
      status: 200,
      json: async () => ({ created: true, orderSnapshot: { orderSnapshotId: "ord-1" } }),
    });
    await waitFor(() => expect(window.location.pathname).toBe("/lucrari/ord-1"));
    expect(acceptancePosts(fetchMock)).toHaveLength(1);
  });

  it("keeps partial internal cost visible and still confirms before the existing acceptance request", async () => {
    const fetchMock = stubQuotePage({
      envelope: { ...createdEnvelope(), reference: "OF-PARTIAL" },
      snapshot: {
        ...frozenSnapshot(),
        eic: { completeness: "PARTIAL", currency: "EUR", total: 0, lines: [] },
      },
    });
    const user = userEvent.setup();
    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    expect(await screen.findByTestId("internal-cost")).toHaveTextContent("Incomplet");
    await user.click(screen.getByRole("button", { name: "Confirmă comanda" }));
    expect(acceptancePosts(fetchMock)).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Da, confirm comanda" }));
    expect(acceptancePosts(fetchMock)).toEqual([
      expect.stringContaining("/confirm-order"),
    ]);
    expect(acceptancePosts(fetchMock)[0]).toMatch(/\/confirm-order$/);
  });

  it("creates an order from the envelope and opens /lucrari/:orderSnapshotId", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/confirm-order") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            orderSnapshot: { orderSnapshotId: "ord-1" },
          }),
        });
      }
      if (url.endsWith("/api/quotes/q-a")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quote: {
              quoteSnapshotId: "q-a",
              productCode,
              stage: "QUOTE_ACCEPTED",
              stageLabel: "Acceptată",
              nextAction: "CREATE_ORDER",
              nextActionLabel: "Creează comanda",
            },
          }),
        });
      }
      if (url.includes("/quote-snapshots/q-a") && !url.endsWith("/document")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quoteSnapshot: {
              quoteSnapshotId: "q-a",
              productCode,
              productLabel: "Litere",
              inscription: "NORD",
              eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Confirmă comanda" }));
    await user.click(screen.getByRole("button", { name: "Da, confirm comanda" }));
    await waitFor(() => expect(window.location.pathname).toBe("/lucrari/ord-1"));
    const orderCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/confirm-order") && call[1]?.method === "POST",
    );
    expect(orderCall).toBeTruthy();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
  });

  it("renders the snapshot before the envelope action is known", async () => {
    let releaseEnvelope!: () => void;
    const envelope = new Promise<void>((resolve) => {
      releaseEnvelope = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/api/quotes/q-a")) {
          return envelope.then(() =>
            Promise.resolve({
              ok: true,
              status: 200,
              json: async () => ({ quote: createdEnvelope() }),
            }),
          );
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ quoteSnapshot: frozenSnapshot() }),
        });
      }),
    );

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);

    expect(await screen.findByTestId("frozen-profile-cost")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmă comanda" })).not.toBeInTheDocument();
    expect(screen.queryByText("Se verifică")).not.toBeInTheDocument();

    releaseEnvelope();
    expect(await screen.findByRole("button", { name: "Confirmă comanda" })).toBeEnabled();
    expect(screen.getByText("Neacceptată")).toBeInTheDocument();
  });

  it("surfaces a blocked server document response without inventing a PDF", async () => {
    const fetchMock = stubQuotePage({
      envelope: createdEnvelope(),
      snapshot: {
        quoteSnapshotId: "q-a",
        productCode,
        productLabel: "Litere",
        inscription: "NORD",
        eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
      },
      document: {
        ok: false,
        status: 422,
        headers: { get: () => "application/json" },
        json: async () => ({
          error: "service_quote_document_not_authorized",
          reasons: ["Documentul nu este autorizat pentru această ofertă."],
        }),
      },
    });

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);
    await userEvent.setup().click(
      await screen.findByRole("button", { name: "Descarcă oferta PDF" }),
    );
    expect(
      await screen.findByText("Documentul nu este autorizat pentru această ofertă."),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/document"))).toBe(
      true,
    );
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
  });
});

function createdEnvelope() {
  return {
    quoteSnapshotId: "q-a",
    productCode,
    stage: "QUOTE_CREATED",
    stageLabel: "Creată",
    nextAction: "ACCEPT_QUOTE",
    nextActionLabel: "Confirmă comanda",
  };
}

function frozenSnapshot() {
  return {
    quoteSnapshotId: "q-a",
    productCode,
    productLabel: "Litere volumetrice luminoase",
    inscription: "synthetic reference text",
    eic: {
      completeness: "COMPLETE",
      currency: "EUR",
      total: 37.5,
      lines: [
        {
          resourceId: "aluminium_return_profile",
          label: "Profil aluminiu 0,6 mm",
          quantity: 12.5,
          unit: "m",
          rate: 3,
          currency: "EUR",
          cost: 37.5,
        },
      ],
    },
    commercial: {
      netPrice: 50.63,
      grossPrice: 61.26,
      currency: "EUR",
      completeness: "COMPLETE",
      unavailableReasons: [],
    },
  };
}

function stubQuotePage(input: {
  envelope: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  document?: Record<string, unknown>;
}) {
  const fetchMock = vi.fn((inputUrl: RequestInfo, init?: RequestInit) => {
    const url = String(inputUrl);
    if (url.endsWith("/document")) {
      return Promise.resolve(
        input.document ?? {
          ok: true,
          status: 200,
          headers: { get: () => "application/pdf" },
          blob: async () => new Blob(["pdf"]),
        },
      );
    }
    if (url.endsWith("/api/quotes/q-a")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ quote: input.envelope }),
      });
    }
    if (url.includes("/quote-snapshots/q-a")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ quoteSnapshot: input.snapshot }),
      });
    }
    void init;
    return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function acceptancePosts(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter((call) => String(call[0]).endsWith("/confirm-order") && call[1]?.method === "POST")
    .map((call) => String(call[0]));
}

function passiveLifecycleGets(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter((call) => {
      const url = String(call[0]);
      const method = call[1]?.method ?? "GET";
      return (
        method === "GET" &&
        (url.endsWith("/confirm-order") || url.endsWith("/order"))
      );
    })
    .map((call) => String(call[0]));
}
