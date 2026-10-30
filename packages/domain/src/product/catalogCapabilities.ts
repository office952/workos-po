import { OPERATIONAL_PROCESS_GRAPH_WRITE_STATE } from "../processes/writeState.js";
import { ACM_DEVELOPED_SHEET_AREA } from "./acmCassetteBody.js";
import {
  FOREX_BACK_CHANNEL_RECIPE_ID,
  forexBackChannelRecipe,
} from "./backManufacturing.js";
import { getComponentType, type ComponentTypeId } from "./componentTypes.js";
import { presentedTemplate, type DisplayLabelCatalog } from "./displayMetadata.js";
import {
  formulaDefinitionsForType,
  type FormulaDefinition,
  type FormulaReferenceAllowlist,
  type SupportedFormulaId,
} from "./formulaDefinition.js";
import { formulaSourceLabel } from "./formulaVersion.js";
import {
  type ProductEnablementResolution,
  type ProductEnablementSource,
} from "./productEnablement.js";
import { projectOrganizationPresetContract, type OrganizationPresetContract } from "./organizationPreset.js";
import { getFormSchema, productTemplates } from "./productRegistry.js";
import type { FormulaResolution } from "./resolveFormulas.js";
import type { TechnicalSettingResolution } from "./resolveTechnicalSettings.js";
import {
  technicalSettingDefinitionId,
  technicalSettingDefinitionsForTemplate,
  type TechnicalSettingUnit,
} from "./technicalSettings.js";
import { technicalSettingSourceLabel } from "./technicalSettingVersion.js";
import type {
  ComponentRole,
  DraftValue,
  FieldType,
  FormField,
  FormSchema,
  ProductComponent,
  ProductTemplate,
  VisibilityRule,
} from "./types.js";
export const CATALOG_CAPABILITIES_SCHEMA_VERSION = "catalog-capabilities.v1" as const;

export const CATALOG_CAPABILITY_CLASSES = [
  "PLATFORM_FIXED",
  "ORGANIZATION_SETTING",
  "ORGANIZATION_FORMULA",
  "ORGANIZATION_ENABLEMENT",
  "REQUEST_FACT",
  "UNSUPPORTED_OR_FUTURE",
] as const;

export type CatalogCapabilityClass = (typeof CATALOG_CAPABILITY_CLASSES)[number];

export const CATALOG_CAPABILITY_SUPPORTS = [
  "DECLARED",
  "SCHEMA_SELECTABLE",
  "ORGANIZATION_VERSIONED",
  "NOT_PREPARED",
] as const;

export type CatalogCapabilitySupport = (typeof CATALOG_CAPABILITY_SUPPORTS)[number];

export type CatalogCapabilityProvenance = {
  readonly source:
    | "PRODUCT_TEMPLATE"
    | "IDENTITY_FACT"
    | "FIXED_VALUE"
    | "FORM_SCHEMA"
    | "TECHNICAL_SETTING_DEFINITION"
    | "FORMULA_DEFINITION"
    | "PRODUCT_ENABLEMENT"
    | "BACK_MANUFACTURING"
    | "COMPONENT_RESULT_BOUNDARY"
    | "PROCESS_PROJECTION"
    | "ABSENT_WRITER";
  readonly ref: string;
};

export type CatalogCanonicalWriter = {
  readonly method: "POST" | "PATCH";
  readonly path: string;
  readonly permission: "owner";
};

export type CatalogCapabilityCondition =
  | { readonly kind: "componentSelected"; readonly componentId: string }
  | { readonly kind: "fieldEquals"; readonly fieldId: string; readonly value: string }
  | { readonly kind: "fieldIn"; readonly fieldId: string; readonly values: readonly string[] };

export type CatalogCapabilityOption = {
  readonly value: string;
  readonly label: string;
  /** Schema selection is not a manufacturing or cost verdict. */
  readonly support: "SCHEMA_SELECTABLE" | "NOT_PREPARED";
  readonly technologicalCondition: {
    readonly classification: "UNSUPPORTED_OR_FUTURE";
    readonly code: "groove_recipe_missing";
    readonly provenance: CatalogCapabilityProvenance;
  } | null;
};

