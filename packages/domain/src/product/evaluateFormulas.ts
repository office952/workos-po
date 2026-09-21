import { VOLUME_PERIMETER_FIELD } from "./volume.js";
import {
  findFormulaDefinition,
  formulaValueKindForJobInput,
  CONFIRMED_PERIMETER_JOB_INPUT_ID,
  type FormulaDefinition,
} from "./formulaDefinition.js";
import {
  collectFormulaRefs,
  formulaDependencyGraphHasCycle,
  type FormulaAst,
} from "./formulaAst.js";
import {
  addFormulaValues,
  ceilFormulaValue,
  divideFormulaValues,
  formulaValueKindFromTechnicalUnit,
  multiplyFormulaValues,
  subtractFormulaValues,
  type FormulaTypedValue,
  type FormulaValueKind,
} from "./formulaValue.js";
import type { ResolvedFormulaVersion } from "./resolveFormulas.js";
import type { FormulaIssue } from "./formulaVersion.js";
import {
  findTechnicalSettingDefinitionBySettingId,
  resolvedSettingValue,
  type ComponentTechnicalSettingDefinition,
} from "./technicalSettings.js";
import type { TechnicalMeasurement } from "./types.js";

export type FormulaBreakdownStep = {
  readonly label: string;
  readonly value: number;
  readonly valueKind: FormulaValueKind;
};

export type FormulaResolvedReference = {
  readonly kind: "CONFIG_REF" | "JOB_REF" | "FORMULA_REF";
  readonly id: string;
  readonly value: number;
  readonly valueKind: FormulaValueKind;
  readonly unit?: string;
};

export type FormulaFrozenTrace = {
  readonly formulaId: string;
  readonly version: number;
  readonly source: string;
  readonly scope: "ORGANIZATION";
  readonly effectiveFrom: string;
  readonly astIdentity: string;
  readonly resultId: string;
  readonly resultValue: number;
  readonly resultUnit: string;
  readonly resultValueKind: FormulaValueKind;
  readonly explanation: string;
  readonly resolvedReferences: readonly FormulaResolvedReference[];
};

export type FormulaEvaluationResult = {
  readonly formulaId: string;
  readonly resultId: string;
  readonly value: number;
  readonly valueKind: FormulaValueKind;
  readonly unit: string;
  readonly explanation: string;
  readonly breakdown: readonly FormulaBreakdownStep[];
  readonly trace: FormulaFrozenTrace;
};

export type FormulaDagEvaluation =
  | {
      readonly ok: true;
      readonly results: readonly FormulaEvaluationResult[];
    }
  | {
      readonly ok: false;
      readonly reason: string;
      readonly issues: readonly FormulaIssue[];
    };

export function evaluateFormulaDag(input: {
  readonly formulas: readonly ResolvedFormulaVersion[];
  readonly technicalSettings: readonly ComponentTechnicalSettingDefinition[];
  readonly measurements: readonly TechnicalMeasurement[];
}): FormulaDagEvaluation {
  const cycle = detectFormulaCycles(input.formulas);
  if (cycle) {
    return cycle;
  }
  const order = topologicalFormulaOrder(input.formulas);
  if (!order.ok) {
    return order;
  }

  const evaluated = new Map<string, FormulaEvaluationResult>();
  for (const formula of order.formulas) {
    const definition = findFormulaDefinition(formula.formulaId);
    if (!definition) {
      return invalid(`Formula ${formula.formulaId} nu este recunoscută.`, formula.formulaId);
    }
    const computed = evaluateAst(formula.expression, {
      definition,
      formula,
      formulas: input.formulas,
      technicalSettings: input.technicalSettings,
      measurements: input.measurements,
      evaluated,
      references: [],
    });
    if (!computed.ok) {
      return computed;
    }
    if (computed.value.valueKind !== definition.resultValueKind) {
      return invalid(
        "Rezultatul formulei nu are dimensiunea semantică așteptată.",
        formula.formulaId,
      );
    }
    const result: FormulaEvaluationResult = {
      formulaId: formula.formulaId,
      resultId: definition.resultId,
      value: computed.value.value,
      valueKind: computed.value.valueKind,
      unit: definition.resultUnit,
      explanation: computed.explanation,
      breakdown: computed.breakdown,
      trace: {
        formulaId: formula.formulaId,
        version: formula.version,
        source: formula.source,
        scope: "ORGANIZATION",
        effectiveFrom: formula.effectiveFrom,
        astIdentity: formula.astIdentity,
        resultId: definition.resultId,
        resultValue: computed.value.value,
        resultUnit: definition.resultUnit,
        resultValueKind: computed.value.valueKind,
        explanation: computed.explanation,
        resolvedReferences: computed.references,
      },
    };
    evaluated.set(formula.formulaId, result);
  }

  return { ok: true, results: order.formulas.map((item) => evaluated.get(item.formulaId)!) };
}

