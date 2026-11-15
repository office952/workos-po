import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalProductionAdminPage } from "./ExternalProductionAdminPage";

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

function admin(providers: Array<{ providerId: string; name: string; active: boolean }>, mode = "DISABLED") {
  return {
    canWrite: true,
    mode,
    modeLabel: mode === "ENABLED" ? "Activ" : "Oprit",
    source: "CODE_DEFAULT",
    version: 0,
    providers,
  };
}

describe("ExternalProductionAdminPage", () => {
  it("shows the disabled mode and lets an owner add a provider", async () => {
    let providers: Array<{ providerId: string; name: string; active: boolean }> = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/providers") && init?.method === "POST") {
        providers = [{ providerId: "xprov:1", name: "Atelier Extern", active: true }];
        return jsonResponse({ provider: providers[0] }, 201);
      }
      return jsonResponse(admin(providers));
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    expect(await screen.findByText(/Mod curent: Oprit/)).toBeInTheDocument();
    expect(screen.getAllByText("Execuție externă").length).toBeGreaterThan(0);
    expect(screen.getByRole("radio", { name: /Oprit/ })).toBeChecked();
    await user.type(screen.getByLabelText("Furnizor nou"), "Atelier Extern");
    await user.click(screen.getByRole("button", { name: "Adaugă furnizor" }));
    const ask = screen.getByRole("dialog", { name: "Creezi furnizorul „Atelier Extern”?" });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await user.click(within(ask).getByRole("button", { name: "Creează furnizorul" }));
    expect(await screen.findByDisplayValue("Atelier Extern")).toBeInTheDocument();
    expect(screen.getByText("Furnizorul „Atelier Extern” a fost creat.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oprește furnizorul" })).toBeInTheDocument();
    expect(screen.queryByText("xprov:1")).not.toBeInTheDocument();
  });

  it("asks before stopping a provider and sends nothing on cancel (R1 · F10)", async () => {
    let providers = [{ providerId: "xprov:1", name: "Atelier Extern", active: true }];
    const patches: unknown[] = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { active?: boolean };
        patches.push(body);
        providers = providers.map((item) => ({ ...item, active: body.active ?? item.active }));
        return jsonResponse({ provider: providers[0] });
      }
      return jsonResponse(admin(providers));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    await user.click(await screen.findByRole("button", { name: "Oprește furnizorul" }));
    const ask = screen.getByRole("dialog", { name: "Oprești furnizorul Atelier Extern?" });
    expect(within(ask).getByRole("button", { name: "Anulează" })).toHaveFocus();
    await user.click(within(ask).getByRole("button", { name: "Anulează" }));
    expect(patches).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Oprește furnizorul" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Oprești furnizorul Atelier Extern?" })).getByRole("button", {
        name: "Oprește furnizorul",
      }),
    );
    expect(await screen.findByText("Atelier Extern a fost oprit.")).toBeInTheDocument();
    expect(patches).toEqual([{ active: false }]);
    expect(screen.getByRole("button", { name: "Activează furnizorul" })).toBeInTheDocument();
  });

  it("reviews a mode change before saving it", async () => {
    let mode = "DISABLED";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      if (init?.method === "PUT" || init?.method === "PATCH" || init?.method === "POST") {
        mode = "ENABLED";
      }
      return jsonResponse(admin([], mode));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Activ/ }));
    await user.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    const ask = screen.getByRole("dialog", { name: "Pornești execuția externă?" });
    await user.click(within(ask).getByRole("button", { name: "Pornește" }));
    expect(await screen.findByText("Modul de execuție externă este acum Activ.")).toBeInTheDocument();
  });
});

/**
 * R3 safety fix · a new provider is created only from its own explicit confirmation, never because
 * the owner leaves the page, and never twice.
 */
