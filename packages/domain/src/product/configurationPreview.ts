import {
  compileDefinition,
  confirmReviewedDefinition,
  definitionReviewId,
  isFieldVisible,
  selectedComponentIds,
} from "./compiler.js";
import { listTypeTechnicalSettings } from "./technicalSettings.js";
import type {
  DraftConfiguration,
  DraftValues,
  FormField,
  FormSchema,
  FormSection,
  MissingInput,
  ProductComponent,
  ProductDefinition,
  ProductIdentityFact,
  ProductTemplate,
  ProductTruth,
} from "./types.js";

export const CONFIGURATION_REVIEW_ID_PREFIX = "crv1:" as const;

export type TechnicalSettingSnapshot = {
  readonly typeId: string;
  readonly id: string;
  readonly status: string;
  readonly value: number | null;
};

export type ConfigurationProductIdentity = {
  readonly productCode: string;
  readonly label: string;
  readonly familyId: string;
  readonly version: string;
  readonly identityFacts: readonly ProductIdentityFact[];
  readonly fixedValues: DraftValues;
};

export type ConfigurationSelectedComponent = {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
};

export type ConfigurationPreview = {
  readonly product: ConfigurationProductIdentity;
  readonly values: DraftValues;
  readonly formSchema: FormSchema;
  readonly selectedComponents: readonly ConfigurationSelectedComponent[];
  readonly readiness: ProductDefinition["readiness"];
  readonly missing: readonly MissingInput[];
  readonly reviewId: string | null;
};

function fnv1aHex(canonical: string): string {
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function usedTechnicalSettingsSnapshot(
  template: ProductTemplate,
  selectedIds: readonly string[],
): readonly TechnicalSettingSnapshot[] {
  const typeIds = [
    ...new Set(
      template.components
        .filter((component) => selectedIds.includes(component.id))
        .map((component) => component.typeId),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return typeIds.flatMap((typeId) =>
    listTypeTechnicalSettings(typeId).map((setting) => ({
      typeId: setting.typeId,
      id: setting.id,
      status: setting.resolution.status,
      value: setting.resolution.status === "RESOLVED" ? setting.resolution.value : null,
    })),
  );
}

export function configurationReviewId(
  definition: ProductDefinition,
  settings: readonly TechnicalSettingSnapshot[],
): string {
  const canonical = JSON.stringify({
    definitionReviewId: definitionReviewId(definition),
    settings,
  });
  return `${CONFIGURATION_REVIEW_ID_PREFIX}${fnv1aHex(canonical)}`;
}

export function configurationReviewIdFor(
  template: ProductTemplate,
  definition: ProductDefinition,
): string {
  return configurationReviewId(
    definition,
    usedTechnicalSettingsSnapshot(template, definition.selectedComponentIds),
  );
}

function alwaysVisibleField(field: FormField): FormField {
  return {
    ...field,
    visibleWhen: { kind: "always" },
  };
}

export function visibleFormSchema(
  template: ProductTemplate,
  schema: FormSchema,
  values: DraftValues,
): FormSchema {
  const selectedIds = selectedComponentIds(template, values);
  const sections = schema.sections.flatMap((section): FormSection[] => {
    const fields = section.fields
      .filter((field) => isFieldVisible(field, values, selectedIds))
      .map(alwaysVisibleField);
    if (fields.length === 0) {
      return [];
    }
    return [
      {
        ...section,
        fields,
      },
    ];
  });
  return {
    id: schema.id,
    templateCode: schema.templateCode,
    sections,
  };
}

function selectedComponentProjection(
  template: ProductTemplate,
  selectedIds: readonly string[],
): ConfigurationSelectedComponent[] {
  return template.components
    .filter((component: ProductComponent) => selectedIds.includes(component.id))
    .map((component) => ({
      id: component.id,
      label: component.label,
      required: component.required,
    }));
}

export function projectConfigurationPreview(
  template: ProductTemplate,
  schema: FormSchema,
  draft: DraftConfiguration,
): ConfigurationPreview {
  const definition = compileDefinition(template, schema, draft);
  const selectedIds = selectedComponentIds(template, draft.values);
  return {
    product: {
      productCode: template.code,
      label: template.label,
      familyId: template.familyId,
      version: template.version,
      identityFacts: template.identityFacts,
      fixedValues: template.fixedValues,
    },
    values: draft.values,
    formSchema: visibleFormSchema(template, schema, draft.values),
    selectedComponents: selectedComponentProjection(template, selectedIds),
    readiness: definition.readiness,
    missing: definition.missing,
    reviewId:
      definition.readiness === "ready" ? configurationReviewIdFor(template, definition) : null,
  };
}

export function confirmReviewedDraft(
  template: ProductTemplate,
  schema: FormSchema,
  draft: DraftConfiguration,
  reviewId: string,
  confirmedAt = new Date().toISOString(),
):
  | ProductTruth
  | {
      ok: false;
      reason: "not_ready" | "review_mismatch";
      definition: ProductDefinition;
    } {
  const definition = compileDefinition(template, schema, draft);
  if (configurationReviewIdFor(template, definition) !== reviewId) {
    return { ok: false, reason: "review_mismatch", definition };
  }
  return confirmReviewedDefinition(definition, definition.reviewId, confirmedAt);
}
