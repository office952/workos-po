import { describe, expect, it } from "vitest";
import { presentCatalogCapabilities } from "../../adapters/catalogCapabilitiesAdapter";
import { buildCatalogInspectorModel, requestAvailabilityLabel } from "./catalogPropertyInspector";

function manifest() {
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
    },
    platformGaps: [],
    products: [{
      templateCode: "PRD-LETTERS",
      templateVersion: "1",
      label: "Litere",
      displayRevision: 1,
      familyId: "SIGNS",
      categoryId: "LETTERS",
      formSchemaId: "form",
      inPlatformLibrary: true,
      components: [
        { id: "FACE", role: "FACE", typeId: "PLEXIGLAS_FACE", label: "Față", required: true, inputMapping: null },
        { id: "BACK", role: "BACK", typeId: "FOREX_BACK", label: "Spate", required: true, inputMapping: { confirmedAreaMm2FromComponentId: "FACE" } },
      ],
      componentsWithoutRequestSection: [],
      enablement: {
        id: "PRD-LETTERS:enablement",
        classification: "ORGANIZATION_ENABLEMENT",
        label: "Activare",
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
          required: true,
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
          id: "PRD-LETTERS:request:back.supportKind",
          classification: "REQUEST_FACT",
          label: "Suport constructiv",
          fieldType: "select",
          required: true,
          conditions: [{ kind: "fieldEquals", fieldId: "constructive.mountingContext", value: "on_panel" }],
          options: [{ value: "PANEL", label: "Panou", support: "SCHEMA_SELECTABLE", technologicalCondition: null }],
          provenance: { source: "FORM_SCHEMA", ref: "back.supportKind" },
          support: "SCHEMA_SELECTABLE",
          componentId: "BACK",
          componentTypeId: "FOREX_BACK",
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
      ],
    }],
  };
}

describe("catalog property inspector presentation", () => {
  it("distinguishes no condition, a known condition and an unexplained source", () => {
    const view = presentCatalogCapabilities(manifest());
    const face = view?.products[0]?.components.find((item) => item.id === "FACE");
    const back = view?.products[0]?.components.find((item) => item.id === "BACK");
    const finish = face?.properties.find((item) => item.label === "Finisaj față");
    const color = face?.properties.find((item) => item.label === "Culoare față");
    const support = back?.properties.find((item) => item.label === "Suport constructiv");
    expect(requestAvailabilityLabel(finish!)).toBe("Întotdeauna");
    expect(requestAvailabilityLabel(color!)).toBe("Apare când Finisaj față este Colantat.");
    expect(requestAvailabilityLabel(support!)).toBe("Are o condiție care nu poate fi descrisă aici");
  });

  it("joins a known dependent without inventing formula links", () => {
    const view = presentCatalogCapabilities(manifest());
    const product = view!.products[0];
    const face = product.components.find((item) => item.id === "FACE")!;
    const finish = face.properties.find((item) => item.label === "Finisaj față")!;
    const model = buildCatalogInspectorModel({
      item: finish,
      component: face,
      product,
      rows: product.components.map((component, index) => ({ id: component.id, index: index + 1 })),
      selection: { productCode: product.code, componentId: face.id, tab: "constructie" },
      permissions: view!.permissions,
      ownershipLabel: null,
      formula: { status: "idle" },
    });
    expect(model.sections.find((section) => section.id === "depends")?.lines[0]?.action).toEqual({
      kind: "show-property",
      propertyId: "PRD-LETTERS:request:face.color",
      label: "Arată Culoare față",
    });
    expect(model.sections.find((section) => section.id === "when")).toBeUndefined();
  });

  it("keeps no declared relationship, unavailable information and a confirmed link distinct", () => {
    const view = presentCatalogCapabilities(manifest());
    const product = view!.products[0];
    const face = product.components.find((item) => item.id === "FACE")!;
    const args = {
      component: face,
      product,
      rows: product.components.map((component, index) => ({ id: component.id, index: index + 1 })),
      selection: { productCode: product.code, componentId: face.id, tab: "constructie" as const },
      permissions: view!.permissions,
      ownershipLabel: null,
      formula: { status: "idle" as const },
    };
    const depends = (label: string) => buildCatalogInspectorModel({
      ...args,
      item: face.properties.find((item) => item.label === label)!,
    }).sections.find((section) => section.id === "depends")?.lines.map((line) => line.text);
    expect(depends("Finisaj față")?.[0]).toMatch(/^Culoare față\./);
    expect(depends("Culoare față")).toEqual(["Nicio legătură declarată."]);
    expect(depends("Grosime")).toEqual(["Informația nu este disponibilă aici."]);
  });
});
