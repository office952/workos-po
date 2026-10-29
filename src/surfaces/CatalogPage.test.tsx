import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetResourceCache } from "../data/resourceCache";
import { readConfiguratorSession, writeConfiguratorSession } from "../session/configuratorSession";
import { CatalogPage } from "./CatalogPage";

const definitions = {
  canEdit: true,
  products: [{
    code: "PRD-TEST",
    label: "Litere test",
    displayRevision: 2,
    familyLabel: "Semnalistică",
    categoryLabel: "Litere",
    description: "Construcție luminoasă",
    composition: [{ role: "FACE", roleLabel: "Față", typeId: "PLEXIGLAS_FACE", typeLabel: "Plexiglas" }],
  }],
  types: [{
    typeId: "PLEXIGLAS_FACE",
    label: "Plexiglas",
    description: "Față opal",
    measurement: "Suprafață",
    quantity: "Placă",
    configurations: [{ productCode: "PRD-TEST", attributes: [{ label: "Material", valueDisplay: "Plexiglas opal", ownershipLabel: "Definiție" }] }],
    calculationInputs: [{ label: "Arie", value: "Confirmată în lucrare" }],
    calculationResults: [],
    resourceReferences: [{ id: "res-face", label: "Placă plexiglas" }],
    processReferences: [{ id: "cut", label: "Decupare" }],
    gaps: [],
  }],
};

type CatalogComponentFixture = {
  id: string;
  role: string;
  typeId: string;
  label: string;
  required: boolean;
  inputMapping: { confirmedAreaMm2FromComponentId: string } | null;
};

function capabilities(overrides: {
  canEdit?: boolean;
  enabled?: boolean | null;
  label?: string;
  code?: string;
  components?: CatalogComponentFixture[];
  withoutRequest?: string[];
  elements?: Array<Record<string, unknown>>;
} = {}) {
  const code = overrides.code ?? "PRD-TEST";
  const enabled = overrides.enabled === undefined ? true : overrides.enabled;
  const canEdit = overrides.canEdit ?? true;
  return {
    schemaVersion: "catalog-capabilities.v1",
    readOnly: true,
    mutatesConfiguration: false,
    permissions: {
      canRead: true,
      canEditEnablement: canEdit,
      canEditTechnicalSettings: canEdit,
      canEditFormulas: canEdit,
      canEditDisplayLabels: canEdit,
      canViewFinancialAmounts: false,
    },
    platformGaps: [],
    products: [{
      templateCode: code,
      templateVersion: "1",
      label: overrides.label ?? "Litere test",
      displayRevision: 2,
      familyId: "SIGNS",
      categoryId: "LETTERS",
      formSchemaId: "form",
      inPlatformLibrary: true,
      components: overrides.components ?? [
        { id: "FACE", role: "FACE", typeId: "PLEXIGLAS_FACE", label: "Față", required: true, inputMapping: null },
        { id: "BACK", role: "BACK", typeId: "FOREX_BACK", label: "Spate", required: true, inputMapping: { confirmedAreaMm2FromComponentId: "FACE" } },
      ],
      componentsWithoutRequestSection: overrides.withoutRequest ?? [],
      enablement: {
        id: `${code}:enablement`,
        classification: "ORGANIZATION_ENABLEMENT",
        label: "Activare pentru lucrări noi",
        provenance: { source: "PRODUCT_ENABLEMENT", ref: "ORGANIZATION" },
        support: "ORGANIZATION_VERSIONED",
        enabledForNewWork: enabled,
        source: enabled === null ? null : "ORGANIZATION",
        version: enabled === null ? null : 1,
        error: null,
        canonicalWriter: { method: "POST", path: "/api/admin/product-enablement", permission: "owner" },
        readPath: "/api/admin/product-enablement",
      },
      administration: [],
      elements: overrides.elements ?? [{
        id: `${code}:request:root.inscription`,
        classification: "REQUEST_FACT",
        label: "Textul literelor",
        fieldType: "text",
        required: true,
        conditions: [],
        options: [],
        provenance: { source: "FORM_SCHEMA", ref: "root.inscription" },
        support: "SCHEMA_SELECTABLE",
        componentId: "ROOT",
        componentTypeId: null,
        canonicalWriter: null,
        readPath: null,
      }],
    }],
  };
}

