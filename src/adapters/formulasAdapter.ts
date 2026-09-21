import { asNumber, asRecord, asString } from "./record";

export type FormulaAstTransport =
  | { kind: "NUMERIC_CONSTANT"; value: number; valueKind: string }
  | { kind: "CONFIG_REF"; settingId: string }
  | { kind: "JOB_REF"; inputId: string }
  | { kind: "FORMULA_REF"; formulaId: string }
  | {
      kind: "ADD" | "SUBTRACT" | "MULTIPLY" | "DIVIDE";
      left: FormulaAstTransport;
      right: FormulaAstTransport;
    }
  | { kind: "CEIL"; operand: FormulaAstTransport };

export type FormulaAdminItem = {
  formulaId: string;
  resultId: string;
  typeId: string;
  label: string;
  description: string;
  resultUnit: string;
  resultValueKind: string;
  allowedOperators: string[];
  allowedConfigIds: string[];
  allowedJobIds: string[];
  allowedFormulaIds: string[];
  expression: FormulaAstTransport | null;
  explanation: string | null;
  source: string | null;
  sourceLabel: string | null;
  version: number | null;
  status: string | null;
  statusLabel: string | null;
  effectiveFrom: string | null;
};

export type FormulaHistoryItem = {
  formulaId: string;
  resultId: string;
  version: number;
  status: string;
  statusLabel: string;
  source: string;
  sourceLabel: string;
  createdAt: string | null;
  effectiveFrom: string | null;
};

export type FormulasAdminTransport = {
  canEdit: boolean;
  resolutionOk: boolean;
  guidance: string | null;
  formulas: FormulaAdminItem[];
  history: FormulaHistoryItem[];
};

export function presentFormulasAdmin(payload: unknown): FormulasAdminTransport | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  const formulas = Array.isArray(record.formulas)
    ? record.formulas.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.formulaId !== "string") {
          return [];
        }
        const allowed = asRecord(row.allowedReferences);
        return [
          {
            formulaId: row.formulaId,
            resultId: asString(row.resultId) ?? "",
            typeId: asString(row.typeId) ?? "",
            label: asString(row.label) ?? row.formulaId,
            description: asString(row.description) ?? "",
            resultUnit: asString(row.resultUnit) ?? "",
            resultValueKind: asString(row.resultValueKind) ?? "",
            allowedOperators: asStringArray(row.allowedOperators),
            allowedConfigIds: asStringArray(allowed?.configSettingIds),
            allowedJobIds: asStringArray(allowed?.jobInputIds),
            allowedFormulaIds: asStringArray(allowed?.formulaIds),
            expression: presentFormulaAst(row.expression),
            explanation: asString(row.explanation),
            source: asString(row.source),
            sourceLabel: asString(row.sourceLabel),
            version: asNumber(row.version),
            status: asString(row.status),
            statusLabel: asString(row.statusLabel),
            effectiveFrom: asString(row.effectiveFrom),
          },
        ];
      })
    : [];
  const history = Array.isArray(record.history)
    ? record.history.flatMap((item) => {
        const row = asRecord(item);
        if (!row || typeof row.version !== "number" || typeof row.formulaId !== "string") {
          return [];
        }
        return [
          {
            formulaId: row.formulaId,
            resultId: asString(row.resultId) ?? "",
            version: row.version,
            status: asString(row.status) ?? "",
            statusLabel: asString(row.statusLabel) ?? "",
            source: asString(row.source) ?? "",
            sourceLabel: asString(row.sourceLabel) ?? "",
            createdAt: asString(row.createdAt),
            effectiveFrom: asString(row.effectiveFrom),
          },
        ];
      })
    : [];
  return {
    canEdit: record.canEdit === true,
    resolutionOk: record.resolutionOk !== false,
    guidance: asString(record.guidance),
    formulas,
    history,
  };
}

export function presentFormulaAst(value: unknown): FormulaAstTransport | null {
  const row = asRecord(value);
  if (!row || typeof row.kind !== "string") {
    return null;
  }
  switch (row.kind) {
    case "NUMERIC_CONSTANT": {
      const numeric = asNumber(row.value);
      const valueKind = asString(row.valueKind);
      return numeric === null || !valueKind
        ? null
        : { kind: "NUMERIC_CONSTANT", value: numeric, valueKind };
    }
    case "CONFIG_REF": {
      const settingId = asString(row.settingId);
      return settingId ? { kind: "CONFIG_REF", settingId } : null;
    }
    case "JOB_REF": {
      const inputId = asString(row.inputId);
      return inputId ? { kind: "JOB_REF", inputId } : null;
    }
    case "FORMULA_REF": {
      const formulaId = asString(row.formulaId);
      return formulaId ? { kind: "FORMULA_REF", formulaId } : null;
    }
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE": {
      const left = presentFormulaAst(row.left);
      const right = presentFormulaAst(row.right);
      return left && right ? { kind: row.kind, left, right } : null;
    }
    case "CEIL": {
      const operand = presentFormulaAst(row.operand);
      return operand ? { kind: "CEIL", operand } : null;
    }
    default:
      return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