describe("ExternalProductionAdminPage · explicit provider creation and leaving", () => {
  type Provider = { providerId: string; name: string; active: boolean };

  function stub(options: { refuseCreate?: boolean; slowCreate?: boolean } = {}) {
    let providers: Provider[] = [{ providerId: "xprov:1", name: "Atelier Vechi", active: true }];
    let mode = "DISABLED";
    let release: () => void = () => undefined;
    const calls: string[] = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      if (method === "POST" && url.endsWith("/providers")) {
        const name = (JSON.parse(String(init?.body ?? "{}")) as { name: string }).name;
        calls.push(`create:${name}`);
        if (options.refuseCreate) return jsonResponse({ error: "duplicate_name" }, 409);
        const created = () => {
          providers = [...providers, { providerId: "xprov:2", name, active: true }];
          return { ok: true, status: 201, json: async () => ({ provider: providers[1] }) };
        };
        return options.slowCreate
          ? new Promise((resolve) => {
              release = () => resolve(created());
            })
          : Promise.resolve(created());
      }
      if (method === "POST" && url.includes("/providers/")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { name?: string };
        calls.push(`rename:${body.name}`);
        providers = providers.map((p) => (body.name ? { ...p, name: body.name } : p));
        return jsonResponse({ provider: providers[0] });
      }
      if (method === "POST") {
        mode = (JSON.parse(String(init?.body ?? "{}")) as { mode: string }).mode;
        calls.push(`mode:${mode}`);
      }
      return jsonResponse(admin(providers, mode));
    });
    vi.stubGlobal("fetch", fetchMock);
    return { calls, release: () => release() };
  }

  it("sends one creation request even when the confirmation is clicked twice", async () => {
    const server = stub({ slowCreate: true });
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    await user.type(await screen.findByLabelText("Furnizor nou"), "Atelier Nou");
    await user.click(screen.getByRole("button", { name: "Adaugă furnizor" }));
    const ask = screen.getByRole("dialog", { name: "Creezi furnizorul „Atelier Nou”?" });
    const confirm = within(ask).getByRole("button", { name: "Creează furnizorul" });
    act(() => {
      confirm.click();
      confirm.click();
    });
    await act(async () => server.release());
    expect(await screen.findByText("Furnizorul „Atelier Nou” a fost creat.")).toBeInTheDocument();
    expect(server.calls).toEqual(["create:Atelier Nou"]);
  });

  it("keeps the typed name and claims no success when the server refuses the creation", async () => {
    const server = stub({ refuseCreate: true });
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    await user.type(await screen.findByLabelText("Furnizor nou"), "Atelier Vechi");
    await user.click(screen.getByRole("button", { name: "Adaugă furnizor" }));
    const ask = screen.getByRole("dialog", { name: "Creezi furnizorul „Atelier Vechi”?" });
    await user.click(within(ask).getByRole("button", { name: "Creează furnizorul" }));
    expect(await within(ask).findByText("Există deja un furnizor cu acest nume. Alege alt nume.")).toBeInTheDocument();
    expect(screen.queryByText(/a fost creat/)).not.toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Anulează" }));
    expect(screen.getByLabelText("Furnizor nou")).toHaveValue("Atelier Vechi");
    expect(server.calls).toEqual(["create:Atelier Vechi"]);
  });

  it("never creates a typed provider on the way out: the question only says so", async () => {
    window.history.replaceState(null, "", "/admin/external-production");
    const server = stub();
    const { navigate } = await import("../routing/navigate");
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    await user.type(await screen.findByLabelText("Furnizor nou"), "Atelier Nou");
    act(() => navigate("/admin/access"));
    const ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    expect(ask).toHaveTextContent("Furnizorul nou „Atelier Nou” nu este creat la plecare.");
    expect(within(ask).queryByRole("button", { name: "Revizuiește și salvează" })).not.toBeInTheDocument();
    await user.click(within(ask).getByRole("button", { name: "Pleacă fără salvare" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/access"));
    expect(server.calls).toEqual([]);
  });

  it("saves a mode change on the way out only through the mode confirmation", async () => {
    window.history.replaceState(null, "", "/admin/external-production");
    const server = stub();
    const { navigate } = await import("../routing/navigate");
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Activ/ }));
    await user.type(screen.getByLabelText("Furnizor nou"), "Atelier Nou");
    act(() => navigate("/admin/access"));
    let ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    await user.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    const confirm = await screen.findByRole("dialog", { name: "Pornești execuția externă?" });
    expect(server.calls).toEqual([]);
    await user.click(within(confirm).getByRole("button", { name: "Pornește" }));
    // The mode is saved; the typed provider is still not created, so the question comes back.
    ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    expect(server.calls).toEqual(["mode:ENABLED"]);
    expect(window.location.pathname).toBe("/admin/external-production");
    await user.click(within(ask).getByRole("button", { name: "Pleacă fără salvare" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/access"));
    expect(server.calls).toEqual(["mode:ENABLED"]);
  });

  it("saves renames on the way out exactly as the inline button does, then leaves", async () => {
    window.history.replaceState(null, "", "/admin/external-production");
    const server = stub();
    const { navigate } = await import("../routing/navigate");
    const user = userEvent.setup();
    render(<ExternalProductionAdminPage />);
    const name = await screen.findByLabelText("Nume furnizor");
    await user.clear(name);
    await user.type(name, "Atelier Redenumit");
    act(() => navigate("/admin/access"));
    const ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    await user.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/access"));
    expect(server.calls).toEqual(["rename:Atelier Redenumit"]);
  });
});