type CapabilityBase = {
  readonly id: string;
  readonly label: string;
  readonly provenance: CatalogCapabilityProvenance;
  readonly support: CatalogCapabilitySupport;
  readonly componentId: string | null;
  readonly componentTypeId: ComponentTypeId | null;
  readonly canonicalWriter: CatalogCanonicalWriter | null;
  readonly readPath: string | null;
};

export type CatalogFixedCapability = CapabilityBase & {
  readonly classification: "PLATFORM_FIXED";
  readonly value: DraftValue;
  readonly nesting: false | null;
};

export type CatalogRequestCapability = CapabilityBase & {
  readonly classification: "REQUEST_FACT";
  readonly fieldType: FieldType;
  readonly required: boolean;
  readonly conditions: readonly CatalogCapabilityCondition[];
  readonly options: readonly CatalogCapabilityOption[];
};

export type CatalogOrganizationVersion = {
  readonly resolved: boolean;
  readonly version: number | null;
  readonly source: string | null;
  readonly sourceLabel: string | null;
  readonly organizationConfirmed: boolean;
  readonly error: string | null;
};

export type CatalogSettingCapability = CapabilityBase & {
  readonly classification: "ORGANIZATION_SETTING";
  readonly settingId: string;
  readonly unit: TechnicalSettingUnit;
  readonly appliesToTemplateCodes: readonly string[];
  readonly organization: CatalogOrganizationVersion & {
    readonly value: number | null;
  };
};

export type CatalogFormulaCapability = CapabilityBase & {
  readonly classification: "ORGANIZATION_FORMULA";
  readonly formulaId: SupportedFormulaId;
  readonly appliesToTemplateCodes: readonly string[];
  readonly allowedReferences: FormulaReferenceAllowlist;
  readonly organization: CatalogOrganizationVersion;
};

export type CatalogUnsupportedCapability = CapabilityBase & {
  readonly classification: "UNSUPPORTED_OR_FUTURE";
  readonly reason: string;
};

export type CatalogCapabilityElement =
  | CatalogFixedCapability
  | CatalogRequestCapability
  | CatalogSettingCapability
  | CatalogFormulaCapability
  | CatalogUnsupportedCapability;

export type CatalogEnablementCapability = {
  readonly id: string;
  readonly classification: "ORGANIZATION_ENABLEMENT";
  readonly label: string;
  readonly provenance: CatalogCapabilityProvenance;
  readonly support: CatalogCapabilitySupport;
  readonly enabledForNewWork: boolean | null;
  readonly source: ProductEnablementSource | null;
  readonly version: number | null;
  readonly error: string | null;
  readonly canonicalWriter: CatalogCanonicalWriter;
  readonly readPath: string;
};

export type CatalogCapabilityComponent = {
  readonly id: string;
  readonly role: ComponentRole;
  readonly typeId: ComponentTypeId;
  readonly label: string;
  readonly required: boolean;
  readonly inputMapping: ProductComponent["inputMapping"] | null;
};

export type CatalogCapabilityProduct = {
  readonly templateCode: string;
  readonly templateVersion: string;
  readonly label: string;
  readonly displayRevision: number;
  readonly familyId: string;
  readonly categoryId: string;
  readonly formSchemaId: string;
  readonly inPlatformLibrary: true;
  readonly components: readonly CatalogCapabilityComponent[];
  readonly componentsWithoutRequestSection: readonly string[];
  readonly enablement: CatalogEnablementCapability;
  readonly administration: readonly {
    readonly id: string;
    readonly label: string;
    readonly canonicalWriter: CatalogCanonicalWriter;
  }[];
  readonly elements: readonly CatalogCapabilityElement[];
  readonly presetContract: OrganizationPresetContract;
};

export type CatalogCapabilitiesManifest = {
  readonly schemaVersion: typeof CATALOG_CAPABILITIES_SCHEMA_VERSION;
  readonly readOnly: true;
  readonly mutatesConfiguration: false;
  readonly permissions: {
    readonly canRead: true;
    readonly canEditEnablement: boolean;
    readonly canEditTechnicalSettings: boolean;
    readonly canEditFormulas: boolean;
    readonly canEditDisplayLabels: boolean;
    readonly canViewFinancialAmounts: false;
  };
  readonly products: readonly CatalogCapabilityProduct[];
  readonly platformGaps: readonly CatalogUnsupportedCapability[];
};

