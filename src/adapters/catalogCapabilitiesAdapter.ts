import { asBoolean, asNumber, asRecord, asString } from "./record";

const SCHEMA_VERSION = "catalog-capabilities.v1";

const FIXED_VALUE_LABELS: Record<string, string> = {
  plexiglas: "Plexiglas",
  opal: "Opal",
  aluminium: "Aluminiu",
  forex: "Forex",
  front_lit: "Iluminare frontală",
  acm: "ACM",
  steel: "Oțel",
  none: "Fără finisaj",
};

export type CatalogEnablementTone = "offered" | "not-offered" | "unknown";

export type CatalogPropertyGroup = "platform" | "setting" | "formula" | "request" | "unsupported";

export type CatalogPropertyOptionView = {
  label: string;
  note: string | null;
};

export type CatalogPropertyView = {
  id: string;
  group: CatalogPropertyGroup;
  label: string;
  value: string | null;
  notes: string[];
  options: CatalogPropertyOptionView[];
};

export type CatalogComponentView = {
  id: string;
  label: string;
  typeId: string;
  required: boolean;
  requestGap: string | null;
  relationships: string[];
  properties: CatalogPropertyView[];
};

export type CatalogWorkspaceProduct = {
  code: string;
  label: string;
  displayRevision: number;
  enablementLabel: string;
  enablementTone: CatalogEnablementTone;
  components: CatalogComponentView[];
  workFacts: CatalogPropertyView[];
  productFacts: CatalogPropertyView[];
};

export type CatalogCapabilitiesPermissions = {
  canEditEnablement: boolean;
  canEditTechnicalSettings: boolean;
  canEditFormulas: boolean;
  canEditDisplayLabels: boolean;
};

export type CatalogCapabilitiesView = {
  permissions: CatalogCapabilitiesPermissions;
  products: CatalogWorkspaceProduct[];
  platformLimits: CatalogPropertyView[];
};

type DraftValue = string | number | boolean | null;

type ParsedCondition =
  | { kind: "componentSelected"; componentId: string }
  | { kind: "fieldEquals"; fieldId: string; value: string }
  | { kind: "fieldIn"; fieldId: string; values: string[] };

type ParsedOption = {
  value: string;
  label: string;
  note: string | null;
};

type ParsedComponent = {
  id: string;
  label: string;
  typeId: string;
  required: boolean;
  areaFromComponentId: string | null;
};

type ParsedElement = {
  id: string;
  classification: CatalogPropertyGroup;
  label: string;
  componentId: string | null;
  value: string | null;
  notes: string[];
  options: ParsedOption[];
  conditions: ParsedCondition[];
  required: boolean | null;
  sharedTemplateCodes: string[];
};

type ParsedProduct = {
  code: string;
  label: string;
  displayRevision: number;
  enablementLabel: string;
  enablementTone: CatalogEnablementTone;
  components: ParsedComponent[];
  withoutRequestSection: string[];
  elements: ParsedElement[];
};

function objectList(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value)) return null;
  const rows: Record<string, unknown>[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

function draftValue(value: unknown): DraftValue | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function formatRoNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(value).replace(".", ",");
}

function formatUnit(value: number, unit: string): string {
  const text = formatRoNumber(value);
  switch (unit) {
    case "mm":
      return `${text} mm`;
    case "percent":
      return `${text} %`;
    case "W":
      return `${text} W`;
    default:
      return text;
  }
}

function formatFixedValue(value: DraftValue, ref: string, nesting: false | null): string | null {
  if (value === null) return nesting === false ? "Fără nesting" : null;
  if (typeof value === "boolean") return value ? "Da" : "Nu";
  if (typeof value === "number") {
    const text = formatRoNumber(value);
    return ref.endsWith("Mm") ? `${text} mm` : text;
  }
  const known = FIXED_VALUE_LABELS[value];
  if (known) return known;
  if (/^[a-z0-9_]+$/.test(value)) return null;
  return value;
}

function enablementTone(enabled: boolean | null): CatalogEnablementTone {
  if (enabled === true) return "offered";
  if (enabled === false) return "not-offered";
  return "unknown";
}

function enablementLabel(enabled: boolean | null): string {
  const tone = enablementTone(enabled);
  switch (tone) {
    case "offered":
      return "Oferit pentru lucrări noi";
    case "not-offered":
      return "Nu este oferit pentru lucrări noi";
    case "unknown":
      return "Activarea nu este cunoscută";
    default: {
      const exhaustive: never = tone;
      return exhaustive;
    }
  }
}

