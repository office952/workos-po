import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function routeFetch(body = capabilities(), system = definitions, extras: { formulas?: unknown; formulasStatus?: number } = {}) {
  return vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PATCH") return json({});
    if (url.includes("/api/catalog/capabilities")) return json(body);
    if (url.includes("/api/catalog/process-graph")) return json(emptyGraph());
    if (url.includes("/api/product-system-admin")) return json(system);
    if (url.includes("/api/admin/formulas")) {
      if (extras.formulasStatus) return json({}, extras.formulasStatus);
      if (extras.formulas !== undefined) return json(extras.formulas);
    }
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

function presetContract() {
  return {
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
  };
}

function withPreset() {
  const body = capabilities();
  return { ...body, products: [{ ...body.products[0], presetContract: presetContract() }] };
}

function threeProducts() {
  const letters = capabilities();
  const acm = capabilities({ code: "PRD-ACM", label: "Panou ACM casetat", components: [], elements: [] });
  const logo = capabilities({ code: "PRD-LOGO", label: "Logo volumetric", enabled: false, elements: [] });
  return {
    body: { ...letters, products: [...letters.products, ...acm.products, ...logo.products] },
    system: {
      ...definitions,
      products: [
        ...definitions.products,
        { code: "PRD-ACM", label: "Panou ACM casetat", displayRevision: 1, familyLabel: "Panouri și casete", categoryLabel: "Casete", description: "", composition: [] },
        { code: "PRD-LOGO", label: "Logo volumetric", displayRevision: 1, familyLabel: "Semnalistică", categoryLabel: "Logo", description: "", composition: [] },
      ],
    },
  };
}

async function openProduct(name: string | RegExp = "Litere test") {
  await userEvent.click(await screen.findByRole("link", { name }));
}

afterEach(() => { vi.unstubAllGlobals(); resetResourceCache(); sessionStorage.clear(); window.history.replaceState({}, "", "/"); });

describe("Catalog · bibliotecă", () => {
  it("shows the library when no product is selected, without customer or request IO", async () => {
    window.history.replaceState({}, "", "/catalog");
    writeConfiguratorSession({ customerId: "cus-A", requestId: "req-A", productCode: "OTHER", drafts: { inscription: "A" }, draftContext: { customerId: "cus-A", requestId: "req-A", productCode: "OTHER" }, lastQuote: null });
    const before = readConfiguratorSession();
    const fetchMock = routeFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Bibliotecă de produse" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Litere test" })).toHaveAttribute("href", "/catalog?product=PRD-TEST");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText("Selectează un produs din bibliotecă.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 produs");
    expect(screen.getByRole("link", { name: "Disponibilitatea produselor" })).toHaveAttribute("href", "/admin/products");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(expect.arrayContaining(["/api/catalog/capabilities", "/api/product-system-admin"]));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/customers") || String(url).includes("/api/requests"))).toBe(false);
    expect(readConfiguratorSession()).toEqual(before);
    expect(screen.queryByText(/creează cererea/i)).not.toBeInTheDocument();
    expect(screen.queryByText("PRD-TEST")).not.toBeInTheDocument();
    expect(screen.getByText(/Un produs neoferit rămâne vizibil pentru consultare/)).toBeInTheDocument();
  });

  it("keeps a product that is not offered listed as consultative Product Truth", async () => {
    const { body, system } = threeProducts();
    vi.stubGlobal("fetch", routeFetch(body, system));
    render(<CatalogPage />);
    expect(await screen.findByRole("link", { name: "Logo volumetric" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Panou ACM casetat" })).toBeInTheDocument();
    expect(screen.getAllByText("Nu este oferit pentru lucrări noi").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Neoferite · 1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Disponibilitatea produselor" })).toHaveAttribute("href", "/admin/products");
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
  });

  it("searches without diacritics or case, adds the filters, and clears them", async () => {
    const { body, system } = threeProducts();
    vi.stubGlobal("fetch", routeFetch(body, system));
    render(<CatalogPage />);
    const search = await screen.findByRole("searchbox", { name: "Caută în bibliotecă" });
    expect(screen.getAllByRole("row")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Toate · 3", pressed: true })).toBeInTheDocument();
    await userEvent.type(search, "SEMNALISTICA");
    expect(screen.getByRole("link", { name: "Litere test" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Logo volumetric" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Panou ACM casetat" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Oferite · 1" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Neoferite · 1" }));
    expect(screen.queryByRole("link", { name: "Litere test" })).not.toBeInTheDocument();
    expect(screen.getByText("1 din 3")).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, "totem");
    expect(screen.getByText("Niciun produs nu corespunde căutării „totem”.")).toBeInTheDocument();
    expect(screen.getByText("0 din 3")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Șterge căutarea și filtrele" })[0]);
    expect(search).toHaveValue("");
    expect(screen.getAllByRole("row")).toHaveLength(4);
    await userEvent.selectOptions(screen.getByLabelText("Familie"), "Panouri și casete");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    await userEvent.type(search, "x{Escape}");
    expect(search).toHaveValue("");
  });

  it("keeps an unknown product address on the library, with the existing message", async () => {
    window.history.replaceState({}, "", "/catalog?product=LIPSESTE");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByText("Produsul indicat nu face parte din biblioteca curentă.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Litere test" })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(window.location.search).toBe("?product=LIPSESTE");
  });

  it("recovers from an unreadable library", async () => {
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      void input;
      void init;
      return json({}, 503);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await screen.findByText("Biblioteca de produse nu a putut fi citită.");
    fetchMock.mockImplementation((input: RequestInfo, init?: RequestInit) => routeFetch()(input, init));
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByRole("link", { name: "Litere test" })).toBeInTheDocument();
  });

  it("drops the long description above twelve products and keeps one list", async () => {
    const base = capabilities();
    const many = Array.from({ length: 30 }, (_, index) => ({ ...base.products[0], templateCode: `PRD-${index}`, label: `Produs sintetic ${index + 1}` }));
    const system = { ...definitions, products: many.map((item) => ({ ...definitions.products[0], code: item.templateCode, label: item.label })) };
    vi.stubGlobal("fetch", routeFetch({ ...base, products: many }, system));
    render(<CatalogPage />);
    expect(await screen.findByText("30 de produse")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(31);
    expect(screen.queryByText("Construcție luminoasă")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /pagin/i })).not.toBeInTheDocument();
  });
});

