import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductEnablementAdminPage } from "./ProductEnablementAdminPage";

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

const defaultAdmin = {
  canEdit: true,
  resolutionOk: true,
  source: "CODE_DEFAULT",
  sourceLabel: "Selecție de sistem",
  guidance:
    "Toate produsele partajate sunt oferite pentru lucrări noi, până când organizația confirmă altă selecție.",
  activeVersion: null,
  products: [
    {
      templateCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
      label: "Litere volumetrice față plexi",
      enabled: true,
    },
    {
      templateCode: "PRD-ACM-CASSETTE-NONE",
      label: "Panou ACM casetat",
      enabled: true,
    },
  ],
  history: [],
};

describe("ProductEnablementAdminPage", () => {
  it("shows the system selection without exposing product codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      }),
    );

    render(<ProductEnablementAdminPage />);

    expect(
      await screen.findByText(
        "Toate produsele partajate sunt oferite pentru lucrări noi, până când organizația confirmă altă selecție.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Litere volumetrice față plexi")).toBeChecked();
    expect(screen.getByLabelText("Panou ACM casetat")).toBeChecked();
    expect(screen.queryByText("PRD-LETTERS-FRONTLIT-PLEXI-AL06")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvează produsele oferite" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Valori comerciale" })).toHaveAttribute(
      "href",
      "/admin/commercial",
    );
  });

  it("saves a disabled product for new work", async () => {
    const saved = {
      ...defaultAdmin,
      source: "ORGANIZATION",
      sourceLabel: "Selecție a firmei",
      guidance:
        "Aceste produse apar în catalogul pentru lucrări noi. Ofertele și lucrările vechi rămân deschise.",
      activeVersion: 1,
      products: [
        defaultAdmin.products[0],
        { ...defaultAdmin.products[1], enabled: false },
      ],
      history: [
        {
          version: 1,
          status: "ACTIVE",
          sourceLabel: "Selecție a firmei",
          createdAt: "2026-09-21T00:00:00.000Z",
          effectiveFrom: "2026-09-21T00:00:00.000Z",
          offeredCount: 1,
        },
      ],
    };
    let organizationSaved = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/product-enablement") && String(init?.method ?? "GET") === "POST") {
        organizationSaved = true;
        return jsonResponse(saved);
      }
      return jsonResponse(organizationSaved ? saved : defaultAdmin);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ProductEnablementAdminPage />);
    await screen.findByLabelText("Panou ACM casetat");
    await user.click(screen.getByLabelText("Panou ACM casetat"));
    await user.click(screen.getByRole("button", { name: "Salvează produsele oferite" }));

    expect(await screen.findByText("Selecția a fost salvată")).toBeInTheDocument();
    expect(screen.getByLabelText("Panou ACM casetat")).not.toBeChecked();
    expect(screen.getByText("Versiunea 1")).toBeInTheDocument();
  });

  it("blocks member edits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...defaultAdmin,
          canEdit: false,
        }),
      }),
    );

    render(<ProductEnablementAdminPage />);
    expect(await screen.findByLabelText("Litere volumetrice față plexi")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvează produsele oferite" })).not.toBeInTheDocument();
    expect(
      screen.getAllByText("Editarea nu este disponibilă pentru acest rol.").length,
    ).toBeGreaterThan(0);
  });
});
