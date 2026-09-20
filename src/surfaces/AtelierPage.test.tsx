import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AtelierPage } from "./AtelierPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("AtelierPage", () => {
  it("explains an empty people list without creating a person or assigning skills", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/operator-candidates")) {
        return jsonResponse({ candidates: [] });
      }
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: null });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AtelierPage />);
    expect(await screen.findByText("Nu există operatori configurați")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adaugă operator" })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).includes("/api/people")),
    ).toBe(false);
  });

  it("keeps only the selected job in the inbox and carries task plus job into execution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-candidates")) {
          return jsonResponse({
            candidates: [{ personId: "per:1", displayName: "Andrei", pinConfigured: true }],
          });
        }
        if (url.includes("/operator-session")) {
          return jsonResponse({ operator: { personId: "per:1", displayName: "Andrei" } });
        }
        if (url.includes("/operator-task-inbox")) {
          return jsonResponse({
            inbox: {
              inProgressMine: [],
              availableReady: [
                {
                  taskId: "task-a",
                  planId: "exp-a",
                  jobId: "ord-a",
                  processLabel: "Debitare",
                  scopeLabel: "Spate",
                  statusLabel: "Gata",
                  productLabel: "Litere",
                  inscription: "NORD A",
                  canClaimStart: true,
                  requiresProvider: false,
                  lane: "available_ready",
                },
                {
                  taskId: "task-b",
                  planId: "exp-b",
                  jobId: "ord-b",
                  processLabel: "Cablare",
                  scopeLabel: "Față",
                  statusLabel: "Gata",
                  productLabel: "Litere",
                  inscription: "NORD B",
                  canClaimStart: true,
                  requiresProvider: false,
                  lane: "available_ready",
                },
              ],
              availableNeedsProvider: [],
              waitingDependencies: [],
            },
          });
        }
        return jsonResponse({});
      }),
    );

    render(<AtelierPage jobId="ord-a" />);
    expect(await screen.findByText("NORD A")).toBeInTheDocument();
    expect(screen.queryByText("NORD B")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/executie/exp-a?task=task-a&job=ord-a"]')).not.toBeNull();
  });
});
