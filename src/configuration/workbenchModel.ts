import type {
  MissingFact,
  PresentedFormField,
  PresentedFormSection,
  PreviewTransport,
} from "../api/types";
export type WorkbenchLayerStatus =
  | "configurable"
  | "complete"
  | "attention"
  | "readonly";

export type WorkbenchSection = PresentedFormSection & {
  facts: PreviewTransport["product"]["identityFacts"];
};

export type WorkbenchNavigationState = {
  sectionId: string | null;
  composition: boolean;
};

export function workbenchLayerStatusLabel(status: WorkbenchLayerStatus): string {
  switch (status) {
    case "configurable":
      return "De configurat";
    case "complete":
      return "Complet";
    case "attention":
      return "Necesită atenție";
    case "readonly":
      return "Doar consultare";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function buildWorkbenchSections(preview: PreviewTransport): WorkbenchSection[] {
  const schemaSections = preview.formSchema?.sections ?? [];
  return [
    ...schemaSections.map((section) => ({
      ...section,
      facts: preview.product.identityFacts.filter(
        (fact) => Boolean(section.componentId) && fact.componentId === section.componentId,
      ),
    })),
    ...preview.selectedComponents
      .filter((component) => !schemaSections.some((section) => section.componentId === component.id))
      .map((component) => ({
        id: `component:${component.id}`,
        componentId: component.id,
        title: component.label,
        fields: [] as PresentedFormField[],
        facts: preview.product.identityFacts.filter((fact) => fact.componentId === component.id),
      })),
  ];
}

export function workbenchLayerStatus(
  section: WorkbenchSection,
  missing: readonly MissingFact[],
  drafts: Record<string, string>,
): WorkbenchLayerStatus {
  if (section.fields.length === 0) {
    return "readonly";
  }
  const sectionMissing = missing.filter((fact) =>
    section.fields.some((field) => field.id === fact.fieldId),
  );
  if (sectionMissing.length > 0) {
    return "attention";
  }
  const requiredComplete = section.fields
    .filter((field) => field.required)
    .every((field) => Boolean(drafts[field.id]?.trim()));
  if (requiredComplete && section.fields.length > 0) {
    return "complete";
  }
  return "configurable";
}

export function fieldDisplayValue(
  field: PresentedFormField,
  drafts: Record<string, string>,
): string {
  const value = drafts[field.id]?.trim();
  if (!value) {
    return "—";
  }
  return field.options.find((option) => option.value === value)?.label ?? value;
}

export function workbenchSectionNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

export function workbenchSectionMissing(
  section: WorkbenchSection,
  missing: readonly MissingFact[],
): MissingFact[] {
  return missing.filter((fact) => section.fields.some((field) => field.id === fact.fieldId));
}

/**
 * Inline error under a field, from the server's last list of missing facts.
 * Hidden while the server has not answered for the current values.
 */
export function workbenchFieldError(
  field: { id: string; label: string },
  missing: readonly MissingFact[],
  draft: string | undefined,
  current: boolean,
): string | undefined {
  if (!current) return undefined;
  const fact = missing.find((item) => item.fieldId === field.id);
  if (!fact) return undefined;
  const reason = draft?.trim()
    ? "Valoare neacceptată. Serverul nu o poate folosi la verificare."
    : "Obligatoriu. Serverul nu poate verifica fără această informație.";
  return fact.label.trim() === field.label.trim() ? reason : `${reason} ${fact.label}`;
}

/** One short line under a part: what the server last reported for it. */
export function workbenchSectionSummary(status: WorkbenchLayerStatus, missingCount: number): string {
  switch (status) {
    case "attention":
      return missingCount > 0 ? `${missingCount} lipsă` : workbenchLayerStatusLabel(status);
    case "complete":
    case "configurable":
    case "readonly":
      return workbenchLayerStatusLabel(status);
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Parts that need no more input: complete editable parts and consult-only parts. */
export function workbenchCompletion(
  sections: readonly WorkbenchSection[],
  missing: readonly MissingFact[],
  drafts: Record<string, string>,
): { settled: number; total: number } {
  const settled = sections.filter((section) => {
    const status = workbenchLayerStatus(section, missing, drafts);
    return status === "complete" || status === "readonly";
  }).length;
  return { settled, total: sections.length };
}

export type WorkbenchMissingEntry = MissingFact & {
  fieldId: string;
  sectionId: string;
  sectionNumber: string;
  sectionTitle: string;
};

/** Server-reported missing facts that the operator can open in a part of this schema. */
export function workbenchMissingEntries(
  sections: readonly WorkbenchSection[],
  missing: readonly MissingFact[],
): WorkbenchMissingEntry[] {
  return missing.flatMap((fact) => {
    const index = sections.findIndex((section) => section.fields.some((field) => field.id === fact.fieldId));
    const section = sections[index];
    return section && fact.fieldId
      ? [{
          ...fact,
          fieldId: fact.fieldId,
          sectionId: section.id,
          sectionNumber: workbenchSectionNumber(index),
          sectionTitle: section.title,
        }]
      : [];
  });
}

/** "02 Față · 2" per part that still has missing facts, in schema order. */
export function workbenchMissingByPart(entries: readonly WorkbenchMissingEntry[]): string[] {
  const parts: { key: string; label: string; count: number }[] = [];
  for (const entry of entries) {
    const existing = parts.find((part) => part.key === entry.sectionId);
    if (existing) existing.count += 1;
    else parts.push({ key: entry.sectionId, label: `${entry.sectionNumber} ${entry.sectionTitle}`, count: 1 });
  }
  return parts.map((part) => `${part.label} · ${part.count}`);
}

export function resolveInitialWorkbenchNavigation(
  sections: WorkbenchSection[],
  stored: WorkbenchNavigationState | null | undefined,
): { sectionId: string | null; composition: boolean } {
  if (stored?.composition) {
    return { sectionId: null, composition: true };
  }
  if (stored?.sectionId && sections.some((section) => section.id === stored.sectionId)) {
    return { sectionId: stored.sectionId, composition: false };
  }
  return { sectionId: sections[0]?.id ?? null, composition: false };
}
