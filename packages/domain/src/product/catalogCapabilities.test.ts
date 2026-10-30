import { describe, expect, it } from "vitest";
import { OPERATIONAL_PROCESS_GRAPH_WRITE_STATE } from "../processes/writeState.js";
import { projectOperationalProcessesAdministration } from "../processes/projection.js";
import { ACM_DEVELOPED_SHEET_AREA } from "./acmCassetteBody.js";
import { forexBackChannelRecipe } from "./backManufacturing.js";
import {
  projectCatalogCapabilities,
  type CatalogCapabilityElement,
  type CatalogCapabilitiesManifest,
  type CatalogCapabilityProjectionInput,
} from "./catalogCapabilities.js";
import { seededDisplayLabelCatalog } from "./displayMetadata.js";
import {
  FORMULAS_INACTIVE,
  resolveOrganizationFormulas,
} from "./resolveFormulas.js";
import {
  createPlatformStarterFormulaVersions,
  persistedFormulaVersionFromRecord,
} from "./formulaVersion.js";
import { formulaDefinitionsForType } from "./formulaDefinition.js";
import { ACM_CASSETTE_NONE_PRODUCT_CODE } from "./acmCassetteNone.js";
import { CANONICAL_PRODUCT_CODE } from "./frontlitPlexiAl06.js";
import { LOGO_PRODUCT_CODE } from "./logoFrontlitPlexiAl06.js";
import {
  INACTIVE_PRODUCT_ENABLEMENT,
  ORGANIZATION_ENABLEMENT_GUIDANCE,
  codeDefaultProductEnablement,
  productEnablementEntries,
  type ProductEnablementResolution,
} from "./productEnablement.js";
import { getFormSchemaForTemplate, getProductTemplate, productTemplates } from "./productRegistry.js";
import {
  TECHNICAL_SETTINGS_INACTIVE,
  resolveOrganizationTechnicalSettings,
} from "./resolveTechnicalSettings.js";
import { technicalSettingDefinitionsForTemplate } from "./technicalSettings.js";
import { createPlatformStarterTechnicalSettingVersions } from "./technicalSettingVersion.js";

const NOW = "2026-10-29T00:00:00.000Z";

const FINANCIAL_KEY = /price|cost|amount|currency|margin|eic/i;

function inactiveInput(
  overrides: Partial<CatalogCapabilityProjectionInput> = {},
): CatalogCapabilityProjectionInput {
  return {
    enablement: codeDefaultProductEnablement(),
    technicalSettings: {
      ok: false,
      error: TECHNICAL_SETTINGS_INACTIVE,
      reason: "inactive",
      history: [],
    },
    formulas: {
      ok: false,
      error: FORMULAS_INACTIVE,
      reason: "inactive",
      history: [],
    },
    labels: seededDisplayLabelCatalog(),
    canEditOrganizationConfiguration: false,
    ...overrides,
  };
}

function project(
  overrides: Partial<CatalogCapabilityProjectionInput> = {},
): CatalogCapabilitiesManifest {
  return projectCatalogCapabilities(inactiveInput(overrides));
}

function product(manifest: CatalogCapabilitiesManifest, code: string) {
  const found = manifest.products.find((item) => item.templateCode === code);
  expect(found).toBeDefined();
  return found!;
}

function element(
  elements: readonly CatalogCapabilityElement[],
  idSuffix: string,
): CatalogCapabilityElement {
  const found = elements.find((item) => item.id.endsWith(idSuffix));
  expect(found, idSuffix).toBeDefined();
  return found!;
}

function financialKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      financialKeys(item, found);
    }
    return found;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key !== "canViewFinancialAmounts" && FINANCIAL_KEY.test(key)) {
        found.push(key);
      }
      financialKeys(child, found);
    }
  }
  return found;
}

