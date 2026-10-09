import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invalidateResources, readResource, resetResourceCache } from "../data/resourceCache";
import { resourceKeys } from "../data/resourceKeys";
import {
  readConfiguratorSession,
  writeConfiguratorSession,
} from "../session/configuratorSession";
import { ClientDetailPage } from "./ClientDetailPage";

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStorage.clear();
  resetResourceCache();
  window.history.replaceState({}, "", "/");
});

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function workspace(customerId: string, displayName: string, extras: Record<string, unknown> = {}) {
  return {
    workspace: {
      customer: {
        customerId,
        displayName,
        status: "ACTIVE",
        city: extras.city ?? "Cluj",
      },
      canCreateRequest: true,
      summary: {
        requestCount: Array.isArray(extras.requests) ? extras.requests.length : 0,
        openRequestCount: 0,
        requestNeedsAction: 0,
        quoteCount: 0,
        quoteNeedsAction: 0,
        jobCount: 0,
        jobNeedsAction: 0,
      },
      requests: extras.requests ?? [],
      quotes: extras.quotes ?? [],
      jobs: extras.jobs ?? [],
    },
  };
}

describe("ClientDetailPage", () => {
  it("reserves client metrics during loading instead of presenting false zero counts", async () => {
    let release!: (response: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { release = resolve; })));
    render(<ClientDetailPage customerId="cus-1" />);
    expect(document.querySelectorAll(".pilot-instrument__metric-value")).toHaveLength(3);
    expect([...document.querySelectorAll(".pilot-instrument__metric-value")].map((node) => node.textContent)).toEqual(["—", "—", "—"]);
    await waitFor(() => expect(release).toBeTypeOf("function"));
    await act(async () => release(await jsonResponse(200, workspace("cus-1", "Atelier Nord"))));
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    expect([...document.querySelectorAll(".pilot-instrument__metric-value")].map((node) => node.textContent)).toEqual(["0", "0", "0"]);
  });
  it.each([401, 403])("hides an already loaded client after a %i refresh", async (status) => {
    const fetchMock = vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord")));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { name: "Atelier Nord" });
    await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
    fetchMock.mockImplementation(() => jsonResponse(status, { error: "denied" }));
    act(() => invalidateResources(resourceKeys.customerWorkspace("cus-1")));
    expect(await screen.findByText("Acces refuzat")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Atelier Nord" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerere nouă" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(readResource(resourceKeys.customerWorkspace("cus-1")).data).toBeUndefined();
  });

  it("explains stale data after a temporary refresh failure and retries", async () => {
    const fetchMock = vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord")));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { name: "Atelier Nord" });
    fetchMock.mockImplementation(() => jsonResponse(503, {}));
    act(() => invalidateResources(resourceKeys.customerWorkspace("cus-1")));
    expect(await screen.findByText(/Datele afișate sunt de la ultima citire reușită/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cerere nouă" })).not.toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(200, workspace("cus-1", "Atelier actualizat")));
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("heading", { name: "Atelier actualizat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerere nouă" })).toBeInTheDocument();
  });

  it("does not offer request creation for a retired client", async () => {
    const payload = workspace("cus-1", "Atelier Nord");
    payload.workspace.customer.status = "RETIRED";
    payload.workspace.canCreateRequest = false;
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, payload)));
    render(<ClientDetailPage customerId="cus-1" />);
    await screen.findByRole("heading", { name: "Atelier Nord" });
    expect(screen.queryByRole("button", { name: "Cerere nouă" })).not.toBeInTheDocument();
  });
  it("keeps the object workspace and local sections", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1");
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/customers/cus-1/workspace")) {
          return jsonResponse(200, workspace("cus-1", "Atelier Nord"));
        }
        return jsonResponse(200, {});
      }),
    );

    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
    expect(document.querySelector(".page-workspace--object")).not.toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
    expect(screen.getByRole("navigation", { name: "Secțiuni client" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Documente" })).toHaveAttribute(
      "href",
      "/clienti/cus-1?sectiune=documente",
    );
  });

  it("restores a future section from the URL", async () => {
    window.history.replaceState({}, "", "/clienti/cus-1?sectiune=documente");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => jsonResponse(200, workspace("cus-1", "Atelier Nord"))),
    );
    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByText(/Facturile, contractele și anexele/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /încarcă|semnează|emite/i })).not.toBeInTheDocument();
  });

  it("does not keep customer A request after opening customer B", async () => {
    writeConfiguratorSession({
      drafts: { widthMm: "12" },
      draftContext: { productCode: "PRD-ACM-CASSETTE-NONE", requestId: "req-A", customerId: "cus-A" },
      customerId: "cus-A",
      requestId: "req-A",
      productCode: "PRD-ACM-CASSETTE-NONE",
      lastQuote: null,
      customerLabel: "Client A",
      requestLabel: "Cerere A",
    });
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(200, workspace("cus-B", "Client B"))));
    render(<ClientDetailPage customerId="cus-B" />);
    await screen.findByRole("heading", { name: "Client B" });
    await waitFor(() => {
      const stored = readConfiguratorSession();
      expect(stored.customerId).toBe("cus-B");
      expect(stored.requestId).toBeNull();
      expect(stored.requestLabel).toBeNull();
      expect(stored.drafts).toEqual({ widthMm: "12" });
    });
  });

  it("keeps customer A request when returning to the same client", async () => {
    writeConfiguratorSession({
      drafts: {},
      draftContext: { productCode: null, requestId: "req-A", customerId: "cus-A" },
      customerId: "cus-A",
      requestId: "req-A",
      productCode: null,
      lastQuote: null,
      customerLabel: "Client A",
      requestLabel: "Cerere A",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(
          200,
          workspace("cus-A", "Client A", {
            requests: [{ requestId: "req-A", title: "Cerere A", customerId: "cus-A", statusLabel: "Nouă" }],
          }),
        ),
      ),
    );
    render(<ClientDetailPage customerId="cus-A" />);
    await screen.findByRole("heading", { name: "Client A" });
    await waitFor(() => {
      expect(readConfiguratorSession().requestId).toBe("req-A");
    });
  });

  it("retries a failed hub load", async () => {
    const fetchMock = vi.fn(() => jsonResponse(500, { error: "failed" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ClientDetailPage customerId="cus-1" />);
    expect(await screen.findByText("Clientul nu a putut fi citit")).toBeInTheDocument();
    fetchMock.mockImplementation(() => jsonResponse(200, workspace("cus-1", "Atelier Nord")));
    await userEvent.setup().click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("heading", { name: "Atelier Nord" })).toBeInTheDocument();
  });
  it("hands the current customer to the sole request intake without creating a request in the hub", async () => {
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => { void init; return jsonResponse(200, workspace("cus-1", "Atelier Nord")); });
    vi.stubGlobal("fetch", fetchMock); render(<ClientDetailPage customerId="cus-1" />);
    await userEvent.click(await screen.findByRole("button", { name: "Cerere nouă" }));
    expect(window.location.pathname).toBe("/cereri/noua");
    expect(new URLSearchParams(window.location.search).get("customer")).toBe("cus-1");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