describe("Catalog · structura produsului", () => {
  it("opens the structure overview for a product without a component", async () => {
    window.history.replaceState({}, "", "/catalog");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await openProduct();
    expect(window.location.search).toBe("?product=PRD-TEST");
    expect(screen.getByRole("heading", { level: 1, name: "Litere test" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Structură", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Structura produsului" })).toBeInTheDocument();
    expect(screen.getByText("Construcție luminoasă")).toBeInTheDocument();
    expect(screen.getByText("toate obligatorii · 1 setare · 1 formulă · 3 resurse")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Structură/ })).toHaveAttribute("aria-current", "page");
    const lighting = screen.getByRole("row", { name: /Electrică \/ iluminare/ });
    expect(lighting).toHaveTextContent("1 setare · 1 formulă · 2 resurse");
    expect(screen.getAllByText("Dă suprafața confirmată către 02 Spate")).not.toHaveLength(0);
    expect(screen.getAllByText("Primește suprafața confirmată de la 01 Față")).not.toHaveLength(0);
    expect(screen.getAllByText("Semnalistică")).toHaveLength(1);
    expect(screen.getByText("Textul literelor")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Setări" })).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
    expect(screen.queryByText("PLEXIGLAS_FACE")).not.toBeInTheDocument();
    expect(screen.queryByText(/Limite ale platformei/)).not.toBeInTheDocument();
  });

  it("moves structure → component → structure and follows Back and Forward", async () => {
    window.history.replaceState({}, "", "/catalog");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await openProduct();
    await userEvent.click(screen.getByRole("link", { name: "Spate" }));
    expect(window.location.search).toBe("?product=PRD-TEST&component=BACK");
    expect(screen.getByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    expect(screen.getByText("Componenta 2 din 3 · obligatorie")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /^Față/ }));
    expect(screen.getByRole("heading", { level: 2, name: "Față" })).toBeInTheDocument();
    window.history.back();
    expect(await screen.findByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    window.history.back();
    expect(await screen.findByRole("heading", { level: 2, name: "Structura produsului" })).toBeInTheDocument();
    expect(window.location.search).toBe("?product=PRD-TEST");
    window.history.forward();
    expect(await screen.findByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Structură" }));
    expect(screen.getByRole("heading", { level: 2, name: "Structura produsului" })).toBeInTheDocument();
    expect(window.location.search).toBe("?product=PRD-TEST");
    window.history.replaceState({}, "", "/catalog");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("heading", { level: 1, name: "Bibliotecă de produse" })).toBeInTheDocument();
  });

  it("opens an existing component link and treats an unknown component apart from an unknown product", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    expect(screen.getByText("Primește suprafața confirmată de la")).toBeInTheDocument();
    expect(screen.getByText("Această componentă nu are proprietăți fixe, setări, formule sau resurse proprii.")).toBeInTheDocument();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=NU-EXISTA");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByText("Componenta indicată nu face parte din acest produs. Alege o componentă din listă.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Structura produsului" })).toBeInTheDocument();
    expect(screen.queryByText("Produsul indicat nu face parte din biblioteca curentă.")).not.toBeInTheDocument();
  });

  it("changes the product from the bar, keeps the tab and drops the component", async () => {
    const { body, system } = threeProducts();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK&tab=variante");
    vi.stubGlobal("fetch", routeFetch(body, system));
    render(<CatalogPage />);
    const trigger = await screen.findByRole("button", { name: "Schimbă produsul" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Schimbă produsul" });
    expect(within(dialog).getByRole("searchbox", { name: "Caută un produs" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.type(screen.getByRole("searchbox", { name: "Caută un produs" }), "acm");
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Panou ACM casetat/ }));
    expect(window.location.search).toBe("?product=PRD-ACM&tab=variante");
    expect(screen.getByRole("heading", { level: 1, name: "Panou ACM casetat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Variante", selected: true })).toBeInTheDocument();
    window.history.back();
    expect(await screen.findByRole("heading", { level: 1, name: "Litere test" })).toBeInTheDocument();
    expect(window.location.search).toContain("component=BACK");
  });

  it("does not invent lighting, relations or back fields", async () => {
    const acm = capabilities({
      code: "PRD-ACM",
      label: "Panou ACM casetat",
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
        id: "PRD-ACM:identity:back.frame",
        classification: "PLATFORM_FIXED",
        label: "Cadru intern",
        value: "Profil oțel",
        nesting: null,
        provenance: { source: "IDENTITY_FACT", ref: "back.frame" },
        support: "DECLARED",
        componentId: "BACK",
        componentTypeId: "STEEL_INTERNAL_FRAME",
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
    render(<CatalogPage />);
    await openProduct("Panou ACM casetat");
    expect(screen.getByText("Fără iluminare")).toBeInTheDocument();
    expect(screen.getAllByText("Profil oțel")).not.toHaveLength(0);
    expect(screen.queryByText(/suprafața confirmată/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText("Nicio legătură declarată")).toHaveLength(2);
    await userEvent.click(screen.getByRole("link", { name: "Cadru intern" }));
    expect(screen.getByRole("rowheader", { name: "Joc de montaj cadru" })).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Profil cadru oțel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Formule/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /iluminare/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Prelucrare spate")).not.toBeInTheDocument();
    expect(screen.queryByText("Legături")).not.toBeInTheDocument();
    expect(screen.getByText("Nu are câmpuri de completat pe lucrare.")).toBeInTheDocument();
  });
});

describe("Catalog · fișa componentei", () => {
  it("shows settings, formulas and resources once, with admin links that return to the catalog", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Electrică / iluminare" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Setări/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^Formule/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Pas module LED" })).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("mm")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Cantitate module LED" })).toBeInTheDocument();
    expect(screen.getByText("Modul LED 12V")).toBeInTheDocument();
    expect(screen.getByText("Sursă LED 12V 60W")).toBeInTheDocument();
    expect(screen.getAllByText("Valorile nu sunt încă confirmate de organizație.")).toHaveLength(1);
    expect(screen.queryByText("Construcție luminoasă")).not.toBeInTheDocument();
    expect(screen.queryByText("Semnalistică")).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
    const settings = screen.getByRole("link", { name: "Modifică în Setări tehnice" });
    const formulas = screen.getByRole("link", { name: "Deschide în Formule" });
    expect(new URL(settings.getAttribute("href") ?? "", "https://workos.local").searchParams.get("return")).toBe("/catalog?product=PRD-TEST&component=LIGHTING");
    expect(new URL(formulas.getAttribute("href") ?? "", "https://workos.local").searchParams.get("component")).toBe("LIGHTING_FRONT_LED");
    expect(screen.getByRole("link", { name: "Vezi costurile de producție" })).toHaveAttribute("href", "/admin/resources");
    expect(screen.getByRole("link", { name: "Componenta anterioară: Spate" })).toHaveAttribute("href", "/catalog?product=PRD-TEST&component=BACK");
  });

  it("names what a formula uses from the manifest and shows a missing value in its row", async () => {
    const body = capabilities();
    const elements = body.products[0].elements.map((element) => {
      if (element.classification === "ORGANIZATION_FORMULA") {
        return { ...element, allowedReferences: { configSettingIds: ["ledPitchMm"], jobInputIds: ["confirmedPerimeterMm"], formulaIds: [] } };
      }
      if (element.classification === "ORGANIZATION_SETTING") {
        return { ...element, organization: { resolved: false, version: null, source: null, sourceLabel: null, organizationConfirmed: false, error: "unresolved", value: null } };
      }
      return element;
    });
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch({ ...body, products: [{ ...body.products[0], elements }] }));
    render(<CatalogPage />);
    expect(await screen.findByText("Pas module LED · 1 valoare de pe lucrare")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Referințe permise" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Folosește" })).not.toBeInTheDocument();
    expect(screen.getByText("Valoare necitită")).toBeInTheDocument();
    expect(screen.queryByText("confirmedPerimeterMm")).not.toBeInTheDocument();
  });

  it("shows a component without settings and keeps tab=constructie as the structure view", async () => {
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
    expect(await screen.findByRole("tab", { name: "Structură", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "catalog-panel-constructie");
    expect(screen.getByRole("heading", { level: 2, name: "Volum" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Volum/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Profil retur aluminiu")).toBeInTheDocument();
    expect(screen.getByText("Volum nu are setări tehnice sau formule proprii.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Setări/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /^Formule/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
  });

  it("keeps thirty settings in one flat list with its own search", async () => {
    const body = capabilities();
    const setting = body.products[0].elements.find((element) => element.classification === "ORGANIZATION_SETTING");
    const settings = Array.from({ length: 30 }, (_, index) => ({ ...setting, id: `PRD-TEST:setting:s${index}`, settingId: `s${index}`, label: `Setare sintetică ${index + 1}` }));
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch({ ...body, products: [{ ...body.products[0], elements: settings }] }));
    render(<CatalogPage />);
    const search = await screen.findByRole("searchbox", { name: "Caută o setare" });
    expect(screen.getAllByRole("rowheader")).toHaveLength(30);
    await userEvent.type(search, "sintetica 30");
    expect(screen.getAllByRole("rowheader")).toHaveLength(1);
    expect(screen.getByText("1 din 30")).toBeInTheDocument();
  });
});

function inspectorLetters() {
  const body = capabilities();
  const request = (id: string, label: string, componentId: string, extra: Record<string, unknown> = {}) => ({
    id: `PRD-TEST:request:${id}`,
    classification: "REQUEST_FACT",
    label,
    fieldType: extra.fieldType ?? "select",
    required: extra.required ?? true,
    conditions: extra.conditions ?? [],
    options: extra.options ?? [],
    provenance: { source: "FORM_SCHEMA", ref: id },
    support: "SCHEMA_SELECTABLE",
    componentId,
    componentTypeId: componentId === "FACE" ? "PLEXIGLAS_FACE" : "FOREX_BACK",
    canonicalWriter: null,
    readPath: null,
  });
  const finish = request("face.finish", "Finisaj față", "FACE", {
    options: [
      { value: "none", label: "Fără finisaj", support: "SCHEMA_SELECTABLE", technologicalCondition: null },
      { value: "vinyl", label: "Colantat", support: "SCHEMA_SELECTABLE", technologicalCondition: null },
    ],
  });
  const color = request("face.color", "Culoare față", "FACE", {
    fieldType: "text",
    conditions: [{ kind: "fieldEquals", fieldId: "face.finish", value: "vinyl" }],
  });
  const area = request("face.confirmedAreaMm2", "Suprafață confirmată (mm²)", "FACE", { fieldType: "number", options: [] });
  const thickness = {
    id: "PRD-TEST:fixed:face.thicknessMm",
    classification: "PLATFORM_FIXED",
    label: "Grosime",
    value: 3,
    nesting: null,
    provenance: { source: "FIXED_VALUE", ref: "face.thicknessMm" },
    support: "DECLARED",
    componentId: "FACE",
    componentTypeId: "PLEXIGLAS_FACE",
    canonicalWriter: null,
    readPath: null,
  };
  return {
    ...body,
    products: [{
      ...body.products[0],
      elements: [...body.products[0].elements, finish, color, area, thickness],
    }],
  };
}

function formulasAdminPayload() {
  return {
    canEdit: true,
    resolutionOk: true,
    guidance: null,
    formulas: [{
      formulaId: "LIGHTING_FRONT_LED.ledModuleQuantity",
      resultId: "ledModuleQuantity",
      typeId: "LIGHTING_FRONT_LED",
      label: "Cantitate module LED",
      description: "",
      resultUnit: "buc",
      resultValueKind: "COUNT",
      allowedOperators: [],
      allowedReferences: { configSettingIds: ["ledPitchMm"], jobInputIds: ["confirmedPerimeterMm"], formulaIds: [] },
      expression: null,
      explanation: "rotunjire în sus (Perimetru confirmat ÷ Pas module LED)",
      source: "PLATFORM_STARTER",
      sourceLabel: "Formulă de pornire",
      version: 1,
      status: "ACTIVE",
      statusLabel: "Activă",
      effectiveFrom: "2026-09-21T00:00:00.000Z",
    }],
    history: [],
  };
}

function stubPhoneLayout() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 767px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function stubTabletLayout() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(max-width: 1023px)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

describe("Catalog · inspector de proprietate", () => {
  const showModal = HTMLDialogElement.prototype.showModal;
  const closeDialog = HTMLDialogElement.prototype.close;

  beforeEach(() => {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  });

  afterEach(() => {
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = closeDialog;
  });

  it("keeps the existing sheet when nothing is selected", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Față" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Grosime" })).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "În produs" })).toBeInTheDocument();
  });

  it("opens a fixed property without inventing what uses it", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Grosime/ }));
    const inspector = screen.getByRole("region", { name: "Grosime" });
    expect(within(inspector).getByText("Definiția produsului.")).toBeInTheDocument();
    expect(within(inspector).getByText("Informația nu este disponibilă aici.")).toBeInTheDocument();
    expect(within(inspector).queryByText("Indisponibil.")).not.toBeInTheDocument();
    expect(within(inspector).queryByText(/nu ține evidența/)).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "În produs" })).toBeInTheDocument();
  });

  it("keeps selection when focus moves and when the inspector closes", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Finisaj față/ }));
    expect(screen.getByRole("button", { name: /Finisaj față/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Finisaj față/ })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Închide ×" }));
    expect(screen.getByRole("button", { name: /Finisaj față/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Finisaj față" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Finisaj față/ })).toHaveFocus());
  });

  it("shows a known condition and a same-sheet dependent", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Culoare față/ }));
    expect(screen.getByText("Doar când Finisaj față este Colantat.")).toBeInTheDocument();
    expect(screen.getByText("Nicio legătură declarată.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Arată Finisaj față" }));
    expect(screen.getByRole("heading", { name: "Finisaj față" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arată Culoare față" })).toBeInTheDocument();
  });

  it("opens a confirmed component relationship and returns to the property", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Suprafață confirmată/ }));
    await userEvent.click(screen.getByRole("button", { name: /Deschide 02 Spate/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Înapoi la Față · Suprafață confirmată/ }));
    expect(await screen.findByRole("heading", { name: "Suprafață confirmată (mm²)" })).toBeInTheDocument();
  });

  it("reads a formula explanation without turning allowed references into links", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch(capabilities(), definitions, { formulas: formulasAdminPayload() }));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Cantitate module LED/ }));
    expect(await screen.findByText("rotunjire în sus (Perimetru confirmat ÷ Pas module LED)")).toBeInTheDocument();
    expect(screen.getByText("Elementele formulei nu pot fi deschise de aici.")).toBeInTheDocument();
    expect(screen.getByText("Informația nu este disponibilă aici.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Perimetru confirmat/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deschide în Formule ↗" })).toBeInTheDocument();
  });

  it("retries a failed formula composition read without replacing the sheet", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    let fail = true;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/admin/formulas")) return json(fail ? {} : formulasAdminPayload(), fail ? 500 : 200);
      return routeFetch()(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Cantitate module LED/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Alcătuirea formulei nu a putut fi citită");
    expect(screen.getByRole("heading", { level: 2, name: "Electrică / iluminare" })).toBeInTheDocument();
    fail = false;
    const beforeRetry = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/admin/formulas")).length;
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByText("rotunjire în sus (Perimetru confirmat ÷ Pas module LED)")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/admin/formulas")).length).toBeGreaterThan(beforeRetry);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cantitate module LED/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the phone inspector on the property and operations on the sheet", async () => {
    stubPhoneLayout();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Grosime/ }));
    const inspector = screen.getByRole("region", { name: "Grosime" });
    expect(screen.getByRole("button", { name: "‹ Față" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Față" })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("heading", { name: /Operații în proces/ })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("heading", { name: "Legături" })).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("heading", { name: "Măsurare" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "‹ Față" }));
    expect(screen.getByRole("heading", { level: 2, name: "Față" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Grosime/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Operații în proces · 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Măsurare" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Grosime/ })).toHaveFocus());
  });

  it("keeps tablet keyboard focus inside the inspector dialog", async () => {
    stubTabletLayout();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    const trigger = await screen.findByRole("button", { name: /Grosime/ });
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Grosime" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("button", { name: "Închide ×" })).toHaveFocus();
    expect(within(dialog).queryByRole("heading", { name: /Operații în proces/ })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Față" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Operații în proces · 1" })).toBeInTheDocument();
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Grosime/ })).toHaveFocus());
  });

  it("closes the tablet inspector from the backdrop and restores the row", async () => {
    stubTabletLayout();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch(inspectorLetters()));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Grosime/ }));
    const dialog = screen.getByRole("dialog", { name: "Grosime" });
    await userEvent.click(dialog.querySelector(".catv2-inspector-layer__backdrop")!);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Grosime/ })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("button", { name: /Grosime/ })).toHaveFocus());
  });

  it("still opens the inspector when the operator may only consult", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch(capabilities({ canEdit: false }), definitions, { formulas: formulasAdminPayload() }));
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Pas module LED/ }));
    expect(screen.getByRole("heading", { name: "Pas module LED" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi în Setări tehnice ↗" })).toBeInTheDocument();
  });
});

