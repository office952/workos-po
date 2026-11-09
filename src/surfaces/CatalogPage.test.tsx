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
  }, {
    typeId: "LIGHTING_FRONT_LED",
    label: "Iluminare frontală cu module LED",
    description: "Pasul LED, puterea pe modul și rezerva sursei sunt setări tehnice de sistem.",
    measurement: "",
    quantity: "",
    configurations: [],
    calculationInputs: [],
    calculationResults: [],
    resourceReferences: [
      { id: "MAT-LED-MODULE", label: "Modul LED 12V" },
      { id: "MAT-LED-PSU-12V-60W", label: "Sursă LED 12V 60W" },
    ],
    processReferences: [],
    gaps: [],
  }, {
    typeId: "ALUMINIUM_VOLUME",
    label: "Volum aluminiu",
    description: "Cantul literei.",
    measurement: "Perimetru",
    quantity: "Profil",
    configurations: [],
    calculationInputs: [],
    calculationResults: [],
    resourceReferences: [
      { id: "aluminium_return_profile", label: "Profil retur aluminiu" },
      { id: "return_cant_forming", label: "Formare profil aluminiu" },
    ],
    processReferences: [],
    gaps: [],
  }, {
    typeId: "STEEL_INTERNAL_FRAME",
    label: "Cadru intern din oțel",
    description: "Cadru intern pentru caseta ACM.",
    measurement: "",
    quantity: "",
    configurations: [],
    calculationInputs: [],
    calculationResults: [],
    resourceReferences: [{ id: "steel_frame_profile", label: "Profil cadru oțel" }],
    processReferences: [],
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
        { id: "LIGHTING", role: "LIGHTING", typeId: "LIGHTING_FRONT_LED", label: "Electrică / iluminare", required: true, inputMapping: null },
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
      }, {
        id: `${code}:setting:ledPitchMm`,
        classification: "ORGANIZATION_SETTING",
        label: "Pas module LED",
        settingId: "ledPitchMm",
        unit: "mm",
        appliesToTemplateCodes: [code],
        organization: { resolved: true, version: 1, source: "PLATFORM_STARTER", sourceLabel: "Valoare de pornire", organizationConfirmed: false, error: null, value: 100 },
        provenance: { source: "TECHNICAL_SETTING_DEFINITION", ref: "ledPitchMm" },
        support: "ORGANIZATION_VERSIONED",
        componentId: "LIGHTING",
        componentTypeId: "LIGHTING_FRONT_LED",
        canonicalWriter: { method: "POST", path: "/api/admin/technical-settings", permission: "owner" },
        readPath: "/api/admin/technical-settings",
      }, {
        id: `${code}:formula:LIGHTING_FRONT_LED.ledModuleQuantity`,
        classification: "ORGANIZATION_FORMULA",
        label: "Cantitate module LED",
        formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
        appliesToTemplateCodes: [code],
        organization: { resolved: true, version: 1, source: "PLATFORM_STARTER", sourceLabel: "Valoare de pornire", organizationConfirmed: false, error: null },
        provenance: { source: "FORMULA_DEFINITION", ref: "LIGHTING_FRONT_LED.ledModuleQuantity" },
        support: "ORGANIZATION_VERSIONED",
        componentId: "LIGHTING",
        componentTypeId: "LIGHTING_FRONT_LED",
        canonicalWriter: { method: "POST", path: "/api/admin/formulas", permission: "owner" },
        readPath: "/api/admin/formulas",
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
    if (url.includes("/api/catalog/process-graph")) return json(emptyGraph());
    if (url.includes("/api/product-system-admin")) return json(system);
    return json({}, 404);
  });
}

function emptyGraph() {
  return {
    schemaVersion: "catalog-process-graph.v1",
    readOnly: true,
    mutatesConfiguration: false,
    writeState: "NOT_IMPLEMENTED",
    status: "NO_REFERENCE_SCENARIO",
    productCode: "PRD-TEST",
    productLabel: "Litere test",
    templateVersion: "1",
    canViewFinancialAmounts: false,
    scenario: null,
    scenarios: [],
    graph: null,
  };
}