export type CatalogCapabilityProjectionInput = {
  readonly enablement: ProductEnablementResolution;
  readonly technicalSettings: TechnicalSettingResolution;
  readonly formulas: FormulaResolution;
  readonly labels: DisplayLabelCatalog;
  readonly canEditOrganizationConfiguration: boolean;
};

const ENABLEMENT_READ_PATH = "/api/admin/product-enablement";
const TECHNICAL_SETTINGS_PATH = "/api/admin/technical-settings";
const FORMULAS_PATH = "/api/admin/formulas";

const enablementWriter: CatalogCanonicalWriter = {
  method: "POST",
  path: ENABLEMENT_READ_PATH,
  permission: "owner",
};

const technicalSettingWriter: CatalogCanonicalWriter = {
  method: "POST",
  path: TECHNICAL_SETTINGS_PATH,
  permission: "owner",
};

const formulaWriter: CatalogCanonicalWriter = {
  method: "POST",
  path: FORMULAS_PATH,
  permission: "owner",
};

export function projectCatalogCapabilities(
  input: CatalogCapabilityProjectionInput,
): CatalogCapabilitiesManifest {
  const canEdit = input.canEditOrganizationConfiguration;
  return {
    schemaVersion: CATALOG_CAPABILITIES_SCHEMA_VERSION,
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
    products: productTemplates.map((template) => projectProduct(template, input)),
    platformGaps: platformGaps(),
  };
}

function projectProduct(
  template: ProductTemplate,
  input: CatalogCapabilityProjectionInput,
): CatalogCapabilityProduct {
  const presented = presentedTemplate(template.code, input.labels) ?? template;
  const schema = getFormSchema(template.formSchemaId);
  const components = template.components.map((component) => projectComponent(component));
  const elements: CatalogCapabilityElement[] = [
    ...fixedElements(template),
    ...identityElements(template),
    ...requestElements(template, schema),
    ...settingElements(template, input.technicalSettings),
    ...formulaElements(template, input.formulas),
    ...gapElements(template, schema),
  ];
  return {
    templateCode: template.code,
    templateVersion: template.version,
    label: presented.label,
    displayRevision: input.labels.revision("PRODUCT_TEMPLATE", template.code),
    familyId: template.familyId,
    categoryId: template.categoryId,
    formSchemaId: template.formSchemaId,
    inPlatformLibrary: true,
    components,
    componentsWithoutRequestSection: componentsWithoutRequestSection(template, schema),
    enablement: projectEnablement(template, input.enablement),
    administration: [
      {
        id: `${template.code}:display-label`,
        label: "Etichetă de prezentare",
        canonicalWriter: {
          method: "PATCH",
          path: `/api/admin/product-system/entities/PRODUCT_TEMPLATE/${template.code}/display-label`,
          permission: "owner",
        },
      },
    ],
    elements,
    presetContract: projectOrganizationPresetContract(template.code) ?? {
      schemaVersion: "organization-preset.v1",
      persistence: "ORGANIZATION_VERSIONED",
      canonicalWriter: {
        method: "POST",
        path: "/api/catalog/presets",
        permission: "owner",
      },
      templateCode: template.code,
      templateVersion: template.version,
      eligibleFields: [],
      whereUsed: { available: false, reason: "no_request_reference_index" },
    },
  };
}

function projectComponent(component: ProductComponent): CatalogCapabilityComponent {
  const type = getComponentType(component.typeId);
  return {
    id: component.id,
    role: type.role,
    typeId: component.typeId,
    label: component.label,
    required: component.required,
    inputMapping: component.inputMapping ?? null,
  };
}

function projectEnablement(
  template: ProductTemplate,
  resolution: ProductEnablementResolution,
): CatalogEnablementCapability {
  if (!resolution.ok) {
    return {
      id: `${template.code}:enablement`,
      classification: "ORGANIZATION_ENABLEMENT",
      label: "Activare pentru lucrări noi",
      provenance: {
        source: "PRODUCT_ENABLEMENT",
        ref: resolution.error,
      },
      support: "NOT_PREPARED",
      enabledForNewWork: null,
      source: null,
      version: null,
      error: resolution.error,
      canonicalWriter: enablementWriter,
      readPath: ENABLEMENT_READ_PATH,
    };
  }
  return {
    id: `${template.code}:enablement`,
    classification: "ORGANIZATION_ENABLEMENT",
    label: "Activare pentru lucrări noi",
    provenance: {
      source: "PRODUCT_ENABLEMENT",
      ref: resolution.source,
    },
    support: "ORGANIZATION_VERSIONED",
    enabledForNewWork: resolution.enabledTemplateCodes.includes(template.code),
    source: resolution.source,
    version: resolution.version,
    error: null,
    canonicalWriter: enablementWriter,
    readPath: ENABLEMENT_READ_PATH,
  };
}

