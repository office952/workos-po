import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanyAdminPage } from "./CompanyAdminPage";
import { OfferingPolicyAdminPage } from "./OfferingPolicyAdminPage";
import { JobEconomicsPanel } from "./jobRecord/JobEconomicsPanel";

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const MODES = [
  { mode: "OWNER_ONLY", label: "Doar Proprietarul stabilește prețul și îngheață oferta" },
  { mode: "COMMERCIAL_AUTONOMOUS", label: "Comercialul stabilește prețul și îngheață oferta" },
  { mode: "COMMERCIAL_APPROVAL_POLICY", label: "Comercialul ofertează după reguli; excepțiile cer aprobarea Proprietarului" },
];

const defaultPolicy = {
  mode: "OWNER_ONLY",
  modeLabel: MODES[0]!.label,
  rules: { incompleteCostRequiresApproval: false, minimumMarginPercent: null, maximumNetValue: null },
  version: 0,
  source: "PLATFORM_DEFAULT",
  createdAt: null,
  createdByLabel: null,
};

describe("OfferingPolicyAdminPage", () => {
  it("starts Owner-only, requires a rule for the approval mode and saves the expected version", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/admin/offering-policy") && init?.method === "POST") {
        return jsonResponse({ alreadyApplied: false, policy: { ...defaultPolicy, mode: "COMMERCIAL_APPROVAL_POLICY", version: 1, source: "ORGANIZATION" } });
      }
      if (url.endsWith("/api/admin/offering-policy")) {
        return jsonResponse({ policy: defaultPolicy, versions: [], modes: MODES, openApprovals: 0 });
      }
      if (url.includes("/api/admin/price-approvals")) {
        return jsonResponse({
          approvals: [
            {
              approvalId: "apr:1",
              requestId: "req:1",
              requestReference: "CER-1",
              customerLabel: "Client Demo",
              status: "REQUESTED",
              statusLabel: "Așteaptă aprobarea Proprietarului",
              netPrice: 900,
              installationNetPrice: null,
              currency: "EUR",
              internalCostComplete: true,
              triggeredRules: [{ id: "MAXIMUM_NET_VALUE", label: "Valoarea netă depășește limita fără aprobare" }],
              requestedByLabel: "comercial@demo.test",
              requestedAt: "2026-11-16T09:00:00.000Z",
            },
          ],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<OfferingPolicyAdminPage />);

    expect(await screen.findByRole("heading", { level: 1, name: "Reguli de ofertare" })).toBeInTheDocument();
    expect(screen.getByText("Comportament implicit (nicio versiune salvată)")).toBeInTheDocument();
    expect(await screen.findByText("Valoarea netă depășește limita fără aprobare")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /excepțiile cer aprobarea/ }));
    expect(screen.getByText("Nicio regulă activă")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revizuiește și salvează" })).toBeDisabled();
    // No threshold is proposed: the fields start empty.
    expect(screen.getByLabelText("Valoare netă maximă fără aprobare")).toHaveValue("");
    await user.type(screen.getByLabelText("Valoare netă maximă fără aprobare"), "500");
    await user.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    await user.click(await screen.findByRole("button", { name: "Salvează versiunea 1" }));
    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => call[1]?.method === "POST" && String(call[0]).endsWith("/api/admin/offering-policy"));
      expect(JSON.parse(String(post?.[1]?.body))).toEqual({
        mode: "COMMERCIAL_APPROVAL_POLICY",
        rules: { incompleteCostRequiresApproval: false, minimumMarginPercent: null, maximumNetValue: 500 },
        expectedVersion: 0,
      });
    });
  });

  it("sends the Owner to the variant instead of deciding in the queue", async () => {
    const fetchMock = vi.fn((input: RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/admin/offering-policy")) {
        return jsonResponse({ policy: defaultPolicy, versions: [], modes: MODES, openApprovals: 1 });
      }
      if (url.includes("/api/admin/price-approvals")) {
        return jsonResponse({
          approvals: [{
            approvalId: "apr:2",
            requestId: "req:2",
            variantId: "var:2",
            productCode: "PRD-LETTERS-FRONTLIT-PLEXI-AL06",
            status: "REQUESTED",
            statusLabel: "",
            netPrice: 700,
            currency: "EUR",
            triggeredRules: [],
          }],
        });
      }
      return jsonResponse({});
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<OfferingPolicyAdminPage />);
    const decide = await screen.findByRole("link", { name: "Deschide varianta și decide acolo" });
    expect(decide).toHaveAttribute("href", expect.stringContaining("varianta=var%3A2"));
    expect(decide).toHaveAttribute("href", expect.stringContaining("pas=pret"));
    expect(screen.queryByRole("button", { name: "Respinge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprobă" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/decision"))).toBe(false);
  });

  it("explains the read-only answer to a role without access", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "forbidden" }, 403)));
    render(<OfferingPolicyAdminPage />);
    expect(await screen.findByText("Acces doar pentru Proprietar")).toBeInTheDocument();
  });
});

