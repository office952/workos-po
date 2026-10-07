import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { CatalogPage } from "./CatalogPage";
import { readConfiguratorSession, writeConfiguratorSession } from "../session/configuratorSession";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

describe("CatalogPage", () => {
  it.each(["delayed", "failed"])("does not expose mixed client/request actions during a %s ownership read", async (mode) => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    window.history.replaceState({}, "", "/catalog?request=req-B");
    writeConfiguratorSession({ customerId: "cus-A", requestId: "req-A", productCode: null, drafts: { widthMm: "1200" }, draftContext: { customerId: "cus-A", requestId: "req-A", productCode: null }, lastQuote: null, customerLabel: "Client A", requestLabel: "Cerere A" });
    let release!: (value: unknown) => void;
    let retry = false;
    const body = { overview: { requests: [{ requestId: "req-B", customerId: "cus-B", customerDisplayName: "Client B", title: "Cerere B", statusLabel: "Nouă" }] } };
    const json = (payload: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => payload });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/requests")) {
        if (retry) return json(body);
        return mode === "failed" ? json({}, 503) : new Promise((resolve) => { release = resolve; });
      }
      if (url.endsWith("/product-catalog")) return json({ tree: [{ kind: "product", code: "PRD-TEST", label: "Produs test" }] });
      return json({ offerings: [{ kind: "SIGN_ASSEMBLY_ACM_SIGNAGE_V2", available: true, label: "Ansamblu test" }] });
    }));
    render(<CatalogPage />);
    await screen.findByText("Produs test");
    expect(screen.queryByRole("link", { name: /Produs test/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Ansamblu test")).not.toBeInTheDocument();
    expect(readConfiguratorSession()).toMatchObject({ customerId: "cus-A", requestId: "req-A", drafts: { widthMm: "1200" } });
    if (mode === "failed") {
      await screen.findByText("Cererea nu a putut fi verificată");
      retry = true;
      await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    } else {
      await act(async () => { release({ ok: true, status: 200, json: async () => body }); });
    }
    const link = await screen.findByRole("link", { name: /Produs test/ });
    const href = new URL(link.getAttribute("href")!, window.location.origin);
    expect(href.searchParams.get("customer")).toBe("cus-B");
    expect(href.searchParams.get("request")).toBe("req-B");
    expect(await screen.findByText("Ansamblu test")).toBeInTheDocument();
    expect(readConfiguratorSession().drafts).toEqual({ widthMm: "1200" });
  });
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

  it("does not keep request A when catalog is opened for customer B", async () => {
    window.history.replaceState({}, "", "/catalog?customer=cus-B");
    sessionStorage.setItem(
      "workos-ui20.configurator.v1",
      JSON.stringify({
        drafts: {},
        draftContext: { productCode: null, requestId: "req-A", customerId: "cus-A" },
        customerId: "cus-A",
        requestId: "req-A",
        productCode: null,
        customerLabel: "Client A",
        requestLabel: "Cerere A",
      }),
    );
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
                    requestId: "req-A",
                    title: "Litere",
                    customerId: "cus-A",
                    customerDisplayName: "Client A",
                    statusLabel: "Nouă",
                    nextAction: "CHOOSE_PRODUCT",
                    nextActionLabel: "Alege produs",
                  },
                ],
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ products: [], offerings: [] }) });
      }),
    );

    render(<CatalogPage />);
    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem("workos-ui20.configurator.v1") ?? "{}") as {
        customerId: string | null;
        requestId: string | null;
      };
      expect(stored.customerId).toBe("cus-B");
      expect(stored.requestId).toBeNull();
    });
    expect(screen.queryByText("Client A")).not.toBeInTheDocument();
    expect(screen.queryByText("Cerere A")).not.toBeInTheDocument();
  });
});
