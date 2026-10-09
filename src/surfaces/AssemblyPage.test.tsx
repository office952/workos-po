import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { AssemblyPage, assemblyLead } from "./AssemblyPage";

afterEach(() => {
  vi.unstubAllGlobals();
  resetResourceCache();
  window.history.replaceState(null, "", "/");
});

describe("assemblyLead", () => {
  it("keeps the letters assembly wording when logo is absent", () => {
    expect(assemblyLead(false, true)).toBe(
      "Configurează panoul și literele, apoi confirmă ansamblul.",
    );
  });

  it("says letters are optional only when the logo assembly has no letters", () => {
    expect(assemblyLead(true, false)).toBe(
      "Configurează panoul și logo-ul. Literele sunt opționale.",
    );
  });

  it("names the panel, letters, and logo when letters are present", () => {
    expect(assemblyLead(true, true)).toBe(
      "Configurează panoul, literele și logo-ul, apoi confirmă ansamblul.",
    );
  });
});

describe("AssemblyPage", () => {
  it("uses the full composition lead when letters are confirmed", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:full");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            assembly: {
              assemblyId: "asm:full",
              label: "Panou ACM + litere + logo volumetric",
              statusLabel: "Confirmat",
              stale: false,
              staleReason: null,
              canConfirm: false,
              scopes: [
                { id: "acm", title: "Panou ACM", complete: true, summary: "Panou" },
                { id: "logo", title: "Logo", complete: true, summary: "Logo" },
                { id: "letters", title: "Litere", complete: true, summary: "Litere" },
                { id: "relation", title: "Ansamblare", complete: true, summary: "Relații" },
                { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
              ],
              quote: null,
              orderId: null,
              productionId: null,
              executionPlanId: null,
            },
          }),
        }),
      ),
    );

    render(<AssemblyPage />);
    expect(
      await screen.findByText(
        "Configurează panoul, literele și logo-ul, apoi confirmă ansamblul.",
      ),
    ).toBeInTheDocument();
  });

  it("enables confirm when a remount refetches canConfirm from the server", async () => {
    window.history.replaceState(null, "", "/ansamblu?assembly=asm:sync");
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          assembly: {
            assemblyId: "asm:sync",
            customerId: "cus:1",
            requestId: "crq:1",
            label: "Panou ACM + litere volumetrice",
            statusLabel: "În lucru",
            stale: false,
            staleReason: null,
            canConfirm: true,
            scopes: [
              {
                id: "acm",
                title: "Panou ACM",
                complete: true,
                summary: "Panou",
                productCode: "ACM_PANEL",
                role: "SUPPORT_PANEL",
              },
              {
                id: "letters",
                title: "Litere",
                complete: true,
                summary: "Litere",
                productCode: "LETTERS_V1",
                role: "SIGNAGE_LETTERS",
              },
              { id: "relation", title: "Ansamblare", complete: true, summary: "Relații" },
              { id: "summary", title: "Rezumat ansamblu", complete: true, summary: "Gata" },
            ],
            quote: null,
            orderId: null,
            productionId: null,
            executionPlanId: null,
          },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AssemblyPage />);
    const confirmButton = await screen.findByRole("button", { name: "Confirmă ansamblul" });
    await waitFor(() => {
      expect(confirmButton).not.toBeDisabled();
    });
    expect(fetchMock).toHaveBeenCalled();
  });
});
