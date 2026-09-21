import type { ComponentTypeId } from "./componentTypes.js";
import {
  isFormulaOperatorKind,
  type FormulaAst,
  type FormulaAstIssue,
  type FormulaOperatorKind,
} from "./formulaAst.js";
import {
  LED_MODULE_POWER_SETTING_ID,
  LED_PITCH_SETTING_ID,
  PSU_RESERVE_SETTING_ID,
  findTechnicalSettingDefinitionBySettingId,
} from "./technicalSettings.js";
import type { FormulaPresentationUnit, FormulaValueKind } from "./formulaValue.js";

export const LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID =
  "LIGHTING_FRONT_LED.ledModuleQuantity" as const;
export const LIGHTING_TOTAL_LED_LOAD_FORMULA_ID =
  "LIGHTING_FRONT_LED.totalLedLoadW" as const;
export const LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID =
  "LIGHTING_FRONT_LED.requiredPsuCapacityW" as const;

export const CONFIRMED_PERIMETER_JOB_INPUT_ID = "confirmedPerimeterMm" as const;

export const SUPPORTED_FORMULA_IDS = [
  LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
  LIGHTING_TOTAL_LED_LOAD_FORMULA_ID,
  LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID,
] as const;
export type SupportedFormulaId = (typeof SUPPORTED_FORMULA_IDS)[number];

export type FormulaReferenceAllowlist = {
  readonly configSettingIds: readonly string[];
  readonly jobInputIds: readonly string[];
  readonly formulaIds: readonly SupportedFormulaId[];
};

export type FormulaDefinition = {
  readonly formulaId: SupportedFormulaId;
  readonly componentTypeId: ComponentTypeId;
  readonly resultId: string;
  readonly label: string;
  readonly description: string;
  readonly resultUnit: FormulaPresentationUnit;
  readonly resultValueKind: FormulaValueKind;
  readonly allowedReferences: FormulaReferenceAllowlist;
  readonly allowedOperators: readonly FormulaOperatorKind[];
};

export function isSupportedFormulaId(value: string): value is SupportedFormulaId {
  return (SUPPORTED_FORMULA_IDS as readonly string[]).includes(value);
}

export const lightingFrontLedFormulaDefinitions: readonly FormulaDefinition[] = [
  {
    formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID,
    componentTypeId: "LIGHTING_FRONT_LED",
    resultId: "ledModuleQuantity",
    label: "Cantitate module LED",
    description:
      "Numărul de module LED se calculează din perimetrul confirmat și pasul LED. Formula poate fi schimbată de owner fără editare de sursă.",
    resultUnit: "buc",
    resultValueKind: "COUNT",
    allowedReferences: {
      configSettingIds: [LED_PITCH_SETTING_ID],
      jobInputIds: [CONFIRMED_PERIMETER_JOB_INPUT_ID],
      formulaIds: [],
    },
    allowedOperators: ["DIVIDE", "CEIL"],
  },
  {
    formulaId: LIGHTING_TOTAL_LED_LOAD_FORMULA_ID,
    componentTypeId: "LIGHTING_FRONT_LED",
    resultId: "totalLedLoadW",
    label: "Sarcină LED totală",
    description:
      "Sarcina LED este cantitatea de module înmulțită cu puterea pe modul. Formula poate fi schimbată de owner fără editare de sursă.",
    resultUnit: "W",
    resultValueKind: "POWER",
    allowedReferences: {
      configSettingIds: [LED_MODULE_POWER_SETTING_ID],
      jobInputIds: [],
      formulaIds: [LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID],
    },
    allowedOperators: ["MULTIPLY"],
  },
  {
    formulaId: LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID,
    componentTypeId: "LIGHTING_FRONT_LED",
    resultId: "requiredPsuCapacityW",
    label: "Capacitate minimă sursă",
    description:
      "Capacitatea minimă a sursei aplică rezerva tehnică peste sarcina LED. Formula poate fi schimbată de owner fără editare de sursă.",
    resultUnit: "W",
    resultValueKind: "POWER",
    allowedReferences: {
      configSettingIds: [PSU_RESERVE_SETTING_ID],
      jobInputIds: [],
      formulaIds: [LIGHTING_TOTAL_LED_LOAD_FORMULA_ID],
    },
    allowedOperators: ["ADD", "MULTIPLY", "DIVIDE"],
  },
];

export function requiredFormulaDefinitions(): readonly FormulaDefinition[] {
  return lightingFrontLedFormulaDefinitions;
}

export function findFormulaDefinition(
  formulaId: string,
): FormulaDefinition | undefined {
  return lightingFrontLedFormulaDefinitions.find((item) => item.formulaId === formulaId);
}

export function formulaDefinitionsForType(
  typeId: ComponentTypeId,
): readonly FormulaDefinition[] {
  return lightingFrontLedFormulaDefinitions.filter((item) => item.componentTypeId === typeId);
}

export const LIGHTING_LED_MODULE_QUANTITY_STARTER_AST: FormulaAst = {
  kind: "CEIL",
  operand: {
    kind: "DIVIDE",
    left: { kind: "JOB_REF", inputId: CONFIRMED_PERIMETER_JOB_INPUT_ID },
    right: { kind: "CONFIG_REF", settingId: LED_PITCH_SETTING_ID },
  },
};

