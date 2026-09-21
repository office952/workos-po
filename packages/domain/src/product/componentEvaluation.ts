import type {
  ComponentCalculationResult,
  SharedCalculationContext,
} from "./componentContract.js";
import { getComponentContract } from "./componentRegistry.js";
import { noteEvaluateProductComponents } from "./evaluationTrace.js";
import { type ResolvedFormulaVersion } from "./resolveFormulas.js";
import { listTypeTechnicalSettings, type ComponentTechnicalSettingDefinition } from "./technicalSettings.js";
import type {
  ComponentTypeId,
  DraftValues,
  ProductComponent,
  ProductTemplate,
  TechnicalMeasurement,
} from "./types.js";

export type ComponentEvaluation = {
  readonly component: ProductComponent;
  readonly result: ComponentCalculationResult;
};

export function collectComponentMeasurements(
  template: ProductTemplate,
  selectedIds: readonly string[],
  values: DraftValues,
): TechnicalMeasurement[] {
  return template.components
    .filter((component) => selectedIds.includes(component.id))
    .flatMap((component) =>
      getComponentContract(component.typeId).collectMeasurements(values),
    );
}

export function evaluateProductComponents(input: {
  template: ProductTemplate;
  selectedComponentIds: readonly string[];
  values: DraftValues;
  measurements: readonly TechnicalMeasurement[];
  technicalSettingsForType?: (
    typeId: ComponentTypeId,
  ) => readonly ComponentTechnicalSettingDefinition[];
  formulaVersionsForType?: (typeId: ComponentTypeId) => readonly ResolvedFormulaVersion[];
}): readonly ComponentEvaluation[] {
  noteEvaluateProductComponents();
  const settingsForType = input.technicalSettingsForType ?? listTypeTechnicalSettings;
  const formulasForType = input.formulaVersionsForType ?? (() => []);
  return input.template.components
    .filter((component) => input.selectedComponentIds.includes(component.id))
    .map((component) => ({
      component,
      result: getComponentContract(component.typeId).calculate({
        values: input.values,
        measurements: input.measurements,
        shared: sharedContextFor(component, input.measurements),
        technicalSettings: settingsForType(component.typeId),
        formulaVersions: formulasForType(component.typeId),
      }),
    }));
}

export function lightingEvaluationFrom(
  evaluations: readonly ComponentEvaluation[],
): ComponentCalculationResult | undefined {
  return evaluations.find((item) => item.result.role === "LIGHTING")?.result;
}

function sharedContextFor(
  component: ProductComponent,
  measurements: readonly TechnicalMeasurement[],
): SharedCalculationContext {
  const sourceId = component.inputMapping?.confirmedAreaMm2FromComponentId;
  if (!sourceId) {
    return {};
  }
  const area = measurements.find(
    (item) => item.componentId === sourceId && item.unit === "mm2",
  );
  return area ? { confirmedAreaMm2: area.value } : {};
}
