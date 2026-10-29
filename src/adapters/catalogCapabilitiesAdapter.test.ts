import { describe, expect, it } from "vitest";
import { presentCatalogCapabilities } from "./catalogCapabilitiesAdapter";

function manifest(products: unknown[], permissions?: Record<string, unknown>) {
  return {
    schemaVersion: "catalog-capabilities.v1",
    readOnly: true,
    mutatesConfiguration: false,
    permissions: {
      canRead: true,
      canEditEnablement: false,
      canEditTechnicalSettings: false,
      canEditFormulas: false,
      canEditDisplayLabels: false,
      canViewFinancialAmounts: false,
      ...permissions,
    },
    products,
    platformGaps: [
      {
        id: "platform:unsupported:organization-product-preset",
        classification: "UNSUPPORTED_OR_FUTURE",
        label: "Preset de produs al organizației",
        reason: "Nu există un writer canonic pentru preseturi salvate de organizație.",
        provenance: { source: "ABSENT_WRITER", ref: "organization-product-preset" },
        support: "NOT_PREPARED",
        componentId: null,
        componentTypeId: null,
        canonicalWriter: null,
        readPath: null,
      },
    ],
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    templateCode: "PRD-LETTERS",
    templateVersion: "1",
    label: "Litere volumetrice",
    displayRevision: 3,
    familyId: "SIGNS",
    categoryId: "LETTERS",
    formSchemaId: "letters-form",
    inPlatformLibrary: true,
    components: [
      { id: "FACE", role: "FACE", typeId: "PLEXIGLAS_FACE", label: "Față", required: true, inputMapping: null },
      { id: "BACK", role: "BACK", typeId: "FOREX_BACK", label: "Spate", required: true, inputMapping: { confirmedAreaMm2FromComponentId: "FACE" } },
      { id: "LIGHTING", role: "LIGHTING", typeId: "LIGHTING_FRONT_LED", label: "Electrică / iluminare", required: true, inputMapping: null },
    ],
    componentsWithoutRequestSection: ["LIGHTING"],
    enablement: {
      id: "PRD-LETTERS:enablement",
      classification: "ORGANIZATION_ENABLEMENT",
      label: "Activare pentru lucrări noi",
      provenance: { source: "PRODUCT_ENABLEMENT", ref: "CODE_DEFAULT" },
      support: "ORGANIZATION_VERSIONED",
      enabledForNewWork: true,
      source: "CODE_DEFAULT",
      version: null,
      error: null,
      canonicalWriter: { method: "POST", path: "/api/admin/product-enablement", permission: "owner" },
      readPath: "/api/admin/product-enablement",
    },
    administration: [],
    elements: [
      {
        id: "PRD-LETTERS:fixed:lighting.mode",
        classification: "PLATFORM_FIXED",
        label: "Tehnologie",
        value: "front_lit",
        nesting: null,
        provenance: { source: "FIXED_VALUE", ref: "lighting.mode" },
        support: "DECLARED",
        componentId: "LIGHTING",
        componentTypeId: "LIGHTING_FRONT_LED",
        canonicalWriter: null,
        readPath: null,
      },
      {
        id: "PRD-LETTERS:fixed:face.thicknessMm",
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
      },
      {
        id: "PRD-LETTERS:request:face.finish",
        classification: "REQUEST_FACT",
        label: "Finisaj față",
        fieldType: "select",
        required: true,
        conditions: [],
        options: [
          { value: "none", label: "Fără finisaj", support: "SCHEMA_SELECTABLE", technologicalCondition: null },
          { value: "vinyl", label: "Colantat", support: "SCHEMA_SELECTABLE", technologicalCondition: null },
        ],
        provenance: { source: "FORM_SCHEMA", ref: "face.finish" },
        support: "SCHEMA_SELECTABLE",
        componentId: "FACE",
        componentTypeId: "PLEXIGLAS_FACE",
        canonicalWriter: null,
        readPath: null,
      },
      {
        id: "PRD-LETTERS:request:face.color",
        classification: "REQUEST_FACT",
        label: "Culoare față",
        fieldType: "text",
        required: false,
        conditions: [{ kind: "fieldEquals", fieldId: "face.finish", value: "vinyl" }],
        options: [],
        provenance: { source: "FORM_SCHEMA", ref: "face.color" },
        support: "SCHEMA_SELECTABLE",
        componentId: "FACE",
        componentTypeId: "PLEXIGLAS_FACE",
        canonicalWriter: null,
        readPath: null,
      },
      {
        id: "PRD-LETTERS:request:back.profile",
        classification: "REQUEST_FACT",
        label: "Prelucrare spate",
        fieldType: "select",
        required: false,
        conditions: [],
        options: [
          { value: "FLAT", label: "Fără canal", support: "SCHEMA_SELECTABLE", technologicalCondition: null },
          {
            value: "GROOVED",
            label: "Cu canal",
            support: "NOT_PREPARED",
            technologicalCondition: { classification: "UNSUPPORTED_OR_FUTURE", code: "groove_recipe_missing", provenance: { source: "BACK_MANUFACTURING", ref: "forex-back-channel" } },
          },
        ],
        provenance: { source: "FORM_SCHEMA", ref: "back.profile" },
        support: "SCHEMA_SELECTABLE",
        componentId: "BACK",
        componentTypeId: "FOREX_BACK",
        canonicalWriter: null,
        readPath: null,
      },
      {
        id: "PRD-LETTERS:setting:ledPitchMm",
        classification: "ORGANIZATION_SETTING",
        label: "Pas module LED",
        settingId: "ledPitchMm",
        unit: "mm",
        appliesToTemplateCodes: ["PRD-LETTERS", "PRD-LOGO"],
        organization: { resolved: true, version: 1, source: "PLATFORM_STARTER", sourceLabel: "Valoare de pornire", organizationConfirmed: false, error: null, value: 100 },
        provenance: { source: "TECHNICAL_SETTING_DEFINITION", ref: "ledPitchMm" },
        support: "ORGANIZATION_VERSIONED",
        componentId: "LIGHTING",
        componentTypeId: "LIGHTING_FRONT_LED",
        canonicalWriter: { method: "POST", path: "/api/admin/technical-settings", permission: "owner" },
        readPath: "/api/admin/technical-settings",
      },
      {
        id: "PRD-LETTERS:boundary:developed-sheet",
        classification: "PLATFORM_FIXED",
        label: "Foaie dezvoltată (implicit, nu nesting)",
        value: null,
        nesting: false,
        provenance: { source: "COMPONENT_RESULT_BOUNDARY", ref: "developed-sheet" },
        support: "DECLARED",
        componentId: "FACE",
        componentTypeId: "ACM_CASSETTE_BODY",
        canonicalWriter: null,
        readPath: null,
      },
    ],
    ...overrides,
  };
}

