export const FORMULA_VALUE_KINDS = [
  "SCALAR",
  "LENGTH",
  "POWER",
  "PERCENT",
  "COUNT",
] as const;
export type FormulaValueKind = (typeof FORMULA_VALUE_KINDS)[number];

export const FORMULA_PRESENTATION_UNITS = ["buc", "W", "mm", "percent"] as const;
export type FormulaPresentationUnit = (typeof FORMULA_PRESENTATION_UNITS)[number];

export type FormulaTypedValue = {
  readonly value: number;
  readonly valueKind: FormulaValueKind;
};

export type FormulaValueIssue = {
  readonly field: string;
  readonly reason: string;
};

export function isFormulaValueKind(value: string): value is FormulaValueKind {
  return (FORMULA_VALUE_KINDS as readonly string[]).includes(value);
}

export function isFormulaPresentationUnit(value: string): value is FormulaPresentationUnit {
  return (FORMULA_PRESENTATION_UNITS as readonly string[]).includes(value);
}

export function formulaValueKindFromTechnicalUnit(
  unit: string,
): FormulaValueKind | null {
  switch (unit) {
    case "mm":
      return "LENGTH";
    case "W":
      return "POWER";
    case "percent":
      return "PERCENT";
    default:
      return null;
  }
}

export function presentationUnitForValueKind(
  valueKind: FormulaValueKind,
): FormulaPresentationUnit | null {
  switch (valueKind) {
    case "COUNT":
      return "buc";
    case "POWER":
      return "W";
    case "LENGTH":
      return "mm";
    case "PERCENT":
      return "percent";
    case "SCALAR":
      return null;
    default: {
      const _exhaustive: never = valueKind;
      return _exhaustive;
    }
  }
}

export function finiteFormulaNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function addFormulaValues(
  left: FormulaTypedValue,
  right: FormulaTypedValue,
): FormulaTypedValue | FormulaValueIssue {
  if (left.valueKind !== right.valueKind) {
    return {
      field: "ADD",
      reason: "Adunarea cere dimensiuni semantice compatibile.",
    };
  }
  return { value: left.value + right.value, valueKind: left.valueKind };
}

export function subtractFormulaValues(
  left: FormulaTypedValue,
  right: FormulaTypedValue,
): FormulaTypedValue | FormulaValueIssue {
  if (left.valueKind !== right.valueKind) {
    return {
      field: "SUBTRACT",
      reason: "Scăderea cere dimensiuni semantice compatibile.",
    };
  }
  return { value: left.value - right.value, valueKind: left.valueKind };
}

export function multiplyFormulaValues(
  left: FormulaTypedValue,
  right: FormulaTypedValue,
): FormulaTypedValue | FormulaValueIssue {
  const valueKind = multiplyValueKind(left.valueKind, right.valueKind);
  if (!valueKind) {
    return {
      field: "MULTIPLY",
      reason: "Înmulțirea produce o dimensiune semantică nepermisă.",
    };
  }
  return { value: left.value * right.value, valueKind };
}

export function divideFormulaValues(
  left: FormulaTypedValue,
  right: FormulaTypedValue,
): FormulaTypedValue | FormulaValueIssue {
  if (right.value === 0) {
    return {
      field: "DIVIDE",
      reason: "Împărțirea la zero nu este permisă.",
    };
  }
  const valueKind = divideValueKind(left.valueKind, right.valueKind);
  if (!valueKind) {
    return {
      field: "DIVIDE",
      reason: "Împărțirea produce o dimensiune semantică nepermisă.",
    };
  }
  return { value: left.value / right.value, valueKind };
}

export function ceilFormulaValue(
  operand: FormulaTypedValue,
): FormulaTypedValue | FormulaValueIssue {
  if (operand.valueKind !== "SCALAR") {
    return {
      field: "CEIL",
      reason: "Rotunjirea în sus se aplică doar unui scalar adimensional.",
    };
  }
  return { value: Math.ceil(operand.value), valueKind: "COUNT" };
}

function multiplyValueKind(
  left: FormulaValueKind,
  right: FormulaValueKind,
): FormulaValueKind | null {
  if (left === "SCALAR") {
    return right;
  }
  if (right === "SCALAR") {
    return left;
  }
  if (
    (left === "COUNT" && right === "POWER") ||
    (left === "POWER" && right === "COUNT")
  ) {
    return "POWER";
  }
  return null;
}

function divideValueKind(
  left: FormulaValueKind,
  right: FormulaValueKind,
): FormulaValueKind | null {
  if (left === right) {
    return "SCALAR";
  }
  if (right === "SCALAR") {
    return left;
  }
  return null;
}
