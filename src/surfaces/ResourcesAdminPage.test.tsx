import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourcesAdminPage } from "./ResourcesAdminPage";

const plexiRow = {
  resourceId: "plexiglas_3mm_opal",
  resourceLabel: "Plexiglas 3 mm opal",
  evidenceRowId: "row-plexi",
  qualifierIdentity: "unqualified",
  amount: 16,
  currency: "EUR",
  unitLabel: "m²",
  amountDisplay: "16,00 EUR / m²",
  note: "",
  lastChangedAt: "2026-09-01T00:00:00.000Z",
  kindLabel: "Material",
  classificationLabel: "Default de dezvoltare",
  sourceLabel: "Valoare implicită de platformă",
};

const aluminiumRow = {
  resourceId: "aluminium_return_profile",
  resourceLabel: "Profil aluminiu 0,6 mm",
  evidenceRowId: "row-60",
  qualifierIdentity: "volumeDepthMm=60",
  qualifierLabel: "Adâncime volum: 60 mm",
  qualifier: {
    kind: "volumeDepthMm",
    label: "Adâncime volum",
    unitLabel: "mm",
    value: 60,
  },
  amount: 3,
  currency: "EUR",
  unitLabel: "m",
  amountDisplay: "3,00 EUR / m · Adâncime volum: 60 mm",
  note: "Owner-confirmed",
  lastChangedAt: "2026-09-01T00:00:00.000Z",
  kindLabel: "Material",
  classificationLabel: "Confirmat de owner",
  sourceLabel: "Achiziție confirmată de owner",
};

const cncRow = {
  resourceId: "SVC-CNC-FACE",
  resourceLabel: "CNC față",
  evidenceRowId: "row-cnc",
  qualifierIdentity: "unqualified",
  amount: 4.5,
  currency: "EUR",
  unitLabel: "m",
  amountDisplay: "4,50 EUR / m",
  note: "",
  lastChangedAt: "2026-09-01T00:00:00.000Z",
  kindLabel: "Serviciu",
  classificationLabel: "Confirmat de owner",
  sourceLabel: "Tarif intern confirmat de owner",
};

const laborRow = {
  resourceId: "LAB-VINYL-FACE",
  resourceLabel: "Manoperă vinil față",
  evidenceRowId: "row-labor",
  qualifierIdentity: "unqualified",
  amount: 18,
  currency: "EUR",
  unitLabel: "ore-persoană",
  amountDisplay: "18,00 EUR / ore-persoană",
  note: "",
  lastChangedAt: "2026-09-01T00:00:00.000Z",
  kindLabel: "Manoperă",
  classificationLabel: "Confirmat de owner",
  sourceLabel: "Tarif intern confirmat de owner",
};

