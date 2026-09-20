import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("lets the first owner add an operator when the people list is empty", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/people") && init?.method === "POST") {
        return jsonResponse({ person: { personId: "per:1", displayName: "Operator Nord" } });
      }
      if (url.endsWith("/api/people/skills")) {
        return jsonResponse({ skills: [{ skillId: "sk:cnc" }, { skillId: "sk:wire" }] });
      }
      if (url.includes("/skills") && init?.method === "POST") {
        return jsonResponse({ ok: true });
      }
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
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Nume operator"), "Operator Nord");
    await user.click(screen.getByRole("button", { name: "Adaugă operator" }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url) === "/api/people" && init?.method === "POST",
        ),
      ).toBe(true);
      expect(
        fetchMock.mock.calls.filter(
          ([url, init]) => String(url).includes("/skills") && init?.method === "POST",
        ),
      ).toHaveLength(2);
    });
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
