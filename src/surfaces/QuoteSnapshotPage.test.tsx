import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QuoteSnapshotPage } from "./QuoteSnapshotPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("QuoteSnapshotPage", () => {
  it("renders frozen profile evidence from the snapshot payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/acceptance") || url.endsWith("/order")) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: "not_found" }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quoteSnapshot: {
              quoteSnapshotId: "q-a",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
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
            },
          }),
        });
      }),
    );

    render(
      <QuoteSnapshotPage
        productCode="PRD-LETTERS-FRONTLIT-PLEXI-AL06"
        quoteSnapshotId="q-a"
      />,
    );

    expect(await screen.findByTestId("frozen-profile-cost")).toHaveTextContent(
      "12,5 m × 3,00 EUR/m = 37,50 EUR",
    );
    expect(screen.getByTestId("commercial-price")).toHaveTextContent("Preț net client");
    expect(screen.getByRole("button", { name: "Acceptă oferta" })).toBeEnabled();
    expect(document.querySelector(".lifecycle")).toBeNull();
  });

  it("presents customer and request links only when the snapshot transport has them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/acceptance") || url.endsWith("/order")) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: async () => ({ error: "not_found" }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quoteSnapshot: {
              quoteSnapshotId: "q-a",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
              productLabel: "Litere",
              inscription: "NORD",
              customerId: "cus-1",
              customerDisplayName: "Atelier Nord",
              requestId: "req-1",
              eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
            },
          }),
        });
      }),
    );

    render(
      <QuoteSnapshotPage
        productCode="PRD-LETTERS-FRONTLIT-PLEXI-AL06"
        quoteSnapshotId="q-a"
      />,
    );

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

  it("opens the existing job from the header when the order already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/acceptance")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              acceptanceDecision: { acceptanceId: "qad-1" },
            }),
          });
        }
        if (url.endsWith("/order")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              orderSnapshot: { orderSnapshotId: "ord-1" },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quoteSnapshot: {
              quoteSnapshotId: "q-a",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
              productLabel: "Litere",
              inscription: "NORD",
              eic: { completeness: "COMPLETE", currency: "EUR", total: 1, lines: [] },
            },
          }),
        });
      }),
    );

    render(
      <QuoteSnapshotPage
        productCode="PRD-LETTERS-FRONTLIT-PLEXI-AL06"
        quoteSnapshotId="q-a"
      />,
    );

    const links = await screen.findAllByRole("link", { name: "Deschide lucrarea" });
    expect(links[0]).toHaveAttribute("href", "/lucrari/ord-1");
    expect(links.every((link) => link.getAttribute("href") === "/lucrari/ord-1")).toBe(true);
    expect(screen.queryByRole("button", { name: "Acceptă oferta" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Creează lucrarea" })).not.toBeInTheDocument();
    expect(document.querySelector(".lifecycle")).toBeNull();
  });

  it("accepts the frozen quote without sending a new product definition", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/acceptance") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            created: true,
            acceptanceDecision: { acceptanceId: "qad:q-a" },
          }),
        });
      }
      if (url.endsWith("/acceptance") || url.endsWith("/order")) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ error: "not_found" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          quoteSnapshot: {
            quoteSnapshotId: "q-a",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            productLabel: "Litere",
            inscription: "WORKOS",
            eic: { completeness: "COMPLETE", currency: "EUR", total: 37.5, lines: [] },
          },
        }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QuoteSnapshotPage
        productCode="PRD-LETTERS-FRONTLIT-PLEXI-AL06"
        quoteSnapshotId="q-a"
      />,
    );
    await userEvent.setup().click(await screen.findByRole("button", { name: "Acceptă oferta" }));
    expect(await screen.findByText("Acceptată")).toBeInTheDocument();
    const acceptCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith("/acceptance") && call[1]?.method === "POST",
    );
    expect(acceptCall?.[1]?.body).toBeUndefined();
  });

  it("renders the snapshot before lifecycle tail requests finish", async () => {
    let releaseTail!: () => void;
    const tail = new Promise<void>((resolve) => {
      releaseTail = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/acceptance") || url.endsWith("/order")) {
          return tail.then(() =>
            Promise.resolve({
              ok: false,
              status: 404,
              json: async () => ({ error: "not_found" }),
            }),
          );
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            quoteSnapshot: {
              quoteSnapshotId: "q-a",
              productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
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
            },
          }),
        });
      }),
    );

    render(
      <QuoteSnapshotPage
        productCode="PRD-LETTERS-FRONTLIT-PLEXI-AL06"
        quoteSnapshotId="q-a"
      />,
    );

    expect(await screen.findByTestId("frozen-profile-cost")).toBeInTheDocument();
    expect(screen.getByTestId("commercial-price")).toHaveTextContent("Preț net client");
    expect(screen.queryByRole("button", { name: "Acceptă oferta" })).not.toBeInTheDocument();
    expect(screen.queryByText("Neacceptată")).not.toBeInTheDocument();
    expect(screen.getByText("Se verifică")).toBeInTheDocument();

    releaseTail();
    expect(await screen.findByRole("button", { name: "Acceptă oferta" })).toBeEnabled();
    expect(screen.getByText("Neacceptată")).toBeInTheDocument();
  });
});