describe("Catalog · permisiuni și redenumire", () => {
  it("uses the existing revisioned label endpoint, without a commercial mutation", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editează denumirea" }));
    await userEvent.clear(screen.getByLabelText("Denumirea produsului"));
    await userEvent.type(screen.getByLabelText("Denumirea produsului"), "Litere noi");
    await userEvent.click(screen.getByRole("button", { name: "Salvează denumirea" }));
    expect(fetch).toHaveBeenCalledWith("/api/admin/product-system/entities/PRODUCT_TEMPLATE/PRD-TEST/display-label", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ displayLabel: "Litere noi", revision: 2 }) }));
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("explains a rename conflict in place and offers a reload", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => (init?.method === "PATCH" ? json({ error: "revision_conflict" }, 409) : routeFetch()(input, init)));
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editează denumirea" }));
    await userEvent.type(screen.getByLabelText("Denumirea produsului"), " nou");
    await userEvent.click(screen.getByRole("button", { name: "Salvează denumirea" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Denumirea a fost modificată între timp. Reîncarcă produsul înainte de salvare.");
    expect(screen.getByLabelText("Denumirea produsului")).toHaveValue("Litere test nou");
    const before = fetchMock.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Reîncarcă denumirea" }));
    expect(screen.queryByLabelText("Denumirea produsului")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBeGreaterThan(before);
  });

  it("fails closed for editing when either permission is absent", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    vi.stubGlobal("fetch", routeFetch(capabilities(), { ...definitions, canEdit: undefined as unknown as boolean }));
    const { unmount } = render(<CatalogPage />);
    await screen.findByRole("heading", { level: 1, name: "Litere test" });
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    unmount();
    resetResourceCache();
    vi.stubGlobal("fetch", routeFetch(capabilities({ canEdit: false })));
    render(<CatalogPage />);
    await screen.findByRole("heading", { level: 1, name: "Litere test" });
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    expect(screen.getByText("Doar proprietarul poate schimba disponibilitatea.")).toBeInTheDocument();
  });

  it("keeps a member read-only, with view links and without financial amounts", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch(capabilities({ canEdit: false })));
    render(<CatalogPage />);
    expect(await screen.findByText("Doar consultare")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi în Setări tehnice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vezi în Formule" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Modifică în Setări tehnice" })).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
  });
});

