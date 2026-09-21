import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TechnicalAdminPage } from "./TechnicalAdminPage";

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
  guidance:
    "Aceste valori sunt folosite la calculul tehnic al lucrărilor noi. Lucrările înghețate rămân neschimbate.",
  settings: [
    {
      definitionId: "LIGHTING_FRONT_LED.ledPitchMm",
      settingId: "ledPitchMm",
      typeId: "LIGHTING_FRONT_LED",
      label: "Pas module LED",
      description: "Distanța aproximativă curentă între modulele LED.",
      value: 100,
      unit: "mm",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-20T00:00:00.000Z",
    },
    {
      definitionId: "LIGHTING_FRONT_LED.ledModulePowerW",
      settingId: "ledModulePowerW",
      typeId: "LIGHTING_FRONT_LED",
      label: "Putere modul LED",
      description: "Puterea electrică pe modul LED.",
      value: 0.75,
      unit: "W",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-20T00:00:00.000Z",
    },
    {
      definitionId: "LIGHTING_FRONT_LED.psuReservePercent",
      settingId: "psuReservePercent",
      typeId: "LIGHTING_FRONT_LED",
      label: "Rezervă sursă de alimentare",
      description: "Rezerva de dimensionare a sursei.",
      value: 25,
      unit: "percent",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-20T00:00:00.000Z",
    },
    {
      definitionId: "STEEL_INTERNAL_FRAME.frameClearanceMm",
      settingId: "frameClearanceMm",
      typeId: "STEEL_INTERNAL_FRAME",
      label: "Joc de montaj cadru",
      description: "Jocul total scăzut din fiecare dimensiune exterioară a cadrului.",
      value: 2,
      unit: "mm",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-20T00:00:00.000Z",
    },
  ],
  history: [
    {
      definitionId: "LIGHTING_FRONT_LED.ledPitchMm",
      settingId: "ledPitchMm",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      source: "PLATFORM_STARTER",
      sourceLabel: "Valoare de pornire",
      value: 100,
      unit: "mm",
      createdAt: "2026-09-20T00:00:00.000Z",
      effectiveFrom: "2026-09-20T00:00:00.000Z",
    },
  ],
};

describe("TechnicalAdminPage", () => {
  it("shows persisted starter values and administration navigation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => defaultAdmin,
      }),
    );

    render(<TechnicalAdminPage />);

    expect(await screen.findByLabelText("Pas module LED (mm)")).toHaveValue("100");
    expect(screen.getByLabelText("Putere modul LED (W)")).toHaveValue("0.75");
    expect(screen.getByLabelText("Rezervă sursă de alimentare (percent)")).toHaveValue("25");
    expect(screen.getByLabelText("Joc de montaj cadru (mm)")).toHaveValue("2");
    expect(screen.getAllByText("Valoare de pornire").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Salvează setările" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Valori comerciale" })).toHaveAttribute(
      "href",
      "/admin/commercial",
    );
  });

  it("shows a loading floor before the payload arrives", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise(() => undefined)),
    );
    render(<TechnicalAdminPage />);
    expect(screen.getByText("Se încarcă setările tehnice")).toBeInTheDocument();
  });

  it("blocks member edits and shows validation errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ...defaultAdmin, canEdit: false }),
      }),
    );
    render(<TechnicalAdminPage />);
    expect(await screen.findByText("Editarea nu este disponibilă pentru acest rol.")).toBeInTheDocument();
    expect(screen.getByLabelText("Pas module LED (mm)")).toBeDisabled();
  });

  it("saves an organization version and reports alreadyApplied", async () => {
    const saved = {
      ...defaultAdmin,
      alreadyApplied: false,
      settings: defaultAdmin.settings.map((item) =>
        item.settingId === "ledPitchMm"
          ? {
              ...item,
              value: 80,
              source: "ORGANIZATION",
              sourceLabel: "Valoare a organizației",
              version: 2,
            }
          : item,
      ),
      history: [
        ...defaultAdmin.history,
        {
          definitionId: "LIGHTING_FRONT_LED.ledPitchMm",
          settingId: "ledPitchMm",
          version: 2,
          status: "ACTIVE",
          statusLabel: "Activă",
          source: "ORGANIZATION",
          sourceLabel: "Valoare a organizației",
          value: 80,
          unit: "mm",
          createdAt: "2026-09-20T01:00:00.000Z",
          effectiveFrom: "2026-09-20T01:00:00.000Z",
        },
      ],
    };
    let posts = 0;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/technical-settings") && String(init?.method ?? "GET") === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          ledPitchMm?: number;
          settings?: Array<{ settingId: string; value: number }>;
        };
        const pitch =
          body.settings?.find((item) => item.settingId === "ledPitchMm")?.value ?? body.ledPitchMm;
        if (pitch === 0) {
          return jsonResponse(
            { error: "invalid_settings", reasons: ["Pasul modulelor LED trebuie să fie mai mare decât 0 mm."] },
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

    render(<TechnicalAdminPage />);
    const pitch = await screen.findByLabelText("Pas module LED (mm)");
    await userEvent.clear(pitch);
    await userEvent.type(pitch, "0");
    await userEvent.click(screen.getByRole("button", { name: "Salvează setările" }));
    expect(await screen.findByText("Pasul modulelor LED trebuie să fie mai mare decât 0 mm.")).toBeInTheDocument();

    await userEvent.clear(pitch);
    await userEvent.type(pitch, "80");
    await userEvent.click(screen.getByRole("button", { name: "Salvează setările" }));
    expect(await screen.findByText("Setările au fost salvate")).toBeInTheDocument();
    expect(screen.getByLabelText("Pas module LED (mm)")).toHaveValue("80");
    await userEvent.click(screen.getByRole("button", { name: "Salvează setările" }));
    expect(await screen.findByText("Valorile sunt deja salvate")).toBeInTheDocument();
  });
});