describe("catalog capabilities presentation", () => {
  it("fails closed on a mismatched or financial payload", () => {
    expect(presentCatalogCapabilities({ schemaVersion: "other" })).toBeNull();
    expect(presentCatalogCapabilities(manifest([product()], { canViewFinancialAmounts: true }))).toBeNull();
    expect(presentCatalogCapabilities(manifest([{ ...product(), elements: [{ id: "x" }] }]))).toBeNull();
  });

  it("keeps operator labels and the real component relationships", () => {
    const logo = product({
      templateCode: "PRD-LOGO",
      label: "Logo volumetric",
      componentsWithoutRequestSection: ["BACK", "LIGHTING"],
      enablement: { ...product().enablement, enabledForNewWork: false, source: "CODE_DEFAULT" },
      elements: product().elements.filter((item) => !String(item.id).includes("back.profile")),
    });
    const view = presentCatalogCapabilities(manifest([product(), logo]));
    expect(view?.permissions).toEqual({
      canEditEnablement: false,
      canEditTechnicalSettings: false,
      canEditFormulas: false,
      canEditDisplayLabels: false,
    });
    const letters = view?.products[0];
    const face = letters?.components.find((item) => item.id === "FACE");
    const back = letters?.components.find((item) => item.id === "BACK");
    const lighting = letters?.components.find((item) => item.id === "LIGHTING");
    expect(face?.relationships).toEqual(["Spate preia suprafața confirmată din această componentă."]);
    expect(back?.relationships).toEqual(["Suprafața confirmată este preluată din Față."]);
    expect(lighting?.requestGap).toBe("Nu are câmpuri de completat pe lucrare.");
    expect(lighting?.properties.find((item) => item.label === "Tehnologie")?.value).toBe("Iluminare frontală");
    expect(JSON.stringify(lighting)).not.toContain("front_lit");
    expect(face?.properties.find((item) => item.label === "Grosime")?.value).toBe("3 mm");
    expect(face?.properties.find((item) => item.label === "Foaie dezvoltată (implicit, nu nesting)")?.value).toBe("Fără nesting");
    expect(face?.properties.find((item) => item.label === "Culoare față")?.notes).toContain("Apare când Finisaj față este Colantat.");
    const profile = back?.properties.find((item) => item.label === "Prelucrare spate");
    expect(profile?.options.map((option) => option.label)).toEqual(["Fără canal", "Cu canal"]);
    expect(profile?.options[1]?.note).toMatch(/fără pregătire tehnologică/i);
    const setting = lighting?.properties.find((item) => item.label === "Pas module LED");
    expect(setting?.value).toBe("100 mm");
    expect(setting?.notes).toEqual(expect.arrayContaining(["Valoare de pornire", "Nu este confirmată de organizație.", "Valoare comună, folosită și pentru Logo volumetric."]));
    expect(view?.products[1]?.enablementLabel).toBe("Nu este oferit pentru lucrări noi");
    expect(view?.products[1]?.components.find((item) => item.id === "BACK")?.requestGap).toBe("Nu are câmpuri de completat pe lucrare.");
    expect(view?.products[1]?.components.find((item) => item.id === "BACK")?.properties.some((item) => item.label === "Prelucrare spate")).toBe(false);
    expect(view?.platformLimits[0]?.label).toBe("Preset de produs al organizației");
    const visibleText = JSON.stringify(letters?.components.flatMap((item) => item.properties));
    expect(visibleText).not.toMatch(/front_lit|PLEXIGLAS_FACE|price|cost/);
  });

  it("does not add a lighting component that the payload does not contain", () => {
    const acm = product({
      templateCode: "PRD-ACM",
      label: "Panou ACM casetat",
      components: [
        { id: "FACE", role: "FACE", typeId: "ACM_CASSETTE_BODY", label: "Corp casetă ACM", required: true, inputMapping: null },
        { id: "BACK", role: "BACK", typeId: "STEEL_INTERNAL_FRAME", label: "Cadru intern", required: true, inputMapping: null },
      ],
      componentsWithoutRequestSection: ["BACK"],
      elements: [
        {
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
        },
      ],
    });
    const view = presentCatalogCapabilities(manifest([acm]));
    expect(view?.products[0]?.components.map((item) => item.label)).toEqual(["Corp casetă ACM", "Cadru intern"]);
    expect(view?.products[0]?.productFacts[0]).toMatchObject({ label: "Iluminare", value: "Fără iluminare" });
    expect(view?.products[0]?.components.find((item) => item.id === "BACK")?.relationships).toEqual([]);
  });

  it("reports unknown enablement without a boolean guess", () => {
    const inactive = product({
      enablement: { ...product().enablement, enabledForNewWork: null, support: "NOT_PREPARED", error: "PRODUCT_ENABLEMENT_INACTIVE" },
    });
    const view = presentCatalogCapabilities(manifest([inactive]));
    expect(view?.products[0]?.enablementLabel).toBe("Activarea nu este cunoscută");
    expect(view?.products[0]?.enablementTone).toBe("unknown");
    expect(JSON.stringify(view)).not.toContain("PRODUCT_ENABLEMENT_INACTIVE");
  });
});