const json = (body: unknown, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => body });

function routeFetch(body = capabilities(), system = definitions) {
  return vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PATCH") return json({});
    if (url.includes("/api/catalog/capabilities")) return json(body);
    if (url.includes("/api/product-system-admin")) return json(system);
    return json({}, 404);
  });
}

afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("Catalog workspace", () => {
  it("reads the capability manifest and the product definition without customer or request IO", async () => {
    window.history.replaceState({}, "", "/catalog");
    writeConfiguratorSession({ customerId: "cus-A", requestId: "req-A", productCode: "OTHER", drafts: { inscription: "A" }, draftContext: { customerId: "cus-A", requestId: "req-A", productCode: "OTHER" }, lastQuote: null });
    const before = readConfiguratorSession();
    const fetchMock = routeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.getByText("Plexiglas opal")).toBeInTheDocument();
    expect(screen.getByText("Confirmată în lucrare")).toBeInTheDocument();
    expect(screen.getByText("Spate preia suprafața confirmată din această componentă.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Formulele acestei componente" })).toHaveAttribute("href", "/admin/formulas?component=PLEXIGLAS_FACE");
    expect(screen.getByRole("link", { name: "Disponibilitatea produselor" })).toHaveAttribute("href", "/admin/products");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining(["/api/catalog/capabilities", "/api/product-system-admin"]));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/customers") || String(url).includes("/api/requests"))).toBe(false);
    expect(window.location.pathname).toBe("/catalog");
    expect(window.location.search).toContain("product=PRD-TEST");
    expect(readConfiguratorSession()).toEqual(before);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText(/creează cererea/i)).not.toBeInTheDocument();
    expect(screen.queryByText("PLEXIGLAS_FACE")).not.toBeInTheDocument();
  });

  it("uses the existing revisioned label endpoint, without a commercial mutation", async () => {
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("button", { name: "Editează denumirea" }));
    await userEvent.clear(screen.getByLabelText("Denumire produs"));
    await userEvent.type(screen.getByLabelText("Denumire produs"), "Litere noi");
    await userEvent.click(screen.getByRole("button", { name: "Salvează denumirea" }));
    expect(fetch).toHaveBeenCalledWith("/api/admin/product-system/entities/PRODUCT_TEMPLATE/PRD-TEST/display-label", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ displayLabel: "Litere noi", revision: 2 }) }));
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("fails closed for editing when either permission is absent", async () => {
    vi.stubGlobal("fetch", routeFetch(capabilities(), { ...definitions, canEdit: undefined as unknown as boolean }));
    const { unmount } = render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    unmount();
    resetResourceCache();
    vi.stubGlobal("fetch", routeFetch(capabilities({ canEdit: false })));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    expect(screen.getByText("Doar proprietarul poate schimba disponibilitatea.")).toBeInTheDocument();
  });

  it("recovers from an unreadable library", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      void init;
      return json({}, 503);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await screen.findByText("Biblioteca de produse nu a putut fi citită");
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => routeFetch()(input, init));
    await userEvent.click(screen.getByRole("button", { name: (name) => name === "Reîncearcă" }));
    expect(await screen.findByRole("button", { name: /Litere test/ })).toBeInTheDocument();
  });

  it("restores product and component selection on Back and Forward", async () => {
    window.history.replaceState({}, "", "/catalog");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("button", { name: "Spate", pressed: false }));
    await userEvent.click(screen.getByRole("button", { name: "Față", pressed: false }));
    expect(screen.getByRole("button", { name: "Față", pressed: true })).toBeInTheDocument();
    window.history.back();
    expect(await screen.findByRole("button", { name: "Spate", pressed: true })).toBeInTheDocument();
    expect(window.location.search).toContain("component=BACK");
    window.history.back();
    expect(await screen.findByRole("button", { name: "Față", pressed: true })).toBeInTheDocument();
    window.history.forward();
    expect(await screen.findByRole("button", { name: "Spate", pressed: true })).toBeInTheDocument();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("button", { name: "Spate", pressed: true })).toBeInTheDocument();
    window.history.replaceState({}, "", "/catalog");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("Selectează un produs pentru construcție și proprietăți.")).toBeInTheDocument();
  });

  it("keeps product and component selection stable, including an unknown deep link", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("button", { name: "Spate", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Suprafața confirmată este preluată din Față.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Față", pressed: false }));
    expect(screen.getByText("Spate preia suprafața confirmată din această componentă.")).toBeInTheDocument();
    expect(window.location.search).toContain("component=FACE");
    await userEvent.type(screen.getByLabelText("Caută în bibliotecă"), "nimic");
    expect(screen.getByText("Niciun produs nu corespunde căutării.")).toBeInTheDocument();
    expect(screen.getByText("Produsul selectat rămâne deschis și nu este în rezultatul căutării.")).toBeInTheDocument();
  });

  it("does not replace an unknown deep link with another product", async () => {
    window.history.replaceState({}, "", "/catalog?product=LIPSESTE");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findAllByText("Produsul indicat nu face parte din biblioteca curentă.")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: /Litere test/, pressed: false })).toBeInTheDocument();
  });

  it("does not invent lighting or back fields and isolates organization state", async () => {
    const acm = capabilities({
      code: "PRD-ACM",
      label: "Panou ACM casetat",
      enabled: true,
      components: [
        { id: "FACE", role: "FACE", typeId: "ACM_CASSETTE_BODY", label: "Corp casetă ACM", required: true, inputMapping: null },
        { id: "BACK", role: "BACK", typeId: "STEEL_INTERNAL_FRAME", label: "Cadru intern", required: true, inputMapping: null },
      ],
      withoutRequest: ["BACK"],
      elements: [{
        id: "PRD-ACM:identity:lighting",
        classification: "PLATFORM_FIXED",
        label: "Iluminare",
        value: "Fără iluminare",
        nesting: null,
        provenance: { source: "IDENTITY_FACT", ref: "lighting" },
        support: "DECLARED",
        componentId: null,
        componentTypeId: null,
        canonicalWriter: null,
        readPath: null,
      }],
    });
    vi.stubGlobal("fetch", routeFetch(acm, { ...definitions, products: [] }));
    const first = render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Panou ACM casetat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cadru intern" }));
    expect(screen.getByText("Fără iluminare")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /iluminare/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Prelucrare spate")).not.toBeInTheDocument();
    expect(screen.getByText("Nu are câmpuri de completat pe lucrare.")).toBeInTheDocument();
    first.unmount();
    resetResourceCache();
    vi.stubGlobal("fetch", routeFetch(capabilities({ label: "Logo organizația B", enabled: false, code: "PRD-LOGO" })));
    render(<CatalogPage />);
    expect(await screen.findByRole("button", { name: /Logo organizația B/ })).toBeInTheDocument();
    expect(screen.getByText("Nu este oferit pentru lucrări noi")).toBeInTheDocument();
    expect(screen.queryByText("Panou ACM casetat")).not.toBeInTheDocument();
  });

  it("keeps the workspace stylesheet modular and responsive", () => {
    const css = readFileSync("src/styles/surfaces/catalog-workspace.css", "utf8");
    const ui = readFileSync("src/styles/ui.css", "utf8");
    expect(css).toContain("@media (max-width: 1279px)");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("focus-visible");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(ui).not.toContain("catalog-workspace");
  });
});
