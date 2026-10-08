import { evaluateProductComponents } from "./componentEvaluation.js";
import { getComponentContract } from "./componentRegistry.js";
import { formulasForTypeFromResolved, type ResolvedFormulaVersion } from "./resolveFormulas.js";
import { technicalSettingsForTypeFromResolved, type ResolvedTechnicalSetting } from "./resolveTechnicalSettings.js";
import { listTypeTechnicalSettings } from "./technicalSettings.js";
import type { FormSchema, ProductDefinition, ProductTemplate } from "./types.js";

export type ConfigurationTechnicalFact = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly kind: "MEASURED" | "TECHNICAL_SETTING" | "CALCULATED";
  readonly sourceLabel: string;
};

export type ConfigurationComponentDetails = {
  readonly componentId: string;
  readonly label: string;
  readonly typeId: string;
  readonly facts: readonly ConfigurationTechnicalFact[];
  readonly inputFields: readonly { readonly fieldId: string; readonly label: string; readonly value: string; readonly componentLabel: string }[];
  readonly calculationLabel: string;
  readonly unavailable: readonly string[];
  readonly hasTechnicalSettings: boolean;
  readonly hasFormulas: boolean;
};

const numeric = new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 6 });
function display(value: number, unit: string): string {
  return `${numeric.format(value)} ${unit === "mm2" ? "mm²" : unit === "m2" ? "m²" : unit === "percent" ? "%" : unit}`;
}

/** Read-only live technical projection; no prices, graph transport, or new inputs. */
export function projectConfigurationComponentDetails(
  template: ProductTemplate,
  schema: FormSchema,
  definition: ProductDefinition,
  settings?: readonly ResolvedTechnicalSetting[],
  formulas?: readonly ResolvedFormulaVersion[],
): readonly ConfigurationComponentDetails[] {
  const evaluations = evaluateProductComponents({
    template,
    selectedComponentIds: definition.selectedComponentIds,
    values: definition.values,
    measurements: definition.measurements,
    technicalSettingsForType: settings ? (typeId) => technicalSettingsForTypeFromResolved(typeId, settings) : undefined,
    formulaVersionsForType: formulas ? (typeId) => formulasForTypeFromResolved(typeId, formulas) : undefined,
  });
  const fields = schema.sections.flatMap((section) => section.fields);
  return evaluations.map(({ component, result }) => {
    const contract = getComponentContract(component.typeId);
    const areaSource = component.inputMapping?.confirmedAreaMm2FromComponentId;
    const supplied = definition.measurements.filter((measurement) => measurement.componentId === areaSource && measurement.unit === "mm2");
    const dependencyIds = new Set([
      ...(contract.profile.inputFieldIds ?? []),
      ...supplied.map((measurement) => measurement.fieldId),
    ]);
    // Keep missing mapped inputs navigable even before a measurement is confirmed.
    if (areaSource && supplied.length === 0) {
      const sourceComponent = template.components.find((item) => item.id === areaSource);
      const profile = sourceComponent ? getComponentContract(sourceComponent.typeId).profile : null;
      if (profile?.measurement === "confirmed_area_mm2") {
        for (const fieldId of profile.measurementFieldIds ?? []) dependencyIds.add(fieldId);
      }
    }
    const inputFields = [...dependencyIds].flatMap((fieldId) => {
      const field = fields.find((item) => item.id === fieldId);
      if (!field) return [];
      const componentLabel = template.components.find((item) => item.id === field.componentId)?.label ?? field.label;
      const measurement = definition.measurements.find((item) => item.fieldId === fieldId);
      return [{ fieldId, label: field.label, componentLabel, value: measurement ? display(measurement.value, measurement.unit) : "De completat" }];
    });
    const definitions = settings ? technicalSettingsForTypeFromResolved(component.typeId, settings) : listTypeTechnicalSettings(component.typeId);
    const measuredFacts: ConfigurationTechnicalFact[] = supplied.map((measurement) => ({
      id: `input:${measurement.fieldId}`, label: "Suprafață preluată", value: display(measurement.value, measurement.unit), kind: "MEASURED",
      sourceLabel: `Din ${template.components.find((item) => item.id === areaSource)?.label ?? "componenta sursă"}, confirmată de operator`,
    }));
    const settingFacts: ConfigurationTechnicalFact[] = definitions.map((setting) => {
      const version = settings?.find((item) => item.typeId === component.typeId && item.settingId === setting.id);
      return {
        id: `setting:${setting.id}`, label: setting.label,
        value: setting.resolution.status === "RESOLVED" ? display(setting.resolution.value, setting.unit) : "Nesetat",
        kind: "TECHNICAL_SETTING", sourceLabel: version
          ? `${version.source === "ORGANIZATION" ? "Setare organizație" : "Valoare inițială a platformei"} · versiunea ${version.version}`
          : "Setare de dezvoltare; nu este o versiune a organizației",
      };
    });
    const calculatedFacts: ConfigurationTechnicalFact[] = result.quantities.map((quantity) => ({
      id: `result:${quantity.id}`, label: quantity.label, value: display(quantity.value, quantity.unit), kind: "CALCULATED",
      sourceLabel: "Calcul tehnic pentru configurația curentă",
    }));
    return {
      componentId: component.id, label: component.label, typeId: component.typeId,
      facts: [...measuredFacts, ...settingFacts, ...calculatedFacts], inputFields,
      calculationLabel: result.status === "CALCULATED" ? "Calculat" : result.status === "PARTIAL" ? "Calcul parțial" : result.status === "MISSING_MEASUREMENT" ? "Lipsesc măsurători" : "Calcul indisponibil",
      unavailable: [...new Set([...result.unavailable, ...definition.missing.filter((item) => dependencyIds.has(item.fieldId)).map((item) => `${item.label} · de completat`)])],
      hasTechnicalSettings: definitions.length > 0,
      hasFormulas: Boolean(formulas?.some((item) => item.componentTypeId === component.typeId)),
    };
  });
}
