import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { CatalogPage } from "./CatalogPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

describe("CatalogPage", () => {
  it("retains customer and request labels from list context without visiting detail", async () => {
    window.history.replaceState({}, "", "/catalog?customer=cus-9&request=req-2");
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.endsWith("/requests")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              overview: {
                requests: [
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
                ],
              },
            }),
          });
        }
        if (url.includes("/catalog") || url.includes("/products") || url.includes("/product-templates")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ products: [] }),
          });
        }
        if (url.includes("/assemblies/offering")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ offerings: [] }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }),
    );

    render(<CatalogPage />);
    await waitFor(() => {
      expect(screen.getByText(/Client Nord/)).toBeInTheDocument();
    });
    expect(screen.getByText(/CRQ-105/)).toBeInTheDocument();
  });
});
