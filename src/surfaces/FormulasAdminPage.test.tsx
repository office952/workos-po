import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FormulasAdminPage } from "./FormulasAdminPage";

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

const quantityExpression = {
  kind: "CEIL",
  operand: {
    kind: "DIVIDE",
    left: { kind: "JOB_REF", inputId: "confirmedPerimeterMm" },
    right: { kind: "CONFIG_REF", settingId: "ledPitchMm" },
  },
};

const defaultAdmin = {
  canEdit: true,
  resolutionOk: true,
  guidance:
    "Aceste formule sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate.",
  formulas: [
    {
      formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
      resultId: "ledModuleQuantity",
      typeId: "LIGHTING_FRONT_LED",
      label: "Cantitate module LED",
      description: "Numărul de module LED se calculează din perimetrul confirmat și pasul LED.",
      resultUnit: "buc",
      resultValueKind: "COUNT",
      allowedOperators: ["DIVIDE", "CEIL"],
      allowedReferences: {
        configSettingIds: ["ledPitchMm"],
        jobInputIds: ["confirmedPerimeterMm"],
        formulaIds: [],
      },
      expression: quantityExpression,
      explanation: "rotunjire în sus (Perimetru confirmat ÷ Pas module LED)",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-21T00:00:00.000Z",
    },
    {
      formulaId: "LIGHTING_FRONT_LED.totalLedLoadW",
      resultId: "totalLedLoadW",
      typeId: "LIGHTING_FRONT_LED",
      label: "Sarcină LED totală",
      description: "Sarcina LED este cantitatea de module înmulțită cu puterea pe modul.",
      resultUnit: "W",
      resultValueKind: "POWER",
      allowedOperators: ["MULTIPLY"],
      allowedReferences: {
        configSettingIds: ["ledModulePowerW"],
        jobInputIds: [],
        formulaIds: ["LIGHTING_FRONT_LED.ledModuleQuantity"],
      },
      expression: {
        kind: "MULTIPLY",
        left: { kind: "FORMULA_REF", formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity" },
        right: { kind: "CONFIG_REF", settingId: "ledModulePowerW" },
      },
      explanation: "(Cantitate module LED × Putere modul LED)",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-21T00:00:00.000Z",
    },
    {
      formulaId: "LIGHTING_FRONT_LED.requiredPsuCapacityW",
      resultId: "requiredPsuCapacityW",
      typeId: "LIGHTING_FRONT_LED",
      label: "Capacitate minimă sursă",
      description: "Capacitatea minimă a sursei aplică rezerva tehnică peste sarcina LED.",
      resultUnit: "W",
      resultValueKind: "POWER",
      allowedOperators: ["ADD", "MULTIPLY", "DIVIDE"],
      allowedReferences: {
        configSettingIds: ["psuReservePercent"],
        jobInputIds: [],
        formulaIds: ["LIGHTING_FRONT_LED.totalLedLoadW"],
      },
      expression: {
        kind: "MULTIPLY",
        left: { kind: "FORMULA_REF", formulaId: "LIGHTING_FRONT_LED.totalLedLoadW" },
        right: {
          kind: "ADD",
          left: { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" },
          right: {
            kind: "DIVIDE",
            left: { kind: "CONFIG_REF", settingId: "psuReservePercent" },
            right: { kind: "NUMERIC_CONSTANT", value: 100, valueKind: "PERCENT" },
          },
        },
      },
      explanation: "(Sarcină LED totală × (1 + Rezervă sursă de alimentare ÷ 100))",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-21T00:00:00.000Z",
    },
  ],
  history: [
    {
      formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
      resultId: "ledModuleQuantity",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      createdAt: "2026-09-21T00:00:00.000Z",
      effectiveFrom: "2026-09-21T00:00:00.000Z",
    },
  ],
};

describe("FormulasAdminPage", () => {
  it("shows starter formulas, structured controls, history, and administration rail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      }),
    );

    render(<FormulasAdminPage />);

    expect(await screen.findByText("Cantitate module LED")).toBeInTheDocument();
    expect(screen.getByText("Sarcină LED totală")).toBeInTheDocument();
    expect(screen.getByText("Capacitate minimă sursă")).toBeInTheDocument();
    expect(screen.getAllByText("LIGHTING_FRONT_LED.ledModuleQuantity").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Tip expresie").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Salvează formula" })[0]).toBeEnabled();
    expect(screen.getByText(/versiunea 1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setări tehnice" })).toHaveAttribute(
      "href",
      "/admin/technical",
    );
  });

  it("shows a loading floor before the payload arrives", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => undefined)));
    render(<FormulasAdminPage />);
    expect(screen.getByText("Se încarcă formulele de calcul")).toBeInTheDocument();
  });

  it("blocks member edits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...defaultAdmin, canEdit: false }),
      }),
    );
    render(<FormulasAdminPage />);
    expect(await screen.findByText("Editarea nu este disponibilă pentru acest rol.")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Tip expresie")[0]).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Salvează formula" })).not.toBeInTheDocument();
  });

  it("saves a structured AST change and reports alreadyApplied", async () => {
    const saved = {
      ...defaultAdmin,
      alreadyApplied: false,
      formulas: defaultAdmin.formulas.map((item) =>
        item.formulaId === "LIGHTING_FRONT_LED.ledModuleQuantity"
          ? {
              ...item,
              source: "ORGANIZATION",
              sourceLabel: "Valoare a organizației",
              version: 2,
            }
          : item,
      ),
      history: [
        ...defaultAdmin.history,
        {
          formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
          resultId: "ledModuleQuantity",
          version: 2,
          status: "ACTIVE",
          statusLabel: "Activă",
          source: "ORGANIZATION",
          sourceLabel: "Valoare a organizației",
          createdAt: "2026-09-21T01:00:00.000Z",
          effectiveFrom: "2026-09-21T01:00:00.000Z",
        },
      ],
    };
    let posts = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/formulas") && String(init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { expression?: { kind?: string } };
        if (body.expression?.kind === "JOB_REF") {
          return jsonResponse(
            { error: "invalid_formulas", reasons: ["Referința nu este permisă pentru această formulă."] },
            400,
          );
        }
        posts += 1;
        if (posts > 1) {
          return jsonResponse({ ...saved, alreadyApplied: true });
        }
        return jsonResponse(saved);
      }
      return jsonResponse(posts > 0 ? saved : defaultAdmin);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<FormulasAdminPage />);
    const kind = await screen.findAllByLabelText("Tip expresie");
    await userEvent.selectOptions(kind[0]!, "JOB_REF");
    await userEvent.click(screen.getAllByRole("button", { name: "Salvează formula" })[0]!);
    expect(await screen.findByText("Referința nu este permisă pentru această formulă.")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getAllByLabelText("Tip expresie")[0]!, "DIVIDE");
    await userEvent.click(screen.getAllByRole("button", { name: "Salvează formula" })[0]!);
    expect(await screen.findByText("Formula a fost salvată")).toBeInTheDocument();
    expect(screen.getByText(/versiunea 2/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Salvează formula" })[0]!);
    expect(await screen.findByText("Formula este deja salvată")).toBeInTheDocument();
  });
});