export function formulaResultById(
  evaluation: Extract<FormulaDagEvaluation, { ok: true }>,
  resultId: string,
): FormulaEvaluationResult | undefined {
  return evaluation.results.find((item) => item.resultId === resultId);
}

function detectFormulaCycles(
  formulas: readonly ResolvedFormulaVersion[],
): Extract<FormulaDagEvaluation, { ok: false }> | null {
  if (formulaDependencyGraphHasCycle(formulas)) {
    return invalid("Formulele de calcul conțin o dependență ciclică.", "graph");
  }
  return null;
}

function topologicalFormulaOrder(
  formulas: readonly ResolvedFormulaVersion[],
):
  | { readonly ok: true; readonly formulas: readonly ResolvedFormulaVersion[] }
  | Extract<FormulaDagEvaluation, { ok: false }> {
  const byId = new Map<string, ResolvedFormulaVersion>(
    formulas.map((item) => [item.formulaId, item]),
  );
  const remaining = new Set<string>(formulas.map((item) => item.formulaId));
  const ordered: ResolvedFormulaVersion[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining].filter((formulaId) => {
      const formula = byId.get(formulaId);
      if (!formula) {
        return false;
      }
      return collectFormulaRefs(formula.expression).every((ref) => !remaining.has(ref));
    });
    if (ready.length === 0) {
      return invalid("Graful de formule nu poate fi evaluat în ordine deterministă.", "graph");
    }
    ready.sort((left, right) => left.localeCompare(right));
    for (const formulaId of ready) {
      const formula = byId.get(formulaId);
      if (!formula) {
        return invalid(`Formula ${formulaId} lipsește din graf.`, formulaId);
      }
      ordered.push(formula);
      remaining.delete(formulaId);
    }
  }
  return { ok: true, formulas: ordered };
}

type EvalContext = {
  readonly definition: FormulaDefinition;
  readonly formula: ResolvedFormulaVersion;
  readonly formulas: readonly ResolvedFormulaVersion[];
  readonly technicalSettings: readonly ComponentTechnicalSettingDefinition[];
  readonly measurements: readonly TechnicalMeasurement[];
  readonly evaluated: ReadonlyMap<string, FormulaEvaluationResult>;
  readonly references: FormulaResolvedReference[];
};