function fixedElements(template: ProductTemplate): CatalogFixedCapability[] {
  return Object.entries(template.fixedValues).map(([key, value]) => {
    const owner = owningComponent(template, key);
    const attribute = owner
      ? getComponentType(owner.typeId).attributes.find((item) => item.id === key)
      : undefined;
    return {
      id: `${template.code}:fixed:${key}`,
      classification: "PLATFORM_FIXED",
      label: attribute?.label ?? key,
      value,
      nesting: null,
      provenance: { source: "FIXED_VALUE", ref: key },
      support: "DECLARED",
      componentId: owner?.id ?? null,
      componentTypeId: owner?.typeId ?? null,
      canonicalWriter: null,
      readPath: null,
    };
  });
}

function identityElements(template: ProductTemplate): CatalogFixedCapability[] {
  return template.identityFacts.map((fact) => ({
    id: `${template.code}:identity:${fact.id}`,
    classification: "PLATFORM_FIXED",
    label: fact.label,
    value: fact.value,
    nesting: null,
    provenance: { source: "IDENTITY_FACT", ref: fact.id },
    support: "DECLARED",
    componentId: fact.componentId ?? null,
    componentTypeId: componentTypeId(template, fact.componentId),
    canonicalWriter: null,
    readPath: null,
  }));
}

function requestElements(
  template: ProductTemplate,
  schema: FormSchema | undefined,
): CatalogRequestCapability[] {
  if (!schema || schema.templateCode !== template.code) {
    return [];
  }
  return schema.sections.flatMap((section) =>
    section.fields.map((field) => requestElement(template, field)),
  );
}

function requestElement(
  template: ProductTemplate,
  field: FormField,
): CatalogRequestCapability {
  const owner = template.components.find((item) => item.id === field.componentId);
  return {
    id: `${template.code}:request:${field.id}`,
    classification: "REQUEST_FACT",
    label: field.label,
    fieldType: field.type,
    required: field.required,
    conditions: conditionsFrom(field.visibleWhen),
    options: (field.options ?? []).map((option) => projectOption(field.id, option)),
    provenance: { source: "FORM_SCHEMA", ref: field.id },
    support: "SCHEMA_SELECTABLE",
    componentId: field.componentId,
    componentTypeId: owner?.typeId ?? null,
    canonicalWriter: null,
    readPath: null,
  };
}

function projectOption(
  fieldId: string,
  option: { readonly value: string; readonly label: string },
): CatalogCapabilityOption {
  if (fieldId === "back.profile" && option.value === "GROOVED" && !forexBackChannelRecipe()) {
    return {
      value: option.value,
      label: option.label,
      support: "NOT_PREPARED",
      technologicalCondition: {
        classification: "UNSUPPORTED_OR_FUTURE",
        code: "groove_recipe_missing",
        provenance: {
          source: "BACK_MANUFACTURING",
          ref: FOREX_BACK_CHANNEL_RECIPE_ID,
        },
      },
    };
  }
  return {
    value: option.value,
    label: option.label,
    support: "SCHEMA_SELECTABLE",
    technologicalCondition: null,
  };
}

