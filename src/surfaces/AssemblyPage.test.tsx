import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssemblyPage, assemblyLead } from "./AssemblyPage";

afterEach(() => {
  vi.unstubAllGlobals();
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
});
