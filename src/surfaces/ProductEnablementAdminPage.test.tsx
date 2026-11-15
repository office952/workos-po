import { act, render, screen, waitFor, within } from "@testing-library/react";
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
    "Produsele existente rămân oferite pentru lucrări noi, până când organizația confirmă propria selecție.",
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

function offer(product: string, choice: "Oferit" | "Neoferit") {
  return within(screen.getByRole("group", { name: product })).getByRole("radio", { name: choice });
}

describe("ProductEnablementAdminPage", () => {
  it("shows the system selection without exposing product codes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => defaultAdmin }));

    render(<ProductEnablementAdminPage />);

    expect(
      await screen.findByText(
        "Produsele existente rămân oferite pentru lucrări noi, până când organizația confirmă propria selecție.",
      ),
    ).toBeInTheDocument();
    expect(offer("Litere volumetrice față plexi", "Oferit")).toBeChecked();
    expect(offer("Panou ACM casetat", "Oferit")).toBeChecked();
    expect(screen.queryByText("PRD-LETTERS-FRONTLIT-PLEXI-AL06")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Servicii operaționale" })).toHaveAttribute("href", "/admin/services");
  });

  it("saves a disabled product for new work through the review", async () => {
    const saved = {
      ...defaultAdmin,
      source: "ORGANIZATION",
      sourceLabel: "Selecție a firmei",
      guidance: "Aceste produse apar în catalogul pentru lucrări noi. Ofertele și lucrările vechi rămân deschise.",
      activeVersion: 1,
      products: [defaultAdmin.products[0], { ...defaultAdmin.products[1], enabled: false }],
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
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) => {
        if (String(input).endsWith("/api/admin/product-enablement") && String(init?.method ?? "GET") === "POST") {
          organizationSaved = true;
          return jsonResponse(saved);
        }
        return jsonResponse(organizationSaved ? saved : defaultAdmin);
      }),
    );

    const user = userEvent.setup();
    render(<ProductEnablementAdminPage />);
    await screen.findByRole("group", { name: "Panou ACM casetat" });
    await user.click(offer("Panou ACM casetat", "Neoferit"));
    expect(screen.getByText("Selectat ca neoferit pentru lucrări noi. Nu este salvat.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Modificări nesalvate" })).toHaveTextContent(
      "Panou ACM casetat: Oferit → Neoferit",
    );
    await user.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    const review = await screen.findByRole("dialog", { name: "Revizuiește modificările" });
    expect(review).toHaveTextContent("Ofertele și lucrările existente rămân deschise.");
    expect(organizationSaved).toBe(false);
    await user.click(within(review).getByRole("button", { name: "Salvează versiunea 1" }));

    expect(await screen.findByText("Selecția a fost salvată")).toBeInTheDocument();
    expect(offer("Panou ACM casetat", "Neoferit")).toBeChecked();
    expect(screen.getByText("Nu este oferit pentru lucrări noi. Ofertele existente rămân deschise.")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("keeps unsaved selection distinct from the applied catalog and restores it on Renunță", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => defaultAdmin }));

    const user = userEvent.setup();
    render(<ProductEnablementAdminPage />);
    await screen.findByRole("group", { name: "Panou ACM casetat" });
    await user.click(offer("Panou ACM casetat", "Neoferit"));

    expect(offer("Panou ACM casetat", "Oferit")).not.toBeChecked();
    expect(screen.getByText("Selectat ca neoferit pentru lucrări noi. Nu este salvat.")).toBeInTheDocument();
    expect(
      screen.queryByText("Nu este oferit pentru lucrări noi. Ofertele existente rămân deschise."),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Renunță" }));

    expect(offer("Panou ACM casetat", "Oferit")).toBeChecked();
    expect(screen.getAllByText("Oferit pentru lucrări noi. Ofertele existente rămân deschise.")).toHaveLength(2);
    expect(screen.queryByRole("region", { name: "Modificări nesalvate" })).not.toBeInTheDocument();
  });

  it("describes a disabled product as not offered for new work", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...defaultAdmin,
          canEdit: false,
          products: [
            ...defaultAdmin.products,
            { templateCode: "PRD-LOGO-FRONTLIT-PLEXI-AL06", label: "Logo volumetric luminos", enabled: false },
          ],
        }),
      }),
    );

    render(<ProductEnablementAdminPage />);
    await screen.findByRole("group", { name: "Logo volumetric luminos" });
    expect(offer("Logo volumetric luminos", "Neoferit")).toBeChecked();
    expect(screen.getAllByText("Oferit pentru lucrări noi. Ofertele existente rămân deschise.")).toHaveLength(2);
    expect(screen.getByText("Nu este oferit pentru lucrări noi. Ofertele existente rămân deschise.")).toBeInTheDocument();
  });

  it("blocks member edits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ...defaultAdmin, canEdit: false }) }),
    );

    render(<ProductEnablementAdminPage />);
    await screen.findByRole("group", { name: "Litere volumetrice față plexi" });
    expect(offer("Litere volumetrice față plexi", "Oferit")).toBeDisabled();
    expect(screen.getByText("Editarea nu este disponibilă pentru acest rol.")).toBeInTheDocument();
  });
});

describe("ProductEnablementAdminPage · leave question uses the normal review", () => {
  it("a product taken off the offer is reviewed before it is saved, then the page is left", async () => {
    window.history.replaceState(null, "", "/admin/products");
    const fetchMock = vi.fn<(input: RequestInfo, init?: RequestInit) => ReturnType<typeof jsonResponse>>(() =>
      jsonResponse(defaultAdmin),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { navigate } = await import("../routing/navigate");
    const user = userEvent.setup();
    render(<ProductEnablementAdminPage />);
    await screen.findAllByRole("radio");
    await user.click(offer("Panou ACM casetat", "Neoferit"));
    act(() => navigate("/admin/services"));
    const ask = await screen.findByRole("dialog", { name: "Ai modificări nesalvate" });
    await user.click(within(ask).getByRole("button", { name: "Revizuiește și salvează" }));
    const review = await screen.findByRole("dialog", { name: "Revizuiește modificările" });
    expect(review).toHaveTextContent("Panou ACM casetat");
    expect(fetchMock.mock.calls.filter(([, init]) => String(((init) as RequestInit | undefined)?.method ?? "GET") === "POST")).toHaveLength(0);
    await user.click(within(review).getByRole("button", { name: "Salvează versiunea 1" }));
    await waitFor(() => expect(window.location.pathname).toBe("/admin/services"));
    expect(fetchMock.mock.calls.filter(([, init]) => String(((init) as RequestInit | undefined)?.method ?? "GET") === "POST")).toHaveLength(1);
  });
});