describe("catalog capabilities v1", () => {
  it("projects the registry products as a read-only versioned manifest", () => {
    const input = inactiveInput();
    const before = JSON.stringify(input);
    const manifest = projectCatalogCapabilities(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(manifest.schemaVersion).toBe("catalog-capabilities.v1");
    expect(manifest.readOnly).toBe(true);
    expect(manifest.mutatesConfiguration).toBe(false);
    expect(manifest.permissions.canViewFinancialAmounts).toBe(false);
    expect(manifest.permissions.canEditEnablement).toBe(false);
    expect(manifest.products.map((item) => item.templateCode)).toEqual(
      productTemplates.map((item) => item.code),
    );
    expect(JSON.stringify(manifest)).not.toContain("templateStatus");
    expect(JSON.stringify(manifest)).not.toContain("PILOT");
    expect(JSON.stringify(manifest)).not.toContain("productionReady");
    expect(financialKeys(manifest)).toEqual([]);
    expect(projectOperationalProcessesAdministration().writeState).toBe(
      OPERATIONAL_PROCESS_GRAPH_WRITE_STATE,
    );
    expect(
      manifest.platformGaps.some(
        (item) => item.id === "platform:unsupported:process-graph-editor",
      ),
    ).toBe(OPERATIONAL_PROCESS_GRAPH_WRITE_STATE === "NOT_IMPLEMENTED");
    expect(
      manifest.platformGaps.find(
        (item) => item.id === "platform:unsupported:organization-product-preset",
      )?.canonicalWriter,
    ).toBeNull();
  });

  it("classifies letters, logo and ACM from the existing templates and schemas", () => {
    const manifest = project();
    const lettersTemplate = getProductTemplate(CANONICAL_PRODUCT_CODE);
    const logoTemplate = getProductTemplate(LOGO_PRODUCT_CODE);
    const acmTemplate = getProductTemplate(ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(lettersTemplate?.version).toBe("1");
    expect(logoTemplate?.version).toBe("1");
    expect(acmTemplate?.version).toBe("2");

    const letters = product(manifest, CANONICAL_PRODUCT_CODE);
    expect(letters.templateVersion).toBe(lettersTemplate?.version);
    expect(letters.presetContract.persistence).toBe("ORGANIZATION_VERSIONED");
    expect(letters.presetContract.canonicalWriter).toEqual({
      method: "POST",
      path: "/api/catalog/presets",
      permission: "owner",
    });
    expect(letters.presetContract.eligibleFields.map((field) => field.fieldId)).toContain("volume.depthMm");
    expect(letters.presetContract.eligibleFields.map((field) => field.fieldId)).not.toContain("root.inscription");
    expect(letters.components.map((item) => item.typeId)).toEqual([
      "PLEXIGLAS_FACE",
      "ALUMINIUM_VOLUME",
      "FOREX_BACK",
      "LIGHTING_FRONT_LED",
    ]);
    const faceMaterial = element(letters.elements, ":fixed:face.materialFamily");
    const faceThickness = element(letters.elements, ":fixed:face.thicknessMm");
    const faceOptical = element(letters.elements, ":fixed:face.opticalType");
    const volumeMaterial = element(letters.elements, ":fixed:volume.materialFamily");
    const volumeThickness = element(letters.elements, ":fixed:volume.thicknessMm");
    const backMaterial = element(letters.elements, ":fixed:back.materialFamily");
    const backThickness = element(letters.elements, ":fixed:back.thicknessMm");
    const lighting = element(letters.elements, ":fixed:lighting.mode");
    expect(faceMaterial).toMatchObject({
      classification: "PLATFORM_FIXED",
      value: "plexiglas",
    });
    expect(faceThickness).toMatchObject({ classification: "PLATFORM_FIXED", value: 3 });
    expect(faceOptical).toMatchObject({ classification: "PLATFORM_FIXED", value: "opal" });
    expect(volumeMaterial).toMatchObject({
      classification: "PLATFORM_FIXED",
      value: "aluminium",
    });
    expect(volumeThickness).toMatchObject({ classification: "PLATFORM_FIXED", value: 0.6 });
    expect(backMaterial).toMatchObject({ classification: "PLATFORM_FIXED", value: "forex" });
    expect(backThickness).toMatchObject({ classification: "PLATFORM_FIXED", value: 10 });
    expect(lighting).toMatchObject({ classification: "PLATFORM_FIXED", value: "front_lit" });
    expect(element(letters.elements, ":identity:face.material")).toMatchObject({
      classification: "PLATFORM_FIXED",
      value: "Plexiglas 3 mm opal",
    });
    expect(element(letters.elements, ":identity:back.material")).toMatchObject({
      value: "Forex 10 mm",
    });
    expect(element(letters.elements, ":identity:lighting")).toMatchObject({
      value: "Iluminare frontală",
    });

    const lettersSchema = getFormSchemaForTemplate(CANONICAL_PRODUCT_CODE);
    const depth = element(letters.elements, ":request:volume.depthMm");
    expect(depth.classification).toBe("REQUEST_FACT");
    if (depth.classification === "REQUEST_FACT") {
      expect(depth.options.map((option) => option.value)).toEqual(
        lettersSchema?.sections
          .flatMap((section) => section.fields)
          .find((field) => field.id === "volume.depthMm")
          ?.options?.map((option) => option.value),
      );
    }
    const faceColor = element(letters.elements, ":request:face.color");
    expect(faceColor).toMatchObject({
      classification: "REQUEST_FACT",
      conditions: [{ kind: "fieldEquals", fieldId: "face.finish", value: "vinyl" }],
    });
    const profile = element(letters.elements, ":request:back.profile");
    expect(profile.classification).toBe("REQUEST_FACT");
    if (profile.classification === "REQUEST_FACT") {
      const grooved = profile.options.find((option) => option.value === "GROOVED");
      const flat = profile.options.find((option) => option.value === "FLAT");
      expect(flat?.support).toBe("SCHEMA_SELECTABLE");
      expect(flat?.technologicalCondition).toBeNull();
      expect(grooved?.support).toBe(forexBackChannelRecipe() ? "SCHEMA_SELECTABLE" : "NOT_PREPARED");
      if (!forexBackChannelRecipe()) {
        expect(grooved?.technologicalCondition?.classification).toBe("UNSUPPORTED_OR_FUTURE");
        expect(grooved?.technologicalCondition?.code).toBe("groove_recipe_missing");
      }
    }
    expect(letters.elements.some((item) => item.id.endsWith(":unsupported:back.profile:GROOVED"))).toBe(
      !forexBackChannelRecipe(),
    );

    const logo = product(manifest, LOGO_PRODUCT_CODE);
    expect(logo.components.map((item) => item.typeId)).toEqual(letters.components.map((item) => item.typeId));
    expect(logo.componentsWithoutRequestSection).toEqual(["BACK", "LIGHTING"]);
    expect(logo.elements.some((item) => item.id.includes("back.profile"))).toBe(false);
    expect(logo.elements.some((item) => item.id.includes("back.supportKind"))).toBe(false);
    expect(element(logo.elements, ":request:root.inscription")).toMatchObject({
      classification: "REQUEST_FACT",
      label: "Denumire logo",
    });
    expect(element(logo.elements, ":request:face.confirmedAreaMm2").classification).toBe(
      "REQUEST_FACT",
    );
    expect(logo.enablement).toMatchObject({
      classification: "ORGANIZATION_ENABLEMENT",
      enabledForNewWork: false,
      source: "CODE_DEFAULT",
      version: null,
    });

    const acm = product(manifest, ACM_CASSETTE_NONE_PRODUCT_CODE);
    expect(acm.templateVersion).toBe("2");
    expect(acm.components.map((item) => [item.id, item.typeId])).toEqual([
      ["FACE", "ACM_CASSETTE_BODY"],
      ["BACK", "STEEL_INTERNAL_FRAME"],
    ]);
    expect(acm.components.some((item) => item.role === "LIGHTING")).toBe(false);
    expect(element(acm.elements, ":fixed:face.materialFamily")).toMatchObject({
      value: "acm",
    });
    expect(element(acm.elements, ":fixed:face.thicknessMm")).toMatchObject({ value: 3 });
    expect(element(acm.elements, ":identity:back.material")).toMatchObject({
      value: "Profil oțel",
    });
    expect(element(acm.elements, ":identity:lighting")).toMatchObject({
      value: "Fără iluminare",
    });
    const width = element(acm.elements, ":request:face.widthMm");
    const height = element(acm.elements, ":request:face.heightMm");
    const depthMm = element(acm.elements, ":request:face.cassetteDepthMm");
    const backReturn = element(acm.elements, ":request:face.backReturnMm");
    expect([width, height, depthMm, backReturn].map((item) => item.classification)).toEqual([
      "REQUEST_FACT",
      "REQUEST_FACT",
      "REQUEST_FACT",
      "REQUEST_FACT",
    ]);
    const boundary = element(acm.elements, `:boundary:${ACM_DEVELOPED_SHEET_AREA.id}`);
    expect(boundary).toMatchObject({
      classification: "PLATFORM_FIXED",
      nesting: false,
    });
    expect(acm.elements.some((item) => item.id.includes("LIGHTING"))).toBe(false);
    expect(letters.enablement.enabledForNewWork).toBe(true);
    expect(acm.enablement.enabledForNewWork).toBe(true);
  });

  it("keeps technical settings and formulas on their component writers without starter values when unresolved", () => {
    const manifest = project();
    const letters = product(manifest, CANONICAL_PRODUCT_CODE);
    const logo = product(manifest, LOGO_PRODUCT_CODE);
    const acm = product(manifest, ACM_CASSETTE_NONE_PRODUCT_CODE);
    const letterSettings = technicalSettingDefinitionsForTemplate(
      getProductTemplate(CANONICAL_PRODUCT_CODE)!,
    );
    expect(letterSettings.map((item) => item.id)).toEqual([
      "ledPitchMm",
      "ledModulePowerW",
      "psuReservePercent",
    ]);
    for (const definition of letterSettings) {
      const projected = element(letters.elements, `:setting:LIGHTING_FRONT_LED.${definition.id}`);
      expect(projected.classification).toBe("ORGANIZATION_SETTING");
      if (projected.classification === "ORGANIZATION_SETTING") {
        expect(projected.organization.value).toBeNull();
        expect(projected.organization.organizationConfirmed).toBe(false);
        expect(projected.organization.error).toBe(TECHNICAL_SETTINGS_INACTIVE);
        expect(projected.canonicalWriter).toEqual({
          method: "POST",
          path: "/api/admin/technical-settings",
          permission: "owner",
        });
        expect(projected.componentTypeId).toBe("LIGHTING_FRONT_LED");
      }
    }
    expect(logo.elements.filter((item) => item.classification === "ORGANIZATION_FORMULA").map((item) => item.id)).toEqual(
      letters.elements.filter((item) => item.classification === "ORGANIZATION_FORMULA").map((item) => item.id).map((id) => id.replace(CANONICAL_PRODUCT_CODE, LOGO_PRODUCT_CODE)),
    );
    const formulas = formulaDefinitionsForType("LIGHTING_FRONT_LED");
    expect(formulas).toHaveLength(3);
    for (const definition of formulas) {
      const projected = element(letters.elements, `:formula:${definition.formulaId}`);
      expect(projected.classification).toBe("ORGANIZATION_FORMULA");
      expect(projected).not.toHaveProperty("expression");
      if (projected.classification === "ORGANIZATION_FORMULA") {
        expect(projected.allowedReferences).toEqual(definition.allowedReferences);
        expect(projected.canonicalWriter?.path).toBe("/api/admin/formulas");
        expect(projected.organization.resolved).toBe(false);
      }
    }
    expect(acm.elements.some((item) => item.id.includes("ledPitchMm"))).toBe(false);
    const clearance = element(acm.elements, ":setting:STEEL_INTERNAL_FRAME.frameClearanceMm");
    expect(clearance).toMatchObject({
      classification: "ORGANIZATION_SETTING",
      componentTypeId: "STEEL_INTERNAL_FRAME",
    });
    expect(JSON.stringify(manifest)).not.toContain("CEIL");
  });

  it("reports starter versions as platform starters and isolates organization enablement", () => {
    const technicalSettings = resolveOrganizationTechnicalSettings(
      createPlatformStarterTechnicalSettingVersions({
        now: NOW,
        rowIdFor: (definitionId) => `tsv:${definitionId}`,
      }),
    );
    const formulas = resolveOrganizationFormulas(
      createPlatformStarterFormulaVersions({
        now: NOW,
        rowIdFor: (formulaId) => `fv:${formulaId}`,
      }).map(persistedFormulaVersionFromRecord),
    );
    expect(technicalSettings.ok).toBe(true);
    expect(formulas.ok).toBe(true);
    const manifest = project({ technicalSettings, formulas });
    const pitch = element(
      product(manifest, CANONICAL_PRODUCT_CODE).elements,
      ":setting:LIGHTING_FRONT_LED.ledPitchMm",
    );
    expect(pitch.classification).toBe("ORGANIZATION_SETTING");
    if (pitch.classification === "ORGANIZATION_SETTING") {
      expect(pitch.organization.source).toBe("PLATFORM_STARTER");
      expect(pitch.organization.organizationConfirmed).toBe(false);
      expect(pitch.organization.resolved).toBe(true);
      expect(technicalSettings.ok && pitch.organization.value).toBe(
        technicalSettings.ok
          ? technicalSettings.settings.find((item) => item.settingId === "ledPitchMm")?.value
          : null,
      );
    }

    const orgA = organizationEnablement([CANONICAL_PRODUCT_CODE], 4);
    const orgB = organizationEnablement(
      [ACM_CASSETTE_NONE_PRODUCT_CODE, LOGO_PRODUCT_CODE],
      7,
    );
    const manifestA = project({ enablement: orgA, canEditOrganizationConfiguration: true });
    const manifestB = project({ enablement: orgB, canEditOrganizationConfiguration: false });
    expect(product(manifestA, CANONICAL_PRODUCT_CODE).enablement.enabledForNewWork).toBe(true);
    expect(product(manifestA, LOGO_PRODUCT_CODE).enablement.enabledForNewWork).toBe(false);
    expect(product(manifestA, ACM_CASSETTE_NONE_PRODUCT_CODE).enablement.enabledForNewWork).toBe(
      false,
    );
    expect(product(manifestB, CANONICAL_PRODUCT_CODE).enablement.enabledForNewWork).toBe(false);
    expect(product(manifestB, LOGO_PRODUCT_CODE).enablement.enabledForNewWork).toBe(true);
    expect(product(manifestB, ACM_CASSETTE_NONE_PRODUCT_CODE).enablement.enabledForNewWork).toBe(
      true,
    );
    expect(product(manifestA, LOGO_PRODUCT_CODE).enablement.version).toBe(4);
    expect(product(manifestB, LOGO_PRODUCT_CODE).enablement.version).toBe(7);
    expect(manifestA.permissions.canEditEnablement).toBe(true);
    expect(manifestB.permissions.canEditEnablement).toBe(false);
    expect(product(manifestA, LOGO_PRODUCT_CODE).inPlatformLibrary).toBe(true);
  });

  it("fail-closes inactive enablement instead of falling back to the platform default", () => {
    const inactive: ProductEnablementResolution = {
      ok: false,
      error: INACTIVE_PRODUCT_ENABLEMENT,
      reason: "inactive",
      history: [],
    };
    const manifest = project({ enablement: inactive });
    for (const item of manifest.products) {
      expect(item.enablement.enabledForNewWork).toBeNull();
      expect(item.enablement.support).toBe("NOT_PREPARED");
      expect(item.enablement.error).toBe(INACTIVE_PRODUCT_ENABLEMENT);
      expect(item.inPlatformLibrary).toBe(true);
    }
    expect(product(manifest, CANONICAL_PRODUCT_CODE).enablement.enabledForNewWork).not.toBe(true);
  });
});

function organizationEnablement(
  enabledTemplateCodes: readonly string[],
  version: number,
): ProductEnablementResolution {
  return {
    ok: true,
    source: "ORGANIZATION",
    version,
    enabledTemplateCodes,
    entries: productEnablementEntries(enabledTemplateCodes),
    guidance: ORGANIZATION_ENABLEMENT_GUIDANCE,
  };
}