function evaluateAst(
  ast: FormulaAst,
  context: EvalContext,
):
  | {
      readonly ok: true;
      readonly value: FormulaTypedValue;
      readonly explanation: string;
      readonly breakdown: FormulaBreakdownStep[];
      readonly references: FormulaResolvedReference[];
    }
  | Extract<FormulaDagEvaluation, { ok: false }> {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT": {
      if (!Number.isFinite(ast.value)) {
        return invalid("Constanta numerică trebuie să fie finită.", context.formula.formulaId);
      }
      return okValue(
        { value: ast.value, valueKind: ast.valueKind },
        formatNumber(ast.value),
        context.references,
      );
    }
    case "CONFIG_REF": {
      if (!context.definition.allowedReferences.configSettingIds.includes(ast.settingId)) {
        return invalid(
          "Referința de setare tehnică nu este permisă pentru această formulă.",
          ast.settingId,
        );
      }
      const setting = findTechnicalSettingDefinitionBySettingId(ast.settingId);
      const value = resolvedSettingValue(context.technicalSettings, ast.settingId);
      const valueKind = setting ? formulaValueKindFromTechnicalUnit(setting.unit) : null;
      if (value === undefined || !setting || !valueKind) {
        return invalid("Setarea tehnică referită lipsește.", ast.settingId);
      }
      const references = [
        ...context.references,
        {
          kind: "CONFIG_REF" as const,
          id: ast.settingId,
          value,
          valueKind,
          unit: setting.unit,
        },
      ];
      return okValue({ value, valueKind }, setting.label, references);
    }
    case "JOB_REF": {
      if (!context.definition.allowedReferences.jobInputIds.includes(ast.inputId)) {
        return invalid(
          "Referința de măsurătoare nu este permisă pentru această formulă.",
          ast.inputId,
        );
      }
      const resolved = resolveJobInput(ast.inputId, context.measurements);
      if (!resolved) {
        return invalid("Măsurătoarea referită lipsește.", ast.inputId);
      }
      const references = [
        ...context.references,
        {
          kind: "JOB_REF" as const,
          id: ast.inputId,
          value: resolved.value,
          valueKind: resolved.valueKind,
          unit: resolved.unit,
        },
      ];
      return okValue(resolved, "Perimetru confirmat", references);
    }
    case "FORMULA_REF": {
      if (
        !(context.definition.allowedReferences.formulaIds as readonly string[]).includes(
          ast.formulaId,
        )
      ) {
        return invalid(
          "Referința de formulă nu este permisă pentru această formulă.",
          ast.formulaId,
        );
      }
      const prior = context.evaluated.get(ast.formulaId);
      if (!prior) {
        return invalid("Formula referită nu a fost evaluată.", ast.formulaId);
      }
      const definition = findFormulaDefinition(ast.formulaId);
      const references = [
        ...context.references,
        {
          kind: "FORMULA_REF" as const,
          id: ast.formulaId,
          value: prior.value,
          valueKind: prior.valueKind,
          unit: prior.unit,
        },
      ];
      return okValue(
        { value: prior.value, valueKind: prior.valueKind },
        definition?.label ?? ast.formulaId,
        references,
      );
    }
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE": {
      if (!context.definition.allowedOperators.includes(ast.kind)) {
        return invalid("Operatorul nu este permis pentru această formulă.", ast.kind);
      }
      const left = evaluateAst(ast.left, context);
      if (!left.ok) {
        return left;
      }
      const right = evaluateAst(ast.right, { ...context, references: left.references });
      if (!right.ok) {
        return right;
      }
      const combined =
        ast.kind === "ADD"
          ? addFormulaValues(left.value, right.value)
          : ast.kind === "SUBTRACT"
            ? subtractFormulaValues(left.value, right.value)
            : ast.kind === "MULTIPLY"
              ? multiplyFormulaValues(left.value, right.value)
              : divideFormulaValues(left.value, right.value);
      if ("reason" in combined) {
        return invalid(combined.reason, ast.kind);
      }
      if (!Number.isFinite(combined.value)) {
        return invalid("Rezultatul formulei trebuie să fie finit.", context.formula.formulaId);
      }
      return okValue(
        combined,
        `${left.explanation} ${operatorSymbol(ast.kind)} ${right.explanation}`,
        right.references,
        [...left.breakdown, ...right.breakdown],
      );
    }
    case "CEIL": {
      if (!context.definition.allowedOperators.includes(ast.kind)) {
        return invalid("Operatorul nu este permis pentru această formulă.", ast.kind);
      }
      const operand = evaluateAst(ast.operand, context);
      if (!operand.ok) {
        return operand;
      }
      const combined = ceilFormulaValue(operand.value);
      if ("reason" in combined) {
        return invalid(combined.reason, ast.kind);
      }
      if (!Number.isFinite(combined.value)) {
        return invalid("Rezultatul formulei trebuie să fie finit.", context.formula.formulaId);
      }
      return okValue(
        combined,
        `rotunjire în sus (${operand.explanation})`,
        operand.references,
        operand.breakdown,
      );
    }
    default: {
      const _exhaustive: never = ast;
      return invalid("Nodul AST nu este suportat.", "expression");
    }
  }
}

function resolveJobInput(
  inputId: string,
  measurements: readonly TechnicalMeasurement[],
): (FormulaTypedValue & { unit: "mm" }) | null {
  const valueKind = formulaValueKindForJobInput(inputId);
  if (inputId !== CONFIRMED_PERIMETER_JOB_INPUT_ID || valueKind !== "LENGTH") {
    return null;
  }
  const perimeter = measurements.find(
    (item) => item.fieldId === VOLUME_PERIMETER_FIELD && item.confirmed,
  );
  if (!perimeter || perimeter.value <= 0 || !Number.isFinite(perimeter.value)) {
    return null;
  }
  return { value: perimeter.value, valueKind, unit: "mm" };
}

function okValue(
  value: FormulaTypedValue,
  explanation: string,
  references: readonly FormulaResolvedReference[],
  breakdown: readonly FormulaBreakdownStep[] = [],
) {
  return {
    ok: true as const,
    value,
    explanation,
    references: [...references],
    breakdown: [
      ...breakdown,
      { label: explanation, value: value.value, valueKind: value.valueKind },
    ],
  };
}

function invalid(
  reason: string,
  field: string,
): Extract<FormulaDagEvaluation, { ok: false }> {
  return {
    ok: false,
    reason,
    issues: [{ field, reason }],
  };
}

function operatorSymbol(kind: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE"): string {
  switch (kind) {
    case "ADD":
      return "+";
    case "SUBTRACT":
      return "−";
    case "MULTIPLY":
      return "×";
    case "DIVIDE":
      return "÷";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
