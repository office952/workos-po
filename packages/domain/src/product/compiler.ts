import {
  collectComponentMeasurements,
  evaluateProductComponents,
  type ComponentEvaluation,
} from "./componentEvaluation.js";
import type { DisplayLabelCatalog } from "./displayMetadata.js";
import type {
  DraftConfiguration,
  DraftValue,
  DraftValues,
  FormField,
  FormSchema,
  MissingInput,
  ProductAggregate,
  ProductDefinition,
  ProductTemplate,
  ProductTruth,
  VisibilityRule,
} from "./types.js";

export function selectedComponentIds(
  template: ProductTemplate,
  values: DraftValues,
): string[] {
  return template.components
    .filter((component) => {
      if (component.required) {
        return true;
      }
      if (!component.selectionFieldId) {
        return false;
      }
      return values[component.selectionFieldId] === true;
    })
    .map((component) => component.id);
}

export function isFieldVisible(
  field: FormField,
  values: DraftValues,
  selectedIds: readonly string[],
): boolean {
  return matchesVisibility(field.visibleWhen, values, selectedIds);
}

function matchesVisibility(
  rule: VisibilityRule,
  values: DraftValues,
  selectedIds: readonly string[],
): boolean {
  switch (rule.kind) {
    case "always":
      return true;
    case "componentSelected":
      return selectedIds.includes(rule.componentId);
    case "fieldEquals":
      return values[rule.fieldId] === rule.value;
    case "fieldIn":
      return rule.values.includes(String(values[rule.fieldId] ?? ""));
    default: {
      const _exhaustive: never = rule;
      return _exhaustive;
    }
  }
}

function isEmpty(value: DraftValue | undefined): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

function isValidValue(field: FormField, value: DraftValue | undefined): boolean {
  if (isEmpty(value)) {
    return false;
  }
  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return false;
    }
    if (field.min !== undefined && value < field.min) {
      return false;
    }
  }
  if (field.type === "select" && field.options) {
    return field.options.some((option) => option.value === value);
  }
  if (field.type === "boolean") {
    return typeof value === "boolean";
  }
  return true;
}

function allFields(schema: FormSchema): FormField[] {
  return schema.sections.flatMap((section) => [...section.fields]);
}

export function compileDefinition(
  template: ProductTemplate,
  schema: FormSchema,
  draft: DraftConfiguration,
): ProductDefinition {
  const selectedIds = selectedComponentIds(template, draft.values);
  const missing: MissingInput[] = [];
  const values: DraftValues = { ...template.fixedValues };

  for (const field of allFields(schema)) {
    if (field.id in template.fixedValues) {
      continue;
    }
    const belongsToSelected =
      field.componentId === "ROOT" || selectedIds.includes(field.componentId);
    if (!belongsToSelected) {
      continue;
    }
    if (!isFieldVisible(field, draft.values, selectedIds)) {
      continue;
    }

    const value = draft.values[field.id];
    if (field.required && !isValidValue(field, value)) {
      missing.push({
        fieldId: field.id,
        label: field.label,
        componentId: field.componentId,
      });
      continue;
    }
    if (!isEmpty(value) && isValidValue(field, value)) {
      values[field.id] = value as DraftValue;
    }
  }

  const measurements = collectComponentMeasurements(template, selectedIds, values);
  const compiled: ProductDefinition = {
    templateCode: template.code,
    templateVersion: template.version,
    familyId: template.familyId,
    selectedComponentIds: selectedIds,
    values,
    measurements,
    reviewId: "",
    readiness: missing.length === 0 ? "ready" : "blocked",
    missing,
  };
  compiled.reviewId = definitionReviewId(compiled);
  return compiled;
}

export function definitionReviewId(definition: ProductDefinition): string {
  const canonical = JSON.stringify({
    templateCode: definition.templateCode,
    templateVersion: definition.templateVersion,
    selectedComponentIds: [...definition.selectedComponentIds],
    values: Object.fromEntries(
      Object.entries(definition.values).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    measurements: definition.measurements,
  });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function uniqueUnavailable(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function confirmReviewedDefinition(
  reviewed: ProductDefinition,
  reviewId: string,
  confirmedAt = new Date().toISOString(),
):
  | ProductTruth
  | {
      ok: false;
      reason: "not_ready" | "review_mismatch";
      definition: ProductDefinition;
    } {
  if (definitionReviewId(reviewed) !== reviewId) {
    return { ok: false, reason: "review_mismatch", definition: reviewed };
  }
  if (reviewed.readiness !== "ready") {
    return { ok: false, reason: "not_ready", definition: reviewed };
  }

  return {
    status: "CONFIRMED_IN_RUNTIME",
    templateCode: reviewed.templateCode,
    templateVersion: reviewed.templateVersion,
    familyId: reviewed.familyId,
    selectedComponentIds: reviewed.selectedComponentIds,
    values: reviewed.values,
    measurements: reviewed.measurements,
    reviewId,
    confirmedAt,
  };
}

function optionLabel(schema: FormSchema, fieldId: string, value: DraftValue): string {
  const field = allFields(schema).find((item) => item.id === fieldId);
  if (!field?.options || typeof value !== "string") {
    return String(value ?? "");
  }
  return field.options.find((option) => option.value === value)?.label ?? value;
}

export type CompileAggregateOptions = {
  readonly evaluations?: readonly ComponentEvaluation[];
};

export function compileAggregate(
  truth: ProductTruth,
  template: ProductTemplate,
  schema: FormSchema,
  labels: DisplayLabelCatalog,
  options: CompileAggregateOptions = {},
): ProductAggregate {
  const inscription =
    typeof truth.values["root.inscription"] === "string"
      ? truth.values["root.inscription"]
      : "";

  const rootDetails = allFields(schema)
    .filter(
      (field) =>
        field.componentId === "ROOT" &&
        field.id !== "root.inscription" &&
        truth.values[field.id] !== undefined,
    )
    .map((field) => `${field.label}: ${optionLabel(schema, field.id, truth.values[field.id])}`);
  const components = [
    ...(rootDetails.length > 0
      ? [{ id: "ROOT", label: "Produs", details: rootDetails }]
      : []),
    ...template.components
      .filter((component) => truth.selectedComponentIds.includes(component.id))
      .map((component) => {
        const details = allFields(schema)
          .filter(
            (field) =>
              field.componentId === component.id &&
              field.id !== component.selectionFieldId &&
              truth.values[field.id] !== undefined,
          )
          .map(
            (field) =>
              `${field.label}: ${optionLabel(schema, field.id, truth.values[field.id])}`,
          );

        return {
          id: component.id,
          label: component.label,
          details,
        };
      }),
  ];

  const calculations =
    options.evaluations ??
    evaluateProductComponents({
      template,
      selectedComponentIds: truth.selectedComponentIds,
      values: truth.values,
      measurements: truth.measurements,
    });

  return {
    derivedFrom: "ProductTruth",
    productLabel: template.label,
    familyLabel: labels.label("PRODUCT_FAMILY", template.familyId),
    inscription,
    components,
    quantities: calculations.flatMap((item) => item.result.quantities),
    requirements: calculations.flatMap((item) => item.result.requirements),
    componentStatuses: calculations.map(({ component, result }) => ({
      id: component.id,
      label: component.label,
      typeId: result.typeId,
      status: result.status,
      unavailable: result.unavailable,
    })),
    unavailable: uniqueUnavailable(
      calculations.flatMap((item) => item.result.unavailable),
    ),
  };
}