describe("Catalog · file, proces și variante", () => {
  it("restores the tab from the URL and keeps the selection", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK&tab=variante");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("tab", { name: "Variante", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Acest produs nu are variante reutilizabile definite.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Structură" }));
    expect(screen.getByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    expect(window.location.search).toContain("component=BACK");
    expect(window.location.search).not.toContain("tab=");
  });

  it("moves tab focus with the keyboard", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    const structure = await screen.findByRole("tab", { name: "Structură" });
    structure.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Proces tehnologic", selected: true })).toHaveFocus();
    expect(window.location.search).toContain("tab=proces");
    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Variante", selected: true })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Structură", selected: true })).toHaveFocus();
    expect(window.location.search).not.toContain("tab=");
  });

  it("renders one tabpanel at a time and restores a tab deep link", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    expect(await screen.findByRole("tabpanel")).toHaveAttribute("id", "catalog-panel-constructie");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Structură");
    expect(screen.queryByRole("heading", { level: 2, name: "Proces tehnologic" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "Proces tehnologic" }));
    expect(await screen.findByRole("heading", { level: 2, name: "Proces tehnologic" })).toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByRole("navigation", { name: "Structura produsului" })).not.toBeInTheDocument();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK&tab=variante");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(await screen.findByRole("tab", { name: "Variante", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "catalog-panel-variante");
    expect(screen.getByRole("heading", { level: 2, name: "Variante" })).toBeInTheDocument();
    expect(window.location.search).toContain("component=BACK");
  });

  it("shows the read-only route as lanes and as steps, keeps the selection, and does not start work", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&tab=proces");
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/catalog/process-graph")) return json(graphPayload());
      return routeFetch()(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    expect(await screen.findByRole("heading", { level: 2, name: "Proces tehnologic" })).toBeInTheDocument();
    expect(screen.getByText("Nu se salvează")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
    expect(await screen.findByText("Scenariu ilustrativ. Nu este un deviz.")).toBeInTheDocument();
    expect(screen.getByText(/Săgeata intră în operația care urmează/)).toBeInTheDocument();
    expect(screen.getByText("2 operații · 2 pași")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Traseul pe pași" })).toHaveTextContent("Față · după Debitare");
    expect(screen.getByRole("button", { name: "Debitare · Față · Necesar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pornește" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Debitare" }));
    expect(screen.getByRole("heading", { name: "Debitare" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Debitare · Față · Necesar", pressed: true })).toBeInTheDocument();
    expect(screen.getByText("Tarif lipsă. Absența nu este zero.")).toBeInTheDocument();
    expect(screen.getByText("Debitare CNC")).toBeInTheDocument();
    expect(screen.getByText("Nicio altă operație din acest scenariu nu folosește aceeași dovadă. Impactul asupra altor produse nu este calculat aici.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Costuri de producție" })).toHaveAttribute("href", "/admin/resources");
    expect(screen.getByRole("link", { name: "Disponibilitatea produsului" })).toHaveAttribute("href", "/admin/products");
    expect(screen.getByRole("link", { name: "Setările componentei" })).toHaveAttribute("href", "/admin/technical?component=PLEXIGLAS_FACE");
    await userEvent.click(screen.getByRole("button", { name: "Toate relațiile" }));
    expect(screen.getByRole("heading", { name: "Debitare" })).toBeInTheDocument();
    expect(screen.queryByText("PLEXIGLAS_FACE")).not.toBeInTheDocument();
    expect(screen.queryByText("cut")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Scenariu ilustrativ"), "letters-finish-vinyl");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("scenario=letters-finish-vinyl"))).toBe(true);
  });

  it("does not invent a process editor when writeState is not consultative", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&tab=proces");
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/catalog/process-graph")) return json({ ...graphPayload(), writeState: "READY" });
      return routeFetch()(input, init);
    }));
    render(<CatalogPage />);
    expect(await screen.findByText("Datele primite nu respectă contractul de consultare.")).toBeInTheDocument();
    expect(screen.getByText("Nu se salvează")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reîncearcă traseul" })).toBeInTheDocument();
  });

  it("publishes a variant through the catalog preset endpoint and blocks an unprepared option", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&tab=variante");
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/api/catalog/presets")) return json({ canEdit: true, templateCode: "PRD-TEST", presets: [] });
      return routeFetch(withPreset())(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    expect(await screen.findByRole("heading", { name: "Variantă nouă" })).toBeInTheDocument();
    expect(screen.getByText("Nu există variante salvate.")).toBeInTheDocument();
    expect(screen.getByText("„Cu canal” nu poate fi ales: Spatele cu canal nu are încă o rețetă de prelucrare.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cu canal" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Publică" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Denumirea variantei"), "Cant 80 vopsit{Enter}");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await userEvent.type(screen.getByLabelText("Descriere · opțional"), "Exterior");
    await userEvent.click(screen.getByRole("button", { name: "80 mm", pressed: false }));
    await userEvent.click(screen.getByRole("button", { name: "Publică" }));
    const saved = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(saved?.[0]).toBe("/api/catalog/presets");
    expect(JSON.parse(String(saved?.[1]?.body))).toMatchObject({
      presetId: null,
      expectedRevision: null,
      templateCode: "PRD-TEST",
      lifecycle: "PUBLISHED",
      name: "Cant 80 vopsit",
      description: "Exterior",
      selections: [{ fieldId: "volume.depthMm", value: "80" }],
    });
  });

  it("continues, saves a draft and retires only after confirmation, with the server reason on refusal", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&tab=variante");
    const published = { presetId: "pst.1", revision: 2, lifecycle: "PUBLISHED", name: "Cant 80", description: "Exterior", templateCode: "PRD-TEST", templateVersion: "1", selections: [{ fieldId: "volume.depthMm", value: "80" }], supersedesRevision: 1 };
    const retired = { ...published, presetId: "pst.2", revision: 3, lifecycle: "RETIRED", name: "Veche" };
    let refuse: { status: number; body: unknown } | null = null;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/api/catalog/presets")) {
        if (init?.method === "POST") return refuse ? json(refuse.body, refuse.status) : json({ preset: published, history: [published] });
        return json({ canEdit: true, templateCode: "PRD-TEST", presets: [published, retired] });
      }
      return routeFetch(withPreset())(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    const row = await screen.findByRole("row", { name: /Cant 80/ });
    expect(row).toHaveTextContent("80 mm");
    expect(row).toHaveTextContent("Publicată");
    expect(row).toHaveTextContent("revizia 2");
    expect(within(screen.getByRole("row", { name: /Veche/ })).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Variantă nouă" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Șterge/ })).not.toBeInTheDocument();

    await userEvent.click(within(row).getByRole("button", { name: "Retrage" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    expect(screen.getByText(/O variantă retrasă nu se redeschide și nu mai poate fi aleasă în Configurator/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Renunță" }));
    await userEvent.click(within(screen.getByRole("row", { name: /Cant 80/ })).getByRole("button", { name: "Retrage" }));
    refuse = { status: 409, body: { error: "revision_conflict", reasons: ["Revizia variantei s-a schimbat între timp."] } };
    await userEvent.click(screen.getByRole("button", { name: "Retrage varianta" }));
    const retire = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").pop();
    expect(JSON.parse(String(retire?.[1]?.body))).toMatchObject({ presetId: "pst.1", expectedRevision: 2, lifecycle: "RETIRED", name: "Cant 80", selections: [{ fieldId: "volume.depthMm", value: "80" }] });
    expect(await screen.findByRole("alert")).toHaveTextContent("Varianta nu a fost retrasă. Revizia variantei s-a schimbat între timp.");
    // The refusal stays with the variant it concerns, inside its confirmation.
    expect(within(screen.getByRole("group", { name: "Retragerea variantei Cant 80" })).getByRole("alert")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "Reîncarcă lista" }));
    refuse = null;

    await userEvent.click(within(await screen.findByRole("row", { name: /Cant 80/ })).getByRole("button", { name: "Continuă" }));
    expect(screen.getByRole("heading", { name: "Continuă varianta" })).toBeInTheDocument();
    expect(screen.getByLabelText("Denumirea variantei")).toHaveValue("Cant 80");
    expect(screen.getByRole("button", { name: "80 mm", pressed: true })).toBeInTheDocument();
    expect(screen.getByText(/nu mai poate fi aleasă în Configurator până când o publici din nou/)).toBeInTheDocument();
    refuse = { status: 400, body: { error: "published_requires_selection", reasons: ["O variantă publicată alege cel puțin o opțiune suportată."] } };
    await userEvent.click(screen.getByRole("button", { name: "80 mm", pressed: true }));
    await userEvent.click(screen.getByRole("button", { name: "Publică" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Varianta nu a fost publicată. O variantă publicată alege cel puțin o opțiune suportată.");
    expect(screen.getByLabelText("Denumirea variantei")).toHaveValue("Cant 80");
    refuse = null;
    await userEvent.click(screen.getByRole("button", { name: "Salvează ciorna" }));
    const draft = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").pop();
    expect(JSON.parse(String(draft?.[1]?.body))).toMatchObject({ presetId: "pst.1", expectedRevision: 2, lifecycle: "DRAFT", selections: [] });
  });

  it("gives other users a read-only list of variants", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&tab=variante");
    const published = { presetId: "pst.1", revision: 2, lifecycle: "PUBLISHED", name: "Cant 80", description: "", templateCode: "PRD-TEST", templateVersion: "1", selections: [{ fieldId: "volume.depthMm", value: "80" }], supersedesRevision: 1 };
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/api/catalog/presets")) return json({ canEdit: false, templateCode: "PRD-TEST", presets: [published] });
      return routeFetch(withPreset())(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    expect(await screen.findByText("Poți consulta variantele publicate. Doar proprietarul le poate schimba.")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Cant 80/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continuă" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retrage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publică" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Denumirea variantei")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("offers one way out when variants cannot be read", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&tab=variante");
    let fail = true;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (String(input).includes("/api/catalog/presets")) return fail ? json({}, 503) : json({ canEdit: true, templateCode: "PRD-TEST", presets: [] });
      return routeFetch(withPreset())(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    expect(await screen.findByText("Variantele nu au putut fi citite.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Reîncearcă" }));
    expect(await screen.findByText("Nu există variante salvate.")).toBeInTheDocument();
  });
});

describe("Catalog · stiluri și stări responsive", () => {
  const read = (name: string) => readFileSync(`src/styles/surfaces/${name}`, "utf8");

  it("keeps the catalog styles modular, scoped and out of ui.css", () => {
    const frame = read("catalog-v2.css");
    const ui = readFileSync("src/styles/ui.css", "utf8");
    expect(frame).toContain(":focus-visible");
    expect(frame).toContain("overflow-wrap: break-word");
    expect(frame).toContain(":root[data-resolved-theme=\"dark\"] .catv2");
    expect(frame).toContain("@media (max-width: 767px)");
    expect(ui).not.toContain("catv2");
    for (const name of ["catalog-v2.css", "catalog-v2-library.css", "catalog-v2-structure.css", "catalog-v2-variants.css", "catalog-process-graph.css", "catalog-v2-inspector.css"]) {
      const css = read(name);
      expect(css.split("\n").length).toBeLessThan(420);
      expect(css).not.toMatch(/^(html|body|:root)\s*\{/m);
    }
  });

  it("turns the rail into a strip on a tablet and hides it on a phone, where the list navigates", () => {
    const css = read("catalog-v2-structure.css");
    const tablet = css.slice(css.indexOf("@media (max-width: 1023px)"), css.indexOf("@media (max-width: 767px)"));
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(tablet).toContain("overflow-x: auto");
    expect(tablet).toContain(".catv2-matrix :is(th, td).catv2-matrix__links { display: none; }");
    expect(phone).toContain(".catv2-rail { display: none; }");
    expect(phone).toContain(".catv2-sheet__back { display: inline-flex;");
    expect(phone).toContain("min-height: 44px");
  });

  it("keeps the inspector in În produs on desktop, as a panel at 768 and as a page under 768", () => {
    const css = read("catalog-v2-inspector.css");
    expect(css).toContain(".catv2-sheet__aside:has(.catv2-inspector) { grid-template-columns: minmax(0, 1fr); }");
    expect(css).toContain("@media (max-width: 1023px)");
    expect(css).toContain("width: min(360px, 100%)");
    expect(css).toContain("@media (max-width: 767px)");
    expect(css).toContain(".catv2-sheet[data-inspector=\"full\"] .catv2-sheet__body { display: none; }");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("tr[data-selected=\"true\"]");
  });

  function stubPhone() {
    stubPhoneLayout();
  }

  it("orders the phone bar as library, product switch, then the name with its rename", async () => {
    stubPhone();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    const title = await screen.findByRole("heading", { level: 1, name: "Litere test" });
    const back = screen.getByRole("link", { name: "Bibliotecă de produse" });
    const change = screen.getByRole("button", { name: "Schimbă produsul" });
    const edit = screen.getByRole("button", { name: "Editează denumirea" });
    const follows = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(back, change)).toBe(true);
    expect(follows(change, title)).toBe(true);
    expect(follows(title, edit)).toBe(true);
    expect(back).toHaveAttribute("href", "/catalog");

    await userEvent.click(edit);
    expect(screen.getByLabelText("Denumirea produsului")).toHaveValue("Litere test");
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schimbă produsul" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Renunță" }));
    expect(screen.getByRole("heading", { level: 1, name: "Litere test" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method && init.method !== "GET")).toBe(false);
  });

  it("shows no rename on the phone bar without the right, and keeps the switch and the way back", async () => {
    stubPhone();
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    vi.stubGlobal("fetch", routeFetch(capabilities({ canEdit: false })));
    render(<CatalogPage />);
    expect(await screen.findByText("Doar consultare")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editează denumirea" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Schimbă produsul" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bibliotecă de produse" })).toBeInTheDocument();
  });

  it("lays a variant out as one record on a phone and keeps the table above", () => {
    const css = read("catalog-v2-variants.css");
    const wide = css.slice(0, css.indexOf("@media (max-width: 767px)"));
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(wide).not.toContain("grid-template-areas");
    expect(phone).toContain("grid-template-areas: \"name state\" \"options options\" \"actions actions\";");
    expect(phone).toContain(".catv2-variants__actions:empty { display: none; }");
    expect(phone).toContain("min-height: 44px");
    const frame = read("catalog-v2.css");
    expect(frame).toContain(".catv2-bar__edit {");
    expect(frame).not.toContain("position: absolute;\n    top: 3px;");
  });

  it("replaces the graph with the step list below 1024 and keeps the library one list", () => {
    const graph = read("catalog-process-graph.css");
    const narrow = graph.slice(graph.indexOf("@media (max-width: 1023px)"));
    expect(graph).toContain(".process-graph__text-list { display: none; }");
    expect(narrow).toContain(".process-graph__stage, .process-graph__zoom, .process-graph__modes { display: none; }");
    expect(narrow).toContain(".process-graph__text-list { display: grid;");
    const library = read("catalog-v2-library.css");
    expect(library).toContain("position: sticky");
    expect(library).toContain(".catv2-library__table thead { display: none; }");
  });
});

describe("Catalog · integritate față de dosarul anterior", () => {
  it("keeps the calculation basis of a component type, closed by default, and never a tariff or a row editor", async () => {
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=FACE");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    const basis = (await screen.findByText("Cum se calculează")).closest("details");
    expect(basis).not.toHaveAttribute("open");
    expect(within(basis as HTMLElement).getByText("Arie")).toBeInTheDocument();
    expect(within(basis as HTMLElement).getByText("Confirmată în lucrare")).toBeInTheDocument();
    expect(screen.queryByText(/3,20/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Editează$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Salvează/ })).not.toBeInTheDocument();
  });

  it("says which request field is optional on the work", async () => {
    const base = capabilities().products[0].elements[0];
    const elements = [
      {
        ...base,
        id: "PRD-TEST:request:back.supportKind",
        label: "Suport constructiv",
        fieldType: "select",
        componentId: "BACK",
        required: true,
        conditions: [{ kind: "fieldEquals", fieldId: "constructive.mountingContext", value: "letters_on_acm_panel" }],
        options: [{ value: "PANEL", label: "Panou", support: "SCHEMA_SELECTABLE", technologicalCondition: null }],
      },
      { ...base, id: "PRD-TEST:request:back.profile", label: "Prelucrare spate", componentId: "BACK", required: false },
    ];
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=BACK");
    vi.stubGlobal("fetch", routeFetch(capabilities({ elements })));
    render(<CatalogPage />);
    expect(await screen.findByRole("rowheader", { name: /Prelucrare spate/ })).toHaveTextContent("Opțional pe lucrare");
    expect(screen.getByRole("rowheader", { name: /Suport constructiv/ })).not.toHaveTextContent("Opțional");
    const support = screen.getByRole("rowheader", { name: /Suport constructiv/ }).closest("tr") as HTMLElement;
    expect(within(support).getByText("Are o condiție care nu poate fi descrisă aici")).toBeInTheDocument();
    expect(within(support).queryByText("Întotdeauna")).not.toBeInTheDocument();
    const profile = screen.getByRole("rowheader", { name: /Prelucrare spate/ }).closest("tr") as HTMLElement;
    expect(within(profile).getByText("Întotdeauna")).toBeInTheDocument();
  });


  it("marks only the unconfirmed value when the organization confirmed the others", async () => {
    const body = capabilities();
    const setting = body.products[0].elements.find((element) => element.classification === "ORGANIZATION_SETTING") as Record<string, unknown>;
    const organization = setting.organization as Record<string, unknown>;
    const elements = [
      { ...setting, id: "PRD-TEST:setting:a", settingId: "a", label: "Setare confirmată", organization: { ...organization, organizationConfirmed: true } },
      { ...setting, id: "PRD-TEST:setting:b", settingId: "b", label: "Setare de pornire" },
    ];
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST&component=LIGHTING");
    vi.stubGlobal("fetch", routeFetch({ ...body, products: [{ ...body.products[0], elements }] }));
    render(<CatalogPage />);
    const pending = (await screen.findByRole("rowheader", { name: "Setare de pornire" })).closest("tr") as HTMLElement;
    expect(within(pending).getByText("Neconfirmată de organizație")).toBeInTheDocument();
    expect(screen.getAllByText("Neconfirmată de organizație")).toHaveLength(1);
    expect(screen.queryByText("Valorile nu sunt încă confirmate de organizație.")).not.toBeInTheDocument();
  });

  it("finds a product by its description, as the previous library did", async () => {
    window.history.replaceState({}, "", "/catalog");
    vi.stubGlobal("fetch", routeFetch());
    render(<CatalogPage />);
    await userEvent.type(await screen.findByRole("searchbox", { name: "Caută în bibliotecă" }), "constructie luminoasa");
    expect(screen.getByRole("link", { name: "Litere test" })).toBeInTheDocument();
  });

  it("does not reopen the rename form on another view when a save fails after leaving", async () => {
    let fail: (() => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        return new Promise<Awaited<ReturnType<typeof json>>>((resolve) => {
          fail = () => resolve({ ok: false, status: 500, json: async () => ({}) });
        });
      }
      return routeFetch()(input, init);
    });
    window.history.replaceState({}, "", "/catalog?product=PRD-TEST");
    vi.stubGlobal("fetch", fetchMock);
    render(<CatalogPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Editează denumirea" }));
    await userEvent.type(screen.getByLabelText("Denumirea produsului"), " nou");
    await userEvent.click(screen.getByRole("button", { name: "Salvează denumirea" }));
    await userEvent.click(screen.getAllByRole("link", { name: /^Spate/ })[0]);
    expect(await screen.findByRole("heading", { level: 2, name: "Spate" })).toBeInTheDocument();
    expect(fail).not.toBeNull();
    (fail as unknown as () => void)();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByLabelText("Denumirea produsului")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("isolates organization state between two libraries", async () => {
    window.history.replaceState({}, "", "/catalog");
    vi.stubGlobal("fetch", routeFetch(capabilities({ code: "PRD-ACM", label: "Panou ACM casetat" }), { ...definitions, products: [] }));
    const first = render(<CatalogPage />);
    expect(await screen.findByRole("link", { name: "Panou ACM casetat" })).toBeInTheDocument();
    first.unmount();
    resetResourceCache();
    vi.stubGlobal("fetch", routeFetch(capabilities({ label: "Logo organizația B", enabled: false, code: "PRD-LOGO" })));
    render(<CatalogPage />);
    expect(await screen.findByRole("link", { name: "Logo organizația B" })).toBeInTheDocument();
    expect(screen.getAllByText("Nu este oferit pentru lucrări noi")).not.toHaveLength(0);
    expect(screen.queryByText("Panou ACM casetat")).not.toBeInTheDocument();
  });
});
