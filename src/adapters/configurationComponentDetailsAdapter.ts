import type { ConfigurationComponentDetails } from "../api/types";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Preserve server display values and targets; never calculate or infer them. */
export function presentConfigurationComponentDetails(value: unknown): ConfigurationComponentDetails[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const component = record(item);
    if (!component || typeof component.componentId !== "string" || typeof component.label !== "string" || typeof component.typeId !== "string" || typeof component.calculationLabel !== "string") return [];
    const facts: ConfigurationComponentDetails["facts"] = Array.isArray(component.facts) ? component.facts.flatMap((item) => {
      const fact = record(item);
      if (!fact || typeof fact.id !== "string" || typeof fact.label !== "string" || typeof fact.value !== "string" || typeof fact.sourceLabel !== "string" || !["MEASURED", "TECHNICAL_SETTING", "CALCULATED"].includes(String(fact.kind))) return [];
      return [{ id: fact.id, label: fact.label, value: fact.value, sourceLabel: fact.sourceLabel, kind: fact.kind as ConfigurationComponentDetails["facts"][number]["kind"] }];
    }) : [];
    const inputFields = Array.isArray(component.inputFields) ? component.inputFields.flatMap((item) => {
      const field = record(item);
      if (!field || typeof field.fieldId !== "string" || typeof field.label !== "string" || typeof field.value !== "string" || typeof field.componentLabel !== "string") return [];
      return [{ fieldId: field.fieldId, label: field.label, value: field.value, componentLabel: field.componentLabel }];
    }) : [];
    return [{ componentId: component.componentId, label: component.label, typeId: component.typeId, calculationLabel: component.calculationLabel, facts, inputFields,
      unavailable: Array.isArray(component.unavailable) ? component.unavailable.filter((reason): reason is string => typeof reason === "string") : [],
      hasTechnicalSettings: component.hasTechnicalSettings === true, hasFormulas: component.hasFormulas === true,
    }];
  });
}
