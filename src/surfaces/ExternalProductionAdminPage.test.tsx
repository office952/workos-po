import { render, screen } from "@testing-library/react";
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

describe("ExternalProductionAdminPage", () => {
  it("shows the disabled mode and lets an owner add a provider", async () => {
    let providers: Array<{ providerId: string; name: string; active: boolean }> = [];
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/providers") && init?.method === "POST") {
        providers = [{ providerId: "xprov:1", name: "Atelier Extern", active: true }];
        return jsonResponse({ provider: providers[0] }, 201);
      }
      return jsonResponse({
        canWrite: true,
        mode: "DISABLED",
        modeLabel: "Oprit",
        source: "CODE_DEFAULT",
        version: 0,
        providers,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExternalProductionAdminPage />);
    expect(await screen.findByText("Mod curent")).toBeInTheDocument();
    expect(screen.getAllByText("Oprit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Execuție externă").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Mod")).toHaveValue("DISABLED");
    await userEvent.setup().type(screen.getByLabelText("Furnizor nou"), "Atelier Extern");
    await userEvent.setup().click(screen.getByRole("button", { name: "Adaugă furnizor" }));
    expect(await screen.findByText("Atelier Extern")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oprește furnizorul" })).toBeInTheDocument();
  });
});