function parseConditions(value: unknown): ParsedCondition[] | null {
  if (!Array.isArray(value)) return null;
  const conditions: ParsedCondition[] = [];
  for (const item of value) {
    const row = asRecord(item);
    const kind = row ? asString(row.kind) : null;
    if (!row || !kind) return null;
    switch (kind) {
      case "componentSelected": {
        const componentId = asString(row.componentId);
        if (!componentId) return null;
        conditions.push({ kind, componentId });
        break;
      }
      case "fieldEquals": {
        const fieldId = asString(row.fieldId);
        const fieldValue = asString(row.value);
        if (!fieldId || !fieldValue) return null;
        conditions.push({ kind, fieldId, value: fieldValue });
        break;
      }
      case "fieldIn": {
        const fieldId = asString(row.fieldId);
        const values = Array.isArray(row.values) ? row.values.filter((entry): entry is string => typeof entry === "string" && entry !== "") : null;
        if (!fieldId || !values) return null;
        conditions.push({ kind, fieldId, values });
        break;
      }
      default:
        return null;
    }
  }
  return conditions;
}

function parseOptions(value: unknown): ParsedOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: ParsedOption[] = [];
  for (const item of value) {
    const row = asRecord(item);
    const label = row ? asString(row.label) : null;
    const value = row ? asString(row.value) : null;
    const support = row ? asString(row.support) : null;
    if (!row || !label || !value || (support !== "SCHEMA_SELECTABLE" && support !== "NOT_PREPARED")) return null;
    options.push({
      value,
      label,
      note: support === "NOT_PREPARED" ? "Selectabilă în schemă, fără pregătire tehnologică." : null,
    });
  }
  return options;
}

function parseComponent(row: Record<string, unknown>): ParsedComponent | null {
  const id = asString(row.id);
  const label = asString(row.label);
  const typeId = asString(row.typeId);
  if (!id || !label || !typeId || typeof row.required !== "boolean") return null;
  const mapping = asRecord(row.inputMapping);
  const areaFrom = mapping ? asString(mapping.confirmedAreaMm2FromComponentId) : null;
  return { id, label, typeId, required: row.required, areaFromComponentId: areaFrom };
}

function organizationNotes(row: Record<string, unknown>, valueNote: boolean): { notes: string[]; numeric: number | null } | null {
  const organization = asRecord(row.organization);
  if (!organization || typeof organization.resolved !== "boolean" || typeof organization.organizationConfirmed !== "boolean") {
    return null;
  }
  const sourceLabel = asString(organization.sourceLabel);
  const numeric = asNumber(organization.value);
  const notes: string[] = [];
  if (!organization.resolved || (valueNote && numeric === null)) {
    notes.push(valueNote ? "Valoarea organizației nu este disponibilă." : "Formula organizației nu este disponibilă.");
    return { notes, numeric: null };
  }
  if (sourceLabel) notes.push(sourceLabel);
  notes.push(organization.organizationConfirmed ? "Confirmată de organizație." : "Nu este confirmată de organizație.");
  return { notes, numeric };
}

