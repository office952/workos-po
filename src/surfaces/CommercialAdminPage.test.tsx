import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommercialAdminPage } from "./CommercialAdminPage";

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
  sourceLabel: "Politică de sistem",
  guidance: "Politica de sistem. Valorile nu au fost încă confirmate pentru această organizație.",
  policyId: "DEFAULT_COMMERCIAL_POLICY",
  activeVersion: null,
  editable: {
    markupPercent: 35,
    vatPercent: 21,
    defaultDiscountPercent: 0,
    defaultAdjustment: 0,
  },
  readOnly: { currency: "EUR", rounding: 0.01 },
  history: [],
};

describe("CommercialAdminPage", () => {
  it("shows the system policy state without claiming organization confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      }),
    );

    render(<CommercialAdminPage />);

    expect(
      await screen.findByText(
        "Politica de sistem. Valorile nu au fost încă confirmate pentru această organizație.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Adaos implicit (%)")).toHaveValue("35");
    expect(screen.getAllByText("Politică de sistem").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Salvează politica" })).toBeEnabled();
  });

  it("does not tell the owner that saved organization defaults still need configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ...defaultAdmin,
          source: "ORGANIZATION",
          sourceLabel: "Valori implicite ale firmei",
          guidance:
            "Aceste valori sunt folosite ca punct de pornire pentru ofertele noi. Pot fi modificate individual pe fiecare ofertă.",
          activeVersion: 1,
        }),
      }),
    );

    render(<CommercialAdminPage />);

    expect(
      await screen.findByText("Punct de pornire pentru oferte noi"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Politica trebuie configurată")).not.toBeInTheDocument();
  });

  it("saves a new organization version", async () => {
    const saved = {
      ...defaultAdmin,
      source: "ORGANIZATION",
      sourceLabel: "Valori implicite ale firmei",
      guidance: null,
      activeVersion: 1,
      editable: {
        markupPercent: 30,
        vatPercent: 21,
        defaultDiscountPercent: 0,
        defaultAdjustment: 0,
      },
      history: [
        {
          version: 1,
          status: "ACTIVE",
          source: "ORGANIZATION",
          createdAt: "2026-09-20T00:00:00.000Z",
          effectiveFrom: "2026-09-20T00:00:00.000Z",
          markupPercent: 30,
          vatPercent: 21,
          defaultDiscountPercent: 0,
          defaultAdjustment: 0,
        },
      ],
    };
    let organizationSaved = false;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/commercial-policy") && String(init?.method ?? "GET") === "POST") {
        organizationSaved = true;
        return jsonResponse(saved);
      }
      return jsonResponse(organizationSaved ? saved : defaultAdmin);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<CommercialAdminPage />);
    const markup = await screen.findByLabelText("Adaos implicit (%)");
    await userEvent.clear(markup);
    await userEvent.type(markup, "30");
    await userEvent.click(screen.getByRole("button", { name: "Salvează politica" }));
    expect(await screen.findByText("Politica a fost salvată")).toBeInTheDocument();
    expect(screen.getByText("Versiunea 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Adaos implicit (%)")).toHaveValue("30");
  });
});
