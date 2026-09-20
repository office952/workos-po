import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResourcesAdminPage } from "./ResourcesAdminPage";

const ownerRow = {
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
};

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

describe("ResourcesAdminPage", () => {
  it("shows Owner edit controls for the qualified aluminium row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ writeState: "READY", costEvidence: [ownerRow] }),
      }),
    );

    render(<ResourcesAdminPage />);

    expect(await screen.findByLabelText("Tarif")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Administrare" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Valori comerciale" })).toHaveAttribute(
      "href",
      "/admin/commercial",
    );
    expect(screen.getAllByText("Dovezi de cost").length).toBeGreaterThan(0);
  });

  it("does not enable edit when amounts are omitted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          writeState: "READY",
          costEvidence: [{ ...ownerRow, amount: undefined, amountDisplay: undefined }],
        }),
      }),
    );

    render(<ResourcesAdminPage />);

    expect(await screen.findByText("Modificare indisponibilă")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează" })).not.toBeInTheDocument();
  });

  it("keeps context while save is pending and shows the saved server amount", async () => {
    let finishSave: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/cost-evidence/")) {
        return new Promise((resolve) => {
          finishSave = resolve;
        });
      }
      return jsonResponse({ writeState: "READY", costEvidence: [ownerRow] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByLabelText("Tarif");
    await user.clear(screen.getByLabelText("Tarif"));
    await user.type(screen.getByLabelText("Tarif"), "3.20");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(screen.getByText("Se salvează tariful")).toBeInTheDocument();
    expect(screen.getByLabelText("Tarif")).toBeDisabled();

    finishSave?.(
      await jsonResponse({
        evidence: { evidenceRowId: "row-60-new" },
        admin: {
          writeState: "READY",
          costEvidence: [{ ...ownerRow, evidenceRowId: "row-60-new", amount: 3.2 }],
        },
      }),
    );

    expect(await screen.findByText("Tarif salvat")).toBeInTheDocument();
    expect(screen.getByLabelText("Tarif")).toHaveValue("3.2");
  });

  it("presents a recoverable stale conflict", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/cost-evidence/")) {
        return jsonResponse({ error: "stale_cost_evidence" }, 409);
      }
      return jsonResponse({ writeState: "READY", costEvidence: [ownerRow] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByLabelText("Tarif");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(
      await screen.findByText("Tariful a fost modificat între timp. Reîncarcă valoarea curentă."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reîncarcă valoarea curentă" }),
    ).toBeEnabled();
  });

  it("keeps recoverability after an API failure", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.includes("/cost-evidence/")) {
        return jsonResponse({ error: "invalid_amount" }, 400);
      }
      return jsonResponse({ writeState: "READY", costEvidence: [ownerRow] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByLabelText("Tarif");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    expect(await screen.findByText("Salvarea a eșuat")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salvează" })).toBeEnabled();
  });

  it("omits a blank note instead of injecting harness text", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void init;
      const url = String(input);
      if (url.includes("/cost-evidence/")) {
        return jsonResponse({
          evidence: { evidenceRowId: "row-60-new" },
          admin: {
            writeState: "READY",
            costEvidence: [{ ...ownerRow, evidenceRowId: "row-60-new", amount: 3.2, note: "" }],
          },
        });
      }
      return jsonResponse({ writeState: "READY", costEvidence: [ownerRow] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<ResourcesAdminPage />);
    await screen.findByLabelText("Tarif");
    await user.clear(screen.getByLabelText("Notă"));
    await user.clear(screen.getByLabelText("Tarif"));
    await user.type(screen.getByLabelText("Tarif"), "3.20");
    await user.click(screen.getByRole("button", { name: "Salvează" }));

    await screen.findByText("Tarif salvat");
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ writeState: "READY", costEvidence: [ownerRow] }),
      }),
    );
    render(<ResourcesAdminPage />);
    await screen.findByLabelText("Tarif");
    expect(
      screen.queryByRole("button", { name: "Verifică versiunea anterioară" }),
    ).not.toBeInTheDocument();
  });
});
