import type {
  DraftValues,
  FormFieldType,
  PresentedFormField,
  PresentedFormSchema,
  PresentedFormSection,
} from "../api/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function presentFieldType(value: unknown): FormFieldType | null {
  if (value === "text" || value === "select" || value === "number") {
    return value;
  }
  return null;
}

function presentOptions(value: unknown): PresentedFormField["options"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    if (
      !record ||
      typeof record.value !== "string" ||
      typeof record.label !== "string"
    ) {
      return [];
    }
    return [{ value: record.value, label: record.label }];
  });
}

function presentField(value: unknown): PresentedFormField | null {
  const record = asRecord(value);
  const type = presentFieldType(record?.type);
  if (
    !record ||
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    type === null
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    type,
    required: record.required === true,
    hint: typeof record.hint === "string" ? record.hint : undefined,
    min: typeof record.min === "number" ? record.min : undefined,
    options: presentOptions(record.options),
  };
}

function presentSection(value: unknown): PresentedFormSection | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || typeof record.title !== "string") {
    return null;
  }
  const fields = Array.isArray(record.fields)
    ? record.fields.flatMap((field) => {
        const presented = presentField(field);
        return presented ? [presented] : [];
      })
    : [];
  if (fields.length === 0) {
    return null;
  }
  return { id: record.id, title: record.title, fields };
}

export function presentFormSchema(value: unknown): PresentedFormSchema | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== "string" || !Array.isArray(record.sections)) {
    return null;
  }
  const sections = record.sections.flatMap((section) => {
    const presented = presentSection(section);
    return presented ? [presented] : [];
  });
  return { id: record.id, sections };
}

export function listFormFields(
  schema: PresentedFormSchema | null,
): PresentedFormField[] {
  return schema?.sections.flatMap((section) => section.fields) ?? [];
}

export function valuesForTransport(
  drafts: Record<string, string>,
  schema: PresentedFormSchema | null,
): DraftValues {
  const values: DraftValues = {};
  for (const field of listFormFields(schema)) {
    const raw = drafts[field.id];
    if (raw === undefined || raw.trim() === "") {
      values[field.id] = null;
      continue;
    }
    if (field.type === "number") {
      const parsed = Number(raw.replace(",", "."));
      values[field.id] = Number.isFinite(parsed) ? parsed : null;
      continue;
    }
    values[field.id] = raw;
  }
  return values;
}

export function draftsFromValues(values: DraftValues): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    drafts[key] = value === null || value === undefined ? "" : String(value);
  }
  return drafts;
}

export function valuesBeforeSchema(drafts: Record<string, string>): DraftValues {
  const values: DraftValues = {};
  for (const [key, raw] of Object.entries(drafts)) {
    if (raw.trim() === "") {
      values[key] = null;
      continue;
    }
    if (/^-?\d+(?:[.,]\d+)?$/.test(raw.trim())) {
      const parsed = Number(raw.replace(",", "."));
      values[key] = Number.isFinite(parsed) ? parsed : raw;
      continue;
    }
    values[key] = raw;
  }
  return values;
}
