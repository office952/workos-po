import { render, screen } from "@testing-library/react";
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
  it("uses envelope stage and nextAction without passive acceptance or order GETs", async () => {
    const fetchMock = stubQuotePage({
      envelope: createdEnvelope(),
      snapshot: frozenSnapshot(),
    });

    render(<QuoteSnapshotPage productCode={productCode} quoteSnapshotId="q-a" />);

    expect(await screen.findByTestId("frozen-profile-cost")).toHaveTextContent(
      "12,5 m × 3,00 EUR/m = 37,50 EUR",
    );
    expect(screen.getByTestId("commercial-price")).toHaveTextContent("Preț net client");
    expect(screen.getByText("Creată")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Marchează acceptată" })).toBeEnabled();
    expect(screen.getByText("Neacceptată")).toBeInTheDocument();
    expect(screen.queryByText("Înghețată")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Descarcă oferta PDF" })).toBeEnabled();
    expect(document.querySelector(".lifecycle")).toBeNull();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
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
    expect(screen.queryByRole("button", { name: "Marchează acceptată" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Creează comanda" })).not.toBeInTheDocument();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
  });

  it("accepts from the envelope and refreshes to CREATE_ORDER", async () => {
    let stage: "QUOTE_CREATED" | "QUOTE_ACCEPTED" = "QUOTE_CREATED";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/acceptance") && init?.method === "POST") {
        stage = "QUOTE_ACCEPTED";
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            created: true,
            acceptanceDecision: { acceptanceId: "qad:q-a" },
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
    await userEvent.setup().click(await screen.findByRole("button", { name: "Marchează acceptată" }));
    expect(await screen.findByRole("button", { name: "Creează comanda" })).toBeEnabled();
    expect(screen.getAllByText("Acceptată").length).toBeGreaterThan(0);
    const acceptCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/acceptance") && call[1]?.method === "POST",
    );
    expect(acceptCall?.[1]?.body).toBeUndefined();
    expect(passiveLifecycleGets(fetchMock)).toEqual([]);
  });

  it("creates an order from the envelope and opens /lucrari/:orderSnapshotId", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/order") && init?.method === "POST") {
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
    await userEvent.setup().click(await screen.findByRole("button", { name: "Creează comanda" }));
    expect(window.location.pathname).toBe("/lucrari/ord-1");
    const orderCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/order") && call[1]?.method === "POST",
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
    expect(screen.queryByRole("button", { name: "Marchează acceptată" })).not.toBeInTheDocument();
    expect(screen.queryByText("Se verifică")).not.toBeInTheDocument();

    releaseEnvelope();
    expect(await screen.findByRole("button", { name: "Marchează acceptată" })).toBeEnabled();
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
    nextActionLabel: "Marchează acceptată",
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

function passiveLifecycleGets(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls
    .filter((call) => {
      const url = String(call[0]);
      const method = call[1]?.method ?? "GET";
      return (
        method === "GET" &&
        (url.endsWith("/acceptance") || url.endsWith("/order"))
      );
    })
    .map((call) => String(call[0]));
}