function parseElement(row: Record<string, unknown>): ParsedElement | null {
  const id = asString(row.id);
  const label = asString(row.label);
  const classification = asString(row.classification);
  if (!id || !label || !classification) return null;
  const componentId = row.componentId === null ? null : asString(row.componentId);
  if (row.componentId !== null && !componentId) return null;
  switch (classification) {
    case "PLATFORM_FIXED": {
      const value = draftValue(row.value);
      const ref = asString(asRecord(row.provenance)?.ref) ?? "";
      const nesting = row.nesting === false ? false : row.nesting === null || row.nesting === undefined ? null : undefined;
      if (value === undefined || nesting === undefined) return null;
      const formatted = formatFixedValue(value, ref, nesting);
      return {
        id,
        classification: "platform",
        label,
        componentId,
        value: formatted,
        notes: formatted === null ? ["Fixată de platformă."] : [],
        options: [],
        conditions: [],
        required: null,
        sharedTemplateCodes: [],
      };
    }
    case "REQUEST_FACT": {
      const conditions = parseConditions(row.conditions);
      const options = parseOptions(row.options);
      if (!conditions || !options || typeof row.required !== "boolean") return null;
      return {
        id,
        classification: "request",
        label,
        componentId,
        value: null,
        notes: [row.required ? "Se completează pe lucrare." : "Opțional pe lucrare."],
        options,
        conditions,
        required: row.required,
        sharedTemplateCodes: [],
      };
    }
    case "ORGANIZATION_SETTING": {
      const organization = organizationNotes(row, true);
      const unit = asString(row.unit);
      const shared = Array.isArray(row.appliesToTemplateCodes)
        ? row.appliesToTemplateCodes.filter((item): item is string => typeof item === "string")
        : null;
      if (!organization || !unit || !shared) return null;
      return {
        id,
        classification: "setting",
        label,
        componentId,
        value: organization.numeric === null ? null : formatUnit(organization.numeric, unit),
        notes: organization.notes,
        options: [],
        conditions: [],
        required: null,
        sharedTemplateCodes: shared,
      };
    }
    case "ORGANIZATION_FORMULA": {
      const organization = organizationNotes(row, false);
      const shared = Array.isArray(row.appliesToTemplateCodes)
        ? row.appliesToTemplateCodes.filter((item): item is string => typeof item === "string")
        : null;
      if (!organization || !shared || !asString(row.formulaId)) return null;
      return {
        id,
        classification: "formula",
        label,
        componentId,
        value: null,
        notes: organization.notes,
        options: [],
        conditions: [],
        required: null,
        sharedTemplateCodes: shared,
      };
    }
    case "UNSUPPORTED_OR_FUTURE": {
      const reason = asString(row.reason);
      if (!reason) return null;
      return {
        id,
        classification: "unsupported",
        label,
        componentId,
        value: null,
        notes: [reason],
        options: [],
        conditions: [],
        required: null,
        sharedTemplateCodes: [],
      };
    }
    default:
      return null;
  }
}

function parseEnablement(row: Record<string, unknown> | null): { label: string; tone: CatalogEnablementTone } | null {
  if (!row || asString(row.classification) !== "ORGANIZATION_ENABLEMENT" || !asString(row.label)) return null;
  const enabled = row.enabledForNewWork === null ? null : asBoolean(row.enabledForNewWork);
  if (row.enabledForNewWork !== null && enabled === null) return null;
  return { label: enablementLabel(enabled), tone: enablementTone(enabled) };
}

function parseProduct(row: Record<string, unknown>): ParsedProduct | null {
  const code = asString(row.templateCode);
  const label = asString(row.label);
  const displayRevision = asNumber(row.displayRevision);
  const enablement = parseEnablement(asRecord(row.enablement));
  if (!code || !label || displayRevision === null || !enablement || row.inPlatformLibrary !== true) return null;
  if (!Array.isArray(row.components) || !Array.isArray(row.elements)) return null;
  const componentRows = objectList(row.components);
  const elementRows = objectList(row.elements);
  if (!componentRows || !elementRows) return null;
  const components = componentRows.map(parseComponent);
  if (components.some((item) => item === null)) return null;
  const elements = elementRows.map(parseElement);
  if (elements.some((item) => item === null)) return null;
  const withoutRequest = Array.isArray(row.componentsWithoutRequestSection)
    ? row.componentsWithoutRequestSection.filter((item): item is string => typeof item === "string")
    : null;
  if (!withoutRequest) return null;
  return {
    code,
    label,
    displayRevision,
    enablementLabel: enablement.label,
    enablementTone: enablement.tone,
    components: components.filter((item): item is ParsedComponent => item !== null),
    withoutRequestSection: withoutRequest,
    elements: elements.filter((item): item is ParsedElement => item !== null),
  };
}

function parsePermissions(value: unknown): CatalogCapabilitiesPermissions | null {
  const row = asRecord(value);
  if (!row || row.canRead !== true || row.canViewFinancialAmounts !== false) return null;
  if (
    typeof row.canEditEnablement !== "boolean" ||
    typeof row.canEditTechnicalSettings !== "boolean" ||
    typeof row.canEditFormulas !== "boolean" ||
    typeof row.canEditDisplayLabels !== "boolean"
  ) {
    return null;
  }
  return {
    canEditEnablement: row.canEditEnablement,
    canEditTechnicalSettings: row.canEditTechnicalSettings,
    canEditFormulas: row.canEditFormulas,
    canEditDisplayLabels: row.canEditDisplayLabels,
  };
}

function requestField(product: ParsedProduct, fieldId: string): ParsedElement | undefined {
  return product.elements.find((item) => item.classification === "request" && item.id.endsWith(`:request:${fieldId}`));
}