function settingElements(
  template: ProductTemplate,
  resolution: TechnicalSettingResolution,
): CatalogSettingCapability[] {
  return technicalSettingDefinitionsForTemplate(template).map((definition) => {
    const definitionId = technicalSettingDefinitionId(definition.typeId, definition.id);
    const resolved =
      resolution.ok
        ? resolution.settings.find((item) => item.definitionId === definitionId)
        : undefined;
    const organization = resolution.ok
      ? resolved
        ? {
            resolved: true as const,
            version: resolved.version,
            source: resolved.source,
            sourceLabel: technicalSettingSourceLabel(resolved.source),
            organizationConfirmed: resolved.source === "ORGANIZATION",
            error: null,
            value: resolved.value,
          }
        : {
            resolved: false as const,
            version: null,
            source: null,
            sourceLabel: null,
            organizationConfirmed: false,
            error: "TECHNICAL_SETTINGS_INACTIVE",
            value: null,
          }
      : {
          resolved: false as const,
          version: null,
          source: null,
          sourceLabel: null,
          organizationConfirmed: false,
          error: resolution.error,
          value: null,
        };
    return {
      id: `${template.code}:setting:${definitionId}`,
      classification: "ORGANIZATION_SETTING",
      label: definition.label,
      settingId: definition.id,
      unit: definition.unit,
      appliesToTemplateCodes: templateCodesForType(definition.typeId),
      organization,
      provenance: { source: "TECHNICAL_SETTING_DEFINITION", ref: definitionId },
      support: organization.resolved ? "ORGANIZATION_VERSIONED" : "NOT_PREPARED",
      componentId: componentIdForType(template, definition.typeId),
      componentTypeId: definition.typeId,
      canonicalWriter: technicalSettingWriter,
      readPath: TECHNICAL_SETTINGS_PATH,
    };
  });
}

function formulaElements(
  template: ProductTemplate,
  resolution: FormulaResolution,
): CatalogFormulaCapability[] {
  const seen = new Set<string>();
  const definitions: FormulaDefinition[] = [];
  for (const component of template.components) {
    for (const definition of formulaDefinitionsForType(component.typeId)) {
      if (!seen.has(definition.formulaId)) {
        seen.add(definition.formulaId);
        definitions.push(definition);
      }
    }
  }
  return definitions.map((definition) => {
    const resolved = resolution.ok
      ? resolution.formulas.find((item) => item.formulaId === definition.formulaId)
      : undefined;
    const organization: CatalogOrganizationVersion = resolution.ok
      ? resolved
        ? {
            resolved: true,
            version: resolved.version,
            source: resolved.source,
            sourceLabel: formulaSourceLabel(resolved.source),
            organizationConfirmed: resolved.source === "ORGANIZATION",
            error: null,
          }
        : unbound("FORMULAS_INACTIVE")
      : unbound(resolution.error);
    return {
      id: `${template.code}:formula:${definition.formulaId}`,
      classification: "ORGANIZATION_FORMULA",
      label: definition.label,
      formulaId: definition.formulaId,
      appliesToTemplateCodes: templateCodesForType(definition.componentTypeId),
      allowedReferences: definition.allowedReferences,
      organization,
      provenance: { source: "FORMULA_DEFINITION", ref: definition.formulaId },
      support: organization.resolved ? "ORGANIZATION_VERSIONED" : "NOT_PREPARED",
      componentId: componentIdForType(template, definition.componentTypeId),
      componentTypeId: definition.componentTypeId,
      canonicalWriter: formulaWriter,
      readPath: FORMULAS_PATH,
    };
  });
}

function gapElements(
  template: ProductTemplate,
  schema: FormSchema | undefined,
): CatalogCapabilityElement[] {
  const gaps: CatalogCapabilityElement[] = [];
  if (!schema || schema.templateCode !== template.code) {
    gaps.push(
      unsupported({
        id: `${template.code}:unsupported:form-schema`,
        label: "Schema de formular",
        reason: "Template-ul nu are o schemă de formular legată.",
        provenance: { source: "FORM_SCHEMA", ref: template.formSchemaId },
        componentId: null,
        componentTypeId: null,
      }),
    );
  }
  const grooved = schema?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "back.profile")
    ?.options?.some((option) => option.value === "GROOVED");
  if (grooved && !forexBackChannelRecipe()) {
    gaps.push(
      unsupported({
        id: `${template.code}:unsupported:back.profile:GROOVED`,
        label: "Canal spate",
        reason:
          "Opțiunea Cu canal este selectabilă în schemă, dar nu are rețetă de canal verificată.",
        provenance: {
          source: "BACK_MANUFACTURING",
          ref: FOREX_BACK_CHANNEL_RECIPE_ID,
        },
        componentId: "BACK",
        componentTypeId: "FOREX_BACK",
      }),
    );
  }
  if (template.components.some((component) => component.typeId === "ACM_CASSETTE_BODY")) {
    gaps.push({
      id: `${template.code}:boundary:${ACM_DEVELOPED_SHEET_AREA.id}`,
      classification: "PLATFORM_FIXED",
      label: ACM_DEVELOPED_SHEET_AREA.label,
      value: null,
      nesting: ACM_DEVELOPED_SHEET_AREA.nesting,
      provenance: {
        source: "COMPONENT_RESULT_BOUNDARY",
        ref: ACM_DEVELOPED_SHEET_AREA.id,
      },
      support: "DECLARED",
      componentId: "FACE",
      componentTypeId: "ACM_CASSETTE_BODY",
      canonicalWriter: null,
      readPath: null,
    });
  }
  return gaps;
}

