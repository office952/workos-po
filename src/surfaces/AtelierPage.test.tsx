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
    expect(await screen.findByText("Litere · NORD A")).toBeInTheDocument();
    expect(screen.queryByText("Litere · NORD B")).not.toBeInTheDocument();
    expect(document.querySelector('a[href="/executie/exp-a?task=task-a&job=ord-a"]')).not.toBeNull();
  });

  it("lists a configured person as an operator candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/operator-candidates")) {
          return jsonResponse({
            candidates: [
              {
                personId: "per:operator-test",
                displayName: "Operator Test",
                pinConfigured: true,
                availabilityLabel: "Disponibil",
              },
            ],
          });
        }
        if (url.includes("/operator-session")) {
          return jsonResponse({ operator: null });
        }
        return jsonResponse({});
      }),
    );

    render(<AtelierPage />);
    expect(await screen.findByLabelText("Persoană")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Operator Test" })).toBeInTheDocument();
    expect(screen.queryByText("Nu există operatori configurați")).not.toBeInTheDocument();
  });

  it("masks the operator PIN, keeps numeric entry and still identifies the operator", async () => {
    let identified = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (url.includes("/operator-candidates")) {
        return jsonResponse({
          candidates: [{ personId: "per:1", displayName: "Andrei", pinConfigured: true }],
        });
      }
      if (url.includes("/operator-session") && method === "POST") {
        identified = true;
        return jsonResponse({ operator: { personId: "per:1", displayName: "Andrei" } });
      }
      if (url.includes("/operator-session")) {
        return jsonResponse({
          operator: identified ? { personId: "per:1", displayName: "Andrei" } : null,
        });
      }
      if (url.includes("/operator-task-inbox")) {
        return jsonResponse({
          inbox: {
            inProgressMine: [],
            availableReady: [],
            availableNeedsProvider: [],
            waitingDependencies: [],
          },
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AtelierPage />);
    const pin = await screen.findByLabelText("PIN");
    expect(pin).toHaveAttribute("type", "password");
    expect(pin).toHaveAttribute("inputmode", "numeric");
    expect(pin).toHaveAttribute("autocomplete", "off");
    expect(screen.queryByLabelText("Confirmă PIN")).not.toBeInTheDocument();

    await userEvent.type(pin, "246810");
    expect(screen.queryByText("246810")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Intră în atelier" }));

    expect(await screen.findByText("Andrei")).toBeInTheDocument();
    const identifyCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes("/operator-session") && String(init?.method) === "POST",
    );
    expect(String(identifyCall?.[0])).not.toContain("246810");
    expect(JSON.parse(String(identifyCall?.[1]?.body))).toEqual({
      personId: "per:1",
      pin: "246810",
    });
  });

  it("masks both PIN fields during first-time PIN configuration", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/operator-candidates")) {
        return jsonResponse({
          candidates: [{ personId: "per:2", displayName: "Maria", pinConfigured: false }],
        });
      }
      if (url.includes("/operator-pin") && String(init?.method) === "PUT") {
        return jsonResponse({ ok: true });
      }
      if (url.includes("/operator-session")) {
        return jsonResponse({ operator: null });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AtelierPage />);
    const pin = await screen.findByLabelText("PIN");
    const confirm = screen.getByLabelText("Confirmă PIN");
    for (const field of [pin, confirm]) {
      expect(field).toHaveAttribute("type", "password");
      expect(field).toHaveAttribute("inputmode", "numeric");
      expect(field).toHaveAttribute("autocomplete", "off");
    }

    await userEvent.type(pin, "1357");
    await userEvent.type(confirm, "1357");
    await userEvent.click(screen.getByRole("button", { name: "Configurează PIN" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/api/people/per%3A2/operator-pin") &&
            String(init?.method) === "PUT",
        ),
      ).toBe(true);
    });
    expect(screen.queryByText("1357")).not.toBeInTheDocument();
  });

  it("does not offer an external custody lane or external owner actions", async () => {
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
                  taskId: "task-internal",
                  planId: "exp-a",
                  jobId: "ord-a",
                  processLabel: "Debitare",
                  scopeLabel: "Spate",
                  statusLabel: "Gata",
                  productLabel: "Litere",
                  inscription: "INTERN",
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
    render(<AtelierPage />);
    expect(await screen.findByText("Litere · INTERN")).toBeInTheDocument();
    expect(screen.queryByText("La furnizor extern")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Predă către furnizor" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Marchează pentru execuție externă" }),
    ).not.toBeInTheDocument();
  });

  it("shows the server lane, the reason, and an open action that is not start", async () => {
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
              displayOrderNote:
                "Ordinea de afișare nu reprezintă programare sau prioritate de producție.",
              inProgressMine: [
                {
                  taskId: "task-mine",
                  planId: "exp-mine",
                  jobId: "ord-a",
                  processLabel: "Sudură",
                  scopeLabel: "Cadru",
                  seqLabel: "03",
                  statusLabel: "În lucru",
                  productLabel: "Litere",
                  inscription: "NORD",
                  customerDisplayName: "Nord Market",
                  providerLabel: "Router 1",
                  canClaimStart: false,
                  lane: "in_progress_mine",
                },
              ],
              availableReady: [
                {
                  taskId: "task-ready",
                  planId: "exp-ready",
                  jobId: "ord-a",
                  processLabel: "Ambalare",
                  scopeLabel: "Final",
                  statusLabel: "Planificat",
                  productLabel: "Litere",
                  inscription: "NORD",
                  canClaimStart: true,
                  lane: "available_ready",
                },
              ],
              availableNeedsProvider: [
                {
                  taskId: "task-cnc",
                  planId: "exp-cnc",
                  jobId: "ord-a",
                  processLabel: "Debitare",
                  scopeLabel: "Foaie",
                  requiredCapabilityLabel: "Debitare CNC",
                  canClaimStart: false,
                  lane: "available_needs_provider",
                },
              ],
              waitingDependencies: [
                {
                  taskId: "task-wait",
                  planId: "exp-wait",
                  jobId: "ord-a",
                  processLabel: "Cablare",
                  scopeLabel: "Spate",
                  waitingForLabels: ["Debitare foaie CNC"],
                  canClaimStart: false,
                  lane: "waiting_dependencies",
                },
              ],
              blockedMaterial: [
                {
                  taskId: "task-block",
                  planId: "exp-block",
                  jobId: "ord-a",
                  processLabel: "Montare LED",
                  scopeLabel: "Litere",
                  materialBlockLabel: "Modul LED nu este confirmat disponibil.",
                  canClaimStart: false,
                  lane: "blocked_material",
                },
              ],
            },
          });
        }
        return jsonResponse({});
      }),
    );

    render(<AtelierPage />);
    expect(await screen.findByText("1 în lucru de tine")).toBeInTheDocument();
    expect(screen.getByText("1 pot fi pornite")).toBeInTheDocument();
    expect(screen.queryByText(/urmează/)).not.toBeInTheDocument();
    expect(screen.getByText("Router 1")).toBeInTheDocument();
    expect(screen.getByText("Necesită alocare: Debitare CNC")).toBeInTheDocument();
    expect(screen.getByText("Așteaptă: Debitare foaie CNC")).toBeInTheDocument();
    expect(screen.getByText("Modul LED nu este confirmat disponibil.")).toBeInTheDocument();
    expect(screen.getAllByText("Deschide execuția").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Pornește" })).not.toBeInTheDocument();
    expect(screen.getByText(/nu reprezintă programare sau prioritate/)).toBeInTheDocument();
  });
});