const ownerPayload = {
  writeState: "READY",
  costEvidence: [aluminiumRow, plexiRow, cncRow, laborRow],
  materials: [
    {
      id: "acm_missing",
      label: "ACM 3 mm fără cost",
      kindLabel: "Material",
      unitLabel: "m²",
      cost: null,
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function stubAdmin(payload: unknown = ownerPayload) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/admin/assembly-operation-cost")) {
        return jsonResponse({
          canEdit: true,
          version: 1,
          updatedAt: null,
          finalInspectionMode: "INCLUDED",
          finalPackagingMode: "INCLUDED",
          inspectionOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          packagingOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          history: [],
          rates: [],
          futureOnlyNotice: "Politica se aplică doar lucrărilor noi.",
        });
      }
      return jsonResponse(payload);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ResourcesAdminPage", () => {
  it("does not preselect aluminium and lets the owner open plexiglass by search", async () => {
    stubAdmin();
    const user = userEvent.setup();
    render(<ResourcesAdminPage />);

    expect(await screen.findByText("Alege un material, o manoperă sau o operație.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cost achiziție/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Costuri de producție").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Valori comerciale" })).toHaveAttribute(
      "href",
      "/admin/commercial",
    );

    await user.type(screen.getByLabelText("Caută după nume"), "plexiglas");
    await user.click(screen.getByRole("button", { name: /Plexiglas 3 mm opal/ }));

    expect(screen.getByLabelText("Cost achiziție (EUR/m²)")).toBeEnabled();
    expect(screen.getByText("De verificat")).toBeInTheDocument();
    expect(screen.getByText("Cantitate material × cost unitar activ = cost intern de material")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
  });

  it("filters materials without selecting an unrelated aluminium row", async () => {
    stubAdmin();
    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByRole("button", { name: "Materiale" });
    await user.click(screen.getByRole("button", { name: "Materiale" }));

    expect(screen.getByRole("button", { name: /Plexiglas 3 mm opal/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Profil aluminiu/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CNC față/ })).not.toBeInTheDocument();
    expect(screen.getByText("Alege un material, o manoperă sau o operație.")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cost achiziție/)).not.toBeInTheDocument();
  });

  it("separates labor and service rates and keeps unconfirmed costs easy to find", async () => {
    stubAdmin();
    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByRole("button", { name: "Manoperă" });

    await user.click(screen.getByRole("button", { name: "Manoperă" }));
    expect(screen.getByRole("button", { name: /Manoperă vinil față/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CNC față/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Operații și servicii" }));
    expect(screen.getByRole("button", { name: /CNC față/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Plexiglas/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "De confirmat" }));
    expect(screen.getByRole("button", { name: /Plexiglas 3 mm opal/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /CNC față/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ACM 3 mm fără cost/ })).not.toBeInTheDocument();
  });

  it("shows missing cost as Cost lipsa, never as zero", async () => {
    stubAdmin();
    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByRole("button", { name: /ACM 3 mm fără cost/ });
    await user.click(screen.getByRole("button", { name: /ACM 3 mm fără cost/ }));

    expect(screen.getAllByText("Cost lipsa").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Cost achiziție (EUR/m²)")).toHaveValue("");
    expect(screen.queryByDisplayValue("0")).not.toBeInTheDocument();
  });

  it("does not enable edit when amounts are omitted", async () => {
    stubAdmin({
      writeState: "READY",
      costEvidence: [
        {
          ...aluminiumRow,
          amount: undefined,
          amountDisplay: undefined,
          classificationLabel: "Confirmat de owner",
        },
      ],
    });

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Profil aluminiu/ }));

    expect(screen.getByText("Modificare indisponibilă")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Confirmat").length).toBeGreaterThan(0);
  });

  it("keeps the selected resource while save is pending and shows the saved server amount", async () => {
    let finishSave: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/admin/assembly-operation-cost")) {
        return jsonResponse({
          canEdit: true,
          version: 1,
          updatedAt: null,
          finalInspectionMode: "INCLUDED",
          finalPackagingMode: "INCLUDED",
          inspectionOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          packagingOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          history: [],
          rates: [],
          futureOnlyNotice: "Politica se aplică doar lucrărilor noi.",
        });
      }
      if (url.includes("/cost-evidence/")) {
        return new Promise((resolve) => {
          finishSave = resolve;
        });
      }
      return jsonResponse(ownerPayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Plexiglas 3 mm opal/ }));
    const amountField = screen.getByLabelText("Cost achiziție (EUR/m²)");
    await user.clear(amountField);
    await user.type(amountField, "15");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(screen.getByText("Se salvează costul")).toBeInTheDocument();
    expect(screen.getByLabelText("Cost achiziție (EUR/m²)")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Plexiglas 3 mm opal/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    finishSave?.(
      await jsonResponse({
        evidence: { evidenceRowId: "row-plexi-new" },
        admin: {
          writeState: "READY",
          costEvidence: [
            aluminiumRow,
            { ...plexiRow, evidenceRowId: "row-plexi-new", amount: 15, amountDisplay: "15,00 EUR / m²", classificationLabel: "Confirmat de owner" },
            cncRow,
            laborRow,
          ],
        },
      }),
    );

    expect(await screen.findByText("Cost salvat")).toBeInTheDocument();
    expect(screen.getByLabelText("Cost achiziție (EUR/m²)")).toHaveValue("15");
    expect(screen.getByText("Confirmat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Plexiglas 3 mm opal/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("discards an unsaved draft and can clear the selection", async () => {
    stubAdmin();
    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Plexiglas 3 mm opal/ }));
    const amountField = screen.getByLabelText("Cost achiziție (EUR/m²)");
    await user.clear(amountField);
    await user.type(amountField, "22");
    await user.click(screen.getByRole("button", { name: "Renunță" }));
    expect(screen.getByLabelText("Cost achiziție (EUR/m²)")).toHaveValue("16");
    await user.click(screen.getByRole("button", { name: "Golește selecția" }));
    expect(screen.getByText("Alege un material, o manoperă sau o operație.")).toBeInTheDocument();
  });

  it("presents a recoverable stale conflict", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/admin/assembly-operation-cost")) {
        return jsonResponse({
          canEdit: true,
          version: 1,
          updatedAt: null,
          finalInspectionMode: "INCLUDED",
          finalPackagingMode: "INCLUDED",
          inspectionOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          packagingOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          history: [],
          rates: [],
          futureOnlyNotice: "Politica se aplică doar lucrărilor noi.",
        });
      }
      if (url.includes("/cost-evidence/")) {
        return jsonResponse({ error: "stale_cost_evidence" }, 409);
      }
      return jsonResponse(ownerPayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Plexiglas 3 mm opal/ }));
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(
      await screen.findByText("Costul a fost modificat între timp. Reîncarcă valoarea curentă."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reîncarcă valoarea curentă" }),
    ).toBeEnabled();
  });

  it("keeps recoverability after an API failure", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/api/admin/assembly-operation-cost")) {
        return jsonResponse({
          canEdit: true,
          version: 1,
          updatedAt: null,
          finalInspectionMode: "INCLUDED",
          finalPackagingMode: "INCLUDED",
          inspectionOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          packagingOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          history: [],
          rates: [],
          futureOnlyNotice: "Politica se aplică doar lucrărilor noi.",
        });
      }
      if (url.includes("/cost-evidence/")) {
        return jsonResponse({ error: "invalid_amount" }, 400);
      }
      return jsonResponse(ownerPayload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Plexiglas 3 mm opal/ }));
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByText("Salvarea a eșuat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
  });

  it("omits a blank note instead of injecting harness text", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/api/admin/assembly-operation-cost")) {
        return jsonResponse({
          canEdit: true,
          version: 1,
          updatedAt: null,
          finalInspectionMode: "INCLUDED",
          finalPackagingMode: "INCLUDED",
          inspectionOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          packagingOptions: [{ value: "INCLUDED", label: "Inclusă" }],
          history: [],
          rates: [],
          futureOnlyNotice: "Politica se aplică doar lucrărilor noi.",
        });
      }
      if (url.includes("/cost-evidence/")) {
        return jsonResponse({
          evidence: { evidenceRowId: "row-60-new" },
          admin: {
            writeState: "READY",
            costEvidence: [{ ...aluminiumRow, evidenceRowId: "row-60-new", amount: 3.2 }],
          },
        });
      }
      return jsonResponse({ writeState: "READY", costEvidence: [aluminiumRow] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Profil aluminiu/ }));
    await user.clear(screen.getByLabelText("Notă"));
    await user.clear(screen.getByLabelText("Cost achiziție (EUR/m)"));
    await user.type(screen.getByLabelText("Cost achiziție (EUR/m)"), "3.20");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    await screen.findByText("Cost salvat");
    const patchCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/cost-evidence/"),
    );
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ amount: 3.2 });
    expect(String(patchCall?.[1]?.body)).not.toContain("Reference Slice");
    expect(
      screen.queryByRole("button", { name: "Verifică versiunea anterioară" }),
    ).not.toBeInTheDocument();
  });

  it("does not expose a control that manufactures a stale write", async () => {
    stubAdmin({ writeState: "READY", costEvidence: [aluminiumRow] });
    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await user.click(await screen.findByRole("button", { name: /Profil aluminiu/ }));
    expect(screen.getByLabelText("Cost achiziție (EUR/m)")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Verifică versiunea anterioară" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the administration rail for everyday cost navigation", async () => {
    stubAdmin();
    render(<ResourcesAdminPage />);
    const rail = await screen.findByRole("group", { name: "Administrare" });
    expect(within(rail).getByRole("link", { name: "Costuri de producție" })).toHaveAttribute(
      "href",
      "/admin/resources",
    );
    expect(within(rail).getByRole("link", { name: "Materiale execuție" })).toHaveAttribute(
      "href",
      "/admin/material-readiness",
    );
  });
});