const sellerFields = [
  ["legalName", "Denumire legală"],
  ["brand", "Brand (denumire comercială)"],
  ["fiscalId", "Identificator fiscal (CIF)"],
  ["tradeRegister", "Nr. Registrul Comerțului"],
  ["address", "Adresă"],
  ["locality", "Localitate"],
  ["iban", "IBAN"],
  ["bank", "Bancă"],
].map(([field, label]) => ({ field, label }));

function sellerBody(overrides: Record<string, unknown> = {}) {
  return {
    seller: { legalName: "Firma Demo SRL", fiscalId: "DEMO-CIF-1", brand: "", tradeRegister: "", address: "", locality: "", iban: "", bank: "" },
    configured: true,
    version: 3,
    canEdit: true,
    fields: sellerFields,
    completeness: { status: "COMPLETE", statusLabel: "Date obligatorii completate", missingRequiredLabels: [] },
    fiscalIdCheck: null,
    ...overrides,
  };
}

describe("CompanyAdminPage", () => {
  it("shows server validation per field and keeps the draft", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/seller") && init?.method === "PATCH") {
        return jsonResponse(
          { error: "invalid_profile", issues: [{ field: "iban", label: "IBAN", reason: "IBAN invalid: verifică țara, cifrele de control și lungimea." }] },
          400,
        );
      }
      if (url.endsWith("/api/seller/versions")) {
        return jsonResponse({ currentVersion: 3, versions: [{ version: 3, createdAt: "2026-11-16T08:00:00.000Z", createdByLabel: "owner@demo.test", changedFields: [{ field: "legalName", label: "Denumire legală" }] }] });
      }
      return jsonResponse(sellerBody());
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<CompanyAdminPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Date firmă" })).toBeInTheDocument();
    expect(await screen.findByText("Modificat: Denumire legală")).toBeInTheDocument();
    // Long free-text fields use the wide, left-aligned text layout (not the short numeric one).
    for (const label of ["Denumire legală", "Identificator fiscal (CIF)", "Adresă", "IBAN"]) {
      const input = screen.getByLabelText(label, { selector: "input" });
      expect(input).toHaveClass("adm-input--text");
      expect(input.closest(".adm-field")).toHaveAttribute("data-variant", "text");
    }
    await user.type(screen.getByLabelText("IBAN"), "RO00 GRESIT");
    await user.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    await user.click(await screen.findByRole("button", { name: "Salvează versiunea 4" }));
    expect(await screen.findByText("IBAN invalid: verifică țara, cifrele de control și lungimea.")).toBeInTheDocument();
    expect(screen.getByLabelText("IBAN")).toHaveValue("RO00 GRESIT");
    const patch = fetchMock.mock.calls.find((call) => call[1]?.method === "PATCH");
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ iban: "RO00 GRESIT", expectedVersion: 3 });
  });

  it("reports a concurrent edit instead of overwriting it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo, init?: RequestInit) =>
        init?.method === "PATCH"
          ? jsonResponse({ error: "version_conflict", currentVersion: 4 }, 409)
          : String(input).endsWith("/versions")
            ? jsonResponse({ versions: [] })
            : jsonResponse(sellerBody()),
      ),
    );
    const user = userEvent.setup();
    render(<CompanyAdminPage />);
    await user.type(await screen.findByLabelText("Bancă"), "Banca Demo");
    await user.click(screen.getByRole("button", { name: "Revizuiește și salvează" }));
    await user.click(await screen.findByRole("button", { name: "Salvează versiunea 4" }));
    expect(await screen.findByText("Modificare concurentă")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reîncarcă datele curente" })).toBeInTheDocument();
  });

  it("is read-only for a role that cannot edit and explains an unconfigured identity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse(
          sellerBody({
            seller: null,
            configured: false,
            version: 0,
            canEdit: false,
            completeness: { status: "UNCONFIGURED", statusLabel: "Datele firmei nu sunt configurate", missingRequiredLabels: ["Denumire legală", "Identificator fiscal (CIF)"] },
          }),
        ),
      ),
    );
    render(<CompanyAdminPage />);
    expect(await screen.findByText("Doar Proprietarul poate modifica datele firmei.")).toBeInTheDocument();
    expect(screen.getAllByText("Datele firmei nu sunt configurate").length).toBeGreaterThan(0);
    expect(screen.queryByRole("textbox", { name: "Denumire legală" })).not.toBeInTheDocument();
  });
});

