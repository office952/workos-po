import { SelectField } from "../components/SelectField";
import { TextField } from "../components/TextField";
import type { FormulaAdminItem, FormulaAstTransport } from "../adapters/formulasAdapter";

type FormulaAstEditorProps = {
  id: string;
  formula: FormulaAdminItem;
  value: FormulaAstTransport | null;
  disabled: boolean;
  onChange: (next: FormulaAstTransport) => void;
};

const VALUE_KINDS = [
  { value: "SCALAR", label: "Scalar" },
  { value: "LENGTH", label: "Lungime" },
  { value: "POWER", label: "Putere" },
  { value: "PERCENT", label: "Procent" },
  { value: "COUNT", label: "Număr" },
];

export function FormulaAstEditor({
  id,
  formula,
  value,
  disabled,
  onChange,
}: FormulaAstEditorProps) {
  const kinds = nodeKindOptions(formula);
  const current = value ?? defaultAst(formula);

  return (
    <div>
      <SelectField
        id={`${id}-kind`}
        label="Tip expresie"
        value={current.kind}
        disabled={disabled}
        options={kinds}
        onChange={(kind) => {
          onChange(astForKind(kind, formula, current));
        }}
      />
      {renderBody(id, formula, current, disabled, onChange)}
    </div>
  );
}

function renderBody(
  id: string,
  formula: FormulaAdminItem,
  current: FormulaAstTransport,
  disabled: boolean,
  onChange: (next: FormulaAstTransport) => void,
) {
  switch (current.kind) {
    case "NUMERIC_CONSTANT":
      return (
        <>
          <TextField
            id={`${id}-value`}
            label="Constantă"
            value={String(current.value)}
            inputMode="decimal"
            disabled={disabled}
            onChange={(raw) => {
              const parsed = Number(raw.replace(",", "."));
              onChange({
                ...current,
                value: Number.isFinite(parsed) ? parsed : current.value,
              });
            }}
          />
          <SelectField
            id={`${id}-value-kind`}
            label="Dimensiune"
            value={current.valueKind}
            disabled={disabled}
            options={VALUE_KINDS}
            onChange={(valueKind) => {
              onChange({ ...current, valueKind });
            }}
          />
        </>
      );
    case "CONFIG_REF":
      return (
        <SelectField
          id={`${id}-config`}
          label="Setare tehnică"
          value={current.settingId}
          disabled={disabled}
          options={formula.allowedConfigIds.map((item) => ({ value: item, label: item }))}
          onChange={(settingId) => {
            onChange({ kind: "CONFIG_REF", settingId });
          }}
        />
      );
    case "JOB_REF":
      return (
        <SelectField
          id={`${id}-job`}
          label="Măsurătoare"
          value={current.inputId}
          disabled={disabled}
          options={formula.allowedJobIds.map((item) => ({
            value: item,
            label: item === "confirmedPerimeterMm" ? "Perimetru confirmat" : item,
          }))}
          onChange={(inputId) => {
            onChange({ kind: "JOB_REF", inputId });
          }}
        />
      );
    case "FORMULA_REF":
      return (
        <SelectField
          id={`${id}-formula`}
          label="Formulă"
          value={current.formulaId}
          disabled={disabled}
          options={formula.allowedFormulaIds.map((item) => ({ value: item, label: item }))}
          onChange={(formulaId) => {
            onChange({ kind: "FORMULA_REF", formulaId });
          }}
        />
      );
    case "CEIL":
      return (
        <FormulaAstEditor
          id={`${id}-operand`}
          formula={formula}
          value={current.operand}
          disabled={disabled}
          onChange={(operand) => {
            onChange({ kind: "CEIL", operand });
          }}
        />
      );
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
      return (
        <>
          <FormulaAstEditor
            id={`${id}-left`}
            formula={formula}
            value={current.left}
            disabled={disabled}
            onChange={(left) => {
              onChange({ ...current, left });
            }}
          />
          <FormulaAstEditor
            id={`${id}-right`}
            formula={formula}
            value={current.right}
            disabled={disabled}
            onChange={(right) => {
              onChange({ ...current, right });
            }}
          />
        </>
      );
    default: {
      const _exhaustive: never = current;
      return _exhaustive;
    }
  }
}

function nodeKindOptions(formula: FormulaAdminItem): { value: string; label: string }[] {
  const options = [
    { value: "NUMERIC_CONSTANT", label: "Constantă" },
    ...(formula.allowedConfigIds.length > 0
      ? [{ value: "CONFIG_REF", label: "Setare tehnică" }]
      : []),
    ...(formula.allowedJobIds.length > 0
      ? [{ value: "JOB_REF", label: "Măsurătoare" }]
      : []),
    ...(formula.allowedFormulaIds.length > 0
      ? [{ value: "FORMULA_REF", label: "Formulă" }]
      : []),
    ...formula.allowedOperators.map((item) => ({
      value: item,
      label: operatorLabel(item),
    })),
  ];
  return options;
}

function operatorLabel(kind: string): string {
  switch (kind) {
    case "ADD":
      return "Adunare";
    case "SUBTRACT":
      return "Scădere";
    case "MULTIPLY":
      return "Înmulțire";
    case "DIVIDE":
      return "Împărțire";
    case "CEIL":
      return "Rotunjire în sus";
    default:
      return kind;
  }
}

function defaultAst(formula: FormulaAdminItem): FormulaAstTransport {
  if (formula.allowedJobIds[0]) {
    return { kind: "JOB_REF", inputId: formula.allowedJobIds[0] };
  }
  if (formula.allowedConfigIds[0]) {
    return { kind: "CONFIG_REF", settingId: formula.allowedConfigIds[0] };
  }
  if (formula.allowedFormulaIds[0]) {
    return { kind: "FORMULA_REF", formulaId: formula.allowedFormulaIds[0] };
  }
  return { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" };
}

function astForKind(
  kind: string,
  formula: FormulaAdminItem,
  current: FormulaAstTransport,
): FormulaAstTransport {
  switch (kind) {
    case "NUMERIC_CONSTANT":
      return { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" };
    case "CONFIG_REF":
      return {
        kind: "CONFIG_REF",
        settingId: formula.allowedConfigIds[0] ?? "",
      };
    case "JOB_REF":
      return { kind: "JOB_REF", inputId: formula.allowedJobIds[0] ?? "" };
    case "FORMULA_REF":
      return { kind: "FORMULA_REF", formulaId: formula.allowedFormulaIds[0] ?? "" };
    case "CEIL":
      return { kind: "CEIL", operand: defaultAst(formula) };
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
      return {
        kind,
        left: current,
        right: defaultAst(formula),
      };
    default:
      return current;
  }
}
