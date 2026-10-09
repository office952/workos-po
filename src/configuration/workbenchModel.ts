import type {
  MissingFact,
  PresentedFormField,
  PresentedFormSection,
  PreviewTransport,
} from "../api/types";
import type { TechnicalDetailsState } from "../components/ConfigurationTechnicalDetails";

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

export function measuredFactsForCanvas(input: {
  preview: PreviewTransport;
  activeComponentId?: string;
  drafts: Record<string, string>;
  activeSection?: WorkbenchSection;
  technicalState?: TechnicalDetailsState;
}): Array<{ label: string; value: string; kind: "draft" | "calculated" | "catalog" }> {
  const technicalCurrent = (input.technicalState ?? "current") === "current";
  // During a fresh server evaluation, even previously rendered input and measured
  // facts must not be presented as current construction evidence.
  if (!technicalCurrent) return [];
  const facts: Array<{ label: string; value: string; kind: "draft" | "calculated" | "catalog" }> =
    [];
  if (input.activeSection) {
    for (const field of input.activeSection.fields) {
      const display = fieldDisplayValue(field, input.drafts);
      if (display !== "—") {
        facts.push({ label: field.label, value: display, kind: "draft" });
      }
    }
  }
  const details = input.preview.componentDetails?.filter(
    (detail) => detail.componentId === input.activeComponentId,
  );
  if (technicalCurrent) {
    for (const detail of details ?? []) {
      for (const fact of detail.facts) {
        if (fact.kind === "MEASURED" || fact.kind === "CALCULATED") {
          facts.push({
            label: fact.label,
            value: fact.value,
            kind: fact.kind === "MEASURED" ? "draft" : "calculated",
          });
        }
      }
    }
  }
  if (facts.length === 0 && input.activeComponentId) {
    for (const fact of input.preview.product.identityFacts) {
      if (fact.componentId === input.activeComponentId) {
        facts.push({ label: fact.label, value: fact.value, kind: "catalog" });
      }
    }
  }
  return facts.slice(0, 8);
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
