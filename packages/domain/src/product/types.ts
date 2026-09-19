import type { ResourceRequirement } from "../resources/requirement.js";

export type ComponentId = "FACE" | "VOLUME" | "BACK" | "LIGHTING" | "ROOT";
export type ComponentRole = "FACE" | "VOLUME" | "BACK" | "LIGHTING";
export type ComponentTypeId =
  | "PLEXIGLAS_FACE"
  | "ALUMINIUM_VOLUME"
  | "FOREX_BACK"
  | "LIGHTING_FRONT_LED"
  | "ACM_CASSETTE_BODY"
  | "STEEL_INTERNAL_FRAME";
export type ComponentCalculationStatus =
  | "CALCULATED"
  | "PARTIAL"
  | "MISSING_MEASUREMENT"
  | "UNAVAILABLE";

export type ComponentRuntimeStatus = {
  id: string;
  label: string;
  typeId: ComponentTypeId;
  status: ComponentCalculationStatus;
  unavailable: readonly string[];
};

export type FieldType = "text" | "number" | "select" | "boolean";

export type VisibilityRule =
  | { kind: "always" }
  | { kind: "componentSelected"; componentId: string }
  | { kind: "fieldEquals"; fieldId: string; value: string }
  | { kind: "fieldIn"; fieldId: string; values: readonly string[] };

export type FieldOption = {
  value: string;
  label: string;
};

export type FormField = {
  id: string;
  componentId: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: readonly FieldOption[];
  visibleWhen: VisibilityRule;
  min?: number;
  hint?: string;
};

export type FormSection = {
  id: string;
  title: string;
  componentId: string;
  fields: readonly FormField[];
};

export type FormSchema = {
  id: string;
  templateCode: string;
  sections: readonly FormSection[];
};

export type ComponentInputMapping = {
  confirmedAreaMm2FromComponentId?: string;
};

export type ProductComponent = {
  id: string;
  label: string;
  required: boolean;
  typeId: ComponentTypeId;
  selectionFieldId?: string;
  inputMapping?: ComponentInputMapping;
};

export type ProductFamily = {
  id: string;
  label: string;
  description: string;
};

export type ProductCategory = {
  id: string;
  familyId: string;
  parentId: string | null;
  label: string;
  sortOrder: number;
};

export type ProductIdentityFact = {
  id: string;
  label: string;
  value: string;
};

export type DraftValue = string | number | boolean | null;
export type DraftValues = Record<string, DraftValue>;

export type ProductTemplate = {
  code: string;
  version: string;
  familyId: string;
  categoryId: string;
  label: string;
  description: string;
  legacyReference?: string;
  identityFacts: readonly ProductIdentityFact[];
  fixedValues: DraftValues;
  components: readonly ProductComponent[];
  formSchemaId: string;
  status: "PILOT";
};

export type DraftConfiguration = {
  templateCode: string;
  values: DraftValues;
};

export type MissingInput = {
  fieldId: string;
  label: string;
  componentId: string;
};

export type TechnicalMeasurement = {
  componentId: string;
  fieldId: string;
  value: number;
  unit: "mm" | "mm2";
  source: "OPERATOR_MANUAL";
  confirmed: true;
  label?: string;
};

export type ProductDefinition = {
  templateCode: string;
  templateVersion: string;
  familyId: string;
  selectedComponentIds: readonly string[];
  values: DraftValues;
  measurements: readonly TechnicalMeasurement[];
  reviewId: string;
  readiness: "ready" | "blocked";
  missing: readonly MissingInput[];
};

export type ProductTruth = {
  status: "CONFIRMED_IN_RUNTIME";
  templateCode: string;
  templateVersion: string;
  familyId: string;
  selectedComponentIds: readonly string[];
  values: DraftValues;
  measurements: readonly TechnicalMeasurement[];
  reviewId: string;
  confirmedAt: string;
};

export type ComponentSummary = {
  id: string;
  label: string;
  details: readonly string[];
};

export type TechnicalQuantity = {
  componentId: string;
  id: string;
  label: string;
  value: number;
  unit: "m" | "m2" | "W" | "buc";
  basis: "confirmed_perimeter" | "confirmed_area" | "calculated_from_settings";
};

export type ProductAggregate = {
  derivedFrom: "ProductTruth";
  productLabel: string;
  familyLabel: string;
  inscription: string;
  components: readonly ComponentSummary[];
  quantities: readonly TechnicalQuantity[];
  requirements: readonly ResourceRequirement[];
  componentStatuses: readonly ComponentRuntimeStatus[];
  unavailable: readonly string[];
};

export type CatalogTreeNode =
  | {
      kind: "family";
      id: string;
      label: string;
      description: string;
      children: readonly CatalogTreeNode[];
    }
  | {
      kind: "category";
      id: string;
      label: string;
      children: readonly CatalogTreeNode[];
    }
  | {
      kind: "product";
      code: string;
      label: string;
      description: string;
    };