function conditionNote(condition: ParsedCondition, product: ParsedProduct): string | null {
  switch (condition.kind) {
    case "componentSelected": {
      const component = product.components.find((item) => item.id === condition.componentId);
      return component ? `Apare când este selectată ${component.label}.` : null;
    }
    case "fieldEquals":
    case "fieldIn": {
      const field = requestField(product, condition.fieldId);
      if (!field) return null;
      const values = condition.kind === "fieldEquals" ? [condition.value] : condition.values;
      const optionLabels = values.map((value) => field.options.find((option) => option.value === value)?.label ?? null);
      if (optionLabels.some((label) => label === null)) return null;
      return `Apare când ${field.label} este ${optionLabels.join(" sau ")}.`;
    }
    default: {
      const exhaustive: never = condition;
      return exhaustive;
    }
  }
}

function relationshipTexts(component: ParsedComponent, components: readonly ParsedComponent[]): string[] {
  const texts: string[] = [];
  if (component.areaFromComponentId) {
    const source = components.find((item) => item.id === component.areaFromComponentId);
    texts.push(`Suprafața confirmată este preluată din ${source?.label ?? "componenta indicată"}.`);
  }
  for (const other of components) {
    if (other.areaFromComponentId === component.id) {
      texts.push(`${other.label} preia suprafața confirmată din această componentă.`);
    }
  }
  return texts;
}

function sharedNote(codes: readonly string[], products: readonly ParsedProduct[], currentCode: string): string | null {
  const labels = codes
    .filter((code) => code !== currentCode)
    .map((code) => products.find((product) => product.code === code)?.label)
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;
  return `Valoare comună, folosită și pentru ${labels.join(", ")}.`;
}

function toView(element: ParsedElement, product: ParsedProduct, products: readonly ParsedProduct[]): CatalogPropertyView {
  const notes = [...element.notes];
  for (const condition of element.conditions) {
    const note = conditionNote(condition, product);
    if (note) notes.push(note);
  }
  const shared = sharedNote(element.sharedTemplateCodes, products, product.code);
  if (shared) notes.push(shared);
  return {
    id: element.id,
    group: element.classification,
    label: element.label,
    value: element.value,
    notes,
    options: element.options.map((option) => ({ label: option.label, note: option.note })),
  };
}

function presentProduct(product: ParsedProduct, products: readonly ParsedProduct[]): CatalogWorkspaceProduct {
  const views = product.elements.map((element) => ({ element, view: toView(element, product, products) }));
  return {
    code: product.code,
    label: product.label,
    displayRevision: product.displayRevision,
    enablementLabel: product.enablementLabel,
    enablementTone: product.enablementTone,
    workFacts: views.filter((item) => item.element.componentId === "ROOT").map((item) => item.view),
    productFacts: views.filter((item) => item.element.componentId === null).map((item) => item.view),
    components: product.components.map((component) => ({
      id: component.id,
      label: component.label,
      typeId: component.typeId,
      required: component.required,
      requestGap: product.withoutRequestSection.includes(component.id) ? "Nu are câmpuri de completat pe lucrare." : null,
      relationships: relationshipTexts(component, product.components),
      properties: views
        .filter((item) => item.element.componentId === component.id)
        .map((item) => item.view),
    })),
  };
}

export function presentCatalogCapabilities(payload: unknown): CatalogCapabilitiesView | null {
  const record = asRecord(payload);
  if (!record || record.schemaVersion !== SCHEMA_VERSION || record.readOnly !== true || record.mutatesConfiguration !== false) {
    return null;
  }
  const permissions = parsePermissions(record.permissions);
  const productRows = objectList(record.products);
  const gapRows = objectList(record.platformGaps);
  if (!permissions || !productRows || !gapRows) return null;
  const products = productRows.map(parseProduct);
  if (products.some((item) => item === null)) return null;
  const parsed = products.filter((item): item is ParsedProduct => item !== null);
  const gaps = gapRows.map(parseElement);
  if (gaps.some((item) => item === null)) return null;
  const parsedGaps = gaps.filter((item): item is ParsedElement => item !== null);
  if (parsedGaps.some((item) => item.classification !== "unsupported")) return null;
  return {
    permissions,
    products: parsed.map((product) => presentProduct(product, parsed)),
    platformLimits: parsedGaps.map((gap) => toView(gap, parsed[0] ?? emptyProduct(), parsed)),
  };
}

function emptyProduct(): ParsedProduct {
  return {
    code: "",
    label: "",
    displayRevision: 0,
    enablementLabel: "",
    enablementTone: "unknown",
    components: [],
    withoutRequestSection: [],
    elements: [],
  };
}
