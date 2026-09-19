import { productCategories, productFamilies } from "./catalog.js";
import { componentTypes } from "./componentTypes.js";
import { productTemplates } from "./productRegistry.js";
import type { ProductCategory, ProductFamily, ProductTemplate } from "./types.js";
import type { ComponentTypeDefinition } from "./componentTypes.js";

export const PRODUCT_SYSTEM_ENTITY_KINDS = [
  "PRODUCT_FAMILY",
  "PRODUCT_CATEGORY",
  "PRODUCT_TEMPLATE",
  "COMPONENT_TYPE",
] as const;

export type ProductSystemEntityKind = (typeof PRODUCT_SYSTEM_ENTITY_KINDS)[number];

export const DISPLAY_LABEL_MAX_LENGTH = 120;

export type DisplayLabelRecord = {
  entityKind: ProductSystemEntityKind;
  entityId: string;
  displayLabel: string;
  revision: number;
};

export type DisplayLabelCatalog = {
  label(kind: ProductSystemEntityKind, id: string): string;
  revision(kind: ProductSystemEntityKind, id: string): number;
};

export function isProductSystemEntityKind(
  value: string,
): value is ProductSystemEntityKind {
  return (PRODUCT_SYSTEM_ENTITY_KINDS as readonly string[]).includes(value);
}

export function displayLabelKey(
  kind: ProductSystemEntityKind,
  id: string,
): string {
  return `${kind}:${id}`;
}

export function seedDisplayLabelRecords(): DisplayLabelRecord[] {
  return [
    ...productFamilies.map((family) => ({
      entityKind: "PRODUCT_FAMILY" as const,
      entityId: family.id,
      displayLabel: family.label,
      revision: 1,
    })),
    ...productCategories.map((category) => ({
      entityKind: "PRODUCT_CATEGORY" as const,
      entityId: category.id,
      displayLabel: category.label,
      revision: 1,
    })),
    ...productTemplates.map((template) => ({
      entityKind: "PRODUCT_TEMPLATE" as const,
      entityId: template.code,
      displayLabel: template.label,
      revision: 1,
    })),
    ...componentTypes.map((type) => ({
      entityKind: "COMPONENT_TYPE" as const,
      entityId: type.id,
      displayLabel: type.label,
      revision: 1,
    })),
  ];
}

export function seededDisplayLabelCatalog(): DisplayLabelCatalog {
  return createDisplayLabelCatalog(seedDisplayLabelRecords());
}

export function isKnownProductSystemEntity(
  kind: ProductSystemEntityKind,
  id: string,
): boolean {
  return seedDisplayLabelRecords().some(
    (item) => item.entityKind === kind && item.entityId === id,
  );
}

export function validateDisplayLabel(
  value: unknown,
): { ok: true; displayLabel: string } | { ok: false; error: "invalid_label" } {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid_label" };
  }
  const displayLabel = value.trim();
  if (displayLabel.length === 0 || displayLabel.length > DISPLAY_LABEL_MAX_LENGTH) {
    return { ok: false, error: "invalid_label" };
  }
  return { ok: true, displayLabel };
}

export function createDisplayLabelCatalog(
  records: readonly DisplayLabelRecord[],
): DisplayLabelCatalog {
  const map = new Map<string, DisplayLabelRecord>();
  for (const record of records) {
    if (!isProductSystemEntityKind(record.entityKind)) {
      continue;
    }
    map.set(displayLabelKey(record.entityKind, record.entityId), record);
  }

  const missing = seedDisplayLabelRecords().filter(
    (seed) => !map.has(displayLabelKey(seed.entityKind, seed.entityId)),
  );
  if (missing.length > 0) {
    throw new Error(
      `missing_display_labels:${missing
        .map((item) => displayLabelKey(item.entityKind, item.entityId))
        .join(",")}`,
    );
  }

  return {
    label(kind, id) {
      return requiredRecord(map, kind, id).displayLabel;
    },
    revision(kind, id) {
      return requiredRecord(map, kind, id).revision;
    },
  };
}

export function presentedFamilies(
  labels: DisplayLabelCatalog,
): ProductFamily[] {
  return productFamilies.map((family) => ({
    ...family,
    label: labels.label("PRODUCT_FAMILY", family.id),
  }));
}

export function presentedCategories(
  labels: DisplayLabelCatalog,
): ProductCategory[] {
  return productCategories.map((category) => ({
    ...category,
    label: labels.label("PRODUCT_CATEGORY", category.id),
  }));
}

export function presentedTemplates(
  labels: DisplayLabelCatalog,
): ProductTemplate[] {
  return productTemplates.map((template) => ({
    ...template,
    label: labels.label("PRODUCT_TEMPLATE", template.code),
  }));
}

export function presentedTypes(
  labels: DisplayLabelCatalog,
): ComponentTypeDefinition[] {
  return componentTypes.map((type) => ({
    ...type,
    label: labels.label("COMPONENT_TYPE", type.id),
  }));
}

export function presentedTemplate(
  code: string,
  labels: DisplayLabelCatalog,
): ProductTemplate | undefined {
  return presentedTemplates(labels).find((item) => item.code === code);
}

function requiredRecord(
  map: ReadonlyMap<string, DisplayLabelRecord>,
  kind: ProductSystemEntityKind,
  id: string,
): DisplayLabelRecord {
  const record = map.get(displayLabelKey(kind, id));
  if (!record) {
    throw new Error(`unknown_display_label:${kind}:${id}`);
  }
  return record;
}