describe("JobEconomicsPanel", () => {
  it("shows unknown values as unknown and never invents a margin", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          available: true,
          economics: {
            currency: "EUR",
            scopeLabel: "Litere",
            excludedScopeLabel: null,
            revenue: { netPrice: 1000, label: "Preț net din comanda acceptată (fără TVA)" },
            estimatedCost: { total: 400, completeness: "PARTIAL", completenessLabel: "Parțial", acceptedIncomplete: true },
            operationalCost: { calculableTotal: null, plannedComparableTotal: null, differenceFromEstimate: null, completeness: "UNAVAILABLE", completenessLabel: "Necunoscut", calculableCount: 0, unavailableCount: 2 },
            confirmedCost: { status: "NOT_MODELLED", label: "Costurile efective confirmate contabil (facturi, achiziții) nu sunt înregistrate în WorkOS." },
            estimatedMargin: { value: null, unavailableReason: "Costul estimat nu este complet; marja estimată nu se poate calcula." },
            operationalMargin: { value: null, unavailableReason: "Nu există încă consum înregistrat în execuție." },
            executionLabel: "Lucrarea nu este eliberată în producție",
            lines: [],
            notes: ["Marja operațională este un indicator operațional, nu profit net."],
          },
        }),
      ),
    );
    render(<JobEconomicsPanel jobId="ord:1" />);
    expect(await screen.findByTestId("job-economics")).toBeInTheDocument();
    expect(screen.getByText("Acceptată cu cost intern incomplet")).toBeInTheDocument();
    expect(screen.getAllByText("Necunoscut").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Costul estimat nu este complet; marja estimată nu se poate calcula.")).toBeInTheDocument();
    expect(screen.getByText("Nu este înregistrat")).toBeInTheDocument();
    expect(screen.queryByText(/^0,00/)).not.toBeInTheDocument();
  });

  it("writes the sign and meaning of every difference and marks a partial operational cost", async () => {
    const line = (resourceId: string, plannedCost: number, operationalCost: number | null, difference: number | null) => ({
      resourceId,
      label: resourceId,
      unit: "buc",
      plannedQuantity: 1,
      actualQuantity: operationalCost === null ? null : 1,
      plannedCost,
      operationalCost,
      difference,
      statusLabel: "",
      unknownReason: operationalCost === null ? "Fără consum înregistrat" : null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        jsonResponse({
          available: true,
          economics: {
            currency: "EUR",
            scopeLabel: "Litere",
            excludedScopeLabel: null,
            revenue: { netPrice: 1000, label: "Preț net din comanda acceptată (fără TVA)" },
            estimatedCost: { total: 30, completeness: "COMPLETE", completenessLabel: "Complet", acceptedIncomplete: false },
            operationalCost: { calculableTotal: 25, plannedComparableTotal: 20, differenceFromEstimate: 5, completeness: "PARTIAL", completenessLabel: "Parțial", calculableCount: 2, unavailableCount: 1 },
            confirmedCost: { status: "NOT_MODELLED", label: "Nu este înregistrat." },
            estimatedMargin: { value: 970, unavailableReason: null },
            operationalMargin: { value: null, unavailableReason: "Costul operațional este parțial." },
            executionLabel: "Execuție finalizată",
            lines: [line("Peste", 10, 18, 8), line("Sub", 10, 7, -3), line("Lipsă", 10, null, null)],
            notes: [],
          },
        }),
      ),
    );
    render(<JobEconomicsPanel jobId="ord:3" />);
    expect(await screen.findByTestId("job-economics")).toBeInTheDocument();
    expect(screen.getByText(/^\+5,00/)).toBeInTheDocument();
    expect(screen.getByText(/Cost operațional peste estimare/)).toBeInTheDocument();
    expect(screen.getByText(/nu este total final/)).toBeInTheDocument();
    expect(screen.getByText(/^\+8,00/)).toBeInTheDocument();
    expect(screen.getByText("peste estimare")).toBeInTheDocument();
    expect(screen.getByText(/^−3,00/)).toBeInTheDocument();
    expect(screen.getByText("sub estimare")).toBeInTheDocument();
    expect(screen.getByTestId("job-economics-incomplete")).toHaveTextContent("O resursă nu are încă un cost operațional");
    // The operational margin stays unknown while the operational cost is partial.
    expect(screen.getByText("Costul operațional este parțial.")).toBeInTheDocument();
  });

  it("renders nothing for a role without the internal cost right", async () => {
    vi.stubGlobal("fetch", vi.fn(() => jsonResponse({ error: "forbidden" }, 403)));
    const { container } = render(<JobEconomicsPanel jobId="ord:2" />);
    await waitFor(() => expect(container.textContent).toBe(""));
  });
});