function graphPayload() {
  const node = (id: string, label: string, dependsOn: string[], successors: string[], recipe: unknown) => ({
    id,
    processId: id,
    processLabel: label,
    scope: "FACE",
    scopeLabel: "Față",
    typeId: id === "cut" ? "PLEXIGLAS_FACE" : null,
    typeLabel: id === "cut" ? "Plexiglas" : null,
    conditionLabel: null,
    reason: `${label} din scenariu.`,
    dependsOn,
    successors,
    nodeReadiness: "REQUIRED",
    nodeReadinessLabel: "Necesar",
    blockers: id === "cut" ? ["Geometria lipsește."] : [],
    capabilityLabel: id === "cut" ? "Debitare CNC" : null,
    recipe,
  });
  return {
    schemaVersion: "catalog-process-graph.v1",
    readOnly: true,
    mutatesConfiguration: false,
    writeState: "NOT_IMPLEMENTED",
    status: "READY",
    productCode: "PRD-TEST",
    productLabel: "Litere test",
    templateVersion: "1",
    canViewFinancialAmounts: true,
    scenario: {
      id: "letters-finish-none",
      label: "Fără finisaj",
      summary: "Față fără finisaj aplicat.",
      illustrative: true,
      note: "Scenariu ilustrativ. Nu este un deviz.",
    },
    scenarios: [
      { id: "letters-finish-none", label: "Fără finisaj", summary: "Față fără finisaj aplicat." },
      { id: "letters-finish-vinyl", label: "Colantat", summary: "Cu folie." },
    ],
    graph: {
      directEdgeIds: ["cut>pack"],
      simplifiedEdgeIds: ["cut>pack"],
      hiddenEdgeIds: [],
      hiddenEdgeCount: 0,
      topologicalOrder: ["cut", "pack"],
      technologicalProcessCompletenessLabel: "Parțială",
      executionReadinessLabel: "Pregătită pentru execuție",
      costCompletenessLabel: "Incompletă",
      lightingCalculationReadinessLabel: "Nu se aplică",
      completenessLabel: "Parțială",
      completenessReasons: ["Lipsește o dovadă."],
      nodes: [
        node("cut", "Debitare", [], ["pack"], {
          recipeId: "RCP",
          recipeLabel: "Debitare față",
          recipeKindLabel: "Rețetă serviciu",
          recipeLifecycleLabel: "Activă",
          quantityBasisLabel: "Perimetru",
          resourceId: "SVC",
          resourceLabel: "Serviciu CNC",
          unitLabel: "m",
          evidenceState: "MISSING",
          evidenceSourceLabel: null,
          evidenceClassificationLabel: null,
          sharedWithNodeIds: [],
          rate: null,
          currency: null,
        }),
        node("pack", "Ambalare", ["cut"], [], null),
      ],
      edges: [{ id: "cut>pack", fromNodeId: "cut", toNodeId: "pack" }],
    },
  };
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
    expect(screen.getByRole("tab", { name: "Componente", selected: true })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Setări" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Formule" })).not.toBeInTheDocument();
    expect(screen.queryByText("Această componentă nu are setări tehnice ale organizației.")).not.toBeInTheDocument();
    expect(screen.queryByText("Această componentă nu are formule suportate.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Formulele acestei componente" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Materiale și resurse" })).toBeInTheDocument();
    expect(screen.getByText("Placă plexiglas")).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
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
    expect(await screen.findAllByText("Selectează un produs din bibliotecă.")).not.toHaveLength(0);
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
      }, {
        id: "PRD-ACM:setting:STEEL_INTERNAL_FRAME.frameClearanceMm",
        classification: "ORGANIZATION_SETTING",
        label: "Joc de montaj cadru",
        settingId: "frameClearanceMm",
        unit: "mm",
        appliesToTemplateCodes: ["PRD-ACM"],
        organization: { resolved: true, version: 1, source: "PLATFORM_STARTER", sourceLabel: "Valoare de pornire", organizationConfirmed: false, error: null, value: 2 },
        provenance: { source: "TECHNICAL_SETTING_DEFINITION", ref: "STEEL_INTERNAL_FRAME.frameClearanceMm" },
        support: "ORGANIZATION_VERSIONED",
        componentId: "BACK",
        componentTypeId: "STEEL_INTERNAL_FRAME",
        canonicalWriter: { method: "POST", path: "/api/admin/technical-settings", permission: "owner" },
        readPath: "/api/admin/technical-settings",
      }],
    });
    vi.stubGlobal("fetch", routeFetch(acm, { ...definitions, products: [] }));
    const first = render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Panou ACM casetat/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cadru intern" }));
    expect(screen.getByText("Fără iluminare")).toBeInTheDocument();
    expect(screen.getByText("Joc de montaj cadru")).toBeInTheDocument();
    expect(screen.getByText("2 mm")).toBeInTheDocument();
    expect(screen.getByText("Profil cadru oțel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Formule" })).not.toBeInTheDocument();
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

  it("saves a published variant through the catalog preset endpoint", async () => {
    const body = capabilities();
    const withPreset = {
      ...body,
      products: [{
        ...body.products[0],
        presetContract: {
          schemaVersion: "organization-preset.v1",
          persistence: "ORGANIZATION_VERSIONED",
          canonicalWriter: { method: "POST", path: "/api/catalog/presets", permission: "owner" },
          templateCode: "PRD-TEST",
          templateVersion: "1",
          eligibleFields: [{
            fieldId: "volume.depthMm",
            label: "Adâncime volum (mm)",
            componentId: "VOLUME",
            options: [
              { value: "80", label: "80 mm", support: "SELECTABLE", rejectionCode: null, rejectionMessage: null },
              { value: "GROOVED", label: "Cu canal", support: "NOT_PREPARED", rejectionCode: "groove_recipe_missing", rejectionMessage: "Spatele cu canal nu are încă o rețetă de prelucrare." },
            ],
          }],
          whereUsed: { available: false, reason: "no_request_reference_index" },
        },
      }],
    };
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/catalog/presets")) {
        return json({ canEdit: true, templateCode: "PRD-TEST", presets: [] });
      }
      return routeFetch(withPreset)(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Variante" }));
    expect(screen.getByText("Cu canal: Spatele cu canal nu are încă o rețetă de prelucrare.")).toBeInTheDocument();
    await userEvent.type(await screen.findByLabelText("Numele variantei"), "Cant 80 vopsit");
    await userEvent.selectOptions(screen.getByLabelText("Adâncime volum (mm)"), "80");
    await userEvent.click(screen.getByRole("button", { name: "Publică" }));
    const saved = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(saved?.[0]).toBe("/api/catalog/presets");
    expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({
      templateCode: "PRD-TEST",
      lifecycle: "PUBLISHED",
      name: "Cant 80 vopsit",
      selections: [{ fieldId: "volume.depthMm", value: "80" }],
    });
  });

  it("shows the read-only route, keeps the selection, and does not start work", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/catalog/process-graph")) return json(graphPayload());
      return routeFetch()(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("tab", { name: "Proces tehnologic" }));
    expect(await screen.findByRole("heading", { name: "Traseu tehnologic" })).toBeInTheDocument();
    expect(screen.getByText("Scenariu ilustrativ. Nu este un deviz.")).toBeInTheDocument();
    expect(screen.getByText(/Săgeata intră în operația care urmează/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pornește" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Debitare" }));
    expect(screen.getByRole("heading", { name: "Debitare" })).toBeInTheDocument();
    expect(screen.getByText("Tarif lipsă. Absența nu este zero.")).toBeInTheDocument();
    expect(screen.getByText("Debitare CNC")).toBeInTheDocument();
    expect(screen.getByText("Nicio altă operație din acest scenariu nu folosește aceeași dovadă. Impactul asupra altor produse nu este calculat aici.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dovezile de cost" })).toHaveAttribute("href", "/admin/resources");
    expect(screen.getByRole("link", { name: "Disponibilitatea produsului" })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByRole("link", { name: "Setările componentei" })).toHaveAttribute("href", "/admin/technical?component=PLEXIGLAS_FACE");
    await userEvent.click(screen.getByRole("button", { name: "Toate relațiile" }));
    expect(screen.getByRole("heading", { name: "Debitare" })).toBeInTheDocument();
    expect(screen.queryByText("PLEXIGLAS_FACE")).not.toBeInTheDocument();
    expect(screen.queryByText("cut")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Scenariu ilustrativ"), "letters-finish-vinyl");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("scenario=letters-finish-vinyl"))).toBe(true);
  });

  it("keeps the workspace stylesheet modular and responsive", () => {
    const css = readFileSync("src/styles/surfaces/catalog-workspace.css", "utf8");
    const ui = readFileSync("src/styles/ui.css", "utf8");
    expect(css).toContain("@media (max-width: 1279px)");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain("focus-visible");
    expect(css).toContain("overflow-wrap: break-word");
    expect(css).toContain("role=\"tab\"");
    expect(css).toContain("--catalog-paper");
    expect(css).toContain(".catalog-workspace__records");
    expect(css).toContain(".catalog-workspace__products");
    expect(css).toContain(".catalog-workspace__component-meta { display: none; }");
    expect(css).toContain(".catalog-workspace__product-switch { display: grid; }");
    expect(css).toContain(".catalog-workspace__identity-meta { display: none; }");
    expect(css).toContain("content: \"Valoare\"");
    expect(css).toContain("content: \"Proveniență\"");
    expect(ui).not.toContain("catalog-workspace");
    expect(ui).not.toContain("--catalog-paper");
  });

  it("keeps the selected product title next to a compact product switch", async () => {
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Litere test" })).toBeInTheDocument();
    expect(screen.getByLabelText("Schimbă produsul")).toHaveValue("PRD-TEST");
    expect(screen.getByRole("searchbox", { name: "Caută în bibliotecă" })).toBeInTheDocument();
  });

  it("keeps lighting settings and formula links inside a catalog return", async () => {
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("button", { name: "Electrică / iluminare", pressed: false }));
    expect(screen.getByRole("heading", { name: "Setări" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Formule" })).toBeInTheDocument();
    expect(screen.getByText("Pas module LED")).toBeInTheDocument();
    expect(screen.getByText("100 mm")).toBeInTheDocument();
    expect(screen.getByText("Cantitate module LED")).toBeInTheDocument();
    expect(screen.getByText("Modul LED 12V")).toBeInTheDocument();
    expect(screen.getByText("Sursă LED 12V 60W")).toBeInTheDocument();
    expect(screen.getByText("1 setare · 1 formulă · 2 resurse")).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editează" })).not.toBeInTheDocument();
    const settings = screen.getByRole("link", { name: "Setările acestei componente" });
    const formulas = screen.getByRole("link", { name: "Formulele acestei componente" });
    expect(new URL(settings.getAttribute("href") ?? "", "https://workos.local").searchParams.get("return")).toBe(
      "/catalog?product=PRD-TEST&component=LIGHTING",
    );
    expect(new URL(formulas.getAttribute("href") ?? "", "https://workos.local").searchParams.get("component")).toBe(
      "LIGHTING_FRONT_LED",
    );
    expect(screen.queryByText("Această componentă nu are setări tehnice ale organizației.")).not.toBeInTheDocument();
  });

  it("restores the workspace tab from the URL and keeps selection", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK&tab=variante");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("tab", { name: "Variante", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Acest produs nu are variante reutilizabile definite.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Componente" }));
    expect(screen.getByRole("button", { name: "Spate", pressed: true })).toBeInTheDocument();
    expect(window.location.search).toContain("component=BACK");
    expect(window.location.search).not.toContain("tab=");
  });

  it("moves tab focus with the keyboard", async () => {
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    const construction = screen.getByRole("tab", { name: "Componente" });
    construction.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Proces tehnologic", selected: true })).toHaveFocus();
    expect(window.location.search).toContain("tab=proces");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Variante", selected: true })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Componente", selected: true })).toHaveFocus();
    expect(window.location.search).not.toContain("tab=");
  });

  it("removes inactive tabpanels from the accessibility tree and restores a tab deep link", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("tabpanel")).toHaveAttribute("id", "catalog-panel-constructie");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Componente");
    expect(screen.queryByRole("heading", { name: "Traseu tehnologic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Variantele organizației" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: "Proces tehnologic" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: "Variante" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Proces tehnologic" }));
    expect(await screen.findByRole("heading", { name: "Traseu tehnologic" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Caută în bibliotecă" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK&tab=variante");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("tab", { name: "Variante", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "catalog-panel-variante");
    expect(screen.getByRole("heading", { name: "Variantele organizației" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox", { name: "Caută în bibliotecă" })).not.toBeInTheDocument();
    expect(window.location.search).toContain("tab=variante");
    expect(window.location.search).toContain("component=BACK");
  });

  it("keeps tab=constructie as the Componente view and does not invent volume settings", async () => {
    const body = capabilities({
      components: [
        { id: "FACE", role: "FACE", typeId: "PLEXIGLAS_FACE", label: "Față", required: true, inputMapping: null },
        { id: "VOLUME", role: "VOLUME", typeId: "ALUMINIUM_VOLUME", label: "Volum", required: true, inputMapping: null },
        { id: "BACK", role: "BACK", typeId: "FOREX_BACK", label: "Spate", required: true, inputMapping: { confirmedAreaMm2FromComponentId: "FACE" } },
        { id: "LIGHTING", role: "LIGHTING", typeId: "LIGHTING_FRONT_LED", label: "Electrică / iluminare", required: true, inputMapping: null },
      ],
    });
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=VOLUME&tab=constructie");
    vi.stubGlobal("fetch", routeFetch(body));
    render(<CatalogPage />);
    expect(await screen.findByRole("tab", { name: "Componente", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "catalog-panel-constructie");
    expect(screen.getByRole("button", { name: "Volum", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("fără setări · 2 resurse")).toBeInTheDocument();
    expect(screen.getByText("Profil retur aluminiu")).toBeInTheDocument();
    expect(screen.getByText("Formare profil aluminiu")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Setări" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Formule" })).not.toBeInTheDocument();
    expect(screen.queryByText(/3,20/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
  });

  it("keeps member catalog read-only and without financial amounts", async () => {
    vi.stubGlobal("fetch", routeFetch(capabilities({ canEdit: false })));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Litere test/ }));
    await userEvent.click(screen.getByRole("button", { name: "Electrică / iluminare", pressed: false }));
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvează" })).not.toBeInTheDocument();
    expect(screen.getByText("Doar proprietarul poate modifica setările tehnice.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Setările acestei componente" })).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
  });
});