export const LIGHTING_TOTAL_LED_LOAD_STARTER_AST: FormulaAst = {
  kind: "MULTIPLY",
  left: { kind: "FORMULA_REF", formulaId: LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID },
  right: { kind: "CONFIG_REF", settingId: LED_MODULE_POWER_SETTING_ID },
};

export const LIGHTING_REQUIRED_PSU_CAPACITY_STARTER_AST: FormulaAst = {
  kind: "MULTIPLY",
  left: { kind: "FORMULA_REF", formulaId: LIGHTING_TOTAL_LED_LOAD_FORMULA_ID },
  right: {
    kind: "ADD",
    left: { kind: "NUMERIC_CONSTANT", value: 1, valueKind: "SCALAR" },
    right: {
      kind: "DIVIDE",
      left: { kind: "CONFIG_REF", settingId: PSU_RESERVE_SETTING_ID },
      right: { kind: "NUMERIC_CONSTANT", value: 100, valueKind: "PERCENT" },
    },
  },
};

export const lightingFrontLedStarterAsts: Readonly<Record<SupportedFormulaId, FormulaAst>> = {
  [LIGHTING_LED_MODULE_QUANTITY_FORMULA_ID]: LIGHTING_LED_MODULE_QUANTITY_STARTER_AST,
  [LIGHTING_TOTAL_LED_LOAD_FORMULA_ID]: LIGHTING_TOTAL_LED_LOAD_STARTER_AST,
  [LIGHTING_REQUIRED_PSU_CAPACITY_FORMULA_ID]: LIGHTING_REQUIRED_PSU_CAPACITY_STARTER_AST,
};

export function starterAstFor(formulaId: SupportedFormulaId): FormulaAst {
  return lightingFrontLedStarterAsts[formulaId];
}

export function explainFormulaAst(ast: FormulaAst): string {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT":
      return String(ast.value);
    case "CONFIG_REF": {
      const setting = findTechnicalSettingDefinitionBySettingId(ast.settingId);
      return setting?.label ?? ast.settingId;
    }
    case "JOB_REF":
      return ast.inputId === CONFIRMED_PERIMETER_JOB_INPUT_ID
        ? "Perimetru confirmat"
        : ast.inputId;
    case "FORMULA_REF": {
      const formula = findFormulaDefinition(ast.formulaId);
      return formula?.label ?? ast.formulaId;
    }
    case "ADD":
      return `(${explainFormulaAst(ast.left)} + ${explainFormulaAst(ast.right)})`;
    case "SUBTRACT":
      return `(${explainFormulaAst(ast.left)} − ${explainFormulaAst(ast.right)})`;
    case "MULTIPLY":
      return `(${explainFormulaAst(ast.left)} × ${explainFormulaAst(ast.right)})`;
    case "DIVIDE":
      return `(${explainFormulaAst(ast.left)} ÷ ${explainFormulaAst(ast.right)})`;
    case "CEIL":
      return `rotunjire în sus (${explainFormulaAst(ast.operand)})`;
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

export function validateFormulaAstAgainstDefinition(
  definition: FormulaDefinition,
  ast: FormulaAst,
): FormulaAstIssue[] {
  const issues: FormulaAstIssue[] = [];
  walkAllowed(definition, ast, issues);
  return issues;
}

function walkAllowed(
  definition: FormulaDefinition,
  ast: FormulaAst,
  issues: FormulaAstIssue[],
): void {
  switch (ast.kind) {
    case "NUMERIC_CONSTANT":
      return;
    case "CONFIG_REF":
      if (!definition.allowedReferences.configSettingIds.includes(ast.settingId)) {
        issues.push({
          field: ast.settingId,
          reason: "Referința de setare tehnică nu este permisă pentru această formulă.",
        });
      } else if (!findTechnicalSettingDefinitionBySettingId(ast.settingId)) {
        issues.push({
          field: ast.settingId,
          reason: "Setarea tehnică referită nu există.",
        });
      }
      return;
    case "JOB_REF":
      if (!definition.allowedReferences.jobInputIds.includes(ast.inputId)) {
        issues.push({
          field: ast.inputId,
          reason: "Referința de măsurătoare nu este permisă pentru această formulă.",
        });
      }
      return;
    case "FORMULA_REF":
      if (
        !(definition.allowedReferences.formulaIds as readonly string[]).includes(ast.formulaId)
      ) {
        issues.push({
          field: ast.formulaId,
          reason: "Referința de formulă nu este permisă pentru această formulă.",
        });
      }
      return;
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY":
    case "DIVIDE":
    case "CEIL":
      if (!isFormulaOperatorKind(ast.kind) || !definition.allowedOperators.includes(ast.kind)) {
        issues.push({
          field: ast.kind,
          reason: "Operatorul nu este permis pentru această formulă.",
        });
      }
      if (ast.kind === "CEIL") {
        walkAllowed(definition, ast.operand, issues);
        return;
      }
      walkAllowed(definition, ast.left, issues);
      walkAllowed(definition, ast.right, issues);
      return;
    default: {
      const _exhaustive: never = ast;
      throw new Error(`unsupported_formula_ast:${_exhaustive}`);
    }
  }
}
