import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configuratorHref } from "./routing/appRoute";
import { App } from "./App";

function jsonResponse(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("App navigation", () => {
  it("opens the optional resource view inside jobs, retaining registry search and doing no task writes", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.endsWith("/api/health")) return jsonResponse({ status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" });
      if (url.endsWith("/api/jobs")) return jsonResponse({ overview: { jobs: [] } });
      if (url.endsWith("/api/planning/workload")) return jsonResponse({ workload: { canEditEffort: true, providers: [], unassigned: [], manual: [] } });
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/lucrari");
    render(<App />);
    const search = await screen.findByRole("searchbox", { name: "Caută lucrări" });
    const user = userEvent.setup();
    await user.type(search, "NORD");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("planning/workload"))).toBe(false);
    const shell = document.querySelector(".app-shell__bar");
    await user.click(screen.getByRole("link", { name: "Pe utilaje și zone" }));
    expect(await screen.findByRole("heading", { name: "Pe utilaje și zone" })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/lucrari?vedere=utilaje");
    expect(document.querySelector(".app-shell__bar")).toBe(shell);
    expect(screen.queryByRole("link", { name: "Planificare" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Lista lucrărilor" }));
    expect(await screen.findByRole("searchbox", { name: "Caută lucrări" })).toHaveValue("NORD");
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("replaces a bookmarked Planning URL with the jobs resource view", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo) => jsonResponse(String(input).endsWith("/api/health")
      ? { status: "ok", service: "workos-final-api", apiContractId: "workos-ui-contract-v1" }
      : String(input).endsWith("/api/planning/workload") ? { workload: { providers: [], unassigned: [], manual: [] } } : {})));
    window.history.replaceState({}, "", "/planificare");
    render(<App />);
    expect(await screen.findByRole("heading", { name: "Pe utilaje și zone" })).toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/lucrari?vedere=utilaje");
    expect(screen.getByRole("heading", { name: "Lucrări", level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Planificare" })).not.toBeInTheDocument();
  });

  it("keeps the shell mounted and reuses registry reads across back and forward", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.endsWith("/api/health")) {
        return jsonResponse({
          status: "ok",
          service: "workos-final-api",
          apiContractId: "workos-ui-contract-v1",
        });
      }
      if (url.endsWith("/api/customers") && method === "GET") {
        return jsonResponse({ customers: [] });
      }
      if (url.endsWith("/api/requests") && method === "GET") {
        return jsonResponse({ requests: [] });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState({}, "", "/clienti");

    render(<App />);
    expect(document.querySelector(".boot")).toBeNull();
    // This test checks navigation/cache continuity after asynchronous app startup.
    expect(await screen.findByRole("button", { name: "Client nou" }, { timeout: 10000 })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    const shell = document.querySelector(".app-shell__bar");
    expect(shell).not.toBeNull();

    const customerReads = () =>
      fetchMock.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/api/customers") && String(init?.method ?? "GET") === "GET",
      ).length;
    await waitFor(() => {
      expect(customerReads()).toBeGreaterThan(0);
    });
    const firstCustomerReads = customerReads();

    await userEvent.setup().click(screen.getByRole("link", { name: "Cereri" }));
    expect(await screen.findByRole("heading", { name: "Cereri de ofertă" })).toBeInTheDocument();
    expect(document.querySelector(".app-shell__bar")).toBe(shell);

    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    });
    expect(document.querySelector(".app-shell__bar")).toBe(shell);
    expect(customerReads()).toBe(firstCustomerReads);

    await userEvent.setup().click(screen.getByRole("link", { name: "Cereri" }));
    expect(await screen.findByRole("heading", { name: "Cereri de ofertă" })).toBeInTheDocument();
    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Clienți" })).toBeInTheDocument();
    });
    expect(document.querySelector(".app-shell__bar")).toBe(shell);
    expect(customerReads()).toBe(firstCustomerReads);
  });

  it("keeps configurator customer and request aligned with back and forward", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.endsWith("/api/health")) {
        return jsonResponse({
          status: "ok",
          service: "workos-final-api",
          apiContractId: "workos-ui-contract-v1",
        });
      }
      if (url.endsWith("/preview")) {
        return jsonResponse({
          product: {
            productCode: "PRD-ACM-CASSETTE-NONE",
            label: "Panou ACM casetat",
          },
          values: {},
          formSchema: {
            id: "form",
            sections: [
              {
                id: "product",
                title: "Produs",
                fields: [
                  { id: "face.widthMm", label: "Lățime casetă", type: "number", required: true },
                ],
              },
            ],
          },
          selectedComponents: [],
          readiness: "ready",
          missing: [],
          reviewId: "crv1:acm-ready",
        });
      }
      if (url.endsWith("/seller")) {
        return jsonResponse({ configured: true, seller: { legalName: "Isolated" } });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const contextA = configuratorHref({
      customerId: "cus-A",
      requestId: "req-A",
      productCode: "PRD-ACM-CASSETTE-NONE",
    });
    const contextB = configuratorHref({
      customerId: "cus-B",
      requestId: "req-B",
      productCode: "PRD-ACM-CASSETTE-NONE",
    });
    window.history.replaceState({}, "", contextA);

    render(<App />);
    expect(await screen.findByLabelText("Lățime casetă")).toBeInTheDocument();

    function latestPreviewRequestId(): string | undefined {
      const calls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/preview"));
      const body = calls.at(-1)?.[1]?.body;
      return body ? (JSON.parse(String(body)) as { requestId?: string }).requestId : undefined;
    }

    await waitFor(() => {
      expect(latestPreviewRequestId()).toBe("req-A");
    });

    window.history.pushState({}, "", contextB);
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => {
      expect(latestPreviewRequestId()).toBe("req-B");
    });

    window.history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => {
      expect(latestPreviewRequestId()).toBe("req-A");
    });
  });
});