function platformGaps(): CatalogUnsupportedCapability[] {
  const gaps: CatalogUnsupportedCapability[] = [
    unsupported({
      id: "platform:unsupported:organization-product-preset",
      label: "Preset de produs al organizației",
      reason: "Nu există un writer canonic pentru preseturi salvate de organizație.",
      provenance: { source: "ABSENT_WRITER", ref: "organization-product-preset" },
      componentId: null,
      componentTypeId: null,
    }),
  ];
  switch (OPERATIONAL_PROCESS_GRAPH_WRITE_STATE) {
    case "NOT_IMPLEMENTED":
      gaps.push(
        unsupported({
          id: "platform:unsupported:process-graph-editor",
          label: "Editor de traseu tehnologic",
          reason: "Editarea grafului de procese nu este implementată.",
          provenance: { source: "PROCESS_PROJECTION", ref: "writeState" },
          componentId: null,
          componentTypeId: null,
        }),
      );
      break;
    default: {
      const exhaustive: never = OPERATIONAL_PROCESS_GRAPH_WRITE_STATE;
      return exhaustive;
    }
  }
  return gaps;
}

function unsupported(input: {
  id: string;
  label: string;
  reason: string;
  provenance: CatalogCapabilityProvenance;
  componentId: string | null;
  componentTypeId: ComponentTypeId | null;
}): CatalogUnsupportedCapability {
  return {
    id: input.id,
    classification: "UNSUPPORTED_OR_FUTURE",
    label: input.label,
    reason: input.reason,
    provenance: input.provenance,
    support: "NOT_PREPARED",
    componentId: input.componentId,
    componentTypeId: input.componentTypeId,
    canonicalWriter: null,
    readPath: null,
  };
}

function unbound(error: string | null): CatalogOrganizationVersion {
  return {
    resolved: false,
    version: null,
    source: null,
    sourceLabel: null,
    organizationConfirmed: false,
    error,
  };
}

function conditionsFrom(rule: VisibilityRule): CatalogCapabilityCondition[] {
  switch (rule.kind) {
    case "always":
      return [];
    case "componentSelected":
      return [{ kind: "componentSelected", componentId: rule.componentId }];
    case "fieldEquals":
      return [{ kind: "fieldEquals", fieldId: rule.fieldId, value: rule.value }];
    case "fieldIn":
      return [{ kind: "fieldIn", fieldId: rule.fieldId, values: [...rule.values] }];
    default: {
      const exhaustive: never = rule;
      return exhaustive;
    }
  }
}

function owningComponent(
  template: ProductTemplate,
  attributeId: string,
): ProductComponent | undefined {
  return template.components.find((component) =>
    getComponentType(component.typeId).attributes.some((attribute) => attribute.id === attributeId),
  );
}

function componentTypeId(
  template: ProductTemplate,
  componentId: string | undefined,
): ComponentTypeId | null {
  if (!componentId) {
    return null;
  }
  return template.components.find((component) => component.id === componentId)?.typeId ?? null;
}

function componentIdForType(
  template: ProductTemplate,
  typeId: ComponentTypeId,
): string | null {
  return template.components.find((component) => component.typeId === typeId)?.id ?? null;
}

function templateCodesForType(typeId: ComponentTypeId): readonly string[] {
  return productTemplates
    .filter((template) => template.components.some((component) => component.typeId === typeId))
    .map((template) => template.code);
}

function componentsWithoutRequestSection(
  template: ProductTemplate,
  schema: FormSchema | undefined,
): readonly string[] {
  if (!schema) {
    return template.components.map((component) => component.id);
  }
  const sectionIds = new Set(schema.sections.map((section) => section.componentId));
  return template.components
    .filter((component) => !sectionIds.has(component.id))
    .map((component) => component.id);
}
