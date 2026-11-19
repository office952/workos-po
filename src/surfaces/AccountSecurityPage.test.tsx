import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountSecurityPage } from "./AccountSecurityPage";

afterEach(() => {
  vi.unstubAllGlobals();
});

function security(others: number) {
  return {
    email: "owner@firma.test",
    emailVerified: true,
    passwordChangedAt: "2026-01-01T00:00:00.000Z",
    emailDeliveryAvailable: true,
    sessions: [
      { createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-02T00:00:00.000Z", current: true },
      ...Array.from({ length: others }, (_, index) => ({
        createdAt: `2026-01-${String(index + 3).padStart(2, "0")}T00:00:00.000Z`,
        lastSeenAt: `2026-01-${String(index + 3).padStart(2, "0")}T12:00:00.000Z`,
        current: false,
      })),
    ],
    memberships: [{ organizationId: "org:a", displayName: "Firma Test SRL", roleLabel: "Proprietar" }],
    recentEvents: [],
  };
}

function jsonResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("AccountSecurityPage", () => {
  it("keeps the session list and shows an error when revoke-others returns HTTP 500", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/account/security")) return jsonResponse(200, security(2));
      if (url.endsWith("/api/account/sessions/revoke-others")) return jsonResponse(500, { error: "internal" });
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSecurityPage />);
    const revoke = await screen.findByRole("button", { name: "Închide celelalte 2 sesiuni" });
    expect(screen.getByText("Altă sesiune 1")).toBeInTheDocument();
    expect(screen.getByText("Altă sesiune 2")).toBeInTheDocument();

    await userEvent.click(revoke);

    expect(await screen.findByText("Sesiunile nu au fost închise")).toBeInTheDocument();
    expect(screen.queryByText("Sesiuni închise")).not.toBeInTheDocument();
    expect(screen.getByText("Altă sesiune 1")).toBeInTheDocument();
    expect(screen.getByText("Altă sesiune 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Închide celelalte 2 sesiuni" })).toBeEnabled();
  });

  it("shows an error and does not claim success when the revoke request is rejected", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/account/security")) return jsonResponse(200, security(1));
      if (url.endsWith("/api/account/sessions/revoke-others")) return Promise.reject(new TypeError("Failed to fetch"));
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSecurityPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Închide cealaltă sesiune" }));

    expect(await screen.findByText("Sesiunile nu au fost închise")).toBeInTheDocument();
    expect(screen.getByText(/Conexiunea s-a întrerupt/)).toBeInTheDocument();
    expect(screen.queryByText("Sesiuni închise")).not.toBeInTheDocument();
    expect(screen.getByText("Altă sesiune 1")).toBeInTheDocument();
  });

  it("keeps the success path and reloads sessions after a successful revoke", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/account/sessions/revoke-others")) return jsonResponse(200, { ok: true });
      if (url.endsWith("/api/account/security")) {
        const afterSuccess = fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/api/account/sessions/revoke-others"));
        return jsonResponse(200, security(afterSuccess ? 0 : 2));
      }
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSecurityPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Închide celelalte 2 sesiuni" }));

    expect(await screen.findByText("Sesiuni închise")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Închide celelalte/ })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Altă sesiune 1")).not.toBeInTheDocument();
  });

  it("ignores a second click while revoke-others is in flight", async () => {
    let release!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/account/security")) return jsonResponse(200, security(1));
      if (url.endsWith("/api/account/sessions/revoke-others")) return pending.then(() => jsonResponse(500, {}));
      return jsonResponse(404, {});
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AccountSecurityPage />);
    const revoke = await screen.findByRole("button", { name: "Închide cealaltă sesiune" });
    await userEvent.click(revoke);
    expect(await screen.findByRole("button", { name: "Se închid sesiunile…" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Se închid sesiunile…" }));
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith("/api/account/sessions/revoke-others"))).toHaveLength(1);
    release(undefined);
    expect(await screen.findByText("Sesiunile nu au fost închise")).toBeInTheDocument();
  });
});
