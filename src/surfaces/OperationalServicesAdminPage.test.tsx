import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationalServicesAdminPage } from "./OperationalServicesAdminPage";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function payload(offerMode: string, canWrite = true) {
  return {
    canWrite,
    services: {
      capabilities: [
        {
          capabilityId: "SITE_INSTALLATION",
          label: "Montaj la locație",
          selectable: true,
          reserved: false,
          offerMode,
        },
      ],
    },
  };
}

describe("OperationalServicesAdminPage", () => {
  it("shows only the reason when the read fails, never an empty form (R1 · F9)", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "unavailable" }, 503)));
    render(<OperationalServicesAdminPage />);
    expect(await screen.findByText("Serviciile nu au putut fi citite")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("Montaj la locație", { selector: "h2" })).not.toBeInTheDocument();
  });

  it("saves the chosen mode and names it", async () => {
    let mode = "SERVICE_DISABLED";
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      if (String(init?.method ?? "GET") === "PATCH") {
        mode = (JSON.parse(String(init?.body ?? "{}")) as { offerMode: string }).offerMode;
      }
      return jsonResponse(payload(mode));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<OperationalServicesAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Intern/ }));
    expect(screen.getByRole("region", { name: "Modificări nesalvate" })).toHaveTextContent("Dezactivat → Intern");
    await user.click(screen.getByRole("button", { name: "Salvează modul" }));
    expect(await screen.findByText("Modul a fost salvat")).toBeInTheDocument();
    expect(mode).toBe("INTERNAL");
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
  });

  it("does not report an unreadable save answer as success and keeps the choice (R1 · F8)", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      if (String(init?.method ?? "GET") === "PATCH") {
        return jsonResponse({ ok: true });
      }
      return jsonResponse(payload("SERVICE_DISABLED"));
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<OperationalServicesAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Subcontractat/ }));
    await user.click(screen.getByRole("button", { name: "Salvează modul" }));
    expect(await screen.findByText("Salvarea a eșuat")).toBeInTheDocument();
    expect(screen.queryByText("Modul a fost salvat")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Subcontractat/ })).toBeChecked();
    expect(screen.getByRole("region", { name: "Modificări nesalvate" })).toBeInTheDocument();
  });

  it("keeps the choice when the server refuses the save", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        void input;
        return String(init?.method ?? "GET") === "PATCH"
          ? jsonResponse({ error: "forbidden" }, 403)
          : jsonResponse(payload("INTERNAL"));
      }),
    );
    const user = userEvent.setup();
    render(<OperationalServicesAdminPage />);
    await user.click(await screen.findByRole("radio", { name: /Ambele/ }));
    await user.click(screen.getByRole("button", { name: "Salvează modul" }));
    // A known refusal is explained in Romanian; no raw code in the sentence.
    expect(await screen.findByText(/Nu ai dreptul să faci această modificare/)).toBeInTheDocument();
    expect(screen.queryByText(/forbidden/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Ambele/ })).toBeChecked();
  });

  it("is read-only for members", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse(payload("INTERNAL", false))));
    render(<OperationalServicesAdminPage />);
    expect(await screen.findByText("Modul de serviciu este doar pentru citire.")).toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Mod curent: Intern")).toBeInTheDocument();
  });
});
