import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialReadinessAdminPage } from "./MaterialReadinessAdminPage";

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

function admin(mode: string, canWrite = true) {
  return { canWrite, mode, modeLabel: mode === "REQUIRED" ? "Obligatoriu" : "Oprit", source: "ORG", version: 1 };
}

describe("MaterialReadinessAdminPage", () => {
  it("confirms a mode change before saving it", async () => {
    let mode = "DISABLED";
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        void input;
        if (init?.method && init.method !== "GET") {
          posts.push(JSON.parse(String(init.body ?? "{}")));
          mode = "REQUIRED";
        }
        return jsonResponse(admin(mode));
      }),
    );
    const user = userEvent.setup();
    render(<MaterialReadinessAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Obligatoriu/ }));
    expect(screen.getByRole("region", { name: "Modificări nesalvate" })).toHaveTextContent("Oprit → Obligatoriu");
    await user.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    const ask = screen.getByRole("dialog", { name: "Ceri confirmarea materialelor?" });
    expect(posts).toEqual([]);
    await user.click(within(ask).getByRole("button", { name: "Confirmă" }));
    expect(await screen.findByText("Modul a fost salvat")).toBeInTheDocument();
    expect(posts).toEqual([{ mode: "REQUIRED" }]);
  });

  it("shows the reason only when the read fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "unavailable" }, 503)));
    render(<MaterialReadinessAdminPage />);
    expect(await screen.findByText("Modul nu a putut fi citit")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("is read-only for members", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(admin("REQUIRED", false))));
    render(<MaterialReadinessAdminPage />);
    expect(await screen.findByText("Doar proprietarul organizației poate schimba modul.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });
});

describe("MaterialReadinessAdminPage · leave question uses the normal confirmation", () => {
  it("asks the mode confirmation before saving; cancelling it keeps the page and the choice", async () => {
    window.history.replaceState(null, "", "/admin/material-readiness");
    let mode = "DISABLED";
    const fetchMock = vi.fn((_input: RequestInfo, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") mode = "REQUIRED";
      return jsonResponse(admin(mode));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { navigate } = await import("../routing/navigate");
    const user = userEvent.setup();
    render(<MaterialReadinessAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Obligatoriu/ }));
    act(() => navigate("/admin/people"));
    let ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    await user.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    const confirm = await screen.findByRole("dialog", { name: "Ceri confirmarea materialelor?" });
    expect(fetchMock.mock.calls.filter(([, i]) => String(((i) as RequestInit | undefined)?.method ?? "GET") === "POST")).toHaveLength(0);
    await user.click(within(confirm).getByRole("button", { name: "Anulează" }));
    ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    expect(window.location.pathname).toBe("/admin/material-readiness");
    await user.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Ceri confirmarea materialelor?" })).getByRole("button", { name: "Confirmă" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/people"));
    expect(fetchMock.mock.calls.filter(([, i]) => String(((i) as RequestInit | undefined)?.method ?? "GET") === "POST")).toHaveLength(1);
    expect(screen.getByRole("radio", { name: /Obligatoriu/ })).toBeChecked();
  });
});
